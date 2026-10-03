"use client";
/**
 * Each area's map and photos on the proposal's Scope (Coy, 2026-10-03: "This
 * way the customer can easily understand what this section is covering. They
 * will have the map view + photos for that map area").
 *
 * The map is the area's own takeoff shapes (migration 069) drawn on the part of
 * their sheet — the aerial, or a plan page — that holds them; the photos are
 * the job's photos filed on the area or on one of its shapes. Read live from
 * the Plan Room, like the cover photo. Nothing here measures or prices.
 */
import React, { useEffect, useState } from "react";
import { openPdf, renderRegion } from "@/lib/pdf";
import type { PlansData } from "@/components/v34/plan-room/shared";

type Pt = [number, number];
export interface AreaVisual {
  map: {
    fileId: string; url: string; page: number;
    box: { x: number; y: number; w: number; h: number };
    shapes: Array<{ kind: "area" | "linear" | "count"; color: string; geometry: Pt[]; cutouts: Pt[][] }>;
  } | null;
  photos: Array<{ id: string; url: string; name: string }>;
}

/** What each area has to show, from the Plan Room's data. */
export function areaVisuals(plans: PlansData | null, areaIds: string[]): Record<string, AreaVisual> {
  const out: Record<string, AreaVisual> = {};
  if (!plans) return out;
  const params = new Map(plans.params.map((p) => [p.id, p]));
  const sheets = new Map(plans.sheets.map((s) => [s.id, s]));
  const files = new Map(plans.files.map((f) => [f.id, f]));
  for (const id of areaIds) {
    const mine = plans.measurements.filter((m) => m.section_id === id && params.has(m.parameter_id));
    // The sheet that holds most of the area's shapes.
    const count = new Map<string, number>();
    for (const m of mine) count.set(m.sheet_id, (count.get(m.sheet_id) ?? 0) + 1);
    const sheetId = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const sheet = sheetId ? sheets.get(sheetId) : null;
    const file = sheet ? files.get(sheet.file_id) : null;
    let map: AreaVisual["map"] = null;
    if (sheet && file?.url) {
      const on = mine.filter((m) => m.sheet_id === sheet.id);
      const xs = on.flatMap((m) => m.geometry.map((p) => p[0])), ys = on.flatMap((m) => m.geometry.map((p) => p[1]));
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      // Room around the shapes so the customer sees where they sit; never smaller than a fifth of the sheet.
      const side = Math.max(x1 - x0, y1 - y0, Math.min(sheet.page_w, sheet.page_h) / 5);
      const w = Math.min(sheet.page_w, Math.max(x1 - x0, side) * 1.5), h = Math.min(sheet.page_h, Math.max(y1 - y0, side * 0.6) * 1.5);
      const x = Math.max(0, Math.min(sheet.page_w - w, (x0 + x1) / 2 - w / 2)), y = Math.max(0, Math.min(sheet.page_h - h, (y0 + y1) / 2 - h / 2));
      map = {
        fileId: file.id, url: file.url, page: sheet.page, box: { x, y, w, h },
        shapes: on.map((m) => { const p = params.get(m.parameter_id)!; return { kind: p.kind, color: p.color, geometry: m.geometry as Pt[], cutouts: (m.cutouts ?? []) as Pt[][] }; }),
      };
    }
    const shapeIds = new Set(mine.map((m) => m.id));
    const photos = plans.files
      .filter((f) => f.kind === "image" && f.url && (f.section_id === id || (f.takeoff_measurement_id && shapeIds.has(f.takeoff_measurement_id))))
      .map((f) => ({ id: f.id, url: f.url as string, name: f.name }));
    if (map || photos.length) out[id] = { map, photos };
  }
  return out;
}

const cache = new Map<string, string>();

/** The part of the sheet that holds the area, with its shapes drawn on it. */
export function AreaMap({ map, height }: { map: NonNullable<AreaVisual["map"]>; height: number }) {
  const key = `${map.fileId}:${map.page}:${map.box.x.toFixed(0)},${map.box.y.toFixed(0)},${map.box.w.toFixed(0)},${map.box.h.toFixed(0)}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (cache.has(key)) return;
    let off = false;
    // ~900 px across: sharp in print, small enough to keep in memory.
    const scale = Math.min(4, 900 / map.box.w);
    openPdf(map.fileId, map.url)
      .then((doc) => renderRegion(doc, map.page, map.box, scale))
      .then((c) => { const u = c.toDataURL("image/jpeg", 0.85); cache.set(key, u); if (!off) setSrc(u); })
      .catch(() => { if (!off) setErr(true); });
    return () => { off = true; };
  }, [key, map]);
  const { x, y, w, h } = map.box;
  const sw = w / 300;
  const path = (pts: Pt[], close: boolean) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (close ? " Z" : "");
  return (
    <div style={{ position: "relative", width: `min(100%, ${Math.round((height * w) / h)}px)`, aspectRatio: `${w} / ${h}`, background: "#E9E4DA", border: "1px solid #E6DCC8", borderRadius: 3, overflow: "hidden", flex: "0 0 auto" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn in the browser, printed */}
      {src && <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
      {!src && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8C8578" }}>{err ? "Map can't be drawn" : "Drawing the map…"}</div>}
      <svg viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
        {map.shapes.map((s, i) => s.kind === "count"
          ? <g key={i}>{s.geometry.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r={sw * 4} fill={s.color} stroke="#fff" strokeWidth={sw} />)}</g>
          : s.kind === "linear"
            ? <path key={i} d={path(s.geometry, false)} fill="none" stroke={s.color} strokeWidth={sw * 3} strokeLinejoin="round" strokeLinecap="round" />
            : <path key={i} d={path(s.geometry, true) + s.cutouts.map((c) => " " + path(c, true)).join("")} fillRule="evenodd" fill={s.color} fillOpacity={0.3} stroke={s.color} strokeWidth={sw * 2} />)}
      </svg>
    </div>
  );
}
