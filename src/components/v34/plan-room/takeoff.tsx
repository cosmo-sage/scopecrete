"use client";
/**
 * Plan Room step 3 — Takeoff (design/plan-room; Coy, 2026-09-30: "a tool for
 * me to do takeoffs manually"). The sheet is drawn by pdf.js on a canvas with
 * an SVG layer over it in PDF points, so a shape is the same at any zoom. The
 * tree on the left is JobTread's: groups (Area / Linear / Count) that total
 * their shapes, each shape its own row.
 *
 * Nothing is counted on a sheet whose scale isn't set: the shape is drawn and
 * kept, and its row says "scale not set" until Coy applies the printed scale
 * or measures a known dimension (src/lib/takeoff.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, strong, light, nums } from "@/lib/v34/tokens";
import { openPdf, drawPage } from "@/lib/pdf";
import { dist, fmtQty, parseFeet, rectPoints, scaleFromPoints, scaleLabel, KIND_UNIT, type Pt, type TakeoffKind } from "@/lib/takeoff";
import { call, KIND_LABEL, sheetLabel, type Meas, type Param, type PlanFile, type PlansData, type Sheet } from "./shared";
import { ScaleBadge } from "./files-sheets";

type Tool = "select" | "area" | "rect" | "linear" | "count" | "cutout" | "scale";
const TOOL_KIND: Partial<Record<Tool, TakeoffKind>> = { area: "area", rect: "area", linear: "linear", count: "count" };

function KindIcon({ kind, color }: { kind: TakeoffKind; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      {kind === "area" && <path d="M2.5 4.5 8 2l5.5 3v6.5L8 14l-5.5-3z" fill={color} fillOpacity=".18" />}
      {kind === "linear" && <path d="M2 12 6 6l4 3 4-6" />}
      {kind === "count" && <><circle cx="4" cy="5" r="1.6" fill={color} /><circle cx="11" cy="4.5" r="1.6" fill={color} /><circle cx="7.5" cy="11" r="1.6" fill={color} /></>}
    </svg>
  );
}

const TOOLS: Array<[Tool, string, string]> = [
  ["select", "Select", "Pick a shape"],
  ["area", "Area", "Click the corners; click the first one (or double-click) to close"],
  ["rect", "Rect", "Two opposite corners"],
  ["linear", "Linear", "Click along the line; double-click or Finish to end"],
  ["count", "Count", "Click each one; Finish when done"],
  ["cutout", "Cutout", "Draw a hole in the selected area"],
  ["scale", "Scale", "Click both ends of a dimension you know, then type it"],
];

export function TakeoffStep({ jobId, data, files, sheetId, setSheetId, reload, onSend, fullscreen, setFullscreen }: {
  jobId: string; data: PlansData; files: PlanFile[];
  sheetId: string | null; setSheetId: (id: string) => void; reload: () => Promise<void>;
  onSend: (p: Param) => void; fullscreen: boolean; setFullscreen: (v: boolean) => void;
}) {
  const sheets = data.sheets;
  const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0] ?? null;
  const file = sheet ? files.find((f) => f.id === sheet.file_id) ?? null : null;
  const [tool, setTool] = useState<Tool>("select");
  const [groupId, setGroupId] = useState<string | null>(data.params[0]?.id ?? null);
  const [selId, setSelId] = useState<string | null>(null);
  // A draft belongs to one sheet and one tool; switching either drops it.
  const draftKey = `${sheet?.id ?? ""}:${tool}`;
  const [draftState, setDraftState] = useState<{ k: string; pts: Pt[] }>({ k: "", pts: [] });
  const draft = useMemo(() => (draftState.k === draftKey ? draftState.pts : []), [draftState, draftKey]);
  const setDraft: React.Dispatch<React.SetStateAction<Pt[]>> = useCallback((v) => {
    setDraftState((cur) => {
      const prev = cur.k === draftKey ? cur.pts : [];
      return { k: draftKey, pts: typeof v === "function" ? (v as (p: Pt[]) => Pt[])(prev) : v };
    });
  }, [draftKey]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panel, setPanel] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scaleAskState, setScaleAskState] = useState<{ k: string; a: Pt; b: Pt } | null>(null);
  const scaleAsk = scaleAskState?.k === draftKey ? scaleAskState : null;
  const setScaleAsk = useCallback((v: { a: Pt; b: Pt } | null) => setScaleAskState(v ? { ...v, k: draftKey } : null), [draftKey]);
  const group = data.params.find((p) => p.id === groupId) ?? null;
  const sel = data.measurements.find((m) => m.id === selId) ?? null;

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [reload]);

  const pickTool = (t: Tool) => {
    setMsg(null);
    const k = TOOL_KIND[t];
    if (k && (!group || group.kind !== k)) {
      const g = data.params.find((p) => p.kind === k);
      if (g) setGroupId(g.id);
      else { setMsg(`Add ${k === "area" ? "an area" : `a ${k}`} group first — the + Group button.`); return; }
    }
    if (t === "cutout" && (!sel || data.params.find((p) => p.id === sel.parameter_id)?.kind !== "area")) { setMsg("Select an area shape first, then draw the hole."); return; }
    setTool(t);
  };

  const save = useCallback(async (pts: Pt[]) => {
    if (!sheet) return;
    if (tool === "cutout" && sel) {
      await act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${sel.id}`, "PATCH", { cutouts: [...(sel.cutouts ?? []), pts] }));
    } else if (tool === "scale") {
      if (pts.length === 2) setScaleAsk({ a: pts[0], b: pts[1] });
      return;
    } else if (group) {
      const method = tool === "rect" ? "rect" : tool === "area" ? "area" : tool;
      await act(async () => {
        const b = await call(`/api/jobs/${jobId}/takeoff/measurements`, "POST", { parameter_id: group.id, sheet_id: sheet.id, geometry: pts, method });
        setSelId(b.measurement.id);
      });
    }
    setDraft([]);
  }, [act, group, jobId, sel, sheet, tool, setDraft, setScaleAsk]);

  const finish = useCallback(() => {
    const need = tool === "linear" || tool === "scale" ? 2 : tool === "count" ? 1 : 3;
    if (draft.length >= need) void save(draft);
  }, [draft, save, tool]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") { if (draft.length) setDraft([]); else if (fullscreen) setFullscreen(false); else setTool("select"); }
      if (e.key === "Backspace" && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
      if (e.key === "Enter") finish();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [draft.length, finish, fullscreen, setFullscreen, setDraft]);

  const wrap: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 90, background: T.slab, display: "flex" }
    : { display: "flex", minHeight: 0, height: "calc(100dvh - var(--sc-head) - 110px)" };

  return (
    <div style={wrap} className="flex-col lg:flex-row">
      {/* ---- parameters ---- */}
      {panel ? (
        <ParamPanel jobId={jobId} data={data} groupId={groupId} setGroupId={setGroupId} selId={selId}
          onSelect={(m) => { setSelId(m.id); setGroupId(m.parameter_id); if (m.sheet_id !== sheet?.id) setSheetId(m.sheet_id); setTool("select"); }}
          act={act} onSend={onSend} onCollapse={() => setPanel(false)} />
      ) : (
        <button onClick={() => setPanel(true)} aria-label="Show parameters" className="hidden lg:flex flex-col items-center pt-3 gap-2"
          style={{ width: 44, borderRight: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
          <span style={{ fontSize: 16 }}>›</span>
          <span style={{ ...eyebrow, writingMode: "vertical-rl", color: T.ink3 }}>Parameters · {data.params.length}</span>
        </button>
      )}

      {/* ---- canvas ---- */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0, minHeight: 320 }}>
        <div className="flex items-center gap-1 px-2 overflow-x-auto" style={{ height: 42, flex: "0 0 auto", background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          {!panel && <button onClick={() => setPanel(true)} className="lg:hidden" style={tb(false)}>Groups</button>}
          {TOOLS.map(([k, label, hint]) => (
            <button key={k} onClick={() => pickTool(k)} title={hint} aria-pressed={tool === k} style={tb(tool === k)}>{label}</button>
          ))}
          <button disabled title="Not yet — Dusty doesn't read drawings" style={{ ...tb(false), opacity: 0.45, cursor: "not-allowed" }}>Auto</button>
          <span className="flex-1" />
          {sheet && <span className="hidden md:inline" style={{ fontSize: F.xs, color: T.ink2, whiteSpace: "nowrap" }}>{sheetLabel(sheet)} · <ScaleBadge s={sheet} small /></span>}
          <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Zoom out" style={tb(false)}>−</button>
          <span style={{ fontFamily: strong, fontSize: 11, width: 38, textAlign: "center", ...nums }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(8, z * 1.25))} aria-label="Zoom in" style={tb(false)}>+</button>
          <button onClick={() => setFullscreen(!fullscreen)} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}
            style={{ ...tb(false), width: 30, padding: 0, background: fullscreen ? T.dark : T.card, color: fullscreen ? "#fff" : T.ink }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ margin: "auto" }}>
              {fullscreen ? <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                : <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />}
            </svg>
          </button>
        </div>

        {sheet && <ScaleBar sheet={sheet} act={act} startScale={() => pickTool("scale")} />}
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Floats over the sheet so starting a shape never moves the drawing under the next click. */}
        {(msg || draft.length > 0 || scaleAsk) && (
          <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap" style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, background: msg ? T.redDim : T.dustyTint, borderTop: `1px solid ${T.hair}`, fontSize: F.xs, boxShadow: "0 -2px 6px rgba(42,32,20,.08)" }}>
            {msg && <span style={{ color: T.red }}>{msg}</span>}
            {!msg && draft.length > 0 && !scaleAsk && (
              <>
                <span>{tool === "count" ? `${draft.length} counted` : `${draft.length} point${draft.length === 1 ? "" : "s"}`} — {TOOLS.find((t) => t[0] === tool)?.[2]}</span>
                {(tool === "area" || tool === "linear" || tool === "count" || tool === "cutout") && <button onClick={finish} style={tb(true)}>Finish</button>}
                <button onClick={() => setDraft((d) => d.slice(0, -1))} style={tb(false)}>Undo point</button>
                <button onClick={() => setDraft([])} style={tb(false)}>Cancel</button>
              </>
            )}
            {scaleAsk && sheet && <ScaleAsk a={scaleAsk.a} b={scaleAsk.b} onCancel={() => { setScaleAsk(null); setDraft([]); }}
              onSet={(k) => act(async () => { await call(`/api/plan-sheets/${sheet.id}`, "PATCH", { scale_method: "manual", scale_ft_per_pt: k }); setScaleAsk(null); setDraft([]); setTool("select"); })} />}
          </div>
        )}

        {sheet && file?.url ? (
          <Drawing key={sheet.id} sheet={sheet} fileUrl={file.url} zoom={zoom} setZoom={setZoom} tool={tool}
            data={data} groupId={groupId} selId={selId} setSelId={(id) => { setSelId(id); const m = data.measurements.find((x) => x.id === id); if (m) setGroupId(m.parameter_id); }}
            draft={draft} setDraft={setDraft} hover={hover} setHover={setHover} save={save} busy={busy} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6" style={{ fontSize: F.sm, color: T.ink3 }}>
            {sheet ? "This sheet's file can't be opened right now." : "No sheets yet — add a plan PDF on the Files step."}
          </div>
        )}
        </div>

        {sheets.length > 1 && (
          <div className="flex gap-1 px-2 py-1 overflow-x-auto" style={{ flex: "0 0 auto", background: T.card, borderTop: `1px solid ${T.hair}` }}>
            {sheets.map((s) => (
              <button key={s.id} onClick={() => setSheetId(s.id)} style={{ ...tb(s.id === sheet?.id), height: 26, fontFamily: strong, fontSize: 11 }}>
                {sheetLabel(s)}{s.scale_ft_per_pt ? "" : " ·?"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const tb = (on: boolean): React.CSSProperties => ({
  height: 30, padding: "0 10px", borderRadius: 3, flex: "0 0 auto", cursor: "pointer",
  border: `1px solid ${on ? T.hiviz : T.hair}`, background: on ? T.hivizDim : T.card, color: on ? T.hivizText : T.ink,
  fontFamily: disp, fontSize: 12.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase",
});

/** The sheet's scale and what can be done about it. */
function ScaleBar({ sheet, act, startScale }: { sheet: Sheet; act: (fn: () => Promise<unknown>) => Promise<void>; startScale: () => void }) {
  if (sheet.scale_ft_per_pt) return null;
  const patch = (b: Record<string, unknown>) => act(() => call(`/api/plan-sheets/${sheet.id}`, "PATCH", b));
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap" style={{ background: T.sunDim, color: T.sun, borderBottom: `1px solid ${T.hair}`, fontSize: F.xs }}>
      <span>
        {sheet.scale_method === "none" ? "Marked not to scale — areas and lengths here aren't counted."
          : sheet.printed_ft_per_pt ? `This sheet prints ${sheet.scale_text}. Nothing is counted here until you apply it or measure a known dimension.`
          : "No scale on this sheet yet. Measure a known dimension to set it — nothing is counted here until then."}
      </span>
      {sheet.printed_ft_per_pt && sheet.scale_method !== "none" && <button onClick={() => void patch({ scale_method: "title_block" })} style={tb(true)}>Use {scaleLabel(sheet.printed_ft_per_pt)}</button>}
      <button onClick={startScale} style={tb(false)}>Measure a dimension</button>
      {sheet.scale_method !== "none" ? <button onClick={() => void patch({ scale_method: "none" })} style={tb(false)}>Not to scale</button>
        : <button onClick={() => void patch({ scale_method: null })} style={tb(false)}>Undo</button>}
    </div>
  );
}

function ScaleAsk({ a, b, onSet, onCancel }: { a: Pt; b: Pt; onSet: (k: number) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  const ft = parseFeet(v);
  const k = ft !== null ? scaleFromPoints(a, b, ft) : null;
  return (
    <form className="flex items-center gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); if (k) onSet(k); }}>
      <span style={{ color: T.ink }}>How long is that, for real?</span>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={"30'-6\""} aria-label="Real length"
        style={{ width: 90, height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink, fontFamily: strong }} />
      {k && <span style={{ color: T.ink2 }}>→ {scaleLabel(k)}</span>}
      {v && ft === null && <span style={{ color: T.red }}>Type feet and inches, like 30&apos;-6&quot;</span>}
      <button type="submit" disabled={!k} style={{ ...tb(true), opacity: k ? 1 : 0.5 }}>Set scale</button>
      <button type="button" onClick={onCancel} style={tb(false)}>Cancel</button>
    </form>
  );
}

/* --------------------------------------------------------------- drawing */

function Drawing({ sheet, fileUrl, zoom, setZoom, tool, data, groupId, selId, setSelId, draft, setDraft, hover, setHover, save, busy }: {
  sheet: Sheet; fileUrl: string; zoom: number; setZoom: (f: (z: number) => number) => void; tool: Tool;
  data: PlansData; groupId: string | null; selId: string | null; setSelId: (id: string | null) => void;
  draft: Pt[]; setDraft: React.Dispatch<React.SetStateAction<Pt[]>>; hover: Pt | null; setHover: (p: Pt | null) => void;
  save: (pts: Pt[]) => Promise<void>; busy: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [fitW, setFitW] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitW(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = fitW > 0 ? (fitW / sheet.page_w) * zoom : 0;
  const w = sheet.page_w * scale, h = sheet.page_h * scale;

  // Draw the page — after a zoom settles, so zooming stays quick.
  useEffect(() => {
    if (!scale || !canvas.current) return;
    let cancel: (() => void) | null = null;
    let off = false;
    const t = setTimeout(() => {
      openPdf(sheet.file_id, fileUrl).then((doc) => {
        if (off || !canvas.current) return;
        const job = drawPage(doc, sheet.page, canvas.current, scale);
        cancel = job.cancel;
        return job.done.then(() => { if (!off) setDrawn(true); });
      }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    }, 120);
    return () => { off = true; clearTimeout(t); cancel?.(); };
  }, [sheet.file_id, sheet.page, fileUrl, scale]);

  const toPage = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * sheet.page_w, ((e.clientY - r.top) / r.height) * sheet.page_h];
  };
  const px = scale || 1; // CSS px per point
  const near = (a: Pt, b: Pt) => dist(a, b) * px < 10;

  const click = (e: React.PointerEvent<SVGSVGElement>) => {
    if (busy || tool === "select") return;
    const p = toPage(e);
    if (tool === "rect") {
      if (!draft.length) setDraft([p]);
      else void save(rectPoints(draft[0], p));
      return;
    }
    if (tool === "scale") {
      if (!draft.length) setDraft([p]);
      else if (draft.length === 1) { const pts: Pt[] = [draft[0], p]; setDraft(pts); void save(pts); }
      return;
    }
    if ((tool === "area" || tool === "cutout") && draft.length >= 3 && near(p, draft[0])) { void save(draft); return; }
    if (draft.length && near(p, draft[draft.length - 1])) return; // a double-click's second click
    setDraft((d) => [...d, p]);
  };
  const dbl = () => {
    if (tool === "area" || tool === "cutout") { if (draft.length >= 3) void save(draft); }
    else if (tool === "linear") { if (draft.length >= 2) void save(draft); }
  };

  const params = new Map(data.params.map((p) => [p.id, p]));
  const mine = data.measurements.filter((m) => m.sheet_id === sheet.id);
  const selM = mine.find((m) => m.id === selId) ?? null;
  const selGroup = selM ? params.get(selM.parameter_id) : null;
  const part = (m: Meas) => data.totals[m.parameter_id]?.parts.find((x) => x.id === m.id);
  const sw = 2 / px, r = 5 / px;
  const pathOf = (pts: Pt[], close: boolean) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (close ? " Z" : "");
  const grp = data.params.find((p) => p.id === groupId);
  const draftColor = tool === "cutout" ? T.red : tool === "scale" ? "#1E5AA8" : grp?.color ?? T.hiviz;

  return (
    <div ref={box} className="flex-1 overflow-auto" style={{ background: T.sunk, padding: 12, paddingBottom: 56, position: "relative", minHeight: 0 }}
      onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(8, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))); } }}>
      {err && <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open the plan: {err}</div>}
      <div style={{ position: "relative", width: w || "100%", height: h || 200, background: "#fff", boxShadow: "0 2px 10px rgba(42,32,20,.12)" }}>
        <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: w, height: h, opacity: drawn ? 1 : 0.4 }} />
        {scale > 0 && (
          <svg viewBox={`0 0 ${sheet.page_w} ${sheet.page_h}`} preserveAspectRatio="none" width={w} height={h}
            style={{ position: "absolute", inset: 0, cursor: tool === "select" ? "default" : "crosshair", touchAction: draft.length ? "none" : "pan-x pan-y" }}
            onPointerUp={click} onDoubleClick={dbl}
            onPointerMove={(e) => { if (tool !== "select") setHover(toPage(e)); }} onPointerLeave={() => setHover(null)}>
            {mine.map((m) => {
              const p = params.get(m.parameter_id);
              if (!p) return null;
              const isSel = m.id === selId;
              const op = !selM ? 0.8 : isSel ? 1 : m.parameter_id === selM.parameter_id ? 0.7 : 0.14;
              const pick = (e: React.PointerEvent) => { if (tool === "select") { e.stopPropagation(); setSelId(m.id); } };
              if (p.kind === "count") return (
                <g key={m.id} opacity={op} onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }}>
                  {m.geometry.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={r * (isSel ? 1.3 : 1)} fill={p.color} stroke="#fff" strokeWidth={sw / 2} />)}
                </g>
              );
              if (p.kind === "linear") return (
                <path key={m.id} d={pathOf(m.geometry, false)} fill="none" stroke={p.color} strokeWidth={sw * (isSel ? 2.2 : 1.6)} opacity={op}
                  strokeLinejoin="round" strokeLinecap="round" onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }} />
              );
              return (
                <path key={m.id} d={pathOf(m.geometry, true) + (m.cutouts ?? []).map((c) => " " + pathOf(c, true)).join("")} fillRule="evenodd"
                  fill={p.color} fillOpacity={isSel ? 0.35 : 0.22} stroke={p.color} strokeWidth={sw * (isSel ? 1.6 : 1)} opacity={op}
                  onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }} />
              );
            })}
            {draft.length > 0 && (
              <g pointerEvents="none">
                {tool === "count" ? draft.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={r} fill={draftColor} />)
                  : tool === "rect" && hover ? <path d={pathOf(rectPoints(draft[0], hover), true)} fill={draftColor} fillOpacity={0.15} stroke={draftColor} strokeWidth={sw} strokeDasharray={`${4 / px} ${3 / px}`} />
                  : <>
                    <path d={pathOf(hover ? [...draft, hover] : draft, false)} fill="none" stroke={draftColor} strokeWidth={sw} strokeDasharray={`${4 / px} ${3 / px}`} />
                    {draft.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={r * 0.7} fill="#fff" stroke={draftColor} strokeWidth={sw / 1.5} />)}
                  </>}
              </g>
            )}
          </svg>
        )}
        {/* the floating label on the selected shape */}
        {selM && selGroup && scale > 0 && (() => {
          const xs = selM.geometry.map((p) => p[0]), ys = selM.geometry.map((p) => p[1]);
          const left = Math.min(...xs) * scale, top = Math.min(...ys) * scale;
          const q = part(selM);
          const tot = data.totals[selGroup.id];
          return (
            <div style={{ position: "absolute", left, top: Math.max(0, top - 30), background: T.dark, color: "#fff", borderRadius: 3, padding: "3px 8px", fontSize: 11.5, whiteSpace: "nowrap", pointerEvents: "none", ...nums }}>
              <b>{q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, KIND_UNIT[selGroup.kind]) : q?.reason ?? "—"}</b> · {selM.name ?? selGroup.name}
              {tot?.qty !== null && tot?.qty !== undefined && <span style={{ opacity: 0.7 }}> · {selGroup.name} {fmtQty(tot.qty, tot.unit)} total</span>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- parameter tree */

function ParamPanel({ jobId, data, groupId, setGroupId, selId, onSelect, act, onSend, onCollapse }: {
  jobId: string; data: PlansData; groupId: string | null; setGroupId: (id: string) => void; selId: string | null;
  onSelect: (m: Meas) => void; act: (fn: () => Promise<unknown>) => Promise<void>; onSend: (p: Param) => void; onCollapse: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const sheetsById = useMemo(() => new Map(data.sheets.map((s) => [s.id, s])), [data.sheets]);
  const linked = (p: Param) => data.lines.find((l) => l.takeoff_parameter_id === p.id);
  const nShapes = data.measurements.length;
  return (
    <div className="sc-param-panel flex flex-col" style={{ width: "100%", maxHeight: 260, flex: "0 0 auto", background: T.card, borderRight: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hair}`, minHeight: 0 }}>
      <style>{`@media (min-width:1024px){.sc-param-panel{width:340px!important;flex:0 0 340px!important;max-height:none!important;border-bottom:none!important}}`}</style>
      <div className="flex flex-col" style={{ width: "100%", minHeight: 0, flex: "1 1 auto" }}>
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: light, fontWeight: 300, fontSize: 20, lineHeight: 1.1 }}>Parameters</div>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>{data.params.length} group{data.params.length === 1 ? "" : "s"} · {nShapes} takeoff{nShapes === 1 ? "" : "s"}</div>
          </div>
          <button onClick={onCollapse} aria-label="Hide parameters" style={{ width: 28, height: 28, border: `1px solid ${T.hair}`, borderRadius: 3, cursor: "pointer" }}>‹</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!data.params.length && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>No groups yet. Add one — Slab on grade (area), Curb &amp; gutter (linear), Piers (count) — then draw on the sheet.</div>}
          {data.params.map((p) => {
            const t = data.totals[p.id];
            const isOpen = open[p.id] !== false;
            const line = linked(p);
            const shapes = data.measurements.filter((m) => m.parameter_id === p.id);
            return (
              <div key={p.id} style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                <div className="flex items-center gap-2 px-2.5 py-2" style={{ background: groupId === p.id ? T.slab : "transparent", cursor: "pointer" }} onClick={() => setGroupId(p.id)}>
                  <KindIcon kind={p.kind} color={p.color} />
                  <button onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [p.id]: !isOpen })); }} aria-label={isOpen ? "Fold" : "Open"}
                    style={{ width: 16, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", color: T.ink3, cursor: "pointer" }}>›</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, ...clip }}>{p.name}</div>
                    <div style={{ fontFamily: disp, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: line ? T.ink3 : T.hivizText, ...clip }}>
                      {KIND_LABEL[p.kind]}{p.depth_in ? ` · ${p.depth_in}"` : ""} · {line ? line.name : "no budget line"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 14, ...nums }}>{t?.qty !== null && t?.qty !== undefined ? fmtQty(t.qty, t.unit) : "—"}</div>
                    {t?.cy !== null && t?.cy !== undefined && <div style={{ fontSize: 10.5, color: T.ink3, ...nums }}>{t.cy.toFixed(1)} CY</div>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(editing === p.id ? null : p.id); }} aria-label={`Edit ${p.name}`} style={{ width: 22, color: T.ink3, cursor: "pointer" }}>⋯</button>
                </div>
                {t?.blocked && shapes.length > 0 && <div className="px-9 pb-1" style={{ fontSize: F.xs, color: T.hivizText }}>No total — {t.blocked}</div>}
                {editing === p.id && <GroupEdit jobId={jobId} p={p} act={act} onDone={() => setEditing(null)} />}
                {isOpen && (
                  <div className="pb-1">
                    {shapes.map((m, i) => {
                      const q = t?.parts.find((x) => x.id === m.id);
                      const s = sheetsById.get(m.sheet_id);
                      const on = m.id === selId;
                      return (
                        <div key={m.id} className="flex items-center gap-2 pr-2.5" onClick={() => onSelect(m)}
                          style={{ paddingLeft: 26, minHeight: 34, background: on ? T.slab : "transparent", borderLeft: `3px solid ${on ? p.color : "transparent"}`, cursor: "pointer" }}>
                          <span style={{ width: 4, alignSelf: "stretch", margin: "6px 0", background: p.color, borderRadius: 2 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MeasName jobId={jobId} m={m} fallback={`${p.name} ${i + 1}`} act={act} />
                            <div style={{ fontSize: 11, color: T.ink3 }}>{s ? sheetLabel(s) : "sheet removed"} · {m.method}{(m.cutouts?.length ?? 0) > 0 ? ` · ${m.cutouts.length} cutout${m.cutouts.length === 1 ? "" : "s"}` : ""}</div>
                          </div>
                          <span style={{ fontSize: 12.5, ...nums, color: q?.qty === null ? T.hivizText : T.ink }}>{q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, KIND_UNIT[p.kind]) : "scale not set"}</span>
                          <button onClick={(e) => { e.stopPropagation(); void act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${m.id}`, "DELETE")); }}
                            aria-label="Remove this takeoff" style={{ color: T.ink3, width: 18, cursor: "pointer" }}>×</button>
                        </div>
                      );
                    })}
                    {!shapes.length && <div style={{ paddingLeft: 32, fontSize: F.xs, color: T.ink3 }}>Pick a tool and draw on the sheet.</div>}
                  </div>
                )}
              </div>
            );
          })}
          {adding && <NewGroup jobId={jobId} act={act} onDone={(id) => { setAdding(false); if (id) setGroupId(id); }} />}
        </div>
        <div className="flex gap-2 p-2" style={{ borderTop: `1px solid ${T.hair}` }}>
          <button onClick={() => setAdding(true)} className="flex-1 rounded" style={{ height: 34, background: T.dark, color: "#fff", fontFamily: disp, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 13, cursor: "pointer" }}>+ Group</button>
          {(() => {
            const g = data.params.find((p) => p.id === groupId);
            const on = g ? linked(g) : null;
            return (
              <button disabled={!g || !!on} onClick={() => g && onSend(g)} className="flex-1 rounded"
                style={{ height: 34, background: on ? T.greenDim : T.hiviz, color: on ? T.green : T.onHiviz, opacity: g ? 1 : 0.5, fontFamily: disp, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 13, cursor: g && !on ? "pointer" : "default" }}>
                {on ? "On budget ✓" : "Send to budget"}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function MeasName({ jobId, m, fallback, act }: { jobId: string; m: Meas; fallback: string; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  if (!edit) return <div onDoubleClick={() => setEdit(true)} title="Double-click to rename" style={{ fontSize: 13, ...clip }}>{m.name ?? fallback}</div>;
  return (
    <input autoFocus defaultValue={m.name ?? ""} placeholder={fallback} aria-label="Name this takeoff" onClick={(e) => e.stopPropagation()}
      onBlur={(e) => { setEdit(false); const v = e.target.value.trim(); if (v !== (m.name ?? "")) void act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${m.id}`, "PATCH", { name: v || null })); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(false); }}
      style={{ width: "100%", fontSize: 13, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "1px 4px", background: T.card, color: T.ink }} />
  );
}

const inp: React.CSSProperties = { height: 30, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink, fontSize: F.sm };

function NewGroup({ jobId, act, onDone }: { jobId: string; act: (fn: () => Promise<unknown>) => Promise<void>; onDone: (id: string | null) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TakeoffKind>("area");
  const [depth, setDepth] = useState("");
  return (
    <form className="p-2.5 flex flex-col gap-2" style={{ background: T.slab, borderBottom: `1px solid ${T.hair}` }}
      onSubmit={(e) => { e.preventDefault(); let id: string | null = null; void act(async () => { const b = await call(`/api/jobs/${jobId}/takeoff/parameters`, "POST", { name, kind, depth_in: kind === "area" && depth ? Number(depth) : null }); id = b.parameter.id; }).then(() => onDone(id)); }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Slab on grade, Curb & gutter…" aria-label="Group name" style={inp} />
      <div className="flex gap-1">
        {(["area", "linear", "count"] as TakeoffKind[]).map((k) => (
          <button type="button" key={k} onClick={() => setKind(k)} style={{ ...tb(kind === k), flex: 1 }}>{KIND_LABEL[k]} · {KIND_UNIT[k]}</button>
        ))}
      </div>
      {kind === "area" && <input value={depth} onChange={(e) => setDepth(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={'Depth in inches (optional — for yards)'} aria-label="Depth in inches" style={inp} />}
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim()} style={{ ...tb(true), flex: 1, opacity: name.trim() ? 1 : 0.5 }}>Add group</button>
        <button type="button" onClick={() => onDone(null)} style={tb(false)}>Cancel</button>
      </div>
    </form>
  );
}

function GroupEdit({ jobId, p, act, onDone }: { jobId: string; p: Param; act: (fn: () => Promise<unknown>) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(p.name);
  const [depth, setDepth] = useState(p.depth_in ? String(p.depth_in) : "");
  const [sure, setSure] = useState(false);
  return (
    <form className="px-3 pb-2.5 flex flex-col gap-2" style={{ background: T.slab }}
      onSubmit={(e) => { e.preventDefault(); void act(() => call(`/api/jobs/${jobId}/takeoff/parameters/${p.id}`, "PATCH", { name, ...(p.kind === "area" ? { depth_in: depth ? Number(depth) : null } : {}) })).then(onDone); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name" style={inp} />
      {p.kind === "area" && <input value={depth} onChange={(e) => setDepth(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Depth in inches (for yards)" aria-label="Depth in inches" style={inp} />}
      <div className="flex gap-2">
        <button type="submit" style={{ ...tb(true), flex: 1 }}>Save</button>
        <button type="button" onClick={() => (sure ? void act(() => call(`/api/jobs/${jobId}/takeoff/parameters/${p.id}`, "DELETE")).then(onDone) : setSure(true))}
          style={{ ...tb(false), color: T.red }}>{sure ? "Remove group + its takeoffs?" : "Remove"}</button>
      </div>
    </form>
  );
}
