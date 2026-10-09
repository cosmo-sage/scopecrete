"use client";
/**
 * Click-to-fill in Takeoffs: the part of the sheet round the click is drawn by pdf.js (sharp,
 * 3 px a point), and src/lib/plan-fill.ts traces the outline the click is inside. When the
 * flood runs off that window the area is bigger than it, so a wider window is drawn, then the
 * whole sheet. Nothing is saved here — the outline comes back as a draft in page points.
 */
import { renderRegion, MAX_CANVAS_PX, type Doc } from "@/lib/pdf";
import { traceFill } from "@/lib/plan-fill";
import type { Pt } from "@/lib/takeoff";

export interface TraceOptions {
  /** Bridge gaps up to this many points. */
  gapPt: number;
  /** Leave out lines drawn thinner than this many points (hatching, dimension lines). 0 = keep all. */
  thinPt: number;
}

export type Trace = { ok: true; pts: Pt[] } | { ok: false; reason: string };

const REASON: Record<string, string> = {
  on_line: "That's on a line. Click inside the area.",
  open: "No closed outline around that spot. The outline may have a gap (try Bridge gaps), or the area is bigger than Skip thin lines can look at. Or draw it with Area.",
  too_small: "That space is too small to be an area. Click inside the slab.",
};

export async function traceAt(doc: Doc, page: number, pageW: number, pageH: number, at: Pt, o: TraceOptions): Promise<Trace> {
  const cap = Math.min(MAX_CANVAS_PX, 12e6);
  const whole = Math.min(2, Math.sqrt(cap / Math.max(1, pageW * pageH)));
  // Thin lines are told apart by the width pdf.js draws them at, and it draws anything under a
  // pixel as one pixel: so skipping them needs at least ~4 px a point, and a smaller window.
  const fine = o.thinPt > 0 ? Math.max(3, 1.6 / o.thinPt) : 0;
  const tries: Array<{ scale: number; win: number | null }> = fine
    ? [{ scale: fine, win: 1800 / fine }, { scale: fine, win: Math.sqrt(cap) / fine }]
    : [{ scale: 3, win: 600 }, { scale: 1.5, win: 1300 }, { scale: whole, win: null }];
  let last = "open";
  for (const t of tries) {
    const w = t.win ? Math.min(pageW, t.win) : pageW, h = t.win ? Math.min(pageH, t.win) : pageH;
    const x = Math.max(0, Math.min(pageW - w, at[0] - w / 2)), y = Math.max(0, Math.min(pageH - h, at[1] - h / 2));
    const c = await renderRegion(doc, page, { x, y, w, h }, t.scale, true, o.thinPt * t.scale);
    try {
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { ok: false, reason: "This browser can't read the drawing." };
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const sx = Math.min(c.width - 1, Math.max(0, Math.round((at[0] - x) * t.scale)));
      const sy = Math.min(c.height - 1, Math.max(0, Math.round((at[1] - y) * t.scale)));
      const f = traceFill(img.data, c.width, c.height, sx, sy, {
        gap: Math.round(o.gapPt * t.scale), thin: 0, tol: 1.2,
      });
      if (f.ok) return { ok: true, pts: f.pts.map(([px, py]) => [x + px / t.scale, y + py / t.scale] as Pt) };
      last = f.reason;
      if (f.reason !== "open") break;
      // Already the whole sheet: a bigger window can't help.
      if (w >= pageW && h >= pageH) break;
    } finally { c.width = 0; c.height = 0; }
  }
  return { ok: false, reason: REASON[last] ?? REASON.open };
}
