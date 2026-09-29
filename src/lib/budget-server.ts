import type { ApiSession } from "@/lib/api-auth";

/**
 * The job budget's server side (migration 048): finding or making the one
 * working estimate on a job, and the columns the budget screens read. Session
 * client only — RLS on estimates, estimate_options and estimate_line_items
 * scopes every read and write to the caller's org.
 */

type Sb = ApiSession["supabase"];

export const LINE_COLUMNS = "id, estimate_id, option_id, section_id, cost_group_id, cost_item_id, name, description, cost_type, unit, unit_cost, markup_pct, taxable, qty_rule, rule_params, qty_source, quantity, vendor_contact_id, price_as_of, price_source, show_on_doc, show_qty, show_price, sort_order, updated_at";
export const ESTIMATE_COLUMNS = "id, job_id, status, tax_on, discount_amount, discount_reason, selected_option_id, version, updated_at";

export async function jobInOrg(sb: Sb, orgId: string, jobId: string) {
  const { data } = await sb.from("jobs").select("id, contact_id, duration_days").eq("org_id", orgId).eq("id", jobId).maybeSingle();
  return data as { id: string; contact_id: string | null; duration_days: number | null } | null;
}

export async function workingEstimate(sb: Sb, orgId: string, jobId: string, create: boolean) {
  const { data: found } = await sb.from("estimates").select(ESTIMATE_COLUMNS).eq("org_id", orgId).eq("job_id", jobId)
    .eq("status", "draft").maybeSingle();
  if (found || !create) return found as Record<string, unknown> | null;
  const { data: made, error } = await sb.from("estimates")
    .insert({ org_id: orgId, job_id: jobId, status: "draft", doc_kind: "estimate", engine_version: "budget-v1" })
    .select(ESTIMATE_COLUMNS).single();
  if (error) {
    // Two taps at once: the unique index let one through; read that one.
    const { data: again } = await sb.from("estimates").select(ESTIMATE_COLUMNS).eq("org_id", orgId).eq("job_id", jobId).eq("status", "draft").maybeSingle();
    return again as Record<string, unknown> | null;
  }
  return made as Record<string, unknown>;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const numLine = (r: Record<string, unknown>) => ({
  ...r, unit_cost: num(r.unit_cost), markup_pct: num(r.markup_pct), quantity: num(r.quantity),
});
