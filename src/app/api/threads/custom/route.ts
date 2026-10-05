import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadCustomThreads } from "@/lib/threads-server";

/**
 * The threads Coy makes (migration 073) — a saved set of contacts to see
 * together, e.g. everyone on a job. Being in one never moves anyone out of
 * Customer or Vendor.
 *
 * GET  → { threads: CustomThread[] }
 * GET ?job=<id> | ?customer=<id> → { preview: [{ id, name, bucket }] } — who a
 *      thread made from that job or customer would start with.
 * POST { name, source: "job" | "customer" | "manual", job_id?, customer_id?, contact_ids? }
 *      → { thread } — a job or customer thread fills itself (and follows them, in
 *        the database); a hand-picked one takes contact_ids.
 *
 * Session client; org from the session; every id checked by the database's guard.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const job = req.nextUrl.searchParams.get("job"), customer = req.nextUrl.searchParams.get("customer");
  if ((job && UUID.test(job)) || (customer && UUID.test(customer))) {
    let ids: string[] = [];
    if (job) {
      const { data } = await supabase.rpc("sc_job_people", { p_job: job });
      ids = ((data ?? []) as Array<{ contact_id: string }>).map((r) => r.contact_id);
    } else {
      const { data } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", customer as string)
        .is("merged_into_contact_id", null).is("archived_at", null);
      ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    }
    const { data: people } = ids.length
      ? await supabase.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at").eq("org_id", orgId).in("id", ids)
      : { data: [] };
    const preview = ((people ?? []) as Array<{ id: string; name: string | null; phone: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null }>)
      .map((c) => ({ id: c.id, name: c.name?.trim() || c.phone || "No name", bucket: c.classification_confirmed_at || c.auto_classified_at ? c.contact_type : null }));
    return applyCookies(NextResponse.json({ preview }));
  }
  return applyCookies(NextResponse.json({ threads: await loadCustomThreads(supabase, orgId) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!name) return bad("A thread needs a name.");
  const source = b.source === "job" || b.source === "customer" ? b.source : "manual";
  const job_id = source === "job" && typeof b.job_id === "string" && UUID.test(b.job_id) ? b.job_id : null;
  const customer_id = source === "customer" && typeof b.customer_id === "string" && UUID.test(b.customer_id) ? b.customer_id : null;
  if (source === "job" && !job_id) return bad("Pick the job.");
  if (source === "customer" && !customer_id) return bad("Pick the customer.");
  const { data: t, error } = await supabase.from("threads")
    .insert({ org_id: orgId, name, source, job_id, customer_id, created_by: userId }).select("id").single();
  if (error || !t) return bad(error?.message.includes("not found") ? error.message : error?.message ?? "Couldn't make it.", error?.message.includes("not found") ? 404 : 500);
  const ids = Array.isArray(b.contact_ids) ? (b.contact_ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500) : [];
  if (ids.length) {
    const { error: e2 } = await supabase.from("thread_contacts")
      .upsert(ids.map((contact_id) => ({ thread_id: t.id, contact_id, org_id: orgId, added_by: "user" })), { onConflict: "thread_id,contact_id", ignoreDuplicates: true });
    if (e2) return bad(e2.message, e2.message.includes("not found") ? 404 : 500);
  }
  const all = await loadCustomThreads(supabase, orgId);
  return applyCookies(NextResponse.json({ thread: all.find((x) => x.id === t.id) ?? null }, { status: 201 }));
}
