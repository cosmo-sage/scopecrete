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
import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, strong, light, nums } from "@/lib/v34/tokens";
import { openPdf, drawPage } from "@/lib/pdf";
import { areaShapeAt, dist, fmtQty, holeFits, measurementQty, parseFeet, rectPoints, scaleFromPoints, scaleLabel, KIND_UNIT, type Pt, type TakeoffKind } from "@/lib/takeoff";
import { call, isAerialSheet, KIND_LABEL, SHAPE_COLORS, shapeColor, sheetLabel, type Meas, type Param, type PlanFile, type PlansData, type Sheet } from "./shared";
import { ScaleBadge, Thumb } from "./files-sheets";
import { Drawer, SlideDrawer } from "@/components/v34/primitives";
import { ShapePhotos } from "./shape-photos";
import { usePinchZoom, useWheelZoom } from "@/lib/v34/use-pinch";
import { traceAt, type TraceOptions } from "@/lib/v34/plan-trace";

type Tool = "select" | "area" | "rect" | "fill" | "linear" | "count" | "cutout" | "scale";
const TOOL_KIND: Partial<Record<Tool, TakeoffKind>> = { area: "area", rect: "area", fill: "area", linear: "linear", count: "count" };

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
  ["fill", "Fill", "Click inside an area: its outline is traced off the drawing"],
  ["cutout", "Cutout", "Draw a hole in the selected area"],
  ["linear", "Linear", "Click along the line; double-click or Finish to end"],
  ["count", "Count", "Click each one; Finish when done"],
  ["scale", "Scale", "Click both ends of a dimension you know, then type it"],
];
// One key per tool, like Togal (Coy, 2026-10-10: "take a lesson from Togal.ai").
const TOOL_KEY: Record<Tool, string> = { select: "V", area: "A", rect: "R", fill: "F", cutout: "X", linear: "L", count: "C", scale: "S" };
// A thin rule after these, so the bar reads in groups: pick · areas · lines · counts · scale.
const TOOL_BREAK = new Set<Tool>(["select", "cutout", "linear", "count"]);

function ToolIcon({ tool }: { tool: Tool }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      {tool === "select" && <path d="M5 3l10 6.5-4.5 1L13 16l-2 1-2.5-5.5L5 15z" fill="currentColor" fillOpacity=".15" />}
      {tool === "area" && <><path d="M3 6l7-3 7 4-2 9H5z" fill="currentColor" fillOpacity=".15" />{[[3, 6], [10, 3], [17, 7], [15, 16], [5, 16]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />)}</>}
      {tool === "rect" && <><rect x="3.5" y="5" width="13" height="10" fill="currentColor" fillOpacity=".15" /><circle cx="3.5" cy="5" r="1.3" fill="currentColor" /><circle cx="16.5" cy="15" r="1.3" fill="currentColor" /></>}
      {tool === "fill" && <><path d="M4 9l6-6 6 6-6 6z" fill="currentColor" fillOpacity=".25" /><path d="M16.5 12.5c1 1.4 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-3z" fill="currentColor" /></>}
      {tool === "cutout" && <><rect x="3" y="3" width="14" height="14" fill="currentColor" fillOpacity=".15" /><rect x="7" y="7" width="6" height="6" fill="var(--sc-card, #fff)" strokeDasharray="2 1.5" /></>}
      {tool === "linear" && <><path d="M3 15l5-6 4 3 5-8" /><circle cx="3" cy="15" r="1.3" fill="currentColor" /><circle cx="17" cy="4" r="1.3" fill="currentColor" /></>}
      {tool === "count" && <><circle cx="5" cy="6" r="2" fill="currentColor" /><circle cx="14" cy="5" r="2" fill="currentColor" /><circle cx="9" cy="14" r="2" fill="currentColor" /></>}
      {tool === "scale" && <><path d="M2.5 13.5l11-11 4 4-11 11z" /><path d="M6 10l1.5 1.5M8.5 7.5l1.5 1.5M11 5l1.5 1.5" /></>}
    </svg>
  );
}

export function TakeoffStep({ jobId, data, files, sheetId, setSheetId, reload, onSend, fullscreen, setFullscreen }: {
  jobId: string; data: PlansData; files: PlanFile[];
  sheetId: string | null; setSheetId: (id: string) => void; reload: () => Promise<void>;
  onSend: (p: Param, ids?: string[]) => void; fullscreen: boolean; setFullscreen: (v: boolean) => void;
}) {
  const sheets = data.sheets;
  // The phone's sheets drawer: open on the first visit to this job's Plan Room, closed afterwards (remembered per job).
  const sheetsKey = `sc:plan-sheets-open:${jobId}`;
  const [sheetsOpen, setSheetsOpen] = useState(false);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off || window.matchMedia("(min-width: 1024px)").matches) return;
      try { if (localStorage.getItem(sheetsKey) === null) { setSheetsOpen(true); localStorage.setItem(sheetsKey, "1"); } } catch { /* no storage */ }
    });
    return () => { off = true; };
  }, [sheetsKey]);
  // On a phone Parameters slides in from the left like Sheets (Coy, 2026-10-09); one drawer open at a time.
  const [paramsOpen, setParamsOpen] = useState(false);
  const openSheets = (v: boolean) => { setSheetsOpen(v); if (v) setParamsOpen(false); };
  const openParams = (v: boolean) => { setParamsOpen(v); if (v) setSheetsOpen(false); };
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
  const [shapePhotos, setShapePhotos] = useState(false);
  // Click-to-fill (Coy, 2026-10-09): how forgiving the trace is, and whether one is running.
  const [fillOpt, setFillOpt] = useState<TraceOptions>({ gapPt: 0.5, thinPt: 0 });
  const [tracing, setTracing] = useState(false);
  const lastFill = useRef<Pt | null>(null);
  // Cut out (Coy, 2026-10-10): a click inside a curbed island traces it as a hole in the fill it sits in.
  const [fillCut, setFillCut] = useState(false);
  const [cutTarget, setCutTarget] = useState<string | null>(null);
  // One sheet's scale put on others — every sheet, or the ones ticked (Coy, 2026-10-07).
  const [copyScale, setCopyScale] = useState<{ k: number; from: string; all?: boolean } | null>(null);
  const scaledCount = sheets.filter((x) => x.scale_ft_per_pt).length;
  const selGroup = sel ? data.params.find((p) => p.id === sel.parameter_id) ?? null : null;
  const selName = sel ? sel.name ?? `${selGroup?.name ?? "Shape"} ${data.measurements.filter((m) => m.parameter_id === sel.parameter_id).findIndex((m) => m.id === sel.id) + 1}` : "";
  const selPhotos = sel ? files.filter((f) => f.takeoff_measurement_id === sel.id).length : 0;

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [reload]);

  // × on a sheet in the Sheets drawer takes it out of Takeoffs (Coy, 2026-10-09). A sheet with
  // measurements is kept (they'd go with it); a plan file's only sheet takes the file out instead.
  const [removed, setRemoved] = useState<Sheet | null>(null);
  const removeSheet = async (s: Sheet) => {
    const n = data.measurements.filter((m) => m.sheet_id === s.id).length;
    if (n) { window.alert(`${sheetLabel(s)} has ${n} measurement${n === 1 ? "" : "s"} on it. Delete those first.`); return; }
    const f = files.find((x) => x.id === s.file_id);
    if (sheets.filter((x) => x.file_id === s.file_id).length <= 1) {
      if (!window.confirm(`${sheetLabel(s)} is the only sheet of ${f?.name ?? "its file"}. Take the file out of Takeoffs? It stays in Files.`)) return;
      setRemoved(null);
      await act(() => call(`/api/files/${s.file_id}`, "PATCH", { in_plan_room: false }));
      return;
    }
    await act(async () => { await call(`/api/plan-sheets/${s.id}`, "DELETE"); setRemoved(s); });
  };
  const undoRemove = async () => {
    const s = removed; if (!s) return;
    setRemoved(null);
    await act(async () => {
      const b = await call(`/api/jobs/${jobId}/plans/sheets`, "POST", { file_id: s.file_id, sheets: [{
        page: s.page, page_w: s.page_w, page_h: s.page_h, number: s.number, title: s.title, discipline: s.discipline,
        scale_text: s.scale_text, printed_ft_per_pt: s.printed_ft_per_pt,
      }] });
      const back = (b.sheets as Sheet[] | undefined)?.find((x) => x.page === s.page);
      if (back && s.scale_method === "manual" && s.scale_ft_per_pt) await call(`/api/plan-sheets/${back.id}`, "PATCH", { scale_method: "manual", scale_ft_per_pt: s.scale_ft_per_pt });
      else if (back && (s.scale_method === "title_block" || s.scale_method === "none")) await call(`/api/plan-sheets/${back.id}`, "PATCH", { scale_method: s.scale_method });
    });
  };

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

  const pickToolRef = useRef(pickTool);
  useEffect(() => { pickToolRef.current = pickTool; });

  const save = useCallback(async (pts: Pt[]) => {
    if (!sheet) return;
    const cutInto = tool === "fill" && fillCut ? data.measurements.find((m) => m.id === cutTarget) : tool === "cutout" ? sel : undefined;
    if (tool === "fill" && fillCut && !cutInto) { setMsg("Click inside a fill to cut a hole in it."); return; }
    if (cutInto) {
      if (tool === "fill" && !holeFits(pts, cutInto.geometry)) { setMsg("That outline runs outside the fill, so it wasn't cut. Try tighter gaps, or draw it with Cutout."); return; }
      await act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${cutInto.id}`, "PATCH", { cutouts: [...(cutInto.cutouts ?? []), pts] }));
      setSelId(cutInto.id);
    } else if (tool === "scale") {
      if (pts.length === 2) setScaleAsk({ a: pts[0], b: pts[1] });
      return;
    } else if (group) {
      const method = tool === "rect" ? "rect" : tool === "area" || tool === "fill" ? "area" : tool;
      await act(async () => {
        const b = await call(`/api/jobs/${jobId}/takeoff/measurements`, "POST", { parameter_id: group.id, sheet_id: sheet.id, geometry: pts, method });
        setSelId(b.measurement.id);
      });
    }
    setDraft([]);
  }, [act, group, jobId, sel, sheet, tool, setDraft, setScaleAsk, fillCut, cutTarget, data.measurements, setSelId]);

  const finish = useCallback(() => {
    const need = tool === "linear" || tool === "scale" ? 2 : tool === "count" ? 1 : 3; // fill: 3, like an area
    if (draft.length >= need) void save(draft);
  }, [draft, save, tool]);

  // Trace the outline round a click; the result is a draft Coy keeps with Finish (or drops).
  const fileUrl = file?.url ?? null;
  const trace = useCallback(async (p: Pt, opt: TraceOptions = fillOpt) => {
    if (!sheet || !fileUrl || tracing) return;
    if (fillCut) {
      const areaIds = new Set(data.params.filter((g) => g.kind === "area").map((g) => g.id));
      const into = areaShapeAt(p, data.measurements.filter((m) => m.sheet_id === sheet.id && areaIds.has(m.parameter_id)), selId);
      if (!into) { setDraft([]); setCutTarget(null); setMsg("Click inside a fill to cut a hole in it. That spot isn't on one."); return; }
      setCutTarget(into.id);
    }
    lastFill.current = p;
    setTracing(true); setMsg(null); setDraft([]);
    try {
      const doc = await openPdf(sheet.file_id, fileUrl);
      const r = await traceAt(doc, sheet.page, sheet.page_w, sheet.page_h, p, opt);
      if (r.ok) setDraft(r.pts); else setMsg(r.reason);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setTracing(false); }
  }, [fileUrl, fillOpt, setDraft, sheet, tracing, fillCut, data.params, data.measurements, selId]);
  // Changing how forgiving it is traces the last click again.
  const setFill = (o: TraceOptions) => { setFillOpt(o); if (lastFill.current) void trace(lastFill.current, o); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") { if (draft.length) setDraft([]); else if (fullscreen) setFullscreen(false); else setTool("select"); }
      if (e.key === "Backspace" && draft.length) { e.preventDefault(); setDraft((d) => d.slice(0, -1)); }
      if (e.key === "Enter") finish();
      // A tool's key picks it, when nothing is being drawn and no modifier is held.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !draft.length && (e.target as HTMLElement)?.tagName !== "TEXTAREA" && (e.target as HTMLElement)?.tagName !== "SELECT") {
        const t = (Object.keys(TOOL_KEY) as Tool[]).find((x) => TOOL_KEY[x] === e.key.toUpperCase());
        if (t) pickToolRef.current(t);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [draft.length, finish, fullscreen, setFullscreen, setDraft]);

  // The takeoff fills the screen from where it starts down to the footer, measured, so the drawers
  // (Parameters, Sheets) end above the footer with their buttons in view (Coy, 2026-10-09).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fitH, setFitH] = useState<number | null>(null);
  useEffect(() => {
    if (fullscreen) return;
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const foot = window.matchMedia("(min-width: 1024px)").matches ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sc-foot")) || 0;
      setFitH(Math.max(360, Math.round(window.innerHeight - el.getBoundingClientRect().top - foot)));
    };
    fit();
    const t = window.setTimeout(fit, 400);
    window.addEventListener("resize", fit);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", fit); };
  }, [fullscreen]);
  const wrap: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 90, background: T.slab, display: "flex" }
    : { display: "flex", minHeight: 0, height: fitH ? `${fitH}px` : "calc(100dvh - var(--sc-head) - 110px)" };

  return (
    <div ref={wrapRef} style={wrap} className="flex-col lg:flex-row">
      {/* ---- parameters ---- */}
      {panel ? (
        <div className="hidden lg:flex" style={{ flex: "0 0 auto", minHeight: 0 }}>
          <ParamPanel jobId={jobId} data={data} groupId={groupId} setGroupId={setGroupId} selId={selId}
            onSelect={(m) => { setSelId(m.id); setGroupId(m.parameter_id); if (m.sheet_id !== sheet?.id) setSheetId(m.sheet_id); setTool("select"); }}
            act={act} onSend={onSend} onCollapse={() => setPanel(false)} />
        </div>
      ) : (
        <button onClick={() => setPanel(true)} aria-label="Show parameters" className="hidden lg:flex flex-col items-center pt-3 gap-2"
          style={{ width: 44, borderRight: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
          <span style={{ fontSize: 16 }}>›</span>
          <span style={{ ...eyebrow, writingMode: "vertical-rl", color: T.ink3 }}>Parameters · {data.params.length}</span>
        </button>
      )}

      {/* ---- canvas ---- */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0, minHeight: 320, position: "relative", overflow: "hidden" }}>
        {/* Phone: the drawing gets the screen and the sheets slide over it (Claude Design, phone drawers §1). */}
        <div className="flex lg:hidden items-center gap-2 px-2" style={{ height: 52, flex: "0 0 auto", background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <button onClick={() => openSheets(true)} aria-label={`Sheets, ${sheets.length}`} className="flex items-center gap-1.5 rounded shrink-0"
            style={{ height: 40, padding: "0 10px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
            Sheets · {sheets.length}
          </button>
          {/* Parameters beside Sheets on a phone, so a folded panel can always come back (Coy, 2026-10-09). */}
          <button onClick={() => openParams(!paramsOpen)} aria-pressed={paramsOpen} aria-label={`Parameters, ${data.params.length}`} className="flex items-center gap-1.5 rounded shrink-0"
            style={{ height: 40, padding: "0 10px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
            Parameters · {data.params.length}
          </button>
          {sheet && (
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink, ...clipTxt }}>{sheetLabel(sheet)}</span>
              <span style={{ display: "block", fontSize: 11, color: sheet.scale_ft_per_pt ? T.green : T.ink3 }}>{sheet.scale_ft_per_pt ? "✓ scale set" : sheet.scale_method === "none" ? "not to scale" : "scale not set"}</span>
            </span>
          )}
        </div>
        <SlideDrawer open={sheetsOpen} onOpen={() => openSheets(true)} onClose={() => openSheets(false)} width={300} label="Sheets">
          <div className="flex items-baseline gap-2" style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${T.hairSoft}` }}>
            <span style={{ fontFamily: "var(--sc-font-light)", fontWeight: 300, fontSize: 20, color: T.ink, flex: 1 }}>Sheets · {sheets.length}</span>
            <span style={{ fontSize: 12, color: T.ink2 }}>{sheets.filter((x) => x.scale_ft_per_pt).length} of {sheets.length} scaled</span>
          </div>
          <div className="flex flex-col" style={{ padding: 8, gap: 6 }}>
            {sheets.map((s) => {
              const on = s.id === sheet?.id;
              const f = files.find((x) => x.id === s.file_id);
              const concrete = s.discipline === "civil" || s.discipline === "structural";
              // Labelled as Files labels them (Coy, 2026-10-09): number · title, then the page and its file.
              return (
                <div key={s.id} className="flex items-stretch rounded" style={{ border: `1px solid ${on ? T.hiviz : T.hair}`, background: on ? T.hivizDim : T.card }}>
                  <button onClick={() => { setSheetId(s.id); openSheets(false); }} aria-current={on ? "true" : undefined} className="flex items-center gap-2 text-left flex-1"
                    style={{ padding: 6, minWidth: 0, background: "transparent", border: "none", cursor: "pointer" }}>
                    <span style={{ position: "relative", width: 72, flex: "0 0 auto", border: `1px solid ${T.hair}`, background: "#fff", borderRadius: 2, overflow: "hidden" }}>
                      <Thumb fileId={s.file_id} url={f?.url ?? null} page={s.page} height={54} />
                      {concrete && <span style={{ position: "absolute", left: 2, top: 2, fontFamily: disp, fontSize: 8, fontWeight: 700, letterSpacing: ".06em", background: T.hiviz, color: T.onHiviz, padding: "0 3px", borderRadius: 2 }}>CONCRETE</span>}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, color: T.ink, ...clipTxt }}><b style={{ fontFamily: strong, fontWeight: 600 }}>{sheetLabel(s)}</b>{" "}<span style={{ color: T.ink2 }}>{s.title ?? "No title read"}</span></span>
                      <span style={{ display: "block", fontSize: 10.5, color: T.ink3, ...clipTxt }}>p.{s.page}{f ? ` · ${f.name}` : ""}</span>
                      <span style={{ display: "block", fontSize: 11, color: s.scale_ft_per_pt ? T.green : T.ink3 }}>{s.scale_ft_per_pt ? "✓ scale set" : s.scale_method === "none" ? "not to scale" : s.scale_text ? `prints ${s.scale_text}` : "no scale yet"}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => void removeSheet(s)} aria-label={`Remove ${sheetLabel(s)} from Takeoffs`} title="Remove from Takeoffs"
                    className="shrink-0 flex items-center justify-center" style={{ width: 34, background: "transparent", border: "none", color: T.ink3, fontSize: 18, cursor: "pointer" }}>×</button>
                </div>
              );
            })}
            {removed && (
              <div className="flex items-center gap-2 rounded" style={{ padding: "6px 8px", background: T.sunk, fontSize: 12, color: T.ink2 }}>
                <span style={{ flex: 1, minWidth: 0, ...clipTxt }}>Removed {sheetLabel(removed)}</span>
                <button type="button" onClick={() => void undoRemove()} style={{ background: "transparent", border: "none", color: T.hivizText, fontWeight: 600, cursor: "pointer" }}>Undo</button>
              </div>
            )}
            {!sheets.length && <div style={{ fontSize: F.xs, color: T.ink3, padding: 6 }}>No sheets yet — add a plan PDF on the Files step.</div>}
          </div>
        </SlideDrawer>
        <div className="lg:hidden">
          <SlideDrawer open={paramsOpen} onClose={() => openParams(false)} width={320} label="Parameters">
            <ParamPanel jobId={jobId} data={data} groupId={groupId} setGroupId={setGroupId} selId={selId} drawer
              onSelect={(m) => { setSelId(m.id); setGroupId(m.parameter_id); if (m.sheet_id !== sheet?.id) setSheetId(m.sheet_id); setTool("select"); openParams(false); }}
              act={act} onSend={(p, ids) => { openParams(false); onSend(p, ids); }} onCollapse={() => openParams(false)} />
          </SlideDrawer>
        </div>
        <div className="flex items-center gap-1 px-2 overflow-x-auto" style={{ height: 42, flex: "0 0 auto", background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          {TOOLS.map(([k, label, hint]) => (
            <Fragment key={k}>
              <button onClick={() => pickTool(k)} title={`${label} (${TOOL_KEY[k]}) — ${hint}`} aria-label={label} aria-pressed={tool === k}
                className="flex items-center gap-1.5" style={{ ...tb(tool === k), padding: "0 8px" }}>
                <ToolIcon tool={k} /><span className="hidden md:inline">{label}</span>
              </button>
              {TOOL_BREAK.has(k) && <span aria-hidden="true" style={{ width: 1, height: 22, background: T.hair, margin: "0 3px", flex: "0 0 auto" }} />}
            </Fragment>
          ))}
          <span className="flex-1" />
          {sheet && <span className="hidden md:inline" style={{ fontSize: F.xs, color: T.ink2, whiteSpace: "nowrap" }}>{sheetLabel(sheet)} · <ScaleBadge s={sheet} small /></span>}
          {sel && <button onClick={() => setShapePhotos(true)} title={`Photos of ${selName} — they show on its budget section and the proposal`} style={tb(false)}>Shape photos{selPhotos ? ` (${selPhotos})` : ""}</button>}
          {sheet?.scale_ft_per_pt && sheets.length > 1 && <button onClick={() => setCopyScale({ k: sheet.scale_ft_per_pt as number, from: sheet.id })} title="Put this sheet's scale on every sheet, or the ones you pick" style={tb(false)}>Scale → other sheets</button>}
          <span className="inline-flex items-center" title="Zoom: the scroll wheel zooms where the pointer is" style={{ border: `1px solid ${T.hair}`, borderRadius: 3, flex: "0 0 auto" }}>
            <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Zoom out" style={zb}>−</button>
            <span style={{ fontFamily: strong, fontSize: 11, width: 40, textAlign: "center", ...nums }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(8, z * 1.25))} aria-label="Zoom in" style={zb}>+</button>
            <button onClick={() => setZoom(() => 1)} title="Fit the sheet to the width" style={{ ...zb, width: "auto", padding: "0 8px", borderLeft: `1px solid ${T.hair}`, fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Fit</button>
          </span>
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
        {(msg || draft.length > 0 || scaleAsk || tool === "fill") && (
          <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap" style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, background: msg ? T.redDim : T.dustyTint, borderTop: `1px solid ${T.hair}`, fontSize: F.xs, boxShadow: "0 -2px 6px rgba(42,32,20,.08)" }}>
            {msg && <span style={{ color: T.red }}>{msg}</span>}
            {tool === "fill" && sheet && (
              <FillBar draft={draft} tracing={tracing} opt={fillOpt} setOpt={setFill} sheet={sheet}
                cut={fillCut} setCut={(v) => { setFillCut(v); setDraft([]); setCutTarget(null); lastFill.current = null; setMsg(null); }}
                finish={finish} cancel={() => { setDraft([]); lastFill.current = null; }} />
            )}
            {!msg && draft.length > 0 && !scaleAsk && tool !== "fill" && (
              <>
                <span>{tool === "count" ? `${draft.length} counted` : `${draft.length} point${draft.length === 1 ? "" : "s"}`} — {TOOLS.find((t) => t[0] === tool)?.[2]}</span>
                {(tool === "area" || tool === "linear" || tool === "count" || tool === "cutout") && <button onClick={finish} style={tb(true)}>Finish</button>}
                <button onClick={() => setDraft((d) => d.slice(0, -1))} style={tb(false)}>Undo point</button>
                <button onClick={() => setDraft([])} style={tb(false)}>Cancel</button>
              </>
            )}
            {scaleAsk && sheet && <ScaleAsk a={scaleAsk.a} b={scaleAsk.b} onCancel={() => { setScaleAsk(null); setDraft([]); }}
              others={sheets.length > 1}
              onSet={(k, to) => act(async () => {
                await call(`/api/plan-sheets/${sheet.id}`, "PATCH", { scale_method: "manual", scale_ft_per_pt: k });
                setScaleAsk(null); setDraft([]); setTool("select");
                if (to !== "this") setCopyScale({ k, from: sheet.id, all: to === "all" });
              })} />}
          </div>
        )}

        {sheet && file?.url ? (
          <Drawing key={sheet.id} sheet={sheet} fileUrl={file.url} zoom={zoom} setZoom={setZoom} tool={tool}
            data={data} groupId={groupId} selId={selId} setSelId={(id) => { setSelId(id); const m = data.measurements.find((x) => x.id === id); if (m) setGroupId(m.parameter_id); }}
            draft={draft} setDraft={setDraft} hover={hover} setHover={setHover} save={save} busy={busy || tracing} onTrace={(p) => void trace(p)} cutting={tool === "fill" && fillCut}
            saveShape={(mid, pts) => act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${mid}`, "PATCH", { geometry: pts }))} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6" style={{ fontSize: F.sm, color: T.ink3 }}>
            {sheet ? "This sheet's file can't be opened right now." : "No sheets yet — add a plan PDF on the Files step."}
          </div>
        )}
        </div>

        {sel && shapePhotos && <ShapePhotos jobId={jobId} shapeId={sel.id} shapeName={selName} files={files} open onClose={() => setShapePhotos(false)} onChanged={reload} />}
        {copyScale && <ScaleCopy k={copyScale.k} from={copyScale.from} all={!!copyScale.all} sheets={sheets} onClose={() => setCopyScale(null)}
          apply={(ids) => act(async () => {
            for (let i = 0; i < ids.length; i += 4) {
              await Promise.all(ids.slice(i, i + 4).map((id) => call(`/api/plan-sheets/${id}`, "PATCH", { scale_method: "manual", scale_ft_per_pt: copyScale.k })));
            }
            setCopyScale(null);
          })} />}
        {sheets.length > 1 && (
          <div className="hidden lg:flex items-center gap-1 px-2 py-1 overflow-x-auto" style={{ flex: "0 0 auto", background: T.card, borderTop: `1px solid ${T.hair}` }}>
            {/* How many sheets have a scale — here, not in the page header (Coy, 2026-10-07). */}
            <span style={{ flex: "0 0 auto", fontSize: 11, fontWeight: 600, borderRadius: 3, padding: "3px 8px", marginRight: 4, background: scaledCount === sheets.length ? T.greenDim : T.sunDim, color: scaledCount === sheets.length ? T.green : T.sun }}>
              {scaledCount === sheets.length ? "✓ " : ""}{scaledCount} of {sheets.length} scaled
            </span>
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

const clipTxt: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const zb: React.CSSProperties = { width: 28, height: 28, background: "transparent", border: "none", cursor: "pointer", fontSize: 15, color: T.ink };
const tb = (on: boolean): React.CSSProperties => ({
  height: 30, padding: "0 10px", borderRadius: 3, flex: "0 0 auto", cursor: "pointer",
  border: `1px solid ${on ? T.hiviz : T.hair}`, background: on ? T.hivizDim : T.card, color: on ? T.hivizText : T.ink,
  fontFamily: disp, fontSize: 12.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase",
});

/** Fill's strip: what was traced, how big, and how forgiving the trace is. */
function FillBar({ draft, tracing, opt, setOpt, sheet, cut, setCut, finish, cancel }: {
  draft: Pt[]; tracing: boolean; opt: TraceOptions; setOpt: (o: TraceOptions) => void; sheet: Sheet;
  cut: boolean; setCut: (v: boolean) => void; finish: () => void; cancel: () => void;
}) {
  const q = draft.length >= 3 ? measurementQty("area", { geometry: draft, cutouts: [] }, { ft_per_pt: sheet.scale_ft_per_pt, method: sheet.scale_method, label: sheetLabel(sheet) }) : null;
  const sel: React.CSSProperties = { height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 4px", background: T.card, color: T.ink, fontSize: F.xs };
  return (
    <>
      <span style={{ color: T.ink }}>
        {tracing ? "Tracing the outline…"
          : draft.length ? <>{cut ? "Hole traced" : `Traced ${draft.length} corners`}{q ? (q.ok ? <> · <b>{cut ? "−" : "≈"} {fmtQty(q.qty, "SF")}</b></> : ` · ${q.reason}`) : ""}. Check it against the drawing.</>
          : cut ? "Click inside a curbed island or anything inside a fill. It's traced and cut out of that fill."
          : "Click inside an area. Its outline is traced off the drawing for you to check."}
      </span>
      <span className="inline-flex" role="group" aria-label="Fill or cut out" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 3, overflow: "hidden" }}>
        {([[false, "Fill"], [true, "Cut out"]] as const).map(([v, label]) => (
          <button key={label} onClick={() => setCut(v)} aria-pressed={cut === v}
            style={{ height: 28, padding: "0 9px", fontSize: F.xs, fontWeight: 600, background: cut === v ? (v ? T.red : T.ink) : T.card, color: cut === v ? "#fff" : T.ink2 }}>{label}</button>
        ))}
      </span>
      {draft.length >= 3 && !tracing && <button onClick={finish} style={tb(true)}>{cut ? "Cut it out" : "Keep it"}</button>}
      {draft.length > 0 && !tracing && <button onClick={cancel} style={tb(false)}>Drop it</button>}
      <select value={String(opt.gapPt)} onChange={(e) => setOpt({ ...opt, gapPt: Number(e.target.value) })} aria-label="Bridge gaps" title="Close small breaks in the outline" style={sel}>
        <option value="0.5">Gaps: tight</option>
        <option value="2">Bridge small gaps</option>
        <option value="6">Bridge big gaps</option>
      </select>
      <label className="flex items-center gap-1" title="Ignore hairlines that cross the area, like hatching and dimension lines" style={{ color: T.ink2, cursor: "pointer" }}>
        <input type="checkbox" checked={opt.thinPt > 0} onChange={(e) => setOpt({ ...opt, thinPt: e.target.checked ? 0.4 : 0 })} /> Skip thin lines
      </label>
    </>
  );
}

/** The sheet's scale and what can be done about it. */
function ScaleBar({ sheet, act, startScale }: { sheet: Sheet; act: (fn: () => Promise<unknown>) => Promise<void>; startScale: () => void }) {
  if (sheet.scale_ft_per_pt) return null;
  const patch = (b: Record<string, unknown>) => act(() => call(`/api/plan-sheets/${sheet.id}`, "PATCH", b));
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap" style={{ background: T.sunDim, color: T.sun, borderBottom: `1px solid ${T.hair}`, fontSize: F.xs }}>
      <span>
        {sheet.scale_method === "none" ? "Marked not to scale — areas and lengths here aren't counted."
          : sheet.printed_ft_per_pt && isAerialSheet(sheet) ? `Scale from the map — ${sheet.scale_text}. Check it against the 50 ft bar or something you know the size of (a garage door is about 16 ft) before you use it.`
          : sheet.printed_ft_per_pt ? `This sheet prints ${sheet.scale_text}. Nothing is counted here until you apply it or measure a known dimension.`
          : "No scale on this sheet yet. Measure a known dimension to set it — nothing is counted here until then."}
      </span>
      {sheet.printed_ft_per_pt && sheet.scale_method !== "none" && <button onClick={() => void patch({ scale_method: "title_block" })} style={tb(true)}>{isAerialSheet(sheet) ? "Use the map's scale" : `Use ${scaleLabel(sheet.printed_ft_per_pt)}`}</button>}
      <button onClick={startScale} style={tb(false)}>Measure a dimension</button>
      {sheet.scale_method !== "none" ? <button onClick={() => void patch({ scale_method: "none" })} style={tb(false)}>Not to scale</button>
        : <button onClick={() => void patch({ scale_method: null })} style={tb(false)}>Undo</button>}
    </div>
  );
}

function ScaleAsk({ a, b, onSet, onCancel, others }: { a: Pt; b: Pt; onSet: (k: number, to: "this" | "all" | "pick") => void; onCancel: () => void; others: boolean }) {
  const [v, setV] = useState("");
  const [to, setTo] = useState<"this" | "all" | "pick">("this");
  const ft = parseFeet(v);
  const k = ft !== null ? scaleFromPoints(a, b, ft) : null;
  return (
    <form className="flex items-center gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); if (k) onSet(k, to); }}>
      <span style={{ color: T.ink }}>How long is that, for real?</span>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={"30'-6\""} aria-label="Real length"
        style={{ width: 90, height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink, fontFamily: strong }} />
      {k && <span style={{ color: T.ink2 }}>→ {scaleLabel(k)}</span>}
      {v && ft === null && <span style={{ color: T.red }}>Type feet and inches, like 30&apos;-6&quot;</span>}
      {others && (
        <select value={to} onChange={(e) => setTo(e.target.value as "this" | "all" | "pick")} aria-label="Which sheets"
          style={{ height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 4px", background: T.card, color: T.ink, fontSize: F.xs }}>
          <option value="this">This sheet</option>
          <option value="all">Every sheet</option>
          <option value="pick">Pick sheets…</option>
        </select>
      )}
      <button type="submit" disabled={!k} style={{ ...tb(true), opacity: k ? 1 : 0.5 }}>Set scale</button>
      <button type="button" onClick={onCancel} style={tb(false)}>Cancel</button>
    </form>
  );
}

/** Put one scale on other sheets: every drawing but the aerials ticked for "every sheet", none for "pick". */
function ScaleCopy({ k, from, all, sheets, apply, onClose }: { k: number; from: string; all: boolean; sheets: Sheet[]; apply: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const others = sheets.filter((s) => s.id !== from);
  const [on, setOn] = useState<Set<string>>(() => new Set(all ? others.filter((s) => !isAerialSheet(s)).map((s) => s.id) : []));
  const [busy, setBusy] = useState(false);
  const flip = (id: string) => setOn((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = others.length > 0 && others.every((s) => on.has(s.id));
  return (
    <Drawer open onClose={onClose} title={`Use ${scaleLabel(k)} on…`} sub="Tick the sheets drawn at the same scale. A sheet's own scale is replaced.">
      <div className="p-3 flex flex-col gap-1.5">
        <label className="flex items-center gap-2" style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, padding: "4px 2px" }}>
          <input type="checkbox" checked={allOn} onChange={() => setOn(allOn ? new Set() : new Set(others.map((s) => s.id)))} /> Every sheet ({others.length})
        </label>
        {others.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded" style={{ padding: "6px 8px", border: `1px solid ${on.has(s.id) ? T.hiviz : T.hair}`, background: on.has(s.id) ? T.hivizDim : T.card, fontSize: F.sm, color: T.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={on.has(s.id)} onChange={() => flip(s.id)} />
            <span style={{ flex: 1, minWidth: 0, ...clipTxt }}>{sheetLabel(s)}</span>
            <span style={{ fontSize: 11, color: s.scale_ft_per_pt ? T.green : T.ink3, flex: "0 0 auto" }}>
              {isAerialSheet(s) ? "aerial — its own scale" : s.scale_ft_per_pt ? `now ${scaleLabel(s.scale_ft_per_pt)}` : s.scale_text ? `prints ${s.scale_text}` : "no scale yet"}
            </span>
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button disabled={!on.size || busy} onClick={() => { setBusy(true); void apply([...on]).finally(() => setBusy(false)); }}
            style={{ ...tb(true), opacity: on.size && !busy ? 1 : 0.5 }}>{busy ? "Setting…" : `Set on ${on.size} sheet${on.size === 1 ? "" : "s"}`}</button>
          <button onClick={onClose} style={tb(false)}>Cancel</button>
        </div>
      </div>
    </Drawer>
  );
}

/* --------------------------------------------------------------- drawing */

function Drawing({ sheet, fileUrl, zoom, setZoom, tool, data, groupId, selId, setSelId, draft, setDraft, hover, setHover, save, busy, saveShape, onTrace, cutting }: {
  sheet: Sheet; fileUrl: string; zoom: number; setZoom: (f: (z: number) => number) => void; tool: Tool;
  data: PlansData; groupId: string | null; selId: string | null; setSelId: (id: string | null) => void;
  draft: Pt[]; setDraft: React.Dispatch<React.SetStateAction<Pt[]>>; hover: Pt | null; setHover: (p: Pt | null) => void;
  save: (pts: Pt[]) => Promise<void>; busy: boolean;
  /** A selected shape re-drawn by dragging its corners (Coy, 2026-10-03: "ideally i would be able to edit an area"). */
  saveShape: (id: string, pts: Pt[]) => Promise<void>;
  /** Fill: trace the outline round this point. */
  onTrace: (p: Pt) => void;
  /** Fill is cutting a hole: the draft is drawn red. */
  cutting?: boolean;
}) {
  // The corner being dragged on the selected shape, and the shape's points while it moves.
  const [edit, setEdit] = useState<{ id: string; pts: Pt[]; i: number; moved: boolean; start: Pt } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  // The last press on a corner: a second press on it soon after removes it. The svg holds the
  // pointer while a corner is dragged, so the browser's dblclick lands on the svg, not the corner.
  const [lastCorner, setLastCorner] = useState<{ id: string; i: number; at: number } | null>(null);
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
  // Two fingers zoom on a phone (Coy, 2026-10-09); the fingers lifting never add a point.
  const pinching = usePinchZoom(box, zoom, (z) => setZoom(() => z), 0.5, 8);
  // The scroll wheel zooms where the pointer is (Coy, 2026-10-10: "zoom in and out of the plans with
  // my scroll wheel"); shift + wheel still scrolls sideways.
  useWheelZoom(box, zoom, (z) => setZoom(() => z), 0.5, 8);

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

  // A second press on the same corner within 450 ms removes it (keeping the shape's minimum).
  const secondPress = (e: React.PointerEvent, id: string, i: number, pts: Pt[], min: number) => {
    const last = lastCorner;
    if (last && last.id === id && last.i === i && e.timeStamp - last.at < 450) {
      e.stopPropagation();
      setLastCorner(null);
      if (pts.length > min) { setEdit(null); void saveShape(id, pts.filter((_, j) => j !== i)); }
      return true;
    }
    setLastCorner({ id, i, at: e.timeStamp });
    return false;
  };
  const endEdit = () => {
    if (!edit) return;
    const done = edit;
    setEdit(null);
    if (done.moved) void saveShape(done.id, done.pts);
  };
  const click = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pinching.current) return;
    if (edit) { endEdit(); return; }
    if (busy || tool === "select") return;
    const p = toPage(e);
    if (tool === "fill") { onTrace(p); return; }
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
  const draftColor = tool === "cutout" || cutting ? T.red : tool === "scale" ? "#1E5AA8" : grp?.color ?? T.hiviz;

  return (
    <div ref={box} className="flex-1 overflow-auto" style={{ background: T.sunk, padding: 12, paddingBottom: 56, position: "relative", minHeight: 0 }}>
      {err && <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open the plan: {err}</div>}
      <div style={{ position: "relative", width: w || "100%", height: h || 200, background: "#fff", boxShadow: "0 2px 10px rgba(42,32,20,.12)" }}>
        <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: w, height: h, opacity: drawn ? 1 : 0.4 }} />
        {scale > 0 && (
          <svg viewBox={`0 0 ${sheet.page_w} ${sheet.page_h}`} preserveAspectRatio="none" width={w} height={h}
            style={{ position: "absolute", inset: 0, cursor: tool === "select" ? "default" : "crosshair", touchAction: draft.length ? "none" : "pan-x pan-y" }}
            onPointerUp={click} onDoubleClick={dbl}
            onPointerMove={(e) => {
              if (edit) { const p = toPage(e); setEdit({ ...edit, moved: edit.moved || dist(p, edit.start) * px > 3, pts: edit.pts.map((q, i) => (i === edit.i ? p : q)) }); return; }
              if (tool !== "select" && tool !== "fill") setHover(toPage(e));
            }} onPointerLeave={() => setHover(null)} onPointerCancel={() => setEdit(null)}>
            {mine.map((m0) => {
              const m = edit && edit.id === m0.id ? { ...m0, geometry: edit.pts } : m0;
              const p = params.get(m.parameter_id);
              if (!p) return null;
              const isSel = m.id === selId;
              const op = !selM ? 0.8 : isSel ? 1 : m.parameter_id === selM.parameter_id ? 0.7 : 0.14;
              const pick = (e: React.PointerEvent) => { if (tool === "select") { e.stopPropagation(); setSelId(m.id); } };
              if (p.kind === "count") return (
                <g key={m.id} opacity={op} onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }}>
                  {m.geometry.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={r * (isSel ? 1.3 : 1)} fill={shapeColor(m, p)} stroke="#fff" strokeWidth={sw / 2} />)}
                </g>
              );
              if (p.kind === "linear") return (
                <path key={m.id} d={pathOf(m.geometry, false)} fill="none" stroke={shapeColor(m, p)} strokeWidth={sw * (isSel ? 2.2 : 1.6)} opacity={op}
                  strokeLinejoin="round" strokeLinecap="round" onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }} />
              );
              return (
                <path key={m.id} d={pathOf(m.geometry, true) + (m.cutouts ?? []).map((c) => " " + pathOf(c, true)).join("")} fillRule="evenodd"
                  fill={shapeColor(m, p)} fillOpacity={isSel ? 0.35 : 0.22} stroke={shapeColor(m, p)} strokeWidth={sw * (isSel ? 1.6 : 1)} opacity={op}
                  onPointerUp={pick} style={{ cursor: tool === "select" ? "pointer" : undefined }} />
              );
            })}
            {/* Corners of the selected shape: drag to move, a mid-edge dot adds one, double-click removes one. */}
            {tool === "select" && selM && selGroup && !busy && (() => {
              const pts = edit && edit.id === selM.id ? edit.pts : selM.geometry;
              const closed = selGroup.kind === "area";
              const min = selGroup.kind === "area" ? 3 : selGroup.kind === "linear" ? 2 : 1;
              const grab = (i: number, list: Pt[]) => (e: React.PointerEvent) => {
                e.stopPropagation();
                (e.currentTarget as SVGGraphicsElement).ownerSVGElement?.setPointerCapture?.(e.pointerId);
                setEdit({ id: selM.id, pts: list, i, moved: list.length !== pts.length, start: list[i] });
              };
              const mids = selGroup.kind === "count" ? [] : pts.slice(0, closed ? pts.length : pts.length - 1).map((a, i) => {
                const b = pts[(i + 1) % pts.length];
                return { i, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt };
              });
              return (
                <g>
                  {mids.map(({ i, at }) => (
                    <circle key={`m${i}`} cx={at[0]} cy={at[1]} r={r * 0.7} fill={shapeColor(selM, selGroup)} fillOpacity={0.55} stroke="#fff" strokeWidth={sw / 2}
                      style={{ cursor: "copy", touchAction: "none" }} onPointerDown={grab(i + 1, [...pts.slice(0, i + 1), at, ...pts.slice(i + 1)])} />
                  ))}
                  {pts.map((pt, i) => (
                    <circle key={`v${i}`} cx={pt[0]} cy={pt[1]} r={r * 1.1} fill="#fff" stroke={shapeColor(selM, selGroup)} strokeWidth={sw}
                      style={{ cursor: "move", touchAction: "none" }}
                      onPointerDown={(e) => { if (!secondPress(e, selM.id, i, pts, min)) grab(i, pts)(e); }}>
                      <title>Drag to move · double-click to remove</title>
                    </circle>
                  ))}
                </g>
              );
            })()}
            {draft.length > 0 && (
              <g pointerEvents="none">
                {tool === "count" ? draft.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r={r} fill={draftColor} />)
                  : tool === "fill" ? <path d={pathOf(draft, true)} fill={draftColor} fillOpacity={0.25} stroke={draftColor} strokeWidth={sw * 1.4} strokeDasharray={`${4 / px} ${3 / px}`} />
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
              <b>{q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, KIND_UNIT[selGroup.kind]) : q?.reason ?? "—"}</b>
              {q?.perim_lf != null && <b> · {fmtQty(q.perim_lf, "LF")} perimeter</b>} · {selM.name ?? selGroup.name}
              {tot?.qty !== null && tot?.qty !== undefined && <span style={{ opacity: 0.7 }}> · {selGroup.name} {fmtQty(tot.qty, tot.unit)} total</span>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- parameter tree */

function ParamPanel({ jobId, data, groupId, setGroupId, selId, onSelect, act, onSend, onCollapse, drawer }: {
  jobId: string; data: PlansData; groupId: string | null; setGroupId: (id: string) => void; selId: string | null;
  onSelect: (m: Meas) => void; act: (fn: () => Promise<unknown>) => Promise<void>; onSend: (p: Param, ids?: string[]) => void; onCollapse: () => void;
  /** Inside the phone's slide-out: the drawer's full height, no fold-to-a-strip. */
  drawer?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // Takeoffs ticked to send to the budget (Coy, 2026-10-03: "a check box next to the measurement … select the
  // measurement and push to budget") — one group at a time, since a section takes one kind.
  const [ticked, setTicked] = useState<{ g: string; ids: Set<string> }>({ g: "", ids: new Set() });
  const tick = (m: Meas) => setTicked((t) => {
    const ids = new Set(t.g === m.parameter_id ? t.ids : []);
    if (ids.has(m.id)) ids.delete(m.id); else ids.add(m.id);
    return { g: m.parameter_id, ids };
  });
  // The takeoff whose colour swatches are open under its row.
  const [painting, setPainting] = useState<string | null>(null);
  const sheetsById = useMemo(() => new Map(data.sheets.map((s) => [s.id, s])), [data.sheets]);
  const linked = (p: Param) => data.lines.find((l) => l.takeoff_parameter_id === p.id);
  // How many of a group's shapes are counted in budget sections (migration 069).
  const inBudget = (p: Param) => { const ms = data.measurements.filter((m) => m.parameter_id === p.id); return [ms.filter((m) => m.section_id).length, ms.length] as const; };
  const nShapes = data.measurements.length;
  return (
    <div className={drawer ? "flex flex-col" : "sc-param-panel flex flex-col"} style={drawer ? { width: "100%", height: "100%", background: T.card, minHeight: 0 }
      : { width: "100%", maxHeight: 260, flex: "0 0 auto", background: T.card, borderRight: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hair}`, minHeight: 0 }}>
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
            const [inB, ofB] = inBudget(p);
            const shapes = data.measurements.filter((m) => m.parameter_id === p.id);
            return (
              <div key={p.id} style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                <div className="flex items-center gap-2 px-2.5 py-2" style={{ background: groupId === p.id ? T.slab : "transparent", cursor: "pointer" }} onClick={() => setGroupId(p.id)}>
                  <KindIcon kind={p.kind} color={p.color} />
                  <button onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [p.id]: !isOpen })); }} aria-label={isOpen ? "Fold" : "Open"}
                    style={{ width: 16, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", color: T.ink3, cursor: "pointer" }}>›</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, ...clip }}>{p.name}</div>
                    <div style={{ fontFamily: disp, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: inB || line ? T.ink3 : T.hivizText, ...clip }}>
                      {KIND_LABEL[p.kind]}{p.depth_in ? ` · ${p.depth_in}"` : ""} · {ofB ? (inB === ofB ? "all in the budget" : inB ? `${inB} of ${ofB} in the budget` : "not in the budget") : line ? line.name : "nothing measured"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 14, ...nums }}>{t?.qty !== null && t?.qty !== undefined ? fmtQty(t.qty, t.unit) : "—"}</div>
                    {(t?.cy != null || t?.perim_lf != null) && (
                      <div style={{ fontSize: 10.5, color: T.ink3, ...nums }} title={t?.perim_lf != null ? "Perimeter: feet of edge round every shape, cutouts included" : undefined}>
                        {[t?.cy != null ? `${t.cy.toFixed(1)} CY` : null, t?.perim_lf != null ? `${fmtQty(t.perim_lf, "LF")} edge` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
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
                      const col = shapeColor(m, p);
                      return (
                        <React.Fragment key={m.id}>
                        <div className="flex items-center gap-2 pr-2.5" onClick={() => onSelect(m)}
                          style={{ paddingLeft: 14, minHeight: 34, background: on ? T.slab : "transparent", borderLeft: `3px solid ${on ? col : "transparent"}`, cursor: "pointer" }}>
                          <input type="checkbox" checked={ticked.g === p.id && ticked.ids.has(m.id)} onChange={() => tick(m)} onClick={(e) => e.stopPropagation()}
                            aria-label={`Tick ${m.name ?? `${p.name} ${i + 1}`} to send to the budget`} title="Tick to send to the budget" style={{ width: 16, height: 16, flex: "0 0 auto", cursor: "pointer", accentColor: T.hiviz }} />
                          <button onClick={(e) => { e.stopPropagation(); setPainting(painting === m.id ? null : m.id); }} aria-label="Colour of this takeoff" aria-expanded={painting === m.id}
                            title="Colour of this takeoff" style={{ width: 12, alignSelf: "stretch", margin: "5px 0", background: col, borderRadius: 3, border: `1px solid ${painting === m.id ? T.ink : "transparent"}`, cursor: "pointer", padding: 0, flex: "0 0 auto" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <MeasName jobId={jobId} m={m} fallback={`${p.name} ${i + 1}`} act={act} />
                            <div style={{ fontSize: 11, color: T.ink3 }}>{s ? sheetLabel(s) : "sheet removed"} · {m.method}{(m.cutouts?.length ?? 0) > 0 ? ` · ${m.cutouts.length} cutout${m.cutouts.length === 1 ? "" : "s"}` : ""}</div>
                          </div>
                          {m.section_id && <span title="Counted in a budget section" style={{ fontSize: 10.5, color: T.green, fontWeight: 700 }}>$✓</span>}
                          <span style={{ fontSize: 12.5, ...nums, color: q?.qty === null ? T.hivizText : T.ink, textAlign: "right" }}>
                            {q?.qty !== null && q?.qty !== undefined ? fmtQty(q.qty, KIND_UNIT[p.kind]) : "scale not set"}
                            {q?.perim_lf != null && <span title="Perimeter: feet of edge round this shape, cutouts included" style={{ display: "block", fontSize: 10.5, color: T.ink3 }}>{fmtQty(q.perim_lf, "LF")} edge</span>}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); void act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${m.id}`, "DELETE")); }}
                            aria-label="Remove this takeoff" style={{ color: T.ink3, width: 18, cursor: "pointer" }}>×</button>
                        </div>
                        {painting === m.id && (
                          <ShapeColors current={m.color ?? null} group={p.color}
                            onPick={(c) => { setPainting(null); if (c !== (m.color ?? null)) void act(() => call(`/api/jobs/${jobId}/takeoff/measurements/${m.id}`, "PATCH", { color: c })); }} />
                        )}
                        </React.Fragment>
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
            // Ticked takeoffs go first: "Send 2 to budget" opens the sheet with just those.
            const tg = ticked.ids.size ? data.params.find((p) => p.id === ticked.g) : null;
            if (tg) return (
              <button onClick={() => { onSend(tg, [...ticked.ids]); setTicked({ g: "", ids: new Set() }); }} className="flex-1 rounded"
                style={{ height: 34, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", fontSize: 12, whiteSpace: "nowrap", cursor: "pointer" }}>
                Send {ticked.ids.size} to budget
              </button>
            );
            const g = data.params.find((p) => p.id === groupId);
            const [inB, ofB] = g ? inBudget(g) : [0, 0];
            const all = ofB > 0 && inB === ofB;
            return (
              <button disabled={!g || !ofB} onClick={() => g && onSend(g)} className="flex-1 rounded" title={all ? "Every shape is in the budget — send again to re-arrange" : undefined}
                style={{ height: 34, background: all ? T.greenDim : T.hiviz, color: all ? T.green : T.onHiviz, opacity: g && ofB ? 1 : 0.5, fontFamily: disp, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 13, cursor: g && ofB ? "pointer" : "default" }}>
                {all ? "In budget ✓" : "Send to budget"}
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

/** A takeoff's own colour (migration 070) — the Plan Room only; the budget and proposal keep the group's. */
function ShapeColors({ current, group, onPick }: { current: string | null; group: string; onPick: (c: string | null) => void }) {
  const sw = (c: string, on: boolean, label: string, pick: string | null) => (
    <button key={label} onClick={() => onPick(pick)} aria-label={label} aria-pressed={on} title={label}
      style={{ width: 22, height: 22, borderRadius: 999, background: c, border: `2px solid ${on ? T.ink : T.card}`, boxShadow: `0 0 0 1px ${T.hair}`, cursor: "pointer", padding: 0 }} />
  );
  return (
    <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: "6px 10px 8px 32px", background: T.slab }} onClick={(e) => e.stopPropagation()}>
      <span className="flex items-center gap-1" style={{ fontSize: 11, color: T.ink3, marginRight: 4 }}>
        {sw(group, current === null, "The group's colour", null)} group
      </span>
      {SHAPE_COLORS.filter((c) => c.toLowerCase() !== group.toLowerCase()).map((c) => sw(c, current?.toLowerCase() === c.toLowerCase(), c, c))}
    </div>
  );
}
