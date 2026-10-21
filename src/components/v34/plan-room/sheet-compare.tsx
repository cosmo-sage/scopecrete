"use client";
/**
 * Sheets side by side in Takeoffs (Coy, 2026-10-21; Claude Design "Sheet Compare"): two to four
 * panes, each a sheet, one of them active — the tools, the scale button, Ask, AI Takeoff and
 * undo / redo act on it, and it is the sheet in the address. The others are drawn with their
 * takeoffs and zoom on their own; a click on one makes it the active pane. Link keeps the panes
 * together: zoom matched in real feet when both sheets have a scale, else by the page, and the
 * same spot on each page in view. At most two panes on a phone, stacked, a scanned sheet in the
 * other pane shown by name only (a phone holds one decoded scan at a time).
 *
 * Kept per job on the device (`sc:takeoff-compare:<job>`). The layout maths is in
 * src/lib/sheet-compare.ts (tested).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, strong, nums } from "@/lib/v34/tokens";
import { scaleLabel } from "@/lib/takeoff";
import { sheetLabel, type Sheet } from "./shared";
import { addPane, closePane, cleanCompare, gridFor, linkedZoom, maxPanes, startPanes, type Compare, type Layout } from "@/lib/sheet-compare";

const key = (job: string) => `sc:takeoff-compare:${job}`;

function readSaved(job: string, ids: Set<string>, phone: boolean): Compare | null {
  try { return cleanCompare(JSON.parse(localStorage.getItem(key(job)) || "null"), ids, phone); } catch { return null; }
}

export function usePhoneWidth(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

export type CompareApi = ReturnType<typeof useCompare>;

/**
 * The compare's state. `sheetId` is the active pane's sheet (the address); `setSheetId` moves it.
 * `zoom` / `setZoom` are the active pane's — the other panes keep their own in `paneZoom`.
 */
export function useCompare({ jobId, sheets, sheetId, setSheetId, zoom, setZoom, phone, drafting }: {
  jobId: string; sheets: Sheet[]; sheetId: string | null; setSheetId: (id: string) => void;
  zoom: number; setZoom: (z: number) => void; phone: boolean; drafting: boolean;
}) {
  const ids = useMemo(() => new Set(sheets.map((s) => s.id)), [sheets]);
  const [cmp, setCmpState] = useState<Compare | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const loaded = useRef(false);
  // Brought back once per visit, then kept as it changes.
  useEffect(() => {
    if (loaded.current || !sheets.length) return;
    loaded.current = true;
    const c = readSaved(jobId, ids, phone);
    Promise.resolve().then(() => {
      if (!c) return;
      setCmpState(c);
      setRestored(`Your compare is back: ${c.panes.length} sheets`);
    });
  }, [jobId, ids, phone, sheets.length]);
  const setCmp = useCallback((c: Compare | null) => {
    setCmpState(c);
    try { if (c) localStorage.setItem(key(jobId), JSON.stringify(c)); else localStorage.removeItem(key(jobId)); } catch { /* no storage */ }
  }, [jobId]);
  useEffect(() => { if (!restored) return; const t = window.setTimeout(() => setRestored(null), 7000); return () => window.clearTimeout(t); }, [restored]);

  // The active pane shows the sheet in the address; a sheet picked anywhere lands in it.
  const view = useMemo(() => {
    if (!cmp) return null;
    const panes = [...cmp.panes];
    if (sheetId && ids.has(sheetId)) panes[cmp.active] = sheetId;
    return { ...cmp, panes };
  }, [cmp, sheetId, ids]);
  useEffect(() => {
    if (!cmp || !view || view.panes[cmp.active] === cmp.panes[cmp.active]) return;
    const c = view;
    Promise.resolve().then(() => setCmp(c));
  }, [cmp, view, setCmp]);
  // Phone: two panes at most.
  useEffect(() => {
    if (!cmp || !phone || cmp.panes.length <= 2) return;
    const c = cleanCompare(cmp, ids, true);
    Promise.resolve().then(() => setCmp(c));
  }, [cmp, phone, ids, setCmp]);

  // Each pane's own zoom; the active one's is the toolbar's.
  const [pz, setPz] = useState<number[]>([]);
  const boxes = useRef<Array<HTMLDivElement | null>>([]);
  const zoomOf = (i: number) => (view && i === view.active ? zoom : pz[i] ?? 1);

  const activate = useCallback((i: number) => {
    if (!view || i === view.active || !view.panes[i] || !ids.has(view.panes[i])) return;
    const next = [...pz]; next[view.active] = zoom;
    setPz(next);
    setZoom(pz[i] ?? 1);
    setCmp({ ...view, active: i });
    setSheetId(view.panes[i]);
  }, [view, ids, pz, zoom, setZoom, setCmp, setSheetId]);

  const start = useCallback((pick?: string[]) => {
    const panes = startPanes(sheets.map((s) => s.id), sheetId, pick, phone);
    if (panes.length < 2) return false;
    const active = Math.max(0, panes.indexOf(sheetId ?? ""));
    setPz([]);
    setCmp({ panes, layout: gridFor(panes.length, phone ? "stack" : "side"), active, link: false, max: null, split: 0.5 });
    if (panes[active] !== sheetId) setSheetId(panes[active]);
    return true;
  }, [sheets, sheetId, phone, setCmp, setSheetId]);

  const add = useCallback(() => {
    if (!view) { start(); return; }
    const c = addPane(view, sheets.map((s) => s.id), phone);
    if (c) setCmp(c);
  }, [view, sheets, phone, start, setCmp]);

  const close = useCallback((i: number) => {
    if (!view) return;
    const c = closePane(view, i);
    const z = [...pz]; z.splice(i, 1);
    if (i === view.active) setZoom(z[c?.active ?? 0] ?? 1);
    setPz(z);
    setCmp(c);
    const next = c ? c.panes[c.active] : view.panes[i === 0 ? 1 : 0];
    if (next && next !== sheetId && ids.has(next)) setSheetId(next);
  }, [view, pz, sheetId, ids, setZoom, setCmp, setSheetId]);

  const setPaneSheet = useCallback((i: number, id: string) => {
    if (!view) return;
    if (i === view.active) { setSheetId(id); return; }
    const panes = [...view.panes]; panes[i] = id;
    setCmp({ ...view, panes });
  }, [view, setCmp, setSheetId]);

  const swap = useCallback(() => {
    if (!view || view.panes.length < 2) return;
    const a = view.active, b = (a + 1) % view.panes.length;
    const panes = [...view.panes]; [panes[a], panes[b]] = [panes[b], panes[a]];
    const z = [...pz]; z[b] = zoom; z[a] = pz[b] ?? 1;
    setPz(z);
    setCmp({ ...view, panes, active: b });
  }, [view, pz, zoom, setCmp]);

  const setLayout = useCallback((l: Layout) => {
    if (!view) return;
    const want = l === "three" ? 3 : l === "four" ? 4 : 2;
    let c: Compare | null = view;
    while (c && c.panes.length < want) c = addPane(c, sheets.map((s) => s.id), phone) ?? null;
    if (!c || c.panes.length !== want) return;
    setCmp({ ...c, layout: l, max: null });
  }, [view, sheets, phone, setCmp]);

  const exit = useCallback(() => { setCmp(null); setPz([]); }, [setCmp]);
  const set = useCallback((p: Partial<Compare>) => { if (view) setCmp({ ...view, ...p }); }, [view, setCmp]);

  // Linked: the other panes follow the active one's zoom (in feet when both sheets have a scale)
  // and the spot in view.
  const byId = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);
  const fitW = (i: number) => Math.max(1, (boxes.current[i]?.clientWidth ?? 600) - 24);
  useEffect(() => {
    if (!view?.link) return;
    const a = byId.get(view.panes[view.active]);
    if (!a) return;
    const next = view.panes.map((id, i) => {
      if (i === view.active) return zoom;
      const b = byId.get(id);
      return b ? linkedZoom(zoom, a, fitW(view.active), b, fitW(i)) : pz[i] ?? 1;
    });
    if (next.some((z, i) => Math.abs(z - (pz[i] ?? 1)) > 1e-3 && i !== view.active)) {
      Promise.resolve().then(() => setPz(next));
    }
  }, [view, zoom, byId, pz]);
  const setPaneZoom = useCallback((i: number, z: number) => {
    if (!view) return;
    if (i === view.active) { setZoom(z); return; }
    if (view.link) { const r = z / (pz[i] ?? 1); setZoom(Math.max(0.5, Math.min(8, zoom * r))); return; }
    const n = [...pz]; n[i] = z; setPz(n);
  }, [view, pz, zoom, setZoom]);

  // Scroll: the same spot on each page in view, while linked.
  const quiet = useRef(new WeakSet<HTMLDivElement>());
  const onScroll = useCallback((i: number) => {
    if (!view?.link) return;
    const el = boxes.current[i]; if (!el || quiet.current.has(el)) return;
    const fx = (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth);
    const fy = (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight);
    boxes.current.forEach((o, j) => {
      if (!o || j === i) return;
      quiet.current.add(o);
      o.scrollLeft = fx * o.scrollWidth - o.clientWidth / 2;
      o.scrollTop = fy * o.scrollHeight - o.clientHeight / 2;
      requestAnimationFrame(() => requestAnimationFrame(() => quiet.current.delete(o)));
    });
  }, [view?.link]);
  const boxFns = useRef(new Map<number, (el: HTMLDivElement | null) => void>());
  const scrollFns = useRef(new Map<number, () => void>());
  const onScrollRef = useRef(onScroll);
  useEffect(() => { onScrollRef.current = onScroll; });
  /** A stable callback ref per pane for Drawing's scrolling box. */
  const boxRef = useCallback((i: number) => {
    let f = boxFns.current.get(i);
    if (!f) {
      let s = scrollFns.current.get(i);
      if (!s) { s = () => onScrollRef.current(i); scrollFns.current.set(i, s); }
      const sc = s;
      f = (el: HTMLDivElement | null) => {
        const old = boxes.current[i];
        if (old) old.removeEventListener("scroll", sc);
        boxes.current[i] = el;
        if (el) el.addEventListener("scroll", sc, { passive: true });
      };
      boxFns.current.set(i, f);
    }
    return f;
  }, []);

  // 1–4 picks a pane; Esc puts a maximised pane back.
  useEffect(() => {
    if (!view) return;
    const k = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.ctrlKey || e.metaKey || e.altKey || drafting) return;
      const n = Number(e.key);
      if (n >= 1 && n <= view.panes.length) { e.preventDefault(); activate(n - 1); }
      if (e.key === "Escape" && view.max !== null) set({ max: null });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [view, activate, drafting, set]);

  const canAdd = !!view && view.panes.length < maxPanes(phone) && sheets.length > view.panes.length;
  return { view, start, add, close, activate, setPaneSheet, swap, setLayout, exit, set, zoomOf, setPaneZoom, boxRef, canAdd, restored, dismissRestored: () => setRestored(null), byId };
}

/* ------------------------------------------------------------------ the bar */

const LAYOUTS: Array<[Layout, string, number]> = [["side", "Side by side", 2], ["stack", "Stacked", 2], ["three", "Three", 3], ["four", "Four", 4]];

function LayoutIcon({ l }: { l: Layout }) {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1" y="1" width="14" height="12" rx="1" />
      {l === "side" && <path d="M8 1v12" />}
      {l === "stack" && <path d="M1 7h14" />}
      {l === "three" && <path d="M7 1v12M7 7h8" />}
      {l === "four" && <path d="M8 1v12M1 7h14" />}
    </svg>
  );
}

const btn = (on: boolean): React.CSSProperties => ({
  height: 28, padding: "0 9px", borderRadius: 3, flex: "0 0 auto", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
  border: `1px solid ${on ? T.hiviz : T.hairStrong}`, background: on ? T.hivizDim : T.card, color: on ? T.hivizText : T.ink,
  fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap",
});

/** Over the panes: the layout, Link, Swap, + Sheet, which pane the tools act on, and One sheet. */
export function CompareBar({ c, phone }: { c: CompareApi; phone: boolean }) {
  const v = c.view; if (!v) return null;
  const a = c.byId.get(v.panes[v.active]);
  const b = c.byId.get(v.panes[(v.active + 1) % v.panes.length]);
  const byFeet = !!a?.scale_ft_per_pt && v.panes.every((id) => c.byId.get(id)?.scale_ft_per_pt);
  return (
    <div className="flex items-center gap-1.5 px-2 overflow-x-auto" style={{ height: 38, flex: "0 0 auto", background: T.card, borderBottom: `1px solid ${T.hair}` }}>
      {!phone && (
        <span className="inline-flex" role="group" aria-label="Layout" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 3, overflow: "hidden", flex: "0 0 auto" }}>
          {LAYOUTS.map(([l, label, n]) => {
            const on = v.layout === l;
            const off = n === 2 ? v.panes.length !== 2 : v.panes.length > n;
            return (
              <button key={l} onClick={() => c.setLayout(l)} disabled={off} aria-pressed={on}
                title={off ? `${label}: close a pane first` : n > v.panes.length ? `${label}: adds a pane` : label}
                style={{ width: 32, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: on ? T.ink : T.card, color: on ? T.card : off ? T.ink3 : T.ink2, opacity: off ? 0.45 : 1, cursor: off ? "default" : "pointer", border: "none" }}>
                <LayoutIcon l={l} />
              </button>
            );
          })}
        </span>
      )}
      {phone && (
        <span className="inline-flex" role="group" aria-label="Both or one" style={{ border: `1px solid ${T.hairStrong}`, borderRadius: 3, overflow: "hidden", flex: "0 0 auto" }}>
          <button onClick={() => c.set({ max: null })} aria-pressed={v.max === null} style={{ ...btn(false), border: "none", borderRadius: 0, background: v.max === null ? T.ink : T.card, color: v.max === null ? T.card : T.ink2 }}><LayoutIcon l="stack" /></button>
          <button onClick={() => c.set({ max: v.active })} aria-pressed={v.max !== null} title="One pane at a time; the other is a tap away" style={{ ...btn(false), border: "none", borderRadius: 0, background: v.max !== null ? T.ink : T.card, color: v.max !== null ? T.card : T.ink2, ...nums }}>{v.active + 1} / {v.panes.length}</button>
        </span>
      )}
      <button onClick={() => c.set({ link: !v.link })} aria-pressed={v.link} style={btn(v.link)}
        title={v.link ? (byFeet ? "Zoom matched in feet; the same spot on each page in view. Tap to unlink." : "One sheet has no scale: zoom matched by the page, the same spot on each page in view. Tap to unlink.")
          : "Move the panes together: zoom and the spot in view"}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></svg>
        {v.link ? (byFeet ? "Linked · by distance" : "Linked · by page") : "Link"}
      </button>
      {!phone && <button onClick={c.swap} style={btn(false)} title={b ? `Swap pane ${v.active + 1} with the next` : "Swap"}>⇄ Swap</button>}
      {c.canAdd && <button onClick={c.add} style={btn(false)} title="Another sheet in a new pane">+ Sheet</button>}
      <span className="flex-1" />
      {a && <span className="hidden md:inline" style={{ fontSize: F.xs, color: T.ink2, whiteSpace: "nowrap" }}>Tools on <b style={{ fontFamily: strong }}>pane {v.active + 1} · {sheetLabel(a)}</b></span>}
      <button onClick={c.exit} style={btn(false)} title="Back to one sheet; the active pane stays">One sheet ×</button>
    </div>
  );
}

/* ---------------------------------------------------------------- a pane's header */

export function PaneHead({ i, sheet, sheets, active, c, phone, sameAs }: {
  i: number; sheet: Sheet | null; sheets: Sheet[]; active: boolean; c: CompareApi; phone: boolean; sameAs: number | null;
}) {
  const v = c.view!;
  const scaled = !!sheet?.scale_ft_per_pt;
  return (
    <div className="flex items-center gap-1.5" onClick={() => c.activate(i)}
      style={{ height: 30, flex: "0 0 auto", padding: "0 6px", background: active ? T.hivizDim : T.card, borderBottom: `1px solid ${T.hair}`, minWidth: 0, cursor: active ? "default" : "pointer" }}>
      <span aria-label={`Pane ${i + 1}${active ? ", active" : ""}`} title={active ? "The tools act on this pane" : `Press ${i + 1} or click to draw here`}
        style={{ width: 18, height: 18, flex: "0 0 auto", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: strong, fontSize: 10.5, fontWeight: 700,
          background: active ? T.hiviz : "transparent", color: active ? T.onHiviz : T.ink3, border: active ? "none" : `1px solid ${T.hairStrong}` }}>{i + 1}</span>
      {sheet ? (
        <select value={sheet.id} onClick={(e) => e.stopPropagation()} onChange={(e) => c.setPaneSheet(i, e.target.value)} aria-label={`Sheet in pane ${i + 1}`}
          style={{ minWidth: 0, flex: "1 1 auto", maxWidth: "100%", height: 24, border: "none", background: "transparent", color: T.ink, fontSize: 12, fontFamily: strong, fontWeight: 700, textOverflow: "ellipsis", cursor: "pointer" }}>
          {sheets.map((s) => <option key={s.id} value={s.id}>{sheetLabel(s)}{s.title ? ` · ${s.title}` : ""}</option>)}
        </select>
      ) : <span style={{ flex: 1, fontSize: 12, color: T.ink3 }}>Sheet removed</span>}
      {sameAs !== null && <span title={`Pane ${sameAs + 1} shows this sheet too; takeoffs drawn on either land on it once`} style={{ fontSize: 10.5, color: T.ink2, background: T.sunk, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>same as {sameAs + 1}</span>}
      {sheet && (
        <span title={scaled ? `Scale ${scaleLabel(sheet.scale_ft_per_pt as number)}` : "Takeoffs here won't count until a scale is set"}
          style={{ flex: "0 0 auto", fontFamily: disp, fontSize: 10.5, letterSpacing: ".04em", padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap", ...nums,
            border: `1px solid ${scaled ? T.hairStrong : T.hiviz}`, background: scaled ? "transparent" : T.hivizDim, color: scaled ? T.ink2 : T.hivizText }}>
          {scaled ? scaleLabel(sheet.scale_ft_per_pt as number) : sheet.scale_method === "none" ? "Not to scale" : "Scale not set"}
        </span>
      )}
      {!phone && (
        <button onClick={(e) => { e.stopPropagation(); c.set({ max: v.max === i ? null : i }); if (!active) c.activate(i); }} aria-label={v.max === i ? "Restore" : "Maximise"} title={v.max === i ? "Back to every pane (Esc)" : "Fill the drawing with this pane for now"}
          style={{ width: 24, height: 24, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: T.ink2, cursor: "pointer" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{v.max === i ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" /> : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />}</svg>
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); c.close(i); }} aria-label={`Close pane ${i + 1}`} title="Close this pane"
        style={{ width: 24, height: 24, flex: "0 0 auto", border: "none", background: "transparent", color: T.ink2, fontSize: 17, lineHeight: 1, cursor: "pointer" }}>×</button>
    </div>
  );
}

/** A pane whose sheet is gone, or one a phone won't draw beside another. */
export function PaneNote({ title, body, actions }: { title: string; body: string; actions?: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 p-4" style={{ background: T.sunk, minHeight: 0 }}>
      <b style={{ fontSize: F.sm, color: T.ink }}>{title}</b>
      <span style={{ fontSize: F.xs, color: T.ink2, maxWidth: 300 }}>{body}</span>
      {actions && <span className="flex gap-2 flex-wrap justify-center">{actions}</span>}
    </div>
  );
}

export const paneBtn = btn;

/** The panes' grid: each cell gets its index; `split` is the divider of a two-pane layout. */
export function PaneGrid({ c, phone, cell, narrow }: { c: CompareApi; phone: boolean; cell: (i: number) => React.ReactNode; narrow: boolean }) {
  const v = c.view!;
  const grid = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const n = v.panes.length;
  // A narrow drawing shows two panes and the rest as tabs (Design D6).
  const [all, setAll] = useState(false);
  const fold = narrow && n > 2 && !all && v.max === null;
  const shown = v.max !== null ? [v.max] : fold ? [v.active, (v.active + 1) % n] : v.panes.map((_, i) => i);
  const vertical = v.layout === "stack" || phone;
  const two = shown.length === 2;
  const sp = Math.round((drag ?? v.split) * 1000) / 10;
  const style: React.CSSProperties = shown.length === 1 ? { gridTemplate: "1fr / 1fr" }
    : two ? (vertical ? { gridTemplateRows: `${sp}fr 6px ${100 - sp}fr`, gridTemplateColumns: "1fr" } : { gridTemplateColumns: `${sp}fr 6px ${100 - sp}fr`, gridTemplateRows: "1fr" })
    : v.layout === "three" ? { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6 }
    : { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6 };
  const onMove = (e: React.PointerEvent) => {
    if (drag === null || !grid.current) return;
    const r = grid.current.getBoundingClientRect();
    const f = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    setDrag(Math.max(0.2, Math.min(0.8, f)));
  };
  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      <div ref={grid} style={{ flex: 1, minHeight: 0, display: "grid", background: T.sunk, padding: two ? 0 : 6, ...style }}
        onPointerMove={onMove} onPointerUp={() => { if (drag !== null) { c.set({ split: drag }); setDrag(null); } }}>
        {shown.map((i, k) => (
          <React.Fragment key={i}>
            {two && k === 1 && (
              <div role="separator" aria-orientation={vertical ? "horizontal" : "vertical"} title="Drag to size the panes"
                onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(v.split); }}
                onPointerMove={onMove}
                onPointerUp={() => { if (drag !== null) { c.set({ split: drag }); setDrag(null); } }}
                style={{ cursor: vertical ? "row-resize" : "col-resize", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", background: T.sunk }}>
                <span style={{ width: vertical ? 56 : 4, height: vertical ? 4 : 56, borderRadius: 3, background: T.hairStrong }} />
              </div>
            )}
            <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: T.card,
              gridRow: !two && v.layout === "three" && k === 0 && shown.length === 3 ? "1 / span 2" : undefined,
              border: i === v.active ? `2px solid ${T.hiviz}` : `1px solid ${T.hairStrong}` }}>
              {cell(i)}
            </div>
          </React.Fragment>
        ))}
      </div>
      {fold && (
        <div className="flex items-center gap-1.5 px-2 overflow-x-auto" style={{ height: 32, flex: "0 0 auto", background: T.card, borderTop: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2 }}>
          <span style={{ whiteSpace: "nowrap" }}>This window fits two panes. The others:</span>
          {v.panes.map((id, i) => shown.includes(i) ? null : (
            <button key={i} onClick={() => c.activate(i)} style={btn(false)}>{i + 1} · {c.byId.get(id) ? sheetLabel(c.byId.get(id) as Sheet) : "removed"}</button>
          ))}
          <button onClick={() => setAll(true)} style={{ ...btn(false), border: "none", color: T.hivizText }}>Show {n} anyway</button>
        </div>
      )}
    </div>
  );
}

/** The one-time hints: how to pick the pane you draw in, and a compare brought back. */
export function CompareToast({ c, phone }: { c: CompareApi; phone: boolean }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => { Promise.resolve().then(() => { try { setSeen(localStorage.getItem("sc:compare-hint") === "1"); } catch { /* no storage */ } }); }, []);
  const v = c.view;
  if (!v) return null;
  const text = c.restored ?? (!seen ? (phone ? "Tap a pane to draw in it" : `Click a pane, or press 1 – ${v.panes.length}, to make it the one you draw in`) : null);
  if (!text) return null;
  const done = () => { if (c.restored) c.dismissRestored(); else { setSeen(true); try { localStorage.setItem("sc:compare-hint", "1"); } catch { /* no storage */ } } };
  return (
    <div className="flex items-center gap-3" role="status" style={{ position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)", zIndex: 7, background: T.ink, color: T.card,
      borderRadius: 6, padding: "7px 12px", fontSize: 12.5, boxShadow: "0 4px 14px rgba(0,0,0,.22)", maxWidth: "calc(100% - 24px)" }}>
      <span>{text}</span>
      {c.restored && <button onClick={() => { c.dismissRestored(); c.exit(); }} style={{ color: T.hivizSoft, fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", border: "none", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" }}>Start over</button>}
      <button onClick={done} style={{ color: T.hivizSoft, fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", border: "none", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" }}>Got it</button>
    </div>
  );
}
