"use client";
/**
 * The plan sheets behind a job's scope, opened from the job page (Coy,
 * 2026-10-02: "I need to expand and view each sheet to verify … on desktop, a
 * panel to the left or right of the budget page that has all the relevant
 * sheets listed for me to click into"). On a desktop it is a panel on the
 * right — the budget stays in view beside it — with the sheets listed down its
 * side: the section's own first, then the other sections', then the rest of
 * the set. On a phone it is the whole screen, the sheets a row of chips.
 * Zoom with − / + (or ctrl + wheel), drag the page to pan. Measuring is the
 * Plan Room's: "Measure in the Plan Room" opens Takeoff on this sheet.
 *
 * The takeoffs drawn on a sheet show over it, each in its colour as in Takeoffs (Coy,
 * 2026-10-10: "why doesn't it show me the drawings I made on the plans?"); Takeoffs ✓
 * hides them.
 */
import { usePinchZoom } from "@/lib/v34/use-pinch";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp, clip, eyebrow } from "@/lib/v34/tokens";
import { openPdf, drawPage, pageText } from "@/lib/pdf";
import { findOnSheet, type Hit } from "@/lib/find-on-sheet";
import { shapeColor, type Meas, type Param, type PlanFile, type Sheet } from "@/components/v34/plan-room/shared";
import { useWide } from "@/lib/v34/use-wide";

export interface SheetGroup { label: string; ids: string[] }

export function SheetViewer({ jobId, title, sheets, files, groups, start, find, onClose, params = [], measurements = [] }: {
  jobId: string; title: string; sheets: Sheet[]; files: PlanFile[];
  /** The job's takeoff groups and shapes, drawn over the sheet. */
  params?: Param[]; measurements?: Meas[];
  /** The line the section was read from: boxed wherever it is written on the sheet (Coy, 2026-10-09). */
  find?: string | null;
  /** The sheets listed first, by heading (the section's, then the other sections'). */
  groups: SheetGroup[];
  start: string | null; onClose: () => void;
}) {
  const [ref, wide] = useWide(720);
  const byId = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);
  const listed = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; items: Sheet[] }> = [];
    for (const g of groups) {
      // Once each, in the first group that names it — several sections share a sheet (Coy, 2026-10-02: "doubled up").
      const items: Sheet[] = [];
      for (const id of g.ids) {
        const x = byId.get(id);
        if (x && !seen.has(x.id)) { seen.add(x.id); items.push(x); }
      }
      if (items.length) out.push({ label: g.label, items });
    }
    const rest = sheets.filter((s) => !seen.has(s.id));
    if (rest.length) out.push({ label: out.length ? "The rest of the set" : "All sheets", items: rest });
    return out;
  }, [groups, sheets, byId]);
  const order = useMemo(() => listed.flatMap((g) => g.items), [listed]);
  const [id, setIdState] = useState<string | null>(start ?? order[0]?.id ?? null);
  const s = id ? byId.get(id) ?? null : null;
  const i = s ? order.findIndex((x) => x.id === s.id) : -1;
  const file = s ? files.find((f) => f.id === s.file_id) ?? null : null;

  // The page beside it narrows to fit (v34-shell.css), so the budget stays readable.
  useEffect(() => {
    document.documentElement.setAttribute("data-sheets", "open");
    return () => document.documentElement.removeAttribute("data-sheets");
  }, []);
  const [zoom, setZoom] = useState(1);
  const setId = (n: string) => { setIdState(n); setZoom(1); setHits(null); setAt(-1); };
  // Where the section's line is written on this sheet, in page points; null while looking.
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [at, setAt] = useState(-1);
  const [k, setK] = useState(0); // CSS px per page point as drawn
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null); // the page in points as drawn
  const [marks, setMarks] = useState(true);
  const shapes = useMemo(() => {
    if (!s) return [];
    const byParam = new Map(params.map((p) => [p.id, p]));
    return measurements.filter((m) => m.sheet_id === s.id && byParam.has(m.parameter_id) && m.geometry.length)
      .map((m) => { const p = byParam.get(m.parameter_id)!; return { id: m.id, kind: p.kind, color: shapeColor(m, p), geometry: m.geometry, cutouts: m.cutouts ?? [] }; });
  }, [s, params, measurements]);
  const focus = useRef<number | null>(null);
  const hitsRef = useRef<Hit[] | null>(null);
  useEffect(() => { hitsRef.current = hits; }, [hits]);
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drawn = useRef<{ id: string; zoom: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!s || !file?.url || !canvas.current || !box.current) return;
    let off = false;
    let job: { cancel: () => void; done: Promise<void> } | null = null;
    setFail(null); setBusy(true);
    // A pinch resizes the page drawn last at once, then it is drawn sharp once the zoom settles.
    const c = canvas.current, last = drawn.current;
    if (last && last.id === s.id && last.w) { c.style.width = `${Math.floor(last.w * zoom / last.zoom)}px`; c.style.height = `${Math.floor(last.h * zoom / last.zoom)}px`; }
    const t = window.setTimeout(() => {
      openPdf(s.file_id, file.url!).then(async (doc) => {
        // Fit the page's real width (rotation applied), not the stored reading of it.
        const w = (await doc.getPage(s.page)).getViewport({ scale: 1 }).width;
        if (off || !canvas.current || !box.current) return;
        const fit = Math.max(200, box.current.clientWidth - 16) / Math.max(1, w);
        job = drawPage(doc, s.page, canvas.current, fit * zoom);
        await job.done;
        if (off) return;
        setK(fit * zoom);
        if (canvas.current) setDims({ w: (parseFloat(canvas.current.style.width) || 0) / (fit * zoom), h: (parseFloat(canvas.current.style.height) || 0) / (fit * zoom) });
        if (find) setHits(findOnSheet(await pageText(s.file_id, doc, s.page), find));
        const f = focus.current;
        if (f !== null && box.current && hitsRef.current?.[f]) {
          const h = hitsRef.current[f], kk = fit * zoom;
          box.current.scrollLeft = Math.max(0, (h.x + h.w / 2) * kk - box.current.clientWidth / 2 + 8);
          box.current.scrollTop = Math.max(0, (h.y + h.h / 2) * kk - box.current.clientHeight / 2 + 8);
          focus.current = null;
        }
        if (!off && canvas.current) drawn.current = { id: s.id, zoom, w: parseFloat(canvas.current.style.width) || 0, h: parseFloat(canvas.current.style.height) || 0 };
      }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (!off) setBusy(false); });
    }, last ? 150 : 0);
    return () => { off = true; window.clearTimeout(t); job?.cancel(); };
  }, [s, file?.url, zoom, find]);
  /** Zoom in on one place the line is written, so it reads at a glance. */
  const goTo = (n: number) => {
    const h = hits?.[n];
    if (!h || !box.current || !k) return;
    const fit = k / zoom;
    const z = Math.min(6, Math.max(1.5, (box.current.clientWidth * 0.35) / Math.max(1, h.w * fit)));
    setAt(n); focus.current = n;
    if (Math.abs(z - zoom) < 0.01) {
      box.current.scrollLeft = Math.max(0, (h.x + h.w / 2) * k - box.current.clientWidth / 2 + 8);
      box.current.scrollTop = Math.max(0, (h.y + h.h / 2) * k - box.current.clientHeight / 2 + 8);
      focus.current = null;
    } else setZoom(z);
  };
  // Two fingers zoom on a phone (Coy, 2026-10-09).
  usePinchZoom(box, zoom, setZoom, 0.5, 6);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && i < order.length - 1) setId(order[i + 1].id);
      if (e.key === "ArrowLeft" && i > 0) setId(order[i - 1].id);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, order, onClose]);

  // Drag to pan; ctrl + wheel (a trackpad pinch) to zoom.
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || !box.current) return; // a finger scrolls the box itself
    drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    box.current.scrollLeft = d.l - (e.clientX - d.x);
    box.current.scrollTop = d.t - (e.clientY - d.y);
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); setZoom((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
  }, []);

  const name = (x: Sheet) => `${x.number ?? `p.${x.page}`}${x.title ? ` ${x.title}` : ""}`;
  const btn: React.CSSProperties = { height: 30, minWidth: 30, padding: "0 8px", borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, fontFamily: disp, fontSize: 13, fontWeight: 600, cursor: "pointer", color: T.ink };
  const pick = (x: Sheet) => {
    const on = x.id === id;
    return (
      <button key={x.id} onClick={() => setId(x.id)} aria-current={on ? "true" : undefined}
        className="text-left" title={`${name(x)} · ${files.find((f) => f.id === x.file_id)?.name ?? ""}`}
        style={{ display: "block", width: wide ? "100%" : "auto", padding: wide ? "5px 8px" : "0 10px", height: wide ? "auto" : 28, borderRadius: 4,
          background: on ? T.ink : wide ? "transparent" : T.card, color: on ? T.card : T.ink, border: wide ? "none" : `1px solid ${T.hair}`,
          fontSize: F.sm, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, ...(wide ? clip : {}) }}>
        <b style={{ fontWeight: 600 }}>{x.number ?? `p.${x.page}`}</b>{wide && x.title ? <span style={{ opacity: 0.75 }}> {x.title}</span> : null}
      </button>
    );
  };

  return (
    <div role="dialog" aria-label="Plan sheets" ref={ref} className="fixed z-[60] flex flex-col sc-sheets"
      style={{ background: T.sunk, borderLeft: `1px solid ${T.hairStrong}`, boxShadow: "-8px 0 24px rgba(0,0,0,.12)" }}>
      <div className="flex items-center gap-2 px-3 shrink-0" style={{ height: 48, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <button onClick={onClose} style={btn} aria-label="Close">✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{s ? name(s) : "No sheet"}</div>
          <div style={{ fontSize: 10.5, color: T.ink3, ...clip }}>{title}{file ? ` · ${file.name}` : ""}{order.length ? ` · ${i + 1} of ${order.length}` : ""}</div>
        </div>
        {shapes.length > 0 && (
          <button onClick={() => setMarks((v) => !v)} aria-pressed={marks} title={marks ? "Hide the takeoffs drawn on this sheet" : "Show the takeoffs drawn on this sheet"}
            style={{ ...btn, fontSize: 11, background: marks ? T.ink : T.card, color: marks ? T.card : T.ink }}>{marks ? "✓ " : ""}Takeoffs</button>
        )}
        <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} style={btn} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom(1)} style={{ ...btn, fontSize: 11 }} aria-label="Fit the width">Fit</button>
        <button onClick={() => setZoom((z) => Math.min(6, z * 1.25))} style={btn} aria-label="Zoom in">+</button>
        <button onClick={() => i > 0 && setId(order[i - 1].id)} disabled={i <= 0} style={{ ...btn, opacity: i <= 0 ? 0.4 : 1 }} aria-label="Previous sheet">‹</button>
        <button onClick={() => i < order.length - 1 && setId(order[i + 1].id)} disabled={i >= order.length - 1} style={{ ...btn, opacity: i >= order.length - 1 ? 0.4 : 1 }} aria-label="Next sheet">›</button>
      </div>
      <div className="flex-1 flex min-h-0" style={{ flexDirection: wide ? "row" : "column" }}>
        {/* The list: down the side on a desktop, a row of chips on a phone. */}
        <div className={wide ? "overflow-y-auto shrink-0" : "overflow-x-auto shrink-0 flex gap-1.5 px-3 py-2"}
          style={wide ? { width: 220, background: T.card, borderRight: `1px solid ${T.hair}`, padding: "6px 6px 12px" } : { background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          {listed.map((g, gi) => wide ? (
            <div key={g.label} style={{ marginBottom: 8 }}>
              <div style={{ ...eyebrow, padding: "4px 8px" }}>{g.label}</div>
              {g.items.map(pick)}
            </div>
          ) : (
            <React.Fragment key={g.label}>
              {/* On a phone the chips run on in one row; a small label says where a group starts. */}
              {gi > 0 && <span style={{ ...eyebrow, alignSelf: "center", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 4 }}>{g.label}</span>}
              {g.items.map(pick)}
            </React.Fragment>
          ))}
          {!order.length && <div style={{ fontSize: F.sm, color: T.ink3, padding: 8 }}>No sheets have been read on this job yet — put the plan set in Takeoffs.</div>}
        </div>
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}
            className="flex-1 overflow-auto p-2" style={{ minHeight: 0, cursor: zoom > 1 ? "grab" : "default", touchAction: "pan-x pan-y" }}>
            {fail ? <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open this sheet: {fail}</div>
              : !file?.url ? <div style={{ fontSize: F.sm, color: T.ink3 }}>This sheet&apos;s file isn&apos;t available.</div>
              : (
                <div style={{ position: "relative", width: "fit-content", margin: "0 auto" }}>
                  <canvas ref={canvas} style={{ display: "block", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)", opacity: busy ? 0.6 : 1 }} />
                  {marks && k > 0 && dims && dims.w > 0 && shapes.length > 0 && (() => {
                    const sw = Math.max(dims.w, dims.h) / 900;
                    const path = (pts: number[][], close: boolean) => pts.map((p, n) => `${n ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (close ? " Z" : "");
                    return (
                      <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" aria-hidden="true"
                        style={{ position: "absolute", left: 0, top: 0, width: dims.w * k, height: dims.h * k, pointerEvents: "none" }}>
                        {shapes.map((x) => x.kind === "count"
                          ? <g key={x.id}>{x.geometry.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r={sw * 5} fill={x.color} stroke="#fff" strokeWidth={sw} />)}</g>
                          : x.kind === "linear"
                            ? <path key={x.id} d={path(x.geometry, false)} fill="none" stroke={x.color} strokeWidth={sw * 2.5} strokeLinejoin="round" strokeLinecap="round" />
                            : <path key={x.id} d={path(x.geometry, true) + x.cutouts.map((c) => " " + path(c, true)).join("")} fillRule="evenodd" fill={x.color} fillOpacity={0.28} stroke={x.color} strokeWidth={sw * 1.6} />)}
                      </svg>
                    );
                  })()}
                  {!busy && k > 0 && hits?.map((h, n) => (
                    <div key={n} aria-hidden="true" style={{ position: "absolute", left: h.x * k, top: h.y * k, width: h.w * k, height: h.h * k, pointerEvents: "none",
                      border: `2px solid ${T.hiviz}`, background: "rgba(255,170,0,.18)", borderRadius: 3, boxShadow: n === at ? `0 0 0 4px rgba(255,170,0,.35)` : "none" }} />
                  ))}
                </div>
              )}
          </div>
          {s && find && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5" style={{ background: T.hivizDim, borderTop: `1px solid ${T.hair}`, fontSize: F.xs }}>
              <span style={{ flex: 1, minWidth: 0, color: T.ink2, lineHeight: 1.35 }}>
                <b style={{ color: T.ink }}>{hits === null ? "Looking for the line on this sheet…" : hits.length ? `Boxed in ${hits.length} place${hits.length === 1 ? "" : "s"}` : "Not in this sheet's text"}</b>
                {" "}— “{find}”{hits && !hits.length ? " (it may be drawn, scanned or on another sheet)" : ""}
              </span>
              {hits && hits.length > 0 && (
                <button onClick={() => goTo((at + 1) % hits.length)} style={{ ...btn, height: 26, fontSize: 12, whiteSpace: "nowrap" }}>
                  {at < 0 ? "Zoom to it" : hits.length > 1 ? `Next · ${at + 1} of ${hits.length}` : "Zoom to it"}
                </button>
              )}
            </div>
          )}
          {s && (
            <div className="shrink-0 flex items-center gap-2 px-3" style={{ height: 40, background: T.card, borderTop: `1px solid ${T.hair}` }}>
              <span style={{ fontSize: F.xs, color: T.ink3, ...clip, flex: 1, minWidth: 0 }}>
                {s.scale_ft_per_pt ? "Scale set — measure it in Takeoffs" : s.scale_text ? `Prints ${s.scale_text} — set it in Takeoffs to measure` : "No scale set yet"}
              </span>
              <Link href={`/dashboard/scope/${jobId}/plans?sheet=${s.id}`} style={{ ...eyebrow, color: T.chalk }}>Measure in Takeoffs ›</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
