"use client";
/**
 * Find zones in Takeoffs (Coy, 2026-10-15) — Dusty looks at the sheet, points at each paving zone
 * the legend tells apart, and Fill traces each one off the PDF (src/lib/plan-zones.ts). The
 * zones are drafts, drawn dashed in a colour per legend entry and labelled Dusty's estimate; Coy
 * drops the wrong ones and keeps the rest, which become takeoffs in a group per entry ("5" Light
 * duty concrete pavement", its thickness as the group's depth). Nothing is saved before Keep.
 */
import React, { useCallback, useState } from "react";
import { T, F, disp, nums } from "@/lib/v34/tokens";
import { MAX_CANVAS_PX, openPdf, pageText, releasePage, renderRegion } from "@/lib/pdf";
import { traceAt } from "@/lib/v34/plan-trace";
import { fmtQty, measurementQty, type Pt } from "@/lib/takeoff";
import { groupNameFor, judgeTrace, matchGroup, sameZone, seedTries, toPage, type ZoneLegend } from "@/lib/plan-zones";
import { Emblem } from "@/components/site/marks";
import { call, sheetLabel, type PlansData, type Sheet } from "./shared";

const ZONE_COLORS = ["#1E5AA8", "#2F8A5B", "#C2508A", "#C98A12", "#6A55B0", "#0F7C86", "#B5412C", "#7FA34A"];

interface Zone { id: number; legend: string; pts: Pt[]; how: "traced" | "rough"; confidence: string; note: string | null }

type Phase = { k: "idle" } | { k: "busy"; line: string } | { k: "ready" } | { k: "error"; msg: string };

/** The whole sheet as a JPEG the model can read: ~2,400 px on its long side, smaller if it's too heavy. */
async function sheetPicture(doc: Awaited<ReturnType<typeof openPdf>>, s: Sheet): Promise<string> {
  for (const long of [2400, 1800, 1400]) {
    const scale = Math.min(long / Math.max(s.page_w, s.page_h), Math.sqrt(Math.min(MAX_CANVAS_PX, 12e6) / (s.page_w * s.page_h)));
    const c = await renderRegion(doc, s.page, { x: 0, y: 0, w: s.page_w, h: s.page_h }, scale, true);
    try {
      const url = c.toDataURL("image/jpeg", 0.82);
      if (url.length < 5_200_000) return url.replace(/^data:image\/jpeg;base64,/, "");
    } finally { c.width = 0; c.height = 0; }
  }
  throw new Error("The sheet is too detailed to send as one picture.");
}

/** The sheet's printed words in reading order (rows top to bottom, left to right). */
async function sheetWords(doc: Awaited<ReturnType<typeof openPdf>>, s: Sheet): Promise<string> {
  try {
    const items = await pageText(s.file_id, doc, s.page);
    return [...items].sort((a, b) => Math.round(a.y / 6) - Math.round(b.y / 6) || a.x - b.x).map((i) => i.str).join(" ");
  } catch { return ""; }
}

export function useDustyZones({ sheet, fileUrl, data, act, jobId }: {
  sheet: Sheet | null; fileUrl: string | null; data: PlansData; jobId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [forSheet, setForSheet] = useState<string | null>(null);
  const [legend, setLegend] = useState<ZoneLegend[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const live = forSheet === sheet?.id;

  const close = useCallback(() => { setPhase({ k: "idle" }); setZones([]); setLegend([]); setNotes(null); setForSheet(null); }, []);

  const find = useCallback(async () => {
    if (!sheet || !fileUrl) return;
    const s = sheet;
    setForSheet(s.id); setZones([]); setLegend([]); setNotes(null);
    setPhase({ k: "busy", line: `Looking at ${sheetLabel(s)}…` });
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    try {
      doc = await openPdf(s.file_id, fileUrl);
      const [image, text] = await Promise.all([sheetPicture(doc, s), sheetWords(doc, s)]);
      setPhase({ k: "busy", line: `Matching the legend to the drawing on ${sheetLabel(s)}… (this can take a minute)` });
      const r = await call(`/api/plan-sheets/${s.id}/zones`, "POST", { image, text });
      const lg = (r.legend ?? []) as ZoneLegend[];
      const guesses = (r.zones ?? []) as Array<{ legend: string; seed: Pt; outline: Pt[]; confidence: string; note: string | null }>;
      setLegend(lg); setNotes((r.notes as string | null) ?? null);
      if (!guesses.length) { setPhase({ k: "ready" }); return; }
      const out: Zone[] = [];
      const step = Math.max(4, Math.max(s.page_w, s.page_h) * 0.004);
      const minArea = (s.page_w * s.page_h) * 0.00005;
      for (let i = 0; i < guesses.length; i++) {
        const g = guesses[i];
        setPhase({ k: "busy", line: `Tracing zone ${i + 1} of ${guesses.length}…` });
        const seed = toPage(g.seed, s.page_w, s.page_h);
        const rough = g.outline.map((p) => toPage(p, s.page_w, s.page_h));
        let pts: Pt[] | null = null;
        // The seed and a few spots round it; then once with hatching left out.
        const tries = seedTries(seed, step).slice(0, 5).map((p) => ({ p, thin: 0 })).concat([{ p: seed, thin: 0.4 }]);
        for (const t of tries) {
          const tr = await traceAt(doc, s.page, s.page_w, s.page_h, t.p, { gapPt: 1, thinPt: t.thin });
          if (tr.ok && judgeTrace(tr.pts, rough, minArea) === "traced") { pts = tr.pts; break; }
        }
        const how = judgeTrace(pts, rough, minArea);
        if (!how) continue;
        const shape = how === "traced" && pts ? pts : rough;
        if (out.some((z) => sameZone(z.pts, shape))) continue;
        out.push({ id: i, legend: g.legend, pts: shape, how, confidence: g.confidence, note: g.note });
        setZones([...out]);
      }
      setPhase({ k: "ready" });
    } catch (e) {
      setPhase({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      if (doc) releasePage(doc, s.page);
    }
  }, [sheet, fileUrl]);

  const color = (key: string) => ZONE_COLORS[Math.max(0, legend.findIndex((l) => l.key === key)) % ZONE_COLORS.length];
  const sf = (pts: Pt[]) => {
    if (!sheet) return null;
    const q = measurementQty("area", { geometry: pts, cutouts: [] }, { ft_per_pt: sheet.scale_ft_per_pt, method: sheet.scale_method, label: sheetLabel(sheet) });
    return q.ok ? q.qty : null;
  };

  const keep = useCallback((only?: string) => act(async () => {
    if (!sheet) return;
    const want = zones.filter((z) => !only || z.legend === only);
    for (const l of legend) {
      const mine = want.filter((z) => z.legend === l.key);
      if (!mine.length) continue;
      let g = matchGroup(l, data.params);
      if (!g) {
        const b = await call(`/api/jobs/${jobId}/takeoff/parameters`, "POST", { name: groupNameFor(l), kind: "area", depth_in: l.thickness_in, color: color(l.key) });
        g = b.parameter;
      }
      for (const z of mine) {
        await call(`/api/jobs/${jobId}/takeoff/measurements`, "POST", { parameter_id: g!.id, sheet_id: sheet.id, geometry: z.pts, method: "area" });
      }
    }
    const left = zones.filter((z) => !want.includes(z));
    setZones(left);
    if (!left.length) close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [act, sheet, zones, legend, data.params, jobId, close]);

  const busy = phase.k === "busy";
  const button = (
    <button onClick={() => (live && phase.k !== "idle" ? close() : void find())} disabled={!sheet || !fileUrl || (busy && !live)}
      title="Dusty looks at this sheet, matches the legend's hatches to the drawing, and traces each zone for you to check"
      className="flex items-center gap-1.5" aria-pressed={live && phase.k !== "idle"}
      style={{ height: 30, padding: "0 8px", border: `1px solid ${live && phase.k !== "idle" ? T.ink : T.hairStrong}`, borderRadius: 3, background: live && phase.k !== "idle" ? T.dustyTint : T.card, color: T.ink, cursor: "pointer", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", flex: "0 0 auto" }}>
      <Emblem size={16} spin={busy} state={busy ? "thinking" : "idle"} /><span className="hidden md:inline">Find zones</span>
    </button>
  );

  const layer = (scale: number) => {
    if (!live || !sheet || !scale || !zones.length) return null;
    const px = 1 / scale;
    return (
      <svg width={sheet.page_w * scale} height={sheet.page_h * scale} viewBox={`0 0 ${sheet.page_w} ${sheet.page_h}`}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2 }} aria-hidden="true">
        {zones.map((z) => {
          const c = color(z.legend);
          const d = "M" + z.pts.map((p) => `${p[0]} ${p[1]}`).join(" L") + " Z";
          const mid = z.pts.reduce((a, p) => [a[0] + p[0] / z.pts.length, a[1] + p[1] / z.pts.length], [0, 0]);
          const l = legend.find((x) => x.key === z.legend);
          const q = sf(z.pts);
          const label = `${l?.thickness_in ? `${l.thickness_in}"` : l?.key ?? ""}${q !== null ? ` · ${fmtQty(q, "SF")}` : ""}${z.how === "rough" ? " · rough" : ""}`;
          return (
            <g key={z.id}>
              <path d={d} fill={c} fillOpacity={z.how === "rough" ? 0.1 : 0.22} stroke={c} strokeWidth={2 * px}
                strokeDasharray={z.how === "rough" ? `${2 * px} ${4 * px}` : `${7 * px} ${4 * px}`} />
              <text x={mid[0]} y={mid[1]} textAnchor="middle" fontSize={12 * px} fontWeight={700} fill={c} stroke="#fff" strokeWidth={3 * px} paintOrder="stroke"
                style={{ fontFamily: "system-ui, sans-serif" }}>{label}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  const panel = live && phase.k !== "idle" ? (
    <div role="dialog" aria-label="Dusty's zones"
      style={{ position: "absolute", top: 46, left: 8, zIndex: 7, width: "min(340px, calc(100% - 16px))", maxHeight: "60%", overflowY: "auto", background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.18)", fontSize: F.xs }}>
      <div className="flex items-center gap-2" style={{ padding: "8px 10px", borderBottom: `1px solid ${T.hair}`, background: T.dustyTint }}>
        <Emblem size={18} spin={busy} state={busy ? "thinking" : phase.k === "error" ? "warn" : "idle"} />
        <b style={{ flex: 1 }}>Dusty&apos;s zones · {sheet ? sheetLabel(sheet) : ""}</b>
        <button onClick={close} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: T.ink3 }}>×</button>
      </div>
      <div style={{ padding: "8px 10px", display: "grid", gap: 8 }}>
        {busy && <div style={{ color: T.ink2 }}>{phase.line}</div>}
        {phase.k === "error" && <div style={{ color: T.red }}>{phase.msg}</div>}
        {!busy && phase.k === "ready" && !zones.length && <div style={{ color: T.ink2 }}>Dusty didn&apos;t find zones he could match to a legend on this sheet.</div>}
        {zones.length > 0 && (
          <div style={{ color: T.ink2, lineHeight: 1.4 }}>
            <b style={{ color: T.ink }}>Dusty&apos;s estimate.</b> Check each outline against the drawing. Drop the wrong ones, then keep the rest as takeoffs.
            {!sheet?.scale_ft_per_pt && <> This sheet&apos;s scale isn&apos;t set, so there are no square feet yet.</>}
          </div>
        )}
        {legend.map((l) => {
          const mine = zones.filter((z) => z.legend === l.key);
          if (!mine.length && !busy) return (
            <div key={l.key} style={{ color: T.ink3 }}>{groupNameFor(l)}: none found on the drawing.</div>
          );
          if (!mine.length) return null;
          const tot = mine.reduce((a, z) => a + (sf(z.pts) ?? 0), 0);
          const c = color(l.key);
          return (
            <div key={l.key} style={{ border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden" }}>
              <div className="flex items-center gap-2" style={{ padding: "6px 8px", background: T.sunk }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, flex: "0 0 auto" }} />
                <b style={{ flex: 1, minWidth: 0 }}>{groupNameFor(l)}</b>
                {tot > 0 && <span style={{ ...nums, fontWeight: 600 }}>{fmtQty(tot, "SF")}</span>}
              </div>
              {mine.map((z, i) => {
                const q = sf(z.pts);
                return (
                  <div key={z.id} className="flex items-center gap-2" style={{ padding: "4px 8px", borderTop: `1px solid ${T.hair}` }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Zone {i + 1}{z.note ? ` · ${z.note}` : ""}
                      <span style={{ color: z.how === "rough" ? T.red : T.ink3 }}> · {z.how === "rough" ? "rough outline, Fill couldn't trace it" : "traced"}{z.confidence === "low" ? " · unsure" : ""}</span>
                    </span>
                    {q !== null && <span style={nums}>{fmtQty(q, "SF")}</span>}
                    <button onClick={() => setZones((zs) => zs.filter((x) => x.id !== z.id))} aria-label="Drop this zone" title="Drop it"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: T.ink3, fontSize: 14 }}>×</button>
                  </div>
                );
              })}
              {!busy && (
                <div style={{ padding: "5px 8px", borderTop: `1px solid ${T.hair}` }}>
                  <button onClick={() => void keep(l.key)} style={{ border: `1px solid ${T.hairStrong}`, background: T.card, borderRadius: 3, padding: "2px 8px", cursor: "pointer", fontSize: F.xs }}>
                    Keep {mine.length === 1 ? "it" : `these ${mine.length}`} in {matchGroup(l, data.params)?.name ?? `a new group`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {notes && <div style={{ color: T.ink2 }}><b>Dusty&apos;s note:</b> {notes}</div>}
        {!busy && zones.length > 0 && (
          <div className="flex gap-2">
            <button onClick={() => void keep()} style={{ flex: 1, border: "none", background: T.ink, color: "#fff", borderRadius: 4, padding: "6px 8px", cursor: "pointer", fontWeight: 600 }}>
              Keep all {zones.length} as takeoffs
            </button>
            <button onClick={close} style={{ border: `1px solid ${T.hairStrong}`, background: T.card, borderRadius: 4, padding: "6px 10px", cursor: "pointer" }}>Drop all</button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return { button, layer, panel };
}
