import type { ApiSession } from "@/lib/api-auth";
import { groupTotals, type GroupTotal, type MeasurementIn, type ParameterIn, type Pt, type SheetScale, type TakeoffKind } from "@/lib/takeoff";

/**
 * The Plan Room's server side (migration 059): a job's plan sheets, takeoff
 * groups and shapes, and each group's measured total — the one reader the
 * Plan Room, the budget, the Dashboard and Dusty all use, so a quantity is
 * the same number everywhere. Session client, org filter explicit; RLS is the
 * enforcement.
 */

type Sb = ApiSession["supabase"];

export const SHEET_COLS = "id, job_id, file_id, page, page_w, page_h, number, title, discipline, scale_text, printed_ft_per_pt, scale_ft_per_pt, scale_method, scale_set_at, number_source, updated_at, ocr_title_at, ocr_at, ocr_conf, ocr_error";
export const PARAM_COLS = "id, job_id, name, kind, color, depth_in, sort_order, updated_at";
export const MEAS_COLS = "id, parameter_id, sheet_id, name, geometry, cutouts, method, sort_order, updated_at";

export interface SheetRow {
  id: string; job_id: string; file_id: string; page: number; page_w: number; page_h: number;
  number: string | null; title: string | null; discipline: string | null;
  scale_text: string | null; printed_ft_per_pt: number | null;
  scale_ft_per_pt: number | null; scale_method: "title_block" | "manual" | "none" | null; scale_set_at: string | null;
  number_source: string; updated_at: string;
  ocr_title_at: string | null; ocr_at: string | null; ocr_conf: number | null; ocr_error: string | null;
}
export interface ParamRow { id: string; job_id: string; name: string; kind: TakeoffKind; color: string; depth_in: number | null; sort_order: number; updated_at: string }
export interface MeasRow { id: string; parameter_id: string; sheet_id: string; name: string | null; geometry: Pt[]; cutouts: Pt[][]; method: string; sort_order: number; updated_at: string }

/** A palette for new groups — the handoff's group colours, in order. */
export const GROUP_COLORS = ["#D97757", "#2F8A5B", "#C98A12", "#6A55B0", "#0F7C86", "#1E5AA8", "#B5412C", "#5E5A52"];

export function sheetScales(sheets: SheetRow[]): Record<string, SheetScale> {
  const out: Record<string, SheetScale> = {};
  for (const s of sheets) out[s.id] = { ft_per_pt: s.scale_ft_per_pt, method: s.scale_method, label: s.number ?? `p.${s.page}` };
  return out;
}

export async function loadTakeoff(sb: Sb, orgId: string, jobIds: string[]): Promise<{
  sheets: SheetRow[]; params: ParamRow[]; measurements: MeasRow[]; totals: Record<string, GroupTotal>;
}> {
  if (!jobIds.length) return { sheets: [], params: [], measurements: [], totals: {} };
  const [sh, pr, rf] = await Promise.all([
    sb.from("plan_sheets").select(SHEET_COLS).eq("org_id", orgId).in("job_id", jobIds).order("file_id").order("page"),
    sb.from("takeoff_parameters").select(PARAM_COLS).eq("org_id", orgId).in("job_id", jobIds).order("sort_order").order("created_at"),
    sb.from("job_files").select("id").eq("org_id", orgId).in("job_id", jobIds).eq("in_plan_room", true).is("deleted_at", null),
  ]);
  const allSheets = ((sh.data ?? []) as SheetRow[]).map((s) => ({ ...s, page_w: Number(s.page_w), page_h: Number(s.page_h) }));
  const params = ((pr.data ?? []) as ParamRow[]).map((p) => ({ ...p, depth_in: p.depth_in === null ? null : Number(p.depth_in) }));
  let measurements: MeasRow[] = [];
  if (params.length) {
    const { data } = await sb.from("takeoff_measurements").select(MEAS_COLS).eq("org_id", orgId).in("parameter_id", params.map((p) => p.id)).order("sort_order").order("created_at");
    measurements = (data ?? []) as MeasRow[];
  }
  // Every sheet's scale counts toward the totals; the Plan Room lists only the sheets of files
  // that are IN it (a spec book taken out of the room takes its pages with it — Burgess Ave,
  // 2026-10-02) and any sheet something was measured on.
  const totals = groupTotals(params as ParameterIn[], measurements as MeasurementIn[], sheetScales(allSheets));
  const inRoom = new Set(((rf.data ?? []) as Array<{ id: string }>).map((f) => f.id));
  const measured = new Set(measurements.map((m) => m.sheet_id));
  const sheets = allSheets.filter((s) => inRoom.has(s.file_id) || measured.has(s.id));
  return { sheets, params, measurements, totals };
}

/** The engine's view of a job's takeoff: { parameter id → total }. */
export async function takeoffTotalsFor(sb: Sb, orgId: string, jobId: string) {
  const { totals } = await loadTakeoff(sb, orgId, [jobId]);
  return totals;
}

/** Every id the caller names is checked against the org (and job) before use. */
export async function paramInJob(sb: Sb, orgId: string, jobId: string, id: string): Promise<ParamRow | null> {
  const { data } = await sb.from("takeoff_parameters").select(PARAM_COLS).eq("org_id", orgId).eq("job_id", jobId).eq("id", id).maybeSingle();
  return (data as ParamRow | null) ?? null;
}
export async function sheetInJob(sb: Sb, orgId: string, jobId: string, id: string): Promise<SheetRow | null> {
  const { data } = await sb.from("plan_sheets").select(SHEET_COLS).eq("org_id", orgId).eq("job_id", jobId).eq("id", id).maybeSingle();
  return (data as SheetRow | null) ?? null;
}

/** Points in, cleaned: finite numbers inside a generous page box, at most `max`. */
export function cleanPoints(v: unknown, max = 2000): Pt[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > max) return null;
  const out: Pt[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) return null;
    out.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }
  return out;
}
