"use client";

/**
 * Photos on one area of a job (Coy, 2026-09-30: "on mobile I need to be able
 * to take multiple photos from within a section that are easily mapped to that
 * section. The photos can be listed below the section dimensions.")
 *
 * The camera button opens the phone's camera (several shots on phones that
 * allow it; the library on a desktop); each photo goes straight to storage
 * filed on this section (job_files.section_id, migration 045) and Dusty reads
 * it like any other. Tap a photo for the usual viewer.
 */

import React, { useRef, useState } from "react";
import { T, F, eyebrow, nums } from "@/lib/v34/tokens";
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
      <FileViewer f={open} sections={sections} onClose={() => setOpen(null)}
        onSaved={(f) => { setOpen(f); onChange(f); }}
        onDeleted={(id) => { setOpen(null); onChange(null, id); }} />
    </div>
  );
}
