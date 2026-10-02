import type { ApiSession } from "@/lib/api-auth";
import type { BudgetLine } from "@/lib/engine";
import { LINE_COLUMNS, numLine, workingEstimate } from "@/lib/budget-server";
import { pricingFor } from "@/lib/pricing-server";
import { takeoffTotalsFor } from "@/lib/plans-server";
import { orgRow, orgView } from "@/lib/org-server";
import { signFiles } from "@/lib/files-server";
import { priceDraft, fillOrg, type Draw, type DraftInput, type ProposalDisplay } from "@/lib/proposal";

/**
 * The proposal's server side (migration 060): the job's draft proposal
 * (made on first open from its project type's defaults), and everything the
 * page needs to price and show it — the budget exactly as the budget API
 * serves it, the areas, the customer, the org, the types and templates.
 * Session client, org filter explicit; RLS is the enforcement.
 */

type Sb = ApiSession["supabase"];
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const PROPOSAL_COLS = "id, job_id, version, status, option_id, project_type, display, draws, warranty, terms, scope_intro, cover_file_id, split, snapshot, finalized_at, created_at, updated_at";
export const TYPE_COLS = "id, key, label, overhead_pct, margin_pct, show_item_prices, show_qty, show_tax_line, draws, warranty_template_id, terms_template_id, cover, sort_order";
export const TEMPLATE_COLS = "id, kind, name, project_types, title, body, clauses, starter, updated_at";

export interface ProjectType {
  id: string; key: string; label: string; overhead_pct: number | null; margin_pct: number | null;
  show_item_prices: boolean; show_qty: boolean; show_tax_line: boolean; draws: Draw[];
  warranty_template_id: string | null; terms_template_id: string | null; cover: "photo" | "none"; sort_order: number;
}
export const typeRow = (r: Record<string, unknown>): ProjectType => ({ ...(r as unknown as ProjectType), overhead_pct: num(r.overhead_pct), margin_pct: num(r.margin_pct) });

/** What a new draft (or a change of type) starts from. */
export function typeDefaults(t: ProjectType | null) {
  return {
    project_type: t?.key ?? null,
    display: { show_item_prices: t?.show_item_prices ?? false, show_qty: t?.show_qty ?? false, show_tax_line: t?.show_tax_line ?? false,
      off: t?.cover === "none" ? { cover: true } : {} } as ProposalDisplay,
    draws: t?.draws ?? [],
    warranty: { template_id: t?.warranty_template_id ?? null },
    terms: { template_id: t?.terms_template_id ?? null },
  };
}

export async function draftFor(sb: Sb, orgId: string, jobId: string, jobType: string | null, create = true) {
  const { data: found } = await sb.from("job_proposals").select(PROPOSAL_COLS).eq("org_id", orgId).eq("job_id", jobId).eq("status", "draft").maybeSingle();
  if (found) return found as Record<string, unknown>;
  // After a final, the page shows that final (with New version) — it never starts a draft on its own.
  const { data: fin } = await sb.from("job_proposals").select(PROPOSAL_COLS).eq("org_id", orgId).eq("job_id", jobId).eq("status", "final")
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (fin) return fin as Record<string, unknown>;
  if (!create) return null;
  const [{ data: t }, { data: last }] = await Promise.all([
    jobType ? sb.from("org_project_types").select(TYPE_COLS).eq("org_id", orgId).eq("key", jobType).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("job_proposals").select("version").eq("org_id", orgId).eq("job_id", jobId).order("version", { ascending: false }).limit(1),
  ]);
  const version = ((last ?? [])[0]?.version as number | undefined ?? 0) + 1;
  const { data: made, error } = await sb.from("job_proposals")
    .insert({ org_id: orgId, job_id: jobId, version, ...typeDefaults(t ? typeRow(t as Record<string, unknown>) : null) })
    .select(PROPOSAL_COLS).single();
  if (error) {
    const { data: again } = await sb.from("job_proposals").select(PROPOSAL_COLS).eq("org_id", orgId).eq("job_id", jobId).eq("status", "draft").maybeSingle();
    return again as Record<string, unknown> | null;
  }
  return made as Record<string, unknown>;
}

/** Everything the proposal page reads, in one go. */
/** `create: false` (Dusty) never makes a draft — he only reads. */
export async function proposalBundle(sb: Sb, orgId: string, jobId: string, opts: { create?: boolean } = {}) {
  const { data: job } = await sb.from("jobs").select("id, job_number, title, status, address, city, state, zip, description, job_type, contact_id, customer_id, duration_days")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (!job) return null;
  const est = await workingEstimate(sb, orgId, jobId, opts.create !== false);
  const [draft, { data: finals }, { data: optRows }, { data: lines }, { data: secs }, pricing, takeoff, org, { data: types }, { data: templates }, customer, contact, { data: photos }] = await Promise.all([
    draftFor(sb, orgId, jobId, (job.job_type as string | null) ?? null, opts.create !== false),
    sb.from("job_proposals").select("id, version, finalized_at, snapshot").eq("org_id", orgId).eq("job_id", jobId).eq("status", "final").order("version", { ascending: false }),
    est ? sb.from("estimate_options").select("id, label, sort_order").eq("org_id", orgId).eq("estimate_id", est.id as string).order("sort_order") : Promise.resolve({ data: [] }),
    est ? sb.from("estimate_line_items").select(LINE_COLUMNS).eq("estimate_id", est.id as string).order("sort_order").order("name") : Promise.resolve({ data: [] }),
    sb.from("job_sections").select("id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, sort_order, count_qty, count_unit").eq("org_id", orgId).eq("job_id", jobId).order("sort_order"),
    pricingFor(sb, orgId, [jobId]),
    takeoffTotalsFor(sb, orgId, jobId),
    orgRow(sb, orgId),
    sb.from("org_project_types").select(TYPE_COLS).eq("org_id", orgId).order("sort_order"),
    sb.from("doc_templates").select(TEMPLATE_COLS).eq("org_id", orgId).order("kind").order("name"),
    job.customer_id ? sb.from("customers").select("id, name, address_formatted, address_line1, city, state, zip").eq("org_id", orgId).eq("id", job.customer_id as string).maybeSingle().then((r: { data: unknown }) => r.data as Record<string, unknown> | null) : Promise.resolve(null),
    job.contact_id ? sb.from("contacts").select("id, name, phone, email").eq("org_id", orgId).eq("id", job.contact_id as string).maybeSingle().then((r: { data: unknown }) => r.data as Record<string, unknown> | null) : Promise.resolve(null),
    sb.from("job_files").select("id, name, storage_path, fetch_state").eq("org_id", orgId).eq("job_id", jobId).eq("kind", "image").is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
  ]);
  const p = pricing.get(jobId);
  return {
    job, estimate: est ? { ...est, tax_on: est.tax_on !== false, discount_amount: Number(est.discount_amount ?? 0), margin_pct: num(est.margin_pct), overhead_pct: num(est.overhead_pct) } : null,
    proposal: draft, finals: finals ?? [],
    options: optRows ?? [],
    lines: ((lines ?? []) as Array<Record<string, unknown>>).map(numLine),
    sections: ((secs ?? []) as Array<Record<string, unknown>>).map((s) => ({ ...s, length_ft: num(s.length_ft), width_ft: num(s.width_ft), sqft_override: num(s.sqft_override), depth_in: num(s.depth_in), psi: num(s.psi), count_qty: num(s.count_qty) })),
    settings: p?.settings ?? { margin_pct: null, overhead_pct: null, tax_rate_pct: null },
    pricing: p ? { tax: p.tax, days: p.days, margin_from: p.margin_from, overhead_from: p.overhead_from } : null,
    takeoff,
    org: org ? orgView(org) : null,
    types: ((types ?? []) as Array<Record<string, unknown>>).map(typeRow),
    templates: templates ?? [],
    customer, contact,
    photos: ((await signFiles(sb, (photos ?? []) as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>)
      .map((f) => ({ id: f.id as string, name: (f.name as string | null) ?? null, url: (f.url as string | null) ?? null })),
  };
}

export type Bundle = NonNullable<Awaited<ReturnType<typeof proposalBundle>>>;

/** Prices the draft exactly as the page does — for Final, so the snapshot is the server's arithmetic, not the browser's. */
export function priceBundle(b: Bundle) {
  const prop = b.proposal as Record<string, unknown>;
  return priceDraft({
    lines: b.lines as unknown as BudgetLine[], optionIds: (b.options as Array<{ id: string }>).map((o) => o.id),
    settings: b.settings, sections: b.sections as unknown as DraftInput["sections"], days: num(b.job.duration_days),
    tax_on: (b.estimate?.tax_on as boolean | undefined) ?? true, discount: (b.estimate?.discount_amount as number | undefined) ?? 0, takeoff: b.takeoff,
    option_id: (prop.option_id as string | null) ?? null, display: (prop.display ?? {}) as ProposalDisplay, draws: (prop.draws ?? []) as Draw[],
  });
}

export { fillOrg };
