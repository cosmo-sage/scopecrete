import type { ApiSession } from "@/lib/api-auth";
import { budget, quantities, type BudgetLine, type SectionInput } from "@/lib/engine";
import { numLine, workingEstimate } from "@/lib/budget-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";
import type { ComposeScope } from "@/lib/bids";

/**
 * What the bid request composer reads for one job (migration 091): its scopes
 * — each budget section (and the whole-job lines) with the lines' quantities
 * from the engine's own budget() — and what can go in the packet: photos, plan
 * PDFs, aerials, the address and the sections' notes. Session client; the org
 * from the session. No cost leaves this file: a line carries its name, unit,
 * quantity and cost type only.
 */

type Sb = ApiSession["supabase"];

export const BIDS_MISSING = "Bid requests need migration 091 — say \"apply 091\".";
export const missing091 = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "PGRST202"
    || /bid_request|trades|crew_size|sc_shared_bid|sc_answer_bid/.test(e.message ?? ""));

export interface PacketFile { id: string; name: string; path: string; kind: "photo" | "plan" | "aerial" }
export interface ComposeJob {
  id: string; title: string | null; address: string | null; street: string | null; status: string | null;
  scopes: ComposeScope[]; files: PacketFile[]; access: string | null;
}

const sizeOf = (s: SectionInput): string | null => {
  const q = quantities(s);
  const parts: string[] = [];
  if (q.count !== null && q.count !== undefined && q.count_unit) parts.push(`${fmt(q.count)} ${q.count_unit}`);
  if (q.sqft !== null && q.count_unit !== "LF") parts.push(`${fmt(q.sqft)} SF`);
  if (q.depth_in) parts.push(`${fmt(q.depth_in)}"`);
  return parts.length ? parts.join(" · ") : null;
};
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export async function composeFor(sb: Sb, orgId: string, jobId: string): Promise<ComposeJob | null> {
  const { data: job } = await sb.from("jobs").select("id, title, address, status").eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return null;
  const est = await workingEstimate(sb, orgId, jobId, false);
  const [{ data: secs }, { data: rows }, pricing, takeoff, { data: files }, { data: sheets }] = await Promise.all([
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, count_qty, count_unit, access_notes, sort_order")
      .eq("org_id", orgId).eq("job_id", jobId).order("sort_order").order("created_at"),
    est ? sb.from("estimate_line_items").select("id, section_id, option_id, cost_group_id, cost_item_id, name, cost_type, unit, unit_cost, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, takeoff_parameter_id, sort_order")
      .eq("org_id", orgId).eq("estimate_id", est.id as string).order("sort_order").order("name") : Promise.resolve({ data: [] }),
    pricingFor(sb, orgId, [jobId]),
    takeoffTotalsFor(sb, orgId, jobId),
    sb.from("files").select("id, name, mime_type, storage_path, category, in_plan_room, created_at").eq("org_id", orgId).eq("job_id", jobId)
      .is("deleted_at", null).not("storage_path", "is", null).order("created_at", { ascending: false }).limit(120),
    sb.from("plan_sheets").select("file_id, number").eq("org_id", orgId).eq("job_id", jobId).ilike("number", "AERIAL%"),
  ]);
  const sections = (secs ?? []) as unknown as Array<SectionInput & { id: string; access_notes: string | null }>;
  const lines = ((rows ?? []) as Array<Record<string, unknown>>).map(numLine) as unknown as BudgetLine[];
  const p = pricing.get(jobId);
  // Quantities come from the engine, as on the budget screen; a line it can't count keeps its typed quantity.
  const res = lines.length ? budget(lines, [], p?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null }, sections, p?.days ?? null,
    { tax_on: false, discount: 0, takeoff: takeoff as never }) : null;
  const qtyOf = (l: BudgetLine) => res?.lines[l.id]?.qty ?? (l.quantity !== null && l.quantity !== undefined ? Number(l.quantity) : null);
  const toLine = (l: BudgetLine) => ({ id: l.id, name: l.name, unit: l.unit || null, qty: qtyOf(l), cost_type: (l.cost_type as string) ?? null });

  const scopes: ComposeScope[] = sections.map((s) => ({
    key: s.id, title: s.name?.trim() || String(s.work_type ?? "Area").replace(/_/g, " "), size: sizeOf(s),
    lines: lines.filter((l) => l.section_id === s.id).map(toLine),
  }));
  const whole = lines.filter((l) => !l.section_id || !sections.some((s) => s.id === l.section_id));
  if (whole.length) scopes.push({ key: "job", title: "Whole job", size: null, lines: whole.map(toLine) });

  const aerialIds = new Set(((sheets ?? []) as Array<{ file_id: string }>).map((x) => x.file_id));
  const packet: PacketFile[] = [];
  for (const f of (files ?? []) as Array<Record<string, unknown>>) {
    const mime = String(f.mime_type ?? ""), name = String(f.name ?? "");
    const pdf = mime === "application/pdf" || /\.pdf$/i.test(name);
    const kind = aerialIds.has(f.id as string) ? "aerial" : mime.startsWith("image/") ? "photo" : pdf && (f.in_plan_room || f.category === "plan") ? "plan" : null;
    if (!kind) continue;
    packet.push({ id: f.id as string, name, path: f.storage_path as string, kind });
  }
  const access = sections.map((s) => s.access_notes?.trim()).filter(Boolean).join(" · ") || null;
  const address = (job.address as string | null) ?? null;
  return {
    id: job.id as string, title: (job.title as string | null) ?? null, address, street: address ? address.split(",")[0].trim() : null,
    status: (job.status as string | null) ?? null, scopes, files: packet.slice(0, 60), access,
  };
}
