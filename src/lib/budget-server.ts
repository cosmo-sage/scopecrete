import type { ApiSession } from "@/lib/api-auth";
import { pickAssembly } from "@/lib/engine";

/**
 * The job budget's server side (migration 048): finding or making the one
 * working estimate on a job, and the columns the budget screens read. Session
 * client only — RLS on estimates, estimate_options and estimate_line_items
 * scopes every read and write to the caller's org.
 */

type Sb = ApiSession["supabase"];

export const LINE_COLUMNS = "id, estimate_id, option_id, section_id, cost_group_id, cost_item_id, name, description, cost_type, unit, unit_cost, markup_pct, margin_pct, taxable, qty_rule, rule_params, qty_source, quantity, vendor_contact_id, price_as_of, price_source, show_on_doc, show_qty, show_price, sort_order, updated_at, assembly_id, section_role, source_id, source_pinned, takeoff_parameter_id";
export const ESTIMATE_COLUMNS = "id, job_id, status, tax_on, discount_amount, discount_reason, selected_option_id, version, updated_at, margin_pct, overhead_pct";

export async function jobInOrg(sb: Sb, orgId: string, jobId: string) {
  const { data } = await sb.from("jobs").select("id, contact_id, duration_days").eq("org_id", orgId).eq("id", jobId).maybeSingle();
  return data as { id: string; contact_id: string | null; duration_days: number | null } | null;
}

export async function workingEstimate(sb: Sb, orgId: string, jobId: string, create: boolean) {
  const { data: found } = await sb.from("estimates").select(ESTIMATE_COLUMNS).eq("org_id", orgId).eq("job_id", jobId)
    .eq("status", "draft").maybeSingle();
  if (found || !create) return found as Record<string, unknown> | null;
  // A new budget starts from its job type's defaults (migration 060), else the
  // org's (Price book → Defaults, 057) — copied, so changing a default later
  // never reprices it.
  const [{ data: money }, { data: job }] = await Promise.all([
    sb.from("org_money_settings").select("default_margin_pct, default_overhead_pct").eq("org_id", orgId).maybeSingle(),
    sb.from("jobs").select("job_type").eq("org_id", orgId).eq("id", jobId).maybeSingle(),
  ]);
  const { data: type } = job?.job_type
    ? await sb.from("org_project_types").select("margin_pct, overhead_pct").eq("org_id", orgId).eq("key", job.job_type as string).maybeSingle()
    : { data: null };
  const { data: made, error } = await sb.from("estimates")
    .insert({ org_id: orgId, job_id: jobId, status: "draft", doc_kind: "estimate", engine_version: "budget-v2",
      margin_pct: type?.margin_pct ?? money?.default_margin_pct ?? null, overhead_pct: type?.overhead_pct ?? money?.default_overhead_pct ?? null })
    .select(ESTIMATE_COLUMNS).single();
  if (error) {
    // Two taps at once: the unique index let one through; read that one.
    const { data: again } = await sb.from("estimates").select(ESTIMATE_COLUMNS).eq("org_id", orgId).eq("job_id", jobId).eq("status", "draft").maybeSingle();
    return again as Record<string, unknown> | null;
  }
  return made as Record<string, unknown>;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/**
 * A Price book item's group is where it sits, not a price: every budget line of
 * that item follows it (Coy, 2026-10-04: "if I update it in the price book, it
 * doesn't update in the budget"). Sent proposals keep their own frozen copy.
 */
export async function syncLineGroups(sb: Sb, orgId: string, costItemId: string, groupId: string | null) {
  await sb.from("estimate_line_items").update({ cost_group_id: groupId, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("cost_item_id", costItemId);
}

export const numLine = (r: Record<string, unknown>) => ({
  ...r, unit_cost: num(r.unit_cost), markup_pct: num(r.markup_pct), margin_pct: num(r.margin_pct), quantity: num(r.quantity),
});

// ---------------------------------------------------------------- cards onto lines

export const CARD_COLS = "id, cost_group_id, name, description, cost_type, unit, unit_cost, taxable, markup_pct, vendor_contact_id, price_as_of, price_source, qty_rule, rule_params, active, default_source_id";

/**
 * A card COPIED onto a budget line — name, unit, unit cost, type, taxed,
 * rule, vendor and price date (not its markup: since migration 057 a job is
 * priced by its own O.H. and margin) — so a later change to the card never
 * silently reprices a budget or a quote that went out. The card's price is
 * its default vendor's (migration 051), and the line remembers which vendor
 * (`source_id`). A typed quantity (an
 * assembly's, for a card counted by hand) makes the line `set`.
 */
/**
 * Where a card's price came from, in the words a budget line accepts. A line's
 * check (migration 048) predates imports: "import" — every card from Coy's
 * JobTread file — was refused, and no card could be added (2026-10-02). A
 * source the line can't hold is left blank on the line; the card keeps it.
 */
const LINE_SOURCES = new Set(["org_settings", "market", "manual", "vendor_quote", "quote", "receipt", "invoice", "typed"]);
export const lineSource = (v: unknown): string | null => (typeof v === "string" && LINE_SOURCES.has(v) ? v : null);

export function cardToLine(c: Record<string, unknown>, at: {
  orgId: string; estimateId: string; sectionId: string | null; optionId: string | null; sortOrder: number;
  assemblyId?: string | null; quantity?: number | null; role?: "reinforcement" | null;
}) {
  const manual = (c.qty_rule ?? "manual") === "manual";
  const typed = at.quantity !== null && at.quantity !== undefined;
  return {
    org_id: at.orgId, estimate_id: at.estimateId, option_id: at.optionId, section_id: at.sectionId,
    cost_item_id: c.id ?? null, cost_group_id: c.cost_group_id ?? null, name: c.name, description: c.description ?? null,
    cost_type: c.cost_type, unit: c.unit, unit_cost: c.unit_cost ?? null, markup_pct: null,
    taxable: c.taxable === true, qty_rule: c.qty_rule ?? "manual", rule_params: c.rule_params ?? {},
    qty_source: manual || typed ? "set" : "rule", quantity: typed ? at.quantity : null,
    vendor_contact_id: c.vendor_contact_id ?? null, price_as_of: c.price_as_of ?? null, price_source: lineSource(c.price_source),
    source_id: c.default_source_id ?? null, source_pinned: false,
    sort_order: at.sortOrder, assembly_id: at.assemblyId ?? null, section_role: at.role ?? null,
  };
}

async function nextSort(sb: Sb, estimateId: string) {
  const { count } = await sb.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("estimate_id", estimateId);
  return count ?? 0;
}

// ---------------------------------------------------------------- reinforcement is a card

/**
 * Set (or clear) an area's reinforcement: the section records the card, and
 * the budget carries it as that area's one reinforcement line (shared by
 * every option). Choosing another swaps the line; none removes it. `source`
 * is 'set' when Coy picked it, 'default' when an assembly did — a default
 * never replaces Coy's own pick (the caller checks).
 */
export async function setReinforcement(sb: Sb, orgId: string, jobId: string, sectionId: string, itemId: string | null, source: "set" | "default") {
  let card: Record<string, unknown> | null = null;
  if (itemId) {
    const { data } = await sb.from("cost_items").select(CARD_COLS).eq("org_id", orgId).eq("id", itemId).maybeSingle();
    if (!data) return { ok: false as const, error: "No such card." };
    card = data as Record<string, unknown>;
  }
  const { error: sErr } = await sb.from("job_sections")
    .update({ reinforcement_item_id: itemId, reinforcement_source: itemId ? source : null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("job_id", jobId).eq("id", sectionId);
  if (sErr) return { ok: false as const, error: sErr.message };
  const est = await workingEstimate(sb, orgId, jobId, !!itemId);
  if (!est) return { ok: true as const };
  await sb.from("estimate_line_items").delete().eq("estimate_id", est.id as string).eq("section_id", sectionId)
    .eq("section_role", "reinforcement").is("option_id", null);
  if (card) {
    const { error } = await sb.from("estimate_line_items").insert(cardToLine(card, {
      orgId, estimateId: est.id as string, sectionId, optionId: null, sortOrder: await nextSort(sb, est.id as string), role: "reinforcement",
    }));
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------- assemblies

/**
 * Put an assembly's cards on an area (step 3b). `auto`: the one that fits the
 * job type × work type (pickAssembly), and only onto an area with NO budget
 * lines yet — it never swaps or duplicates. By hand: the named assembly, onto
 * any area. Lines carry `assembly_id` ("from Residential driveway"); a card
 * counted by hand takes the assembly's quantity, or stays blank and says so.
 * The assembly's reinforcement becomes the area's, unless Coy picked one.
 */
export async function loadAssembly(sb: Sb, orgId: string, jobId: string, sectionId: string,
  how: { auto: true; jobType: string | null; workType: string | null } | { auto: false; assemblyId: string }) {
  let asm: { id: string; name: string; reinforcement_item_id: string | null } | null = null;
  if (how.auto) {
    const { data } = await sb.from("cost_assemblies").select("id, name, job_type, work_type, auto_load, reinforcement_item_id")
      .eq("org_id", orgId).eq("auto_load", true).eq("work_type", how.workType ?? "");
    asm = pickAssembly((data ?? []) as Array<{ id: string; name: string; job_type: string | null; work_type: string | null; auto_load: boolean; reinforcement_item_id: string | null }>, how.jobType, how.workType);
  } else {
    const { data } = await sb.from("cost_assemblies").select("id, name, reinforcement_item_id").eq("org_id", orgId).eq("id", how.assemblyId).maybeSingle();
    asm = data as typeof asm;
  }
  if (!asm) return { loaded: null as string | null, lines: 0 };

  const est = await workingEstimate(sb, orgId, jobId, true);
  if (!est) return { loaded: null, lines: 0, error: "Couldn't open the budget." };
  if (how.auto) {
    const { count } = await sb.from("estimate_line_items").select("id", { count: "exact", head: true })
      .eq("estimate_id", est.id as string).eq("section_id", sectionId);
    if ((count ?? 0) > 0) return { loaded: null, lines: 0 };
  }
  const { data: items } = await sb.from("cost_assembly_items").select("cost_item_id, quantity, sort_order")
    .eq("org_id", orgId).eq("assembly_id", asm.id).order("sort_order");
  const ids = ((items ?? []) as Array<{ cost_item_id: string }>).map((i) => i.cost_item_id);
  const { data: cards } = ids.length
    ? await sb.from("cost_items").select(CARD_COLS).eq("org_id", orgId).eq("active", true).in("id", ids)
    : { data: [] };
  const byId = new Map(((cards ?? []) as Array<Record<string, unknown>>).map((c) => [c.id as string, c]));
  let sort = await nextSort(sb, est.id as string);
  const rows = ((items ?? []) as Array<{ cost_item_id: string; quantity: unknown }>)
    .filter((i) => byId.has(i.cost_item_id))
    .map((i) => cardToLine(byId.get(i.cost_item_id) as Record<string, unknown>, {
      orgId, estimateId: est.id as string, sectionId, optionId: null, sortOrder: sort++, assemblyId: asm.id,
      quantity: i.quantity === null || i.quantity === undefined ? null : Number(i.quantity),
    }));
  if (rows.length) {
    const { error } = await sb.from("estimate_line_items").insert(rows);
    if (error) return { loaded: null, lines: 0, error: error.message };
  }
  if (asm.reinforcement_item_id) {
    const { data: sec } = await sb.from("job_sections").select("reinforcement_source").eq("org_id", orgId).eq("id", sectionId).maybeSingle();
    if (sec && sec.reinforcement_source !== "set") await setReinforcement(sb, orgId, jobId, sectionId, asm.reinforcement_item_id, "default");
  }
  return { loaded: asm.name, lines: rows.length };
}
