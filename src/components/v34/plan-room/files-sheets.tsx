"use client";
/**
 * The Plan Room's Files step (design/plan-room; Files and Sheets made one
 * place 2026-10-05 — Coy: "where planset pdf, photos, images and any other
 * file can live. We can call it 'files'"). A folder column on the left —
 * the job's files, its photos, then its sheets by discipline and the pages
 * to read — and what that folder holds on the right.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, strong } from "@/lib/v34/tokens";
import { drawPage, openPdf, pageThumb } from "@/lib/pdf";
import { scaleLabel } from "@/lib/takeoff";
import { CONCRETE_DISC, DISC_COLOR, DISC_LABEL, isPlanFile, sheetLabel, type PlanFile, type Sheet } from "./shared";
import { TextedPhotos } from "./texted-photos";

const READ: Record<string, string> = { waiting: "Waiting for Dusty", reading: "Dusty is reading", read: "Read", failed: "Couldn't read", skipped: "Not read" };

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? T.green : T.hairStrong, position: "relative", cursor: "pointer", flex: "0 0 auto" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

/** Every file on the job: plan sets with In plan room, photos, anything else. */
function FileList({ files, sheets, reading, onToggle, onAdd, uploading }: {
  files: PlanFile[]; sheets: Sheet[]; reading: Record<string, string>;
  onToggle: (f: PlanFile, on: boolean) => void; onAdd: (list: FileList) => void; uploading: string | null;
}) {
  const [over, setOver] = useState(false);
  const list = [...files].sort((a, b) => Number(isPlanFile(b)) - Number(isPlanFile(a)) || b.created_at.localeCompare(a.created_at));
  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files); }}
        className="flex items-center justify-center gap-2 text-center rounded-md"
        style={{ minHeight: 56, border: `2px dashed ${over ? T.hiviz : T.hairStrong}`, background: over ? T.hivizDim : T.card, cursor: "pointer", padding: 10 }}>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf" className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }} />
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>{uploading ?? "Drop plan sets, sketches or photos"}</span>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>PDF, JPG or PNG · or tap to choose</span>
      </label>
      {!list.length && <div className="mt-3" style={{ fontSize: F.sm, color: T.ink3 }}>No files on this job yet. Drop the plan set above.</div>}
      {list.length > 0 && (
        <div className="mt-3 rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
          {list.map((f, i) => {
            const plan = isPlanFile(f);
            const on = f.in_plan_room === true;
            const n = sheets.filter((s) => s.file_id === f.id).length;
            const scaled = sheets.filter((s) => s.file_id === f.id && s.scale_ft_per_pt).length;
            return (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : undefined, opacity: !plan || on ? 1 : 0.6 }}>
                <div className="shrink-0 rounded flex items-center justify-center overflow-hidden" style={{ width: 36, height: 44, background: T.sunk, border: `1px solid ${T.hair}`, fontFamily: disp, fontSize: 10, color: T.ink3 }}>
                  {f.kind === "image" && f.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : f.kind === "pdf" ? "PDF" : (f.name.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{f.name}</div>
                  <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>
                    {f.source === "email" ? "Email" : f.source === "text" ? "Texted" : "Uploaded"} · {reading[f.id] ?? (f.kind === "pdf" ? (n ? `${n} sheet${n === 1 ? "" : "s"} · ${scaled} scaled` : on ? "not opened yet" : "not in Takeoffs") : f.kind === "image" ? "photo or sketch — no scale" : "kept with the job — not a drawing")}
                    {f.read_state ? ` · ${READ[f.read_state] ?? f.read_state}` : ""}
                  </div>
                </div>
                {plan && <>
                  <span className="hidden sm:inline" style={{ ...eyebrow, color: T.ink3 }}>In Takeoffs</span>
                  <Switch on={on} onChange={(v) => onToggle(f, v)} label={`${f.name} in Takeoffs`} />
                </>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The job's photos, newest first. */
function PhotoGrid({ files, jobId, onAdded }: { files: PlanFile[]; jobId?: string; onAdded?: () => void | Promise<void> }) {
  const photos = files.filter((f) => f.kind === "image").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const texted = jobId ? <TextedPhotos jobId={jobId} onAdded={onAdded ?? (() => {})} /> : null;
  if (!photos.length) return <>{texted}<div style={{ fontSize: F.sm, color: T.ink3 }}>No photos on this job yet. Drop them in All files, or bring in the ones the customer texted above.</div></>;
  return (
    <>
    {texted}
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {photos.map((f) => (
        <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="rounded overflow-hidden block" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.url ? <img src={f.url} alt={f.name} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} /> : <div style={{ height: 120, background: T.sunk }} />}
          <div className="px-2 py-1" style={{ fontSize: F.xs, color: T.ink2, ...clip }}>{f.name}</div>
        </a>
      ))}
    </div>
    </>
  );
}

export function FilesStep({ files, sheets, docPages = [], reading, onToggle, onAdd, uploading, onOpen, initial, jobId, onAdded }: {
  files: PlanFile[]; sheets: Sheet[]; docPages?: Sheet[]; reading: Record<string, string>;
  onToggle: (f: PlanFile, on: boolean) => void; onAdd: (list: FileList) => void; uploading: string | null;
  onOpen: (s: Sheet) => void; initial?: "files" | "sheets"; jobId?: string; onAdded?: () => void | Promise<void>;
}) {
  const [view, setView] = useState<string>(initial === "sheets" && (sheets.length || docPages.length) ? (sheets.length ? "concrete" : "pages") : "files");
  const [pageAt, setPageAt] = useState<number | null>(null);
  // A drawing opens large first, to read before measuring (Coy, 2026-10-08: "view the files
  // large so that I can inspect and read whats on the sheets before I do the measurements");
  // Measure › on it opens Takeoff on that sheet.
  const [drawAt, setDrawAt] = useState<{ list: Sheet[]; i: number } | null>(null);
  const url = useMemo(() => new Map(files.map((f) => [f.id, f.url])), [files]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sheets) { const d = s.discipline ?? "other"; c[d] = (c[d] ?? 0) + 1; }
    return c;
  }, [sheets]);
  const concrete = sheets.filter((s) => CONCRETE_DISC.has(s.discipline ?? ""));
  const photos = files.filter((f) => f.kind === "image").length;
  const folders: Array<{ head?: string; k: string; label: string; n: number; dot: string; square?: boolean }> = [
    { head: "Files", k: "files", label: "All files", n: files.length, dot: T.ink3, square: true },
    { k: "photos", label: "Photos", n: photos, dot: T.chalk, square: true },
    ...(sheets.length || docPages.length ? [
      { head: "Sheets", k: "concrete", label: "Concrete scope", n: concrete.length, dot: T.hiviz },
      { k: "all", label: "All drawings", n: sheets.length, dot: T.ink3 },
      ...Object.keys(counts).sort().map((d) => ({ k: d, label: DISC_LABEL[d] ?? d, n: counts[d], dot: DISC_COLOR[d] ?? T.ink3 })),
      ...(docPages.length ? [{ k: "pages", label: "Pages to read", n: docPages.length, dot: T.hairStrong, square: true }] : []),
    ] : []),
  ];
  const isSheets = !["files", "photos"].includes(view);
  const isPages = view === "pages";
  const shown = isPages ? docPages : view === "all" ? sheets : view === "concrete" ? (concrete.length ? concrete : sheets) : sheets.filter((s) => (s.discipline ?? "other") === view);
  return (
    <div className="lg:flex" style={{ minHeight: 0 }}>
      <nav aria-label="Folders" className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto lg:overflow-visible" style={{ flex: "0 0 auto", minWidth: 0, borderRight: `1px solid ${T.hairSoft}` }}>
        {folders.map((f) => (
          <React.Fragment key={f.k}>
            {f.head && <div className="hidden lg:block px-2 pt-2 pb-1" style={{ ...eyebrow, color: T.ink3 }}>{f.head}</div>}
            <button onClick={() => setView(f.k)} className="flex items-center gap-2 rounded px-2 text-left shrink-0"
              style={{ height: 30, background: view === f.k ? T.hivizDim : "transparent", fontSize: F.sm, cursor: "pointer", minWidth: 160 }}>
              <span style={{ width: 9, height: 9, borderRadius: f.square ? 0 : 2, background: f.dot }} />
              <span style={{ flex: 1 }}>{f.label}</span>
              <span style={{ fontFamily: strong, fontSize: 10.5, color: T.ink3 }}>{f.n}</span>
            </button>
          </React.Fragment>
        ))}
        {view === "concrete" && !concrete.length && <div className="hidden lg:block px-2" style={{ fontSize: F.xs, color: T.ink3, maxWidth: 170 }}>No civil or structural sheets found — showing all.</div>}
      </nav>
      <div className="flex-1 p-3 lg:p-4" style={{ minWidth: 0 }}>
        {view === "files" && <FileList files={files} sheets={sheets} reading={reading} onToggle={onToggle} onAdd={onAdd} uploading={uploading} />}
        {view === "photos" && <PhotoGrid files={files} jobId={jobId} onAdded={onAdded} />}
        {isSheets && (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", alignContent: "start" }}>
            {isPages && <div style={{ gridColumn: "1 / -1", fontSize: F.xs, color: T.ink3 }}>Letter- and legal-size pages in the plan file — specs, notes, forms. Tap one to read it; drawings are the measured sheets.</div>}
            {shown.map((s, idx) => (
              <button key={s.id} onClick={() => (isPages ? setPageAt(idx) : setDrawAt({ list: shown, i: idx }))} className="text-left rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}`, cursor: "pointer" }}>
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
        )}
      </div>
      {pageAt !== null && <PageReader pages={docPages} files={files} start={pageAt} onClose={() => setPageAt(null)} />}
      {drawAt && <PageReader pages={drawAt.list} files={files} start={drawAt.i} onClose={() => setDrawAt(null)}
        onMeasure={(s) => { setDrawAt(null); onOpen(s); }} />}
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

export function Thumb({ fileId, url, page, height = 104 }: { fileId: string; url: string | null; page: number; height?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  // Drawn only once it scrolls near the screen: a set of 150 scanned sheets drawn all at
  // once ran the tab out of memory (2026-10-07).
  const el = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  // Not on a phone at all. pdf.js decodes a scanned sheet's whole ~67 MP picture to draw even
  // a thumbnail — ~300 MB for a moment each, measured — and a phone paging through the sheet
  // list still crashed (Coy, 2026-10-07). The number and title say which sheet it is.
  const [phone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  useEffect(() => {
    if (phone || seen || !el.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true); }, { rootMargin: "300px" });
    io.observe(el.current);
    return () => io.disconnect();
  }, [seen, phone]);
  useEffect(() => {
    if (phone || !url || !seen) return;
    let off = false;
    pageThumb(fileId, url, page).then((d) => { if (!off) setSrc(d); }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [fileId, url, page, seen, phone]);
  return (
    <div ref={el} style={{ height, background: T.sunk, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left" }} />
        : <span title={fail ?? undefined} style={{ fontSize: F.xs, color: T.ink3 }}>{fail ? "couldn't draw" : phone ? `p.${page}` : "…"}</span>}
    </div>
  );
}

/**
 * A page read like any PDF reader: fit to width, zoom, drag to look around, previous / next.
 * Nothing is measured here. For a drawing (`onMeasure`) the bar has Measure ›, which opens
 * Takeoff on the sheet shown — a page that isn't a drawing has none.
 */
export function PageReader({ pages, files, start, onClose, onMeasure }: { pages: Sheet[]; files: PlanFile[]; start: number; onClose: () => void; onMeasure?: (s: Sheet) => void }) {
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
          {onMeasure ? <>
            <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{sheetLabel(s)}{s.title ? ` · ${s.title}` : ""}</div>
            <div style={{ fontSize: 10.5, color: T.ink3, ...clip }}>{i + 1} of {pages.length} sheets · {files.find((f) => f.id === s.file_id)?.name ?? "Plans"} p.{s.page} · drag to look around</div>
          </> : <>
            <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{files.find((f) => f.id === s.file_id)?.name ?? "Page"} · p.{s.page}</div>
            <div style={{ fontSize: 10.5, color: T.ink3 }}>{i + 1} of {pages.length} pages to read · not a drawing, so nothing is measured here</div>
          </>}
        </div>
        <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} style={btn} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom((z) => Math.min(onMeasure ? 6 : 4, z * 1.25))} style={btn} aria-label="Zoom in">+</button>
        <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} style={{ ...btn, opacity: i === 0 ? 0.4 : 1 }} aria-label="Previous page">‹</button>
        <button onClick={() => setI((n) => Math.min(pages.length - 1, n + 1))} disabled={i === pages.length - 1} style={{ ...btn, opacity: i === pages.length - 1 ? 0.4 : 1 }} aria-label="Next page">›</button>
        {onMeasure && <button onClick={() => onMeasure(s)} style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: `1px solid ${T.hiviz}`, letterSpacing: ".06em", textTransform: "uppercase" }}>Measure ›</button>}
      </div>
      <div ref={box} className="flex-1 overflow-auto p-3" style={{ minHeight: 0, cursor: zoom > 1 ? "grab" : undefined }}
        onPointerDown={(e) => {
          // Drag to pan with a mouse; a finger already scrolls the box.
          if (e.pointerType !== "mouse" || !box.current) return;
          const b = box.current, x0 = e.clientX, y0 = e.clientY, l0 = b.scrollLeft, t0 = b.scrollTop;
          const mv = (ev: PointerEvent) => { b.scrollLeft = l0 - (ev.clientX - x0); b.scrollTop = t0 - (ev.clientY - y0); };
          const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
        }}>
        {fail ? <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open this page: {fail}</div>
          : <canvas ref={canvas} style={{ display: "block", margin: "0 auto", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} />}
      </div>
    </div>
  );
}
