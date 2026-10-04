import { readTaxLocus, type TaxLookup } from "@/lib/tax";
import { taxAddress } from "@/lib/pricing-server";

/**
 * Sales tax for an address from TaxLocus (Coy, 2026-10-04 — his key,
 * TAXLOCUS_API_KEY in Vercel, server only). POST /v1/rate/lookup with the
 * address and "goods.general" (materials are what is taxed on a budget, §3).
 * Never throws: the reason comes back so the page can say it.
 */
export async function lookupTax(addr: { line1: string; city: string | null; state: string; postal_code: string | null; text: string }):
  Promise<{ ok: true; lookup: TaxLookup } | { ok: false; error: string }> {
  const key = process.env.TAXLOCUS_API_KEY;
  if (!key) return { ok: false, error: "TaxLocus isn't set up — TAXLOCUS_API_KEY is missing in Vercel" };
  try {
    const r = await fetch("https://api.taxlocus.com/v1/rate/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ address: { line1: addr.line1, ...(addr.city ? { city: addr.city } : {}), state: addr.state, ...(addr.postal_code ? { postal_code: addr.postal_code } : {}) }, product_category: "goods.general" }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null) as { error?: string; message?: string } | null;
    if (!r.ok) {
      const why = r.status === 401 ? "TaxLocus refused the key" : r.status === 403 ? "TaxLocus says this plan or quota doesn't allow it" : r.status === 429 ? "TaxLocus is busy — try again in a moment" : body?.message || body?.error || `TaxLocus answered ${r.status}`;
      return { ok: false, error: why };
    }
    const lookup = readTaxLocus(body, addr.text);
    return lookup ? { ok: true, lookup } : { ok: false, error: "TaxLocus gave no rate for that address" };
  } catch (e) {
    return { ok: false, error: `Couldn't reach TaxLocus (${e instanceof Error ? e.message : String(e)})` };
  }
}

type Sb = import("@/lib/api-auth").ApiSession["supabase"];

/**
 * Look a job's rate up and keep it on the job (jobs.tax_lookup, migration 078).
 * Without `force`, only when it is worth a call: Coy hasn't typed a rate or
 * picked a parish, the job (or its customer) has a placeable address, and no
 * lookup exists for that address yet.
 */
export async function refreshJobTax(sb: Sb, orgId: string, jobId: string, force = false):
  Promise<{ ok: true; lookup: TaxLookup | null; skipped?: string } | { ok: false; error: string }> {
  const { data: job, error } = await sb.from("jobs").select("id, address, city, state, zip, customer_id, tax_parish, tax_rate_source, tax_lookup")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (error) return { ok: false, error: /tax_lookup/.test(error.message) ? "Looking up tax needs migration 078 applied" : error.message };
  if (!job) return { ok: false, error: "No such job." };
  const { data: cust } = job.customer_id
    ? await sb.from("customers").select("address_formatted, address_line1, city, state, zip").eq("org_id", orgId).eq("id", job.customer_id).maybeSingle()
    : { data: null };
  const where = taxAddress(job as Record<string, unknown>, cust);
  if (!where) return { ok: false, error: "No street address with a number on the job or its customer to look up" };
  const have = job.tax_lookup as TaxLookup | null;
  if (!force) {
    if (job.tax_rate_source === "override") return { ok: true, lookup: have, skipped: "a rate is typed for this job" };
    if (job.tax_parish) return { ok: true, lookup: have, skipped: "a parish is picked for this job" };
    if (have?.address === where.text) return { ok: true, lookup: have, skipped: "already looked up" };
    if (!process.env.TAXLOCUS_API_KEY) return { ok: true, lookup: have, skipped: "TaxLocus isn't set up" };
  }
  const r = await lookupTax(where);
  if (!r.ok) return r;
  // A forced lookup is Coy asking for the address's rate: it replaces a picked parish.
  const patch: Record<string, unknown> = { tax_lookup: r.lookup };
  if (force && job.tax_rate_source !== "override") patch.tax_parish = null;
  const { error: e2 } = await sb.from("jobs").update(patch).eq("org_id", orgId).eq("id", jobId);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true, lookup: r.lookup };
}
