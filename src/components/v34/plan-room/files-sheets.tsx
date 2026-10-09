"use client";
/**
 * The Plan Room's Files step (design/plan-room; Files and Sheets made one
 * place 2026-10-05 — Coy: "where planset pdf, photos, images and any other
 * file can live. We can call it 'files'"). A folder column on the left —
 * the job's files, its photos, then its sheets by discipline and the pages
 * to read — and what that folder holds on the right.
 */
import { ClipBar } from "./clip-detail";
import type { DetailBox } from "@/lib/plan-details";
import { usePinchZoom } from "@/lib/v34/use-pinch";
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

type Look = "list" | "large";

/** List or large icons (Coy, 2026-10-09), kept on the device. */
function useLook(): [Look, (l: Look) => void] {
  const [look, setLookState] = useState<Look>("list");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mount
    try { if (localStorage.getItem("sc:takeoff-files-look") === "large") setLookState("large"); } catch { /* storage off */ }
  }, []);
  const setLook = (l: Look) => { setLookState(l); try { localStorage.setItem("sc:takeoff-files-look", l); } catch { /* storage off */ } };
  return [look, setLook];
}

function LookSwitch({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  const b = (k: Look, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => onChange(k)} aria-pressed={look === k} aria-label={label} title={label}
      className="flex items-center justify-center" style={{ width: 30, height: 26, background: look === k ? T.ink : T.card, color: look === k ? T.card : T.ink2, cursor: "pointer" }}>
      {icon}
    </button>
  );
  return (
    <span className="inline-flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hairStrong}` }}>
      {b("list", "List", <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>)}
      {b("large", "Large icons", <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>)}
    </span>
  );
}

/** A trash icon; asks first, and won't take a plan set that has measurements on it. */
function DeleteFile({ f, measuredSheets, onDelete }: { f: PlanFile; measuredSheets: number; onDelete: (f: PlanFile) => void }) {
  return (
    <button type="button" aria-label={`Delete ${f.name}`} title="Delete"
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (measuredSheets) { window.alert(`${f.name} has measurements on ${measuredSheets} sheet${measuredSheets === 1 ? "" : "s"}. Delete those measurements first, or switch it out of Takeoffs instead.`); return; }
        if (window.confirm(`Delete ${f.name}? It can't be brought back.`)) onDelete(f);
      }}
      className="shrink-0 flex items-center justify-center rounded" style={{ width: 28, height: 28, color: T.ink3, background: "transparent", cursor: "pointer" }}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5.5M11.5 8.5v5.5" /></svg>
    </button>
  );
}

/** A file's small picture: a photo, the first page of a PDF, or its kind. */
function FileFace({ f, height }: { f: PlanFile; height: number }) {
  if (f.kind === "image" && f.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={f.url} alt="" style={{ width: "100%", height, objectFit: "cover", display: "block" }} />;
  }
  if (f.kind === "pdf") return <Thumb fileId={f.id} url={f.url ?? null} page={1} height={height} />;
  return <div style={{ height, background: T.sunk, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 14, color: T.ink3 }}>{(f.name.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase()}</div>;
}

/** Every file on the job: plan sets with In plan room, photos, anything else. */
function FileList({ files, sheets, reading, onToggle, onAdd, uploading, look, onDelete, measured }: {
  files: PlanFile[]; sheets: Sheet[]; reading: Record<string, string>;
  onToggle: (f: PlanFile, on: boolean) => void; onAdd: (list: FileList) => void; uploading: string | null;
  look: Look; onDelete?: (f: PlanFile) => void; measured?: Set<string>;
}) {
  const measuredOn = (f: PlanFile) => sheets.filter((s) => s.file_id === f.id && measured?.has(s.id)).length;
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
      {list.length > 0 && look === "large" && (
        <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {list.map((f) => {
            const plan = isPlanFile(f);
            const on = f.in_plan_room === true;
            const n = sheets.filter((s) => s.file_id === f.id).length;
            return (
              <div key={f.id} className="rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}`, opacity: !plan || on ? 1 : 0.6 }}>
                {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="block"><FileFace f={f} height={130} /></a> : <FileFace f={f} height={130} />}
                <div className="px-2 pt-1.5" style={{ fontSize: F.xs, fontWeight: 600, ...clip }}>{f.name}</div>
                <div className="flex items-center gap-1.5 px-2 pb-1.5">
                  <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: T.ink3, ...clip }}>{reading[f.id] ?? (f.kind === "pdf" ? (n ? `${n} sheet${n === 1 ? "" : "s"}` : on ? "not opened" : "not in Takeoffs") : f.kind === "image" ? "photo" : "file")}</span>
                  {plan && <Switch on={on} onChange={(v) => onToggle(f, v)} label={`${f.name} in Takeoffs`} />}
                  {onDelete && <DeleteFile f={f} measuredSheets={measuredOn(f)} onDelete={onDelete} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {list.length > 0 && look === "list" && (
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
                {onDelete && <DeleteFile f={f} measuredSheets={measuredOn(f)} onDelete={onDelete} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The job's photos, newest first: large pictures, or a list. */
function PhotoGrid({ files, jobId, onAdded, look, onDelete }: { files: PlanFile[]; jobId?: string; onAdded?: () => void | Promise<void>; look: Look; onDelete?: (f: PlanFile) => void }) {
  const photos = files.filter((f) => f.kind === "image").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const texted = jobId ? <TextedPhotos jobId={jobId} onAdded={onAdded ?? (() => {})} /> : null;
  if (!photos.length) return <>{texted}<div style={{ fontSize: F.sm, color: T.ink3 }}>No photos on this job yet. Drop them in All files, or bring in the ones the customer texted above.</div></>;
  if (look === "list") return (
    <>
    {texted}
    <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
      {photos.map((f, i) => (
        <div key={f.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : undefined }}>
          <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="shrink-0 rounded overflow-hidden block" style={{ width: 44, height: 44, background: T.sunk }}><FileFace f={f} height={44} /></a>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{f.name}</div>
            <div style={{ fontSize: F.xs, color: T.ink3 }}>{f.source === "text" ? "Texted" : f.source === "email" ? "Email" : "Uploaded"} · {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}</div>
          </div>
          {onDelete && <DeleteFile f={f} measuredSheets={0} onDelete={onDelete} />}
        </div>
      ))}
    </div>
    </>
  );
  return (
    <>
    {texted}
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {photos.map((f) => (
        <div key={f.id} className="rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="block"><FileFace f={f} height={120} /></a>
          <div className="flex items-center gap-1 pl-2">
            <span style={{ flex: 1, minWidth: 0, fontSize: F.xs, color: T.ink2, ...clip }}>{f.name}</span>
            {onDelete && <DeleteFile f={f} measuredSheets={0} onDelete={onDelete} />}
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

export function FilesStep({ files, sheets, docPages = [], reading, onToggle, onAdd, uploading, onOpen, initial, jobId, onAdded, onDelete, measured }: {
  files: PlanFile[]; sheets: Sheet[]; docPages?: Sheet[]; reading: Record<string, string>;
  onToggle: (f: PlanFile, on: boolean) => void; onAdd: (list: FileList) => void; uploading: string | null;
  onOpen: (s: Sheet) => void; initial?: "files" | "sheets"; jobId?: string; onAdded?: () => void | Promise<void>;
  onDelete?: (f: PlanFile) => void; measured?: Set<string>;
}) {
  const [look, setLook] = useLook();
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
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>{folders.find((f) => f.k === view)?.label ?? ""}</span>
          <LookSwitch look={look} onChange={setLook} />
        </div>
        {view === "files" && <FileList files={files} sheets={sheets} reading={reading} onToggle={onToggle} onAdd={onAdd} uploading={uploading} look={look} onDelete={onDelete} measured={measured} />}
        {view === "photos" && <PhotoGrid files={files} jobId={jobId} onAdded={onAdded} look={look} onDelete={onDelete} />}
        {isSheets && look === "list" && (
          <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
            {isPages && <div className="px-3 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Letter- and legal-size pages in the plan file — specs, notes, forms. Tap one to read it.</div>}
            {shown.map((s, idx) => (
              <button key={s.id} onClick={() => (isPages ? setPageAt(idx) : setDrawAt({ list: shown, i: idx }))} className="w-full text-left flex items-center gap-3 px-3 py-2"
                style={{ borderTop: idx || isPages ? `1px solid ${T.hairSoft}` : undefined, cursor: "pointer", background: "transparent" }}>
                <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 2, background: DISC_COLOR[s.discipline ?? ""] ?? T.ink3 }} />
                <span className="shrink-0" style={{ fontFamily: strong, fontWeight: 600, fontSize: 13, minWidth: 44 }}>{sheetLabel(s)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: F.xs, color: T.ink2, ...clip }}>{s.title ?? "No title read"} <span style={{ color: T.ink3 }}>· p.{s.page}</span></span>
                {!isPages && <ScaleBadge s={s} small />}
              </button>
            ))}
          </div>
        )}
        {isSheets && look === "large" && (
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
      {drawAt && <PageReader pages={drawAt.list} files={files} start={drawAt.i} onClose={() => setDrawAt(null)} jobId={jobId}
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
export function PageReader({ pages, files, start, onClose, onMeasure, jobId }: { pages: Sheet[]; files: PlanFile[]; start: number; onClose: () => void; onMeasure?: (s: Sheet) => void;
  /** With the job, a drawing can be clipped onto a budget section (Clip detail, clip-detail.tsx). */
  jobId?: string }) {
  const [i, setI] = useState(start);
  // Clip detail (Coy, 2026-10-09): drag a box round a section cut, then file it on a section.
  const [clipping, setClipping] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [box, setBox] = useState<DetailBox | null>(null);
  const [clipMsg, setClipMsg] = useState<string | null>(null);
  const canClip = !!onMeasure && !!jobId;
  // Another sheet: a box drawn on this one doesn't carry over.
  const go = (f: (n: number) => number) => { setBox(null); setDrag(null); setI(f); };
  const [zoom, setZoom] = useState(1);
  const [fail, setFail] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const s = pages[i];
  const url = files.find((f) => f.id === s?.file_id)?.url ?? null;
  useEffect(() => {
    if (!s || !url || !canvas.current || !scroller.current) return;
    let off = false;
    let job: { cancel: () => void } | null = null;
    setFail(null);
    // The page takes its new size at once (a pinch stays smooth) and is drawn sharp once the zoom settles.
    const fit = Math.max(200, scroller.current.clientWidth - 24) / Math.max(1, s.page_w);
    canvas.current.style.width = `${Math.floor(s.page_w * fit * zoom)}px`;
    canvas.current.style.height = `${Math.floor(s.page_h * fit * zoom)}px`;
    const t = window.setTimeout(() => {
      openPdf(s.file_id, url).then((doc) => {
        if (off || !canvas.current || !scroller.current) return;
        job = drawPage(doc, s.page, canvas.current, fit * zoom);
      }).catch((e) => { if (!off) setFail(e instanceof Error ? e.message : String(e)); });
    }, 150);
    return () => { off = true; window.clearTimeout(t); job?.cancel(); };
  }, [s, url, zoom]);
  // Two fingers zoom on a phone (Coy, 2026-10-09).
  usePinchZoom(scroller, zoom, setZoom, 0.5, onMeasure ? 6 : 4);
  // A point on the canvas (CSS px) → page points.
  const toPt = (clientX: number, clientY: number) => {
    const c = canvas.current;
    if (!c || !s) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const k = s.page_w / Math.max(1, r.width);
    return { x: Math.min(s.page_w, Math.max(0, (clientX - r.left) * k)), y: Math.min(s.page_h, Math.max(0, (clientY - r.top) * k)) };
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (clipping) { setClipping(false); setBox(null); setDrag(null); } else onClose(); return; }
      if (e.key === "ArrowRight") go((n) => Math.min(pages.length - 1, n + 1));
      if (e.key === "ArrowLeft") go((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pages.length, onClose, clipping]);
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
        <button onClick={() => go((n) => Math.max(0, n - 1))} disabled={i === 0} style={{ ...btn, opacity: i === 0 ? 0.4 : 1 }} aria-label="Previous page">‹</button>
        <button onClick={() => go((n) => Math.min(pages.length - 1, n + 1))} disabled={i === pages.length - 1} style={{ ...btn, opacity: i === pages.length - 1 ? 0.4 : 1 }} aria-label="Next page">›</button>
        {canClip && <button onClick={() => { setClipping((c) => !c); setBox(null); setDrag(null); setClipMsg(null); }} aria-pressed={clipping}
          title="Drag a box round a section cut or detail, then file it on a budget section"
          aria-label={clipping ? "Stop clipping" : "Clip detail"} className="flex items-center justify-center"
          style={{ ...btn, ...(clipping ? { background: T.ink, color: T.card, border: `1px solid ${T.ink}` } : {}) }}>
          {/* On a phone the words didn't fit (Coy, 2026-10-09): an icon there, the words on a desktop. */}
          <svg className="lg:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
          <span className="hidden lg:inline">{clipping ? "Clipping…" : "Clip detail"}</span>
        </button>}
        {onMeasure && <button onClick={() => onMeasure(s)} aria-label="Measure this sheet" title="Measure this sheet" className="flex items-center justify-center"
          style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: `1px solid ${T.hiviz}`, letterSpacing: ".06em", textTransform: "uppercase" }}>
          <svg className="lg:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 16.5 16.5 3 21 7.5 7.5 21z" /><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2" />
          </svg>
          <span className="hidden lg:inline">Measure ›</span>
        </button>}
      </div>
      {clipping && !box && <div className="px-3 py-1.5" style={{ background: T.ink, color: T.card, fontSize: F.xs }}>
        Drag a box round the section cut or detail{clipMsg ? ` · ${clipMsg}` : ""}. Esc stops clipping.
      </div>}
      <div ref={scroller} className="flex-1 overflow-auto p-3" style={{ minHeight: 0, cursor: clipping ? "crosshair" : zoom > 1 ? "grab" : undefined, touchAction: clipping ? "none" : "pan-x pan-y" }}
        onPointerDown={(e) => {
          if (clipping) {
            // A box, by mouse or finger: from here to where it is let go.
            if (!canvas.current) return;
            e.preventDefault();
            const a = toPt(e.clientX, e.clientY);
            setBox(null); setDrag({ x0: a.x, y0: a.y, x1: a.x, y1: a.y });
            const mv = (ev: PointerEvent) => { const p = toPt(ev.clientX, ev.clientY); setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d)); };
            const up = (ev: PointerEvent) => {
              window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
              const p = toPt(ev.clientX, ev.clientY);
              const b = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
              setDrag(null);
              setBox(b.w >= 8 && b.h >= 8 ? b : null);
            };
            window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
            return;
          }
          // Drag to pan with a mouse; a finger already scrolls the box.
          if (e.pointerType !== "mouse" || !scroller.current) return;
          const b = scroller.current, x0 = e.clientX, y0 = e.clientY, l0 = b.scrollLeft, t0 = b.scrollTop;
          const mv = (ev: PointerEvent) => { b.scrollLeft = l0 - (ev.clientX - x0); b.scrollTop = t0 - (ev.clientY - y0); };
          const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
        }}>
        {fail ? <div style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t open this page: {fail}</div>
          : <div style={{ position: "relative", width: "fit-content", margin: "0 auto" }}>
            <canvas ref={canvas} style={{ display: "block", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} />
            {(() => {
              const r = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : box;
              if (!r || !clipping) return null;
              const pct = (v: number, of: number) => `${(v / Math.max(1, of)) * 100}%`;
              return <div aria-hidden="true" style={{ position: "absolute", left: pct(r.x, s.page_w), top: pct(r.y, s.page_h), width: pct(r.w, s.page_w), height: pct(r.h, s.page_h),
                border: `2px solid ${T.hiviz}`, background: "rgba(217,119,87,.10)", boxShadow: "0 0 0 9999px rgba(0,0,0,.25)", pointerEvents: "none" }} />;
            })()}
          </div>}
      </div>
      {clipping && box && url && jobId && <ClipBar jobId={jobId} sheet={s} url={url} box={box}
        onCancel={() => setBox(null)} onDone={(m) => { setBox(null); setClipMsg(m); }} />}
    </div>
  );
}
