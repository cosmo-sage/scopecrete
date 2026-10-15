import type { ApiSession } from "@/lib/api-auth";
import { loadTakeoff, sheetScales } from "@/lib/plans-server";
import { sectionPatch, sectionTakeoff, type SectionLink, type SectionTakeoff, type ShapeIn } from "@/lib/takeoff-sections";
import type { ParameterIn } from "@/lib/takeoff";
import { sizePatch, sizeTotals, type SizeRow } from "@/lib/section-sizes";

type Sb = ApiSession["supabase"];

const LINK_COLS = "id, takeoff_sync, sqft_override, count_qty, count_unit, length_ft, width_ft, depth_in";

/** Each section's shapes and what they add up to, for a job (the budget and the job page read this). */
export async function sectionTakeoffs(sb: Sb, orgId: string, jobId: string): Promise<Record<string, SectionTakeoff & { group_ids: string[] }>> {
  const t = await loadTakeoff(sb, orgId, [jobId]);
  const { data: allSheets } = await sb.from("plan_sheets").select("id, page, number, scale_ft_per_pt, scale_method").eq("org_id", orgId).eq("job_id", jobId);
  const scales = sheetScales((allSheets ?? []) as Parameters<typeof sheetScales>[0]);
  const shapes = (await shapesOf(sb, orgId, t.params.map((p) => p.id)));
  const ids = [...new Set(shapes.map((s) => s.section_id).filter(Boolean))] as string[];
  const out: Record<string, SectionTakeoff & { group_ids: string[] }> = {};
  for (const id of ids) {
    const st = sectionTakeoff(id, shapes, t.params as ParameterIn[], scales);
    out[id] = { ...st, group_ids: [...new Set(st.shapes.map((x) => x.parameter_id))] };
  }
  return out;
}

async function shapesOf(sb: Sb, orgId: string, paramIds: string[]): Promise<ShapeIn[]> {
  if (!paramIds.length) return [];
  const { data } = await sb.from("takeoff_measurements").select("id, parameter_id, sheet_id, name, geometry, cutouts, section_id")
    .eq("org_id", orgId).in("parameter_id", paramIds);
  return (data ?? []) as ShapeIn[];
}

/**
 * After any takeoff edit: every section that follows its shapes gets their
 * sum written (only where it changed). `touched` = sections that lost or
 * gained shapes in this edit — one left with none has its size cleared.
 * Session client; every write filters the org and job.
 */
export async function syncTakeoffSections(sb: Sb, orgId: string, jobId: string, touched: Array<string | null | undefined> = []): Promise<number> {
  const { data: secs } = await sb.from("job_sections").select(LINK_COLS).eq("org_id", orgId).eq("job_id", jobId);
  const sections = (secs ?? []) as SectionLink[];
  if (!sections.length) return 0;
  const { data: params } = await sb.from("takeoff_parameters").select("id, name, kind, depth_in").eq("org_id", orgId).eq("job_id", jobId);
  const ps = ((params ?? []) as ParameterIn[]).map((p) => ({ ...p, depth_in: p.depth_in === null ? null : Number(p.depth_in) }));
  const shapes = await shapesOf(sb, orgId, ps.map((p) => p.id));
  const { data: sheets } = await sb.from("plan_sheets").select("id, page, number, scale_ft_per_pt, scale_method").eq("org_id", orgId).eq("job_id", jobId);
  const scales = sheetScales((sheets ?? []) as Parameters<typeof sheetScales>[0]);
  const touch = new Set(touched.filter(Boolean) as string[]);
  const linked = new Set(shapes.map((s) => s.section_id).filter(Boolean) as string[]);
  const withRows = await sizeRowsBySection(sb, orgId, jobId);
  let n = 0;
  for (const s of sections) {
    if (!linked.has(s.id) && !touch.has(s.id)) continue;
    if (withRows[s.id]?.length) {
      if (await writeSizes(sb, orgId, jobId, s.id, withRows[s.id], s.takeoff_sync ? sectionTakeoff(s.id, shapes, ps, scales) : null)) n++;
      continue;
    }
    const patch = sectionPatch({ ...s, sqft_override: num(s.sqft_override), count_qty: num(s.count_qty), length_ft: num(s.length_ft), width_ft: num(s.width_ft), depth_in: num(s.depth_in) },
      sectionTakeoff(s.id, shapes, ps, scales), touch.has(s.id));
    if (!patch) continue;
    const { error } = await sb.from("job_sections").update({ ...patch, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("job_id", jobId).eq("id", s.id);
    if (!error) n++;
  }
  return n;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The one budget section every takeoff of a group is in, else null — so a takeoff added to (or moved into) a group sent whole follows it. */
export async function groupSection(sb: Sb, orgId: string, parameterId: string): Promise<string | null> {
  const { data } = await sb.from("takeoff_measurements").select("section_id").eq("org_id", orgId).eq("parameter_id", parameterId);
  const ids = new Set(((data ?? []) as Array<{ section_id: string | null }>).map((r) => r.section_id));
  if (ids.size !== 1) return null;
  const [only] = [...ids];
  return only ?? null;
}

export const SIZE_ROW_COLS = "id, section_id, label, mode, length_ft, width_ft, sqft, qty, unit, width_in, depth_in, sort_order";

/** Each section's size rows (migration 111); an empty map when the table isn't there yet. */
export async function sizeRowsBySection(sb: Sb, orgId: string, jobId: string): Promise<Record<string, Array<SizeRow & { id: string; section_id: string }>>> {
  const { data, error } = await sb.from("job_section_sizes").select(SIZE_ROW_COLS).eq("org_id", orgId).eq("job_id", jobId).order("sort_order").order("created_at");
  if (error) return {};
  const out: Record<string, Array<SizeRow & { id: string; section_id: string }>> = {};
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const row = { ...r } as unknown as SizeRow & { id: string; section_id: string };
    for (const f of ["length_ft", "width_ft", "sqft", "qty", "width_in", "depth_in"] as const) row[f] = num(r[f]);
    (out[row.section_id] ??= []).push(row);
  }
  return out;
}

async function writeSizes(sb: Sb, orgId: string, jobId: string, sectionId: string, rows: SizeRow[], t: SectionTakeoff | null): Promise<boolean> {
  const patch = sizePatch(sizeTotals(rows, t && t.unit ? { unit: t.unit, total: t.total, depth_in: t.depth_in } : null));
  if (!patch) return false;
  const { error } = await sb.from("job_sections").update({ ...patch, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("job_id", jobId).eq("id", sectionId);
  return !error;
}

/** After a size row changes: the section's size is the rows' total, plus its takeoffs when it follows them. */
export async function syncSectionSizes(sb: Sb, orgId: string, jobId: string, sectionId: string): Promise<void> {
  const rows = (await sizeRowsBySection(sb, orgId, jobId))[sectionId] ?? [];
  if (!rows.length) return;
  const { data: sec } = await sb.from("job_sections").select("takeoff_sync").eq("org_id", orgId).eq("job_id", jobId).eq("id", sectionId).maybeSingle();
  const t = sec?.takeoff_sync ? (await sectionTakeoffs(sb, orgId, jobId))[sectionId] ?? null : null;
  await writeSizes(sb, orgId, jobId, sectionId, rows, t);
}
