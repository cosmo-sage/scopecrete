"use client";

/**
 * Photos on one area of a job (Coy, 2026-09-30: "on mobile I need to be able
 * to take multiple photos from within a section that are easily mapped to that
 * section. The photos can be listed below the section dimensions.")
 *
 * The camera button opens the phone's camera (several shots on phones that
 * allow it; the library on a desktop); each photo goes straight to storage
 * filed on this section (files.section_id, migration 045) and Dusty reads
 * it like any other. Tap a photo for the usual viewer.
 *
 * **From the job** (Coy, 2026-10-03: "copy photo here from the PlanRoom or
 * customer text message/email … select the photos to add to the group to be
 * viewed on that group name on the proposal"): every photo already on the job
 * — the Plan Room's, an email's — and every photo the customer texted, ticked
 * onto this area. A texted one is brought onto the job first (as + Job does).
 * A photo on the area shows under it on the proposal.
 */

import React, { useRef, useState } from "react";
import { T, F, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Sheet } from "@/components/v34/primitives";
import { FileTile, FileViewer, sendBytes, type FileRow } from "@/components/v34/files-panel";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export function SectionPhotos({ jobId, sectionId, sectionName, photos, sections, onChange }: {
  jobId: string; sectionId: string; sectionName: string | null; photos: FileRow[];
  sections: Array<{ id: string; name: string | null }>;
  onChange: (f: FileRow | null, removedId?: string) => void;
}) {
  const camera = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState<Array<{ key: string; name: string; pct: number; error: string | null }>>([]);
  const [open, setOpen] = useState<FileRow | null>(null);
  const [picking, setPicking] = useState(false);

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const jobs = files.map((file, i) => ({ key: `${Date.now()}-${i}`, file }));
    setSending((a) => [...a, ...jobs.map((j) => ({ key: j.key, name: j.file.name, pct: 0, error: null }))]);
    for (const j of jobs) {
      const set = (p: Partial<{ pct: number; error: string | null }>) => setSending((a) => a.map((x) => (x.key === j.key ? { ...x, ...p } : x)));
      try {
        const made = await call("/api/files", "POST", { name: j.file.name || "photo.jpg", mime: j.file.type, size: j.file.size, job_id: jobId, section_id: sectionId, category: "photo" });
        await sendBytes(made.upload.signed_url, j.file, (pct) => set({ pct }));
        const done = await call(`/api/files/${made.file.id}/done`, "POST");
        onChange(done.file as FileRow);
        setSending((a) => a.filter((x) => x.key !== j.key));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  return (
    <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
      <div className="flex items-center gap-2">
        <span style={eyebrow}>Photos{photos.length ? ` · ${photos.length}` : ""}</span>
        <span className="flex-1" />
        <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden
          onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <button onClick={() => setPicking(true)} className="rounded px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", ...eyebrow }}>
          From the job
        </button>
        <button onClick={() => camera.current?.click()} aria-label={`Take photos of ${sectionName || "this area"}`}
          className="rounded flex items-center gap-1.5 px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", ...eyebrow }}>
          <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden="true">
            <path d="M1.5 3.5h2.3l1.2-2h5l1.2 2h2.3v8h-12z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <circle cx="7.5" cy="7.3" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Add photos
        </button>
      </div>
      {(photos.length > 0 || sending.length > 0) && (
        <div className="grid gap-1.5 mt-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
          {photos.map((f) => <FileTile key={f.id} f={f} onOpen={() => setOpen(f)} />)}
          {sending.map((p) => (
            <div key={p.key} className="rounded flex items-center justify-center text-center" title={p.name}
              style={{ aspectRatio: "1", border: `1px dashed ${p.error ? T.red : T.hairStrong}`, background: T.slab, fontSize: F.xs, color: p.error ? T.red : T.ink3, ...nums }}>
              {p.error ? "failed" : `${p.pct}%`}
            </div>
          ))}
        </div>
      )}
      {picking && <PickPhotos jobId={jobId} sectionId={sectionId} sectionName={sectionName} onClose={() => setPicking(false)} onChange={onChange} />}
      <FileViewer f={open} sections={sections} onClose={() => setOpen(null)}
        onSaved={(f) => { setOpen(f); onChange(f); }}
        onDeleted={(id) => { setOpen(null); onChange(null, id); }} />
    </div>
  );
}

interface Texted { id: string; who: string | null; sent_at: string | null; url: string | null; file_id: string | null }

/** Every photo on the job, and every one the customer texted, ticked onto this area. */
function PickPhotos({ jobId, sectionId, sectionName, onClose, onChange }: {
  jobId: string; sectionId: string; sectionName: string | null; onClose: () => void; onChange: (f: FileRow | null, removedId?: string) => void;
}) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [texted, setTexted] = useState<Texted[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => {
    let off = false;
    Promise.all([call(`/api/files?job_id=${jobId}`, "GET"), call(`/api/jobs/${jobId}/texted-photos`, "GET").catch(() => ({ photos: [] }))])
      .then(([f, t]) => {
        if (off) return;
        setFiles(((f.files ?? []) as FileRow[]).filter((x) => x.kind === "image"));
        setTexted(((t.photos ?? []) as Texted[]).filter((x) => !x.file_id));
      }).catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [jobId]);
  const toggle = async (f: FileRow) => {
    const on = f.section_id !== sectionId;
    setBusy(f.id); setErr(null);
    try {
      const b = await call(`/api/files/${f.id}`, "PATCH", { section_id: on ? sectionId : null });
      const next = (b.file as FileRow) ?? { ...f, section_id: on ? sectionId : null };
      setFiles((l) => (l ?? []).map((x) => (x.id === f.id ? next : x)));
      if (on) onChange(next); else onChange(null, f.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const bring = async (t: Texted) => {
    setBusy(t.id); setErr(null);
    try {
      const b = await call(`/api/jobs/${jobId}/texted-photos`, "POST", { media_ids: [t.id] });
      const made = ((b.files ?? []) as FileRow[])[0];
      if (!made) throw new Error(b.failed?.[0]?.reason ?? "Couldn't bring it in.");
      const p = await call(`/api/files/${made.id}`, "PATCH", { section_id: sectionId });
      const next = (p.file as FileRow) ?? { ...made, section_id: sectionId };
      setTexted((l) => l.filter((x) => x.id !== t.id));
      setFiles((l) => [next, ...(l ?? [])]);
      onChange(next);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const tile = (key: string, url: string | null, on: boolean, label: string, act: () => void) => (
    <button key={key} onClick={act} disabled={!!busy} title={label} className="relative rounded overflow-hidden"
      style={{ aspectRatio: "1", border: `2px solid ${on ? T.hiviz : T.hair}`, background: T.slab, cursor: "pointer", opacity: busy === key ? 0.5 : 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link */}
      {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: F.xs, color: T.ink3 }}>{label}</span>}
      <span className="absolute flex items-center justify-center" style={{ top: 4, right: 4, width: 20, height: 20, borderRadius: 3, background: on ? T.hiviz : "rgba(255,255,255,.85)",
        border: `1px solid ${on ? T.hiviz : T.hairStrong}`, color: T.onHiviz, fontSize: 13, fontWeight: 700 }}>{on ? "✓" : ""}</span>
    </button>
  );
  return (
    <Sheet open onClose={onClose} title={`Photos for ${sectionName || "this area"}`} sub="Tick the ones that show this area — they go under it here and on the proposal.">
      <div className="px-4 py-3 flex flex-col gap-3">
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        <div>
          <div style={{ ...eyebrow, marginBottom: 6 }}>On the job · from the Plan Room, emails and uploads</div>
          {files === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>…</div> : files.length ? (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
              {files.map((f) => tile(f.id, f.url, f.section_id === sectionId, f.name, () => void toggle(f)))}
            </div>
          ) : <div style={{ fontSize: F.sm, color: T.ink3 }}>No photos on this job yet.</div>}
        </div>
        {texted.length > 0 && (
          <div>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Texted by the customer · not on the job yet</div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
              {texted.map((t) => tile(t.id, t.url, false, `Texted by ${t.who ?? "them"}`, () => void bring(t)))}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4, ...clip }}>Ticking one brings it onto the job and puts it on this area.</div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
