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
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp, clip, eyebrow } from "@/lib/v34/tokens";
import { openPdf, drawPage } from "@/lib/pdf";
import type { PlanFile, Sheet } from "@/components/v34/plan-room/shared";
import { useWide } from "@/lib/v34/use-wide";

export interface SheetGroup { label: string; ids: string[] }

export function SheetViewer({ jobId, title, sheets, files, groups, start, onClose }: {
  jobId: string; title: string; sheets: Sheet[]; files: PlanFile[];
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
  const setId = (n: string) => { setIdState(n); setZoom(1); };
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!s || !file?.url || !canvas.current || !box.current) return;
    let off = false;
    let job: { cancel: () => void; done: Promise<void> } | null = null;
    setFail(null); setBusy(true);
    openPdf(s.file_id, file.url).then(async (doc) => {
      // Fit the page's real width (rotation applied), not the stored reading of it.
      const w = (await doc.getPage(s.page)).getViewport({ scale: 1 }).width;
      if (off || !canvas.current || !box.current) return;
      const fit = Math.max(200, box.current.clientWidth - 16) / Math.max(1, w);
      job = drawPage(doc, s.page, canvas.current, fit * zoom);
      return job.done;
    }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; job?.cancel(); };
  }, [s, file?.url, zoom]);

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
              : <canvas ref={canvas} style={{ display: "block", margin: "0 auto", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)", opacity: busy ? 0.6 : 1 }} />}
          </div>
          {s && (
            <div className="shrink-0 flex items-center gap-2 px-3" style={{ height: 40, background: T.card, borderTop: `1px solid ${T.hair}` }}>
              <span style={{ fontSize: F.xs, color: T.ink3, ...clip, flex: 1, minWidth: 0 }}>
                {s.scale_ft_per_pt ? "Scale set — measure it in Takeoffs" : s.scale_text ? `Prints ${s.scale_text} — set it in Takeoffs to measure` : "No scale set yet"}
              </span>
              <Link href={`/dashboard/scope/${jobId}/plans?step=takeoff&sheet=${s.id}`} style={{ ...eyebrow, color: T.chalk }}>Measure in Takeoffs ›</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
