"use client";
/**
 * Plan Room steps 1 and 2 (design/plan-room): the job's files with In plan
 * room, and the sheets read from them.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, strong, light } from "@/lib/v34/tokens";
import { drawPage, openPdf, pageThumb } from "@/lib/pdf";
import { scaleLabel } from "@/lib/takeoff";
import { CONCRETE_DISC, DISC_COLOR, DISC_LABEL, isPlanFile, sheetLabel, type PlanFile, type Sheet } from "./shared";

const READ: Record<string, string> = { waiting: "Waiting for Dusty", reading: "Dusty is reading", read: "Read", failed: "Couldn't read", skipped: "Not read" };

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? T.green : T.hairStrong, position: "relative", cursor: "pointer", flex: "0 0 auto" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

export function FilesStep({ files, sheets, reading, onToggle, onAdd, uploading }: {
  files: PlanFile[]; sheets: Sheet[]; reading: Record<string, string>;
  onToggle: (f: PlanFile, on: boolean) => void; onAdd: (list: FileList) => void; uploading: string | null;
}) {
  const [over, setOver] = useState(false);
  const list = files.filter(isPlanFile);
  const others = files.length - list.length;
  return (
    <div className="p-3 lg:p-5" style={{ maxWidth: 1100 }}>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files); }}
        className="flex flex-col items-center justify-center text-center rounded-md"
        style={{ minHeight: 120, border: `2px dashed ${over ? T.hiviz : T.hairStrong}`, background: over ? T.hivizDim : T.card, cursor: "pointer", padding: 12 }}>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf" className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }} />
        <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600 }}>{uploading ?? "Drop plan sets, sketches or photos"}</div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>PDF, JPG or PNG · or tap to choose</div>
      </label>

      <div className="mt-4 flex items-baseline gap-2">
        <div style={{ fontFamily: light, fontWeight: 300, fontSize: 20 }}>Already on this job</div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>{list.length} plan file{list.length === 1 ? "" : "s"}{others ? ` · ${others} other file${others === 1 ? "" : "s"} not shown` : ""}</div>
      </div>
      {!list.length && <div className="mt-2" style={{ fontSize: F.sm, color: T.ink3 }}>No PDFs or images on this job yet. Drop the plan set above.</div>}
      <div className="mt-2 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
        {list.map((f) => {
          const on = f.in_plan_room === true;
          const n = sheets.filter((s) => s.file_id === f.id).length;
          const scaled = sheets.filter((s) => s.file_id === f.id && s.scale_ft_per_pt).length;
          return (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: on ? 1 : 0.6 }}>
              <div className="shrink-0 rounded flex items-center justify-center" style={{ width: 36, height: 44, background: T.sunk, border: `1px solid ${T.hair}`, fontFamily: disp, fontSize: 10, color: T.ink3 }}>
                {f.kind === "pdf" ? "PDF" : "IMG"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{f.name}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                  {f.source === "email" ? "Email" : "Uploaded"} · {reading[f.id] ?? (f.kind === "pdf" ? (n ? `${n} sheet${n === 1 ? "" : "s"}${n ? ` · ${scaled} scaled` : ""}` : on ? "not opened yet" : "") : "photo or sketch — no scale")}
                  {f.read_state ? ` · ${READ[f.read_state] ?? f.read_state}` : ""}
                </div>
              </div>
              <span className="hidden sm:inline" style={{ ...eyebrow, color: T.ink3 }}>In plan room</span>
              <Switch on={on} onChange={(v) => onToggle(f, v)} label={`${f.name} in the plan room`} />
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[
          ["Scale, checked by you", "Each sheet's printed scale is read off its title block. You apply it with one tap, or measure a known dimension — nothing is counted on a sheet until you have."],
          ["Groups you define", "Slab on grade, curb & gutter, piers… Area, linear or count. Every shape stays its own row, and the group adds them up."],
          ["Straight to budget", "Send a group to a card from the Price book. The budget line counts the group — re-measure on the plan and it moves."],
        ].map(([h, d], i) => (
          <div key={h} className="rounded p-3" style={{ background: i === 2 ? T.dustyTint : T.card, border: `1px solid ${T.hair}` }}>
            <div style={{ fontFamily: disp, fontWeight: 600, fontSize: F.md }}>{h}</div>
            <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45, marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScaleBadge({ s, small }: { s: Sheet; small?: boolean }) {
  const st: React.CSSProperties = { fontFamily: disp, fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: ".04em", borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap" };
  if (s.scale_ft_per_pt) return <span style={{ ...st, background: T.greenDim, color: T.green }}>✓ {scaleLabel(s.scale_ft_per_pt)}{s.scale_method === "manual" ? " measured" : ""}</span>;
  if (s.scale_method === "none") return <span style={{ ...st, background: T.sunk, color: T.ink3 }}>not to scale</span>;
  if (s.printed_ft_per_pt) return <span style={{ ...st, background: T.sunDim, color: T.sun }} title={`Prints ${s.scale_text} — read off the title block. Apply it or measure a known dimension.`}>{small ? `check ${s.scale_text}` : `prints ${s.scale_text} — check it`}</span>;
  return <span style={{ ...st, background: T.sunk, color: T.ink3 }}>{s.scale_text ? `prints ${s.scale_text}` : "no scale found"}</span>;
}

function Thumb({ fileId, url, page }: { fileId: string; url: string | null; page: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let off = false;
    pageThumb(fileId, url, page).then((d) => { if (!off) setSrc(d); }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [fileId, url, page]);
  return (
    <div style={{ height: 104, background: T.sunk, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left" }} />
        : <span title={fail ?? undefined} style={{ fontSize: F.xs, color: T.ink3 }}>{fail ? "couldn't draw" : "…"}</span>}
    </div>
  );
}

/**
 * A page that isn't a drawing, read like any PDF reader: fit to width, zoom, previous / next.
 * Nothing is measured here.
 */
export function PageReader({ pages, files, start, onClose }: { pages: Sheet[]; files: PlanFile[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [fail, setFail] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const s = pages[i];
  const url = files.find((f) => f.id === s?.file_id)?.url ?? null;
  useEffect(() => {
    if (!s || !url || !canvas.current || !box.current) return;
    let off = false;
    let job: { cancel: () => void } | null = null;
    setFail(null);
    openPdf(s.file_id, url).then((doc) => {
      if (off || !canvas.current || !box.current) return;
      const fit = Math.max(200, box.current.clientWidth - 24) / Math.max(1, s.page_w);
      job = drawPage(doc, s.page, canvas.current, fit * zoom);
    }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; job?.cancel(); };
  }, [s, url, zoom]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(pages.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pages.length, onClose]);
  if (!s) return null;
  const btn: React.CSSProperties = { height: 32, minWidth: 32, padding: "0 10px", borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, fontFamily: disp, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <div role="dialog" aria-label="Read pages" className="fixed inset-0 flex flex-col" style={{ zIndex: 70, background: T.sunk }}>
      <div className="flex items-center gap-2 px-3" style={{ height: 48, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <button onClick={onClose} style={btn} aria-label="Close">✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{files.find((f) => f.id === s.file_id)?.name ?? "Page"} · p.{s.page}</div>
          <div style={{ fontSize: 10.5, color: T.ink3 }}>{i + 1} of {pages.length} pages to read · not a drawing, so nothing is measured here</div>
        </div>
        <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} style={btn} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} style={btn} aria-label="Zoom in">+</button>
        <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} style={{ ...btn, opacity: i === 0 ? 0.4 : 1 }} aria-label="Previous page">‹</button>
        <button onClick={() => setI((n) => Math.min(pages.length - 1, n + 1))} disabled={i === pages.length - 1} style={{ ...btn, opacity: i === pages.length - 1 ? 0.4 : 1 }} aria-label="Next page">›</button>
      </div>
      <div ref={box} className="flex-1 overflow-auto p-3" style={{ minHeight: 0 }}>
        {fail ? <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open this page: {fail}</div>
          : <canvas ref={canvas} style={{ display: "block", margin: "0 auto", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} />}
      </div>
    </div>
  );
}

export function SheetsStep({ sheets, docPages = [], files, onOpen }: { sheets: Sheet[]; docPages?: Sheet[]; files: PlanFile[]; onOpen: (s: Sheet) => void }) {
  const [disc, setDisc] = useState<string>(sheets.length ? "concrete" : "pages");
  const [reading, setReading] = useState<number | null>(null);
  const url = useMemo(() => new Map(files.map((f) => [f.id, f.url])), [files]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sheets) { const d = s.discipline ?? "other"; c[d] = (c[d] ?? 0) + 1; }
    return c;
  }, [sheets]);
  const concrete = sheets.filter((s) => CONCRETE_DISC.has(s.discipline ?? ""));
  const filters = [["concrete", "Concrete scope", concrete.length], ["all", "All drawings", sheets.length],
    ...Object.keys(counts).sort().map((d) => [d, DISC_LABEL[d] ?? d, counts[d]] as const),
    ...(docPages.length ? [["pages", "Pages to read", docPages.length] as const] : [])] as Array<readonly [string, string, number]>;
  const isPages = disc === "pages";
  const shown = isPages ? docPages : disc === "all" ? sheets : disc === "concrete" ? (concrete.length ? concrete : sheets) : sheets.filter((s) => (s.discipline ?? "other") === disc);
  if (!sheets.length && !docPages.length) return <div className="p-5" style={{ fontSize: F.sm, color: T.ink3 }}>No sheets yet. Put a PDF in the plan room on the Files step and its pages are read here.</div>;
  return (
    <div className="lg:flex" style={{ minHeight: 0 }}>
      <div className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto lg:overflow-visible" style={{ flex: "0 0 auto", width: undefined, minWidth: 0 }}>
        {filters.map(([k, label, n]) => (
          <button key={k} onClick={() => setDisc(k)} className="flex items-center gap-2 rounded px-2 text-left shrink-0"
            style={{ height: 30, background: disc === k ? T.hivizDim : "transparent", fontSize: F.sm, cursor: "pointer", minWidth: 150 }}>
            <span style={{ width: 9, height: 9, borderRadius: k === "pages" ? 0 : 2, background: k === "concrete" ? T.hiviz : k === "all" ? T.ink3 : k === "pages" ? T.hairStrong : DISC_COLOR[k] ?? T.ink3 }} />
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontFamily: strong, fontSize: 10.5, color: T.ink3 }}>{n}</span>
          </button>
        ))}
        {disc === "concrete" && !concrete.length && <div className="hidden lg:block px-2" style={{ fontSize: F.xs, color: T.ink3, maxWidth: 170 }}>No civil or structural sheets found — showing all.</div>}
      </div>
      <div className="flex-1 p-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", alignContent: "start" }}>
        {isPages && <div style={{ gridColumn: "1 / -1", fontSize: F.xs, color: T.ink3 }}>Letter- and legal-size pages in the plan file — specs, notes, forms. Tap one to read it; drawings are the measured sheets.</div>}
        {shown.map((s, idx) => (
          <button key={s.id} onClick={() => (isPages ? setReading(idx) : onOpen(s))} className="text-left rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}`, cursor: "pointer" }}>
            <div style={{ position: "relative" }}>
              <Thumb fileId={s.file_id} url={url.get(s.file_id) ?? null} page={s.page} />
              {CONCRETE_DISC.has(s.discipline ?? "") && <span style={{ position: "absolute", top: 5, left: 5, ...eyebrow, fontSize: 9, background: T.hiviz, color: T.onHiviz, borderRadius: 2, padding: "1px 4px" }}>Concrete</span>}
              {!isPages && <span style={{ position: "absolute", bottom: 5, right: 5 }}><ScaleBadge s={s} small /></span>}
            </div>
            <div className="px-2 py-1.5">
              <div className="flex items-baseline gap-1.5">
                <span style={{ fontFamily: strong, fontWeight: 600, fontSize: 13 }}>{sheetLabel(s)}</span>
                <span style={{ fontSize: 10.5, color: T.ink3 }}>p.{s.page}</span>
              </div>
              <div style={{ fontSize: F.xs, color: T.ink2, ...clip }}>{s.title ?? "No title read"}</div>
            </div>
          </button>
        ))}
      </div>
      {reading !== null && <PageReader pages={docPages} files={files} start={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
