"use client";

/**
 * Photos on one area of a job (Coy, 2026-09-30: "on mobile I need to be able
 * to take multiple photos from within a section that are easily mapped to that
 * section. The photos can be listed below the section dimensions.")
 *
 * **Upload** opens the device's files; **Camera** (Coy, 2026-10-05: "open my
 * camera app directly from the scopecrete site … take multiple photos at once
 * and add at the same time") opens the camera in the page — shoot as many as
 * you like, then Add N; where the browser can't (no camera, refused) it falls
 * back to the phone's own camera. Each photo goes straight to storage
 * filed on this section (files.section_id, migration 045) and Dusty reads
 * it like any other. Tap a photo for the usual viewer.
 *
 * **Copy** — was "From the job" (Coy, 2026-10-03: "copy photo here from the PlanRoom or
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

export function SectionPhotos({ jobId, sectionId, sectionName, photos, sections, onChange, onProposal = null, onProposalChange }: {
  jobId: string; sectionId: string; sectionName: string | null; photos: FileRow[];
  sections: Array<{ id: string; name: string | null }>;
  onChange: (f: FileRow | null, removedId?: string) => void;
  /** Whether this area's photos (and map) show on the proposal; null = not known / not shown. */
  onProposal?: boolean | null; onProposalChange?: (on: boolean) => void;
}) {
  const upload = useRef<HTMLInputElement | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const [shooting, setShooting] = useState(false);
  const [sending, setSending] = useState<Array<{ key: string; name: string; pct: number; error: string | null }>>([]);
  const [open, setOpen] = useState<FileRow | null>(null);
  const [picking, setPicking] = useState(false);

  const add = async (list: FileList | File[] | null) => {
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
        {/* On or off the proposal for this area (Coy, 2026-10-05) — the proposal's eye on this area, from here. */}
        {onProposal !== null && photos.length > 0 && onProposalChange && (
          <button role="switch" aria-checked={onProposal} onClick={() => onProposalChange(!onProposal)}
            title={onProposal ? "These photos show under this area on the proposal — tap to leave them off" : "Left off the proposal — tap to show them"}
            className="flex items-center gap-1" style={{ fontSize: F.xs, color: onProposal ? T.ink2 : T.ink3, cursor: "pointer" }}>
            <span aria-hidden="true" style={{ width: 24, height: 14, borderRadius: 7, background: onProposal ? T.green : T.hairStrong, position: "relative", display: "inline-block", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: onProposal ? 12 : 2, width: 10, height: 10, borderRadius: 5, background: "#fff", transition: "left .15s" }} />
            </span>
            Proposal
          </button>
        )}
        <span className="flex-1" />
        <input ref={upload} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden
          onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <button onClick={() => setPicking(true)} title="Copy photos already on the job, or texted by the customer, onto this area" className="rounded px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", ...eyebrow }}>
          Copy
        </button>
        <button onClick={() => upload.current?.click()} title="Upload photos from this device" className="rounded px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", ...eyebrow }}>
          Upload
        </button>
        <button onClick={() => (canShoot() ? setShooting(true) : camera.current?.click())} aria-label={`Take photos of ${sectionName || "this area"}`}
          className="rounded flex items-center gap-1.5 px-2.5" style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", ...eyebrow }}>
          <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden="true">
            <path d="M1.5 3.5h2.3l1.2-2h5l1.2 2h2.3v8h-12z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <circle cx="7.5" cy="7.3" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Camera
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
      {shooting && <CameraSheet title={`Photos of ${sectionName || "this area"}`} onClose={() => setShooting(false)}
        onFallback={() => { setShooting(false); camera.current?.click(); }}
        onAdd={(files) => { setShooting(false); void add(files); }} />}
      {picking && <PickPhotos jobId={jobId} sectionId={sectionId} sectionName={sectionName} onClose={() => setPicking(false)} onChange={onChange} />}
      <FileViewer f={open} sections={sections} onClose={() => setOpen(null)}
        onSaved={(f) => { setOpen(f); onChange(f); }}
        onDeleted={(id) => { setOpen(null); onChange(null, id); }} />
    </div>
  );
}

const canShoot = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/**
 * The camera in the page: the back camera live, a shutter, every shot kept in a strip
 * (× to drop one), then Add N. Nothing leaves the phone until Add. If the camera can't
 * be opened, the phone's own camera app is used instead.
 */
function CameraSheet({ title, onClose, onAdd, onFallback }: { title: string; onClose: () => void; onAdd: (files: File[]) => void; onFallback: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [shots, setShots] = useState<Array<{ file: File; url: string }>>([]);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const shotsRef = useRef(shots);
  const fallback = useRef(onFallback);
  React.useEffect(() => { shotsRef.current = shots; fallback.current = onFallback; }, [shots, onFallback]);
  React.useEffect(() => {
    let stream: MediaStream | null = null, off = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (off) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        setReady(true);
      })
      .catch(() => { if (!off) fallback.current(); });
    return () => {
      off = true;
      stream?.getTracks().forEach((t) => t.stop());
      shotsRef.current.forEach((x) => URL.revokeObjectURL(x.url));
    };
  }, []);
  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    c.toBlob((b) => {
      if (!b) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File([b], `photo-${stamp}-${shotsRef.current.length + 1}.jpg`, { type: "image/jpeg" });
      setShots((a) => [...a, { file, url: URL.createObjectURL(b) }]);
    }, "image/jpeg", 0.9);
  };
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 flex flex-col" style={{ zIndex: 80, background: "#000" }}>
      <div className="flex items-center gap-2 px-3" style={{ height: 48, color: "#fff" }}>
        <button onClick={onClose} style={{ ...eyebrow, color: "#fff", cursor: "pointer" }}>Cancel</button>
        <span className="flex-1 text-center" style={{ fontSize: F.sm, ...clip }}>{title}</span>
        <button onClick={() => onAdd(shots.map((x) => x.file))} disabled={!shots.length} className="rounded px-3"
          style={{ height: 32, background: shots.length ? T.hiviz : "#444", color: shots.length ? T.onHiviz : "#999", fontWeight: 700, fontSize: F.xs, cursor: shots.length ? "pointer" : "default" }}>
          Add {shots.length || ""} photo{shots.length === 1 ? "" : "s"}
        </button>
      </div>
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        {!ready && <div className="absolute inset-0 flex items-center justify-center" style={{ color: "#bbb", fontSize: F.sm }}>Opening the camera…</div>}
        {flash && <div className="absolute inset-0" style={{ background: "#fff", opacity: 0.6 }} />}
      </div>
      {shots.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto" style={{ background: "#111" }}>
          {shots.map((x, i) => (
            <div key={x.url} className="relative shrink-0" style={{ width: 56, height: 56 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local shot */}
              <img src={x.url} alt={`Shot ${i + 1}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 4 }} />
              <button onClick={() => { URL.revokeObjectURL(x.url); setShots((a) => a.filter((y) => y.url !== x.url)); }} aria-label={`Drop shot ${i + 1}`}
                className="absolute flex items-center justify-center" style={{ top: -4, right: -4, width: 20, height: 20, borderRadius: 10, background: "#000", color: "#fff", border: "1px solid #666", fontSize: 12, cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center" style={{ height: 96, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button onClick={snap} disabled={!ready} aria-label="Take a photo"
          style={{ width: 68, height: 68, borderRadius: 34, border: "4px solid #fff", background: ready ? "rgba(255,255,255,.25)" : "transparent", cursor: "pointer" }} />
      </div>
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
