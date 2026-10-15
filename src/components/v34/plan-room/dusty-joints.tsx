"use client";
/**
 * Find joints in Takeoffs (Coy, 2026-10-15: "any way to enable dusty to measure control joint
 * cutting on a parking lot?"). Dusty reads the control joints off the PDF's own lines — the CAD
 * layer that holds them, else whatever is drawn like the legend's control joint sample — joins
 * each dashed line into a run and cuts it where it crosses from one thickness takeoff into
 * another (src/lib/plan-joints.ts). The runs are drafts, drawn over the sheet in a colour per
 * zone and labelled Dusty's estimate; Coy drops a zone's or keeps them, and they become linear
 * takeoffs in the job's control joint group ("Control Joints - Concrete Cutting"). Nothing is
 * saved before Keep.
 */
import React, { useCallback, useState } from "react";
import { T, F, nums, disp } from "@/lib/v34/tokens";
import { openPdf, pageStrokes, pageText, releasePage } from "@/lib/pdf";
import { fmtQty, measurementQty, type Pt } from "@/lib/takeoff";
import { findJoints, jointGroup, zoneLabel, type Piece, type Zone } from "@/lib/plan-joints";
import { Emblem } from "@/components/site/marks";
import { call, sheetLabel, type PlansData, type Sheet } from "./shared";

const ZONE_COLORS = ["#1E5AA8", "#2F8A5B", "#C2508A", "#C98A12", "#6A55B0", "#0F7C86"];
const NONE = "#B5412C";
const GROUP_NAME = "Control Joints - Concrete Cutting";

type Phase = { k: "idle" } | { k: "busy"; line: string } | { k: "ready" } | { k: "error"; msg: string };
type Found = { how: "layer" | "legend"; layer: string | null; zones: Zone[]; pieces: Array<Piece & { id: number }> };

/** The sheet's thickness zones: its area takeoffs whose group has a depth or a thickness in its name. */
function zonesOn(sheet: Sheet, data: PlansData): Zone[] {
  const out: Zone[] = [];
  for (const m of data.measurements) {
    if (m.sheet_id !== sheet.id || m.geometry.length < 3) continue;
    const g = data.params.find((p) => p.id === m.parameter_id);
    if (!g || g.kind !== "area") continue;
    const thick = g.depth_in ?? (/(\d+(\.\d+)?)\s*("|in\b|inch)/i.test(g.name) ? 1 : null);
    if (!thick) continue;
    out.push({ key: g.id, label: zoneLabel(g.name, g.depth_in), poly: m.geometry as Pt[], holes: (m.cutouts ?? []) as Pt[][] });
  }
  return out;
}

export function useDustyJoints({ sheet, fileUrl, data, act, jobId }: {
  sheet: Sheet | null; fileUrl: string | null; data: PlansData; jobId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [forSheet, setForSheet] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const live = forSheet === sheet?.id;

  const close = useCallback(() => { setPhase({ k: "idle" }); setFound(null); setForSheet(null); }, []);

  const find = useCallback(async () => {
    if (!sheet || !fileUrl) return;
    const s = sheet;
    setForSheet(s.id); setFound(null);
    setPhase({ k: "busy", line: `Reading the lines on ${sheetLabel(s)}…` });
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    try {
      doc = await openPdf(s.file_id, fileUrl);
      const [{ strokes, layers }, text] = await Promise.all([pageStrokes(doc, s.page), pageText(s.file_id, doc, s.page).catch(() => [])]);
      const zones = zonesOn(s, data);
      const r = findJoints(strokes, text, layers, zones);
      if (!r.ok) { setPhase({ k: "error", msg: r.reason }); return; }
      setFound({ how: r.how, layer: r.layer, zones, pieces: r.pieces.map((p, id) => ({ ...p, id })) });
      setPhase({ k: "ready" });
    } catch (e) {
      setPhase({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      if (doc) releasePage(doc, s.page);
    }
  }, [sheet, fileUrl, data]);

  const zoneKeys = found ? [...new Set(found.pieces.map((p) => p.zone))] : [];
  const color = (z: string | null) => (z === null ? NONE : ZONE_COLORS[Math.max(0, found?.zones.findIndex((x) => x.key === z) ?? 0) % ZONE_COLORS.length]);
  const label = (z: string | null) => (z === null ? "Outside the thickness takeoffs" : found?.zones.find((x) => x.key === z)?.label ?? "");
  const lf = (ps: Piece[]) => {
    if (!sheet) return null;
    let t = 0;
    for (const p of ps) {
      const q = measurementQty("linear", { geometry: [p.a, p.b], cutouts: [] }, { ft_per_pt: sheet.scale_ft_per_pt, method: sheet.scale_method, label: sheetLabel(sheet) });
      if (!q.ok) return null;
      t += q.qty;
    }
    return t;
  };
  const drop = (z: string | null) => setFound((f) => {
    if (!f) return f;
    const pieces = f.pieces.filter((p) => p.zone !== z);
    if (!pieces.length) { setPhase({ k: "idle" }); setForSheet(null); return null; }
    return { ...f, pieces };
  });

  const keep = useCallback(() => act(async () => {
    if (!sheet || !found) return;
    let g = jointGroup(data.params);
    if (!g) g = (await call(`/api/jobs/${jobId}/takeoff/parameters`, "POST", { name: GROUP_NAME, kind: "linear", depth_in: null, color: "#B5412C" })).parameter;
    const shapes = found.pieces.map((p) => {
      const z = found.zones.find((x) => x.key === p.zone);
      return { geometry: [p.a, p.b], name: z ? `Control joint · ${z.label}` : "Control joint" };
    });
    for (let i = 0; i < shapes.length; i += 500) {
      await call(`/api/jobs/${jobId}/takeoff/measurements/batch`, "POST", { parameter_id: g!.id, sheet_id: sheet.id, shapes: shapes.slice(i, i + 500) });
    }
    close();
  }), [act, sheet, found, data.params, jobId, close]);

  const busy = phase.k === "busy";
  const on = live && phase.k !== "idle";
  const button = (
    <button onClick={() => (on ? close() : void find())} disabled={!sheet || !fileUrl || (busy && !live)}
      title="Dusty reads the control joints off the drawing's lines and splits them by your thickness takeoffs, for you to check"
      className="flex items-center gap-1.5" aria-pressed={on}
      style={{ height: 30, padding: "0 8px", border: `1px solid ${on ? T.ink : T.hairStrong}`, borderRadius: 3, background: on ? T.dustyTint : T.card, color: T.ink, cursor: "pointer", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", flex: "0 0 auto" }}>
      <Emblem size={16} spin={busy} state={busy ? "thinking" : "idle"} /><span className="hidden md:inline">Find joints</span>
    </button>
  );

  const layer = (scale: number) => {
    if (!live || !sheet || !scale || !found) return null;
    const px = 1 / scale;
    return (
      <svg width={sheet.page_w * scale} height={sheet.page_h * scale} viewBox={`0 0 ${sheet.page_w} ${sheet.page_h}`}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2 }} aria-hidden="true">
        {found.pieces.map((p) => (
          <line key={p.id} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke={color(p.zone)} strokeWidth={3 * px} strokeOpacity={0.85}
            strokeDasharray={`${8 * px} ${3 * px}`} strokeLinecap="round" />
        ))}
      </svg>
    );
  };

  const total = found ? lf(found.pieces) : null;
  const panel = on ? (
    <div role="dialog" aria-label="Dusty's control joints"
      style={{ position: "absolute", bottom: 8, left: 8, zIndex: 7, width: "min(340px, calc(100% - 16px))", maxHeight: "55%", overflowY: "auto", background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.18)", fontSize: F.xs }}>
      <div className="flex items-center gap-2" style={{ padding: "8px 10px", borderBottom: `1px solid ${T.hair}`, background: T.dustyTint }}>
        <Emblem size={18} spin={busy} state={busy ? "thinking" : phase.k === "error" ? "warn" : "idle"} />
        <b style={{ flex: 1 }}>Dusty&apos;s control joints · {sheet ? sheetLabel(sheet) : ""}</b>
        <button onClick={close} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: T.ink3 }}>×</button>
      </div>
      <div style={{ padding: "8px 10px", display: "grid", gap: 8 }}>
        {busy && <div style={{ color: T.ink2 }}>{phase.line}</div>}
        {phase.k === "error" && <div style={{ color: T.red }}>{phase.msg}</div>}
        {found && (
          <>
            <div style={{ color: T.ink2, lineHeight: 1.4 }}>
              <b style={{ color: T.ink }}>Dusty&apos;s estimate.</b>{" "}
              {found.how === "layer" ? <>Read from the drawing&apos;s own <b>{found.layer}</b> layer</> : <>Every line drawn like the legend&apos;s control joint</>}
              , {found.pieces.length} runs{total !== null ? <>, <b style={nums}>{fmtQty(total, "LF")}</b></> : null}. Check them against the sheet before you keep them.
              {!sheet?.scale_ft_per_pt && <> This sheet&apos;s scale isn&apos;t set, so there are no feet yet.</>}
              {!found.zones.length && <> There are no thickness takeoffs on this sheet to split them by (Find zones makes them).</>}
            </div>
            <div style={{ border: `1px solid ${T.hair}`, borderRadius: 6, overflow: "hidden" }}>
              {zoneKeys.map((z, i) => {
                const mine = found.pieces.filter((p) => p.zone === z);
                const q = lf(mine);
                return (
                  <div key={z ?? "none"} className="flex items-center gap-2" style={{ padding: "5px 8px", borderTop: i ? `1px solid ${T.hair}` : "none" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color(z), flex: "0 0 auto" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{found.zones.length ? label(z) : "Control joints"} <span style={{ color: T.ink3 }}>· {mine.length} runs</span></span>
                    {q !== null && <span style={{ ...nums, fontWeight: 600 }}>{fmtQty(q, "LF")}</span>}
                    <button onClick={() => drop(z)} aria-label="Drop these" title="Drop these"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: T.ink3, fontSize: 14 }}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => void keep()} style={{ flex: 1, border: "none", background: T.ink, color: "#fff", borderRadius: 4, padding: "6px 8px", cursor: "pointer", fontWeight: 600 }}>
                Keep in {jointGroup(data.params)?.name ?? GROUP_NAME}
              </button>
              <button onClick={close} style={{ border: `1px solid ${T.hairStrong}`, background: T.card, borderRadius: 4, padding: "6px 10px", cursor: "pointer" }}>Drop all</button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const run = () => (on ? close() : void find());
  const ready = !!sheet && !!fileUrl;
  return { button, layer, panel, run, busy: busy && live, active: on, ready };
}
