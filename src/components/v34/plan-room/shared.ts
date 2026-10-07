"use client";
/**
 * The Plan Room's shared shapes and helpers (migration 059, design/plan-room).
 */
import type { Pt, TakeoffKind, GroupTotal } from "@/lib/takeoff";
import type { FileRow } from "@/components/v34/files-panel";

export interface PlanFile extends FileRow { in_plan_room?: boolean; source?: string | null; storage_path?: string }
export interface Sheet {
  id: string; job_id: string; file_id: string; page: number; page_w: number; page_h: number;
  number: string | null; title: string | null; discipline: string | null;
  scale_text: string | null; printed_ft_per_pt: number | null;
  scale_ft_per_pt: number | null; scale_method: "title_block" | "manual" | "none" | null; scale_set_at: string | null;
  number_source: string;
  /** OCR of a scanned sheet (migration 064): title block, then the whole sheet. */
  ocr_title_at?: string | null; ocr_at?: string | null; ocr_conf?: number | null; ocr_error?: string | null;
}
export interface Param { id: string; job_id: string; name: string; kind: TakeoffKind; color: string; depth_in: number | null; sort_order: number }
export interface Meas { id: string; parameter_id: string; sheet_id: string; name: string | null; geometry: Pt[]; cutouts: Pt[][]; method: string; sort_order: number; section_id?: string | null; color?: string | null }
/**
 * Colours a shape can take in the Plan Room (migration 070; Coy, 2026-10-03: "different colors for each
 * measurement … it's just for the plan room"). A shape with none takes its group's colour.
 */
export const SHAPE_COLORS = ["#D97757", "#B5412C", "#C98A12", "#E0B33A", "#2F8A5B", "#7FA34A", "#0F7C86", "#1E5AA8", "#6A55B0", "#C2508A", "#5E5A52", "#2A2A2A"];
export const shapeColor = (m: { color?: string | null }, p: { color: string } | null | undefined) => m.color ?? p?.color ?? "#D97757";
export interface PlansData {
  job: { id: string; title: string | null; address: string | null; job_type: string | null; status: string | null; customer_id?: string | null } | null;
  files: PlanFile[]; sheets: Sheet[]; params: Param[]; measurements: Meas[];
  totals: Record<string, GroupTotal>;
  lines: Array<{ id: string; takeoff_parameter_id: string; name: string; unit: string }>;
}

export async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/**
 * A drawing is a sheet you measure on; anything else in a plan file is a page you read
 * (Coy, 2026-10-02: "if it's not a drawing … I should just be able to see the sheets like any
 * reader"). The test is the page's size, not what was read off it — a scanned plan set has no
 * text, so no number or scale is ever found on it. Bigger than legal (8½×14, 1,008 pt) is a
 * drawing, so an 11×17 half-size set counts; a letter or legal page is a document page unless
 * Coy has set a scale on it.
 */
export const isDrawing = (s: Pick<Sheet, "page_w" | "page_h" | "scale_ft_per_pt" | "scale_method">) =>
  Math.max(s.page_w, s.page_h) >= 1150 || !!s.scale_ft_per_pt || s.scale_method === "manual";

export const sheetLabel = (s: Pick<Sheet, "number" | "page">) => s.number ?? `p.${s.page}`;
export const isPlanFile = (f: PlanFile) => f.kind === "pdf" || f.kind === "image";

export const DISC_LABEL: Record<string, string> = {
  G: "General", C: "Civil", L: "Landscape", A: "Architectural", S: "Structural", M: "Mechanical",
  E: "Electrical", P: "Plumbing", FP: "Fire protection", T: "Telecom", I: "Interiors", D: "Demolition", other: "Other",
};
export const DISC_COLOR: Record<string, string> = {
  G: "#8C8578", C: "#2F8A5B", L: "#5E8A3A", A: "#1E5AA8", S: "#B85A3C", M: "#0F7C86", E: "#C98A12", P: "#6A55B0", other: "#B3AA9A",
};
/** Sheets that usually carry concrete — civil and structural. */
export const CONCRETE_DISC = new Set(["C", "S"]);

export const KIND_LABEL: Record<TakeoffKind, string> = { area: "Area", linear: "Linear", count: "Count" };
