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
 *
 * **Takeoffs with your markups** (Coy, 2026-10-10: "I have 4 measurements on one satellite
 * photo: I would like to pull that photo into the section with the lines I've drawn"): each
 * sheet or aerial with takeoffs drawn on it is offered at the top of Copy; Add draws the part
 * of the sheet that holds them, every shape in its colour, into a JPEG saved as a photo on
 * this area. It is a picture of today's lines — re-measuring doesn't change it.
 */

import React, { useRef, useState } from "react";
import { T, F, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";
import { FileTile, FileViewer, sendBytes, type FileRow } from "@/components/v34/files-panel";
import { AreaMap, mapPicture, sheetMarkup } from "@/components/v34/proposal/area-visuals";
import { isAerialSheet, type PlansData } from "@/components/v34/plan-room/shared";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export function SectionPhotos({ jobId, sectionId, sectionName, photos, sections, onChange, onProposal = null, onProposalChange, plans = null, clipHref = null }: {
  /** Clip a section cut off the plans (Coy, 2026-10-10: the Clip button on the photos row). */
  clipHref?: string | null;
  jobId: string; sectionId: string; sectionName: string | null; photos: FileRow[];
  /** The job's Takeoffs, for pictures of the sheets with their markups. */
  plans?: PlansData | null;
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
      <div className="flex items-center gap-2 flex-wrap">
        <span style={eyebrow}>Add Images to this Section{photos.length ? ` · ${photos.length}` : ""}</span>
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
        {clipHref && (
          <a href={clipHref} title="Open a drawing in Files, then Clip detail — a section cut or detail clipped onto this section" className="rounded px-2.5 flex items-center"
            style={{ height: 30, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, textDecoration: "none", ...eyebrow }}>
            + Clip
          </a>
        )}
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
      {picking && <PickPhotos jobId={jobId} sectionId={sectionId} sectionName={sectionName} plans={plans} onClose={() => setPicking(false)} onChange={onChange} />}
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
function PickPhotos({ jobId, sectionId, sectionName, plans, onClose, onChange }: {
  jobId: string; sectionId: string; sectionName: string | null; plans: PlansData | null; onClose: () => void; onChange: (f: FileRow | null, removedId?: string) => void;
}) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [texted, setTexted] = useState<Texted[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Sheets with takeoffs drawn on them — this area's first, aerials before plan pages.
  const marked = React.useMemo(() => {
    if (!plans) return [];
    return plans.sheets.map((sh) => {
      const mine = plans.measurements.filter((m) => m.sheet_id === sh.id);
      return { sheet: sh, count: mine.length, here: mine.some((m) => m.section_id === sectionId), map: sheetMarkup(plans, sh.id) };
    }).filter((x) => x.map)
      .sort((a, b) => Number(b.here) - Number(a.here) || Number(isAerialSheet(b.sheet)) - Number(isAerialSheet(a.sheet)));
  }, [plans, sectionId]);
  // A phone decodes a whole scanned sheet to draw any part of it, so only aerials get a preview there.
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const [added, setAdded] = useState<Set<string>>(new Set());
  const addMarkup = async (sheetId: string) => {
    const x = marked.find((m) => m.sheet.id === sheetId);
    if (!x?.map) return;
    setBusy(sheetId); setErr(null);
    try {
      const blob = await mapPicture(x.map);
      const label = `${x.sheet.number ?? `p.${x.sheet.page}`}${x.sheet.title && !isAerialSheet(x.sheet) ? ` ${x.sheet.title}` : ""}`;
      const day = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
      const name = `Takeoffs on ${label} · ${day}.jpg`.replace(/[\\/:*?"<>|]/g, "-");
      const made = await call("/api/files", "POST", { name, mime: "image/jpeg", size: blob.size, job_id: jobId, section_id: sectionId, category: "photo" });
      await sendBytes(made.upload.signed_url, new File([blob], name, { type: "image/jpeg" }), () => {});
      const done = await call(`/api/files/${made.file.id}/done`, "POST");
      setAdded((a) => new Set(a).add(sheetId));
      onChange(done.file as FileRow);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
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
  // Ticks are a choice until "Add N photos" — nothing is filed on the tap itself.
  const [pick, setPick] = useState<Set<string> | null>(null);
  const [pickTexted, setPickTexted] = useState<Set<string>>(new Set());
  const chosen = pick ?? new Set((files ?? []).filter((f) => f.section_id === sectionId).map((f) => f.id));
  const flip = (id: string) => setPick(() => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const flipTexted = (id: string) => setPickTexted((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const adding = (files ?? []).filter((f) => chosen.has(f.id) && f.section_id !== sectionId);
  const removing = (files ?? []).filter((f) => !chosen.has(f.id) && f.section_id === sectionId);
  const bringing = texted.filter((t) => pickTexted.has(t.id));
  const nAdd = adding.length + bringing.length;
  const apply = async () => {
    setBusy("apply"); setErr(null);
    try {
      for (const f of [...adding, ...removing]) {
        const on = chosen.has(f.id);
        const b = await call(`/api/files/${f.id}`, "PATCH", { section_id: on ? sectionId : null });
        const next = (b.file as FileRow) ?? { ...f, section_id: on ? sectionId : null };
        setFiles((l) => (l ?? []).map((x) => (x.id === f.id ? next : x)));
        if (on) onChange(next); else onChange(null, f.id);
      }
      if (bringing.length) {
        const b = await call(`/api/jobs/${jobId}/texted-photos`, "POST", { media_ids: bringing.map((t) => t.id) });
        for (const made of (b.files ?? []) as FileRow[]) {
          const p = await call(`/api/files/${made.id}`, "PATCH", { section_id: sectionId });
          const next = (p.file as FileRow) ?? { ...made, section_id: sectionId };
          setFiles((l) => [next, ...(l ?? [])]);
          onChange(next);
        }
        if (b.failed?.length) throw new Error(b.failed[0]?.reason ?? "Couldn't bring every texted photo in.");
      }
      setPick(null); setPickTexted(new Set());
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const applyLabel = busy === "apply" ? "Adding…" : nAdd ? `Add ${nAdd} photo${nAdd === 1 ? "" : "s"}${removing.length ? ` · take off ${removing.length}` : ""}`
    : removing.length ? `Take off ${removing.length} photo${removing.length === 1 ? "" : "s"}` : "Tick photos to add";
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
    <Drawer open drop onClose={onClose} title={`Photos for ${sectionName || "this area"}`} sub="Tick the ones that show this area, then add them. They go under it here and on the proposal.">
      <div className="px-4 py-3 flex flex-col gap-3">
        {err && <div style={{ color: T.red, fontSize: F.sm }}>{err}</div>}
        {marked.length > 0 && (
          <div>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Takeoffs · the sheet with your markups</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {marked.map((x) => (
                <div key={x.sheet.id} className="rounded flex flex-col gap-1.5 p-1.5" style={{ border: `1px solid ${added.has(x.sheet.id) ? T.green : T.hair}`, background: T.card }}>
                  {x.map && (!coarse || isAerialSheet(x.sheet)) ? <AreaMap map={x.map} height={120} /> : null}
                  <div className="flex items-center gap-2">
                    <span style={{ flex: 1, minWidth: 0, fontSize: F.xs, ...clip }}>
                      <b>{x.sheet.number ?? `p.${x.sheet.page}`}</b>{x.sheet.title && !isAerialSheet(x.sheet) ? ` ${x.sheet.title}` : ""} · {x.count} takeoff{x.count === 1 ? "" : "s"}{x.here ? " · this area's" : ""}
                    </span>
                    <button onClick={() => void addMarkup(x.sheet.id)} disabled={!!busy} className="rounded px-2"
                      style={{ height: 26, border: `1px solid ${T.hairStrong}`, background: added.has(x.sheet.id) ? T.greenDim : T.card, color: T.ink, cursor: "pointer", fontSize: F.xs, fontWeight: 600, whiteSpace: "nowrap", opacity: busy === x.sheet.id ? 0.5 : 1 }}>
                      {busy === x.sheet.id ? "Adding…" : added.has(x.sheet.id) ? "✓ Added · again" : "+ Add"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Saved as a photo on this area — a picture of today&apos;s lines.</div>
          </div>
        )}
        <div>
          <div style={{ ...eyebrow, marginBottom: 6 }}>On the job · from Takeoffs, emails and uploads</div>
          {files === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>…</div> : files.length ? (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
              {files.map((f) => tile(f.id, f.url, chosen.has(f.id), f.name, () => flip(f.id)))}
            </div>
          ) : <div style={{ fontSize: F.sm, color: T.ink3 }}>No photos on this job yet.</div>}
        </div>
        {texted.length > 0 && (
          <div>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Texted by the customer · not on the job yet</div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
              {texted.map((t) => tile(t.id, t.url, pickTexted.has(t.id), `Texted by ${t.who ?? "them"}`, () => flipTexted(t.id)))}
            </div>
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4, ...clip }}>Adding one brings it onto the job and puts it on this area.</div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 px-4 py-2.5 flex items-center gap-2" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: F.xs, color: T.ink3, ...clip }}>{chosen.size + pickTexted.size} ticked</span>
        <button onClick={onClose} className="rounded px-3" style={{ height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, cursor: "pointer", fontSize: F.sm }}>Cancel</button>
        <button onClick={() => void apply()} disabled={!!busy || (!nAdd && !removing.length)} className="rounded px-3"
          style={{ height: 34, border: "none", background: nAdd || removing.length ? T.hiviz : T.slab, color: nAdd || removing.length ? T.onHiviz : T.ink3, cursor: "pointer", fontSize: F.sm, fontWeight: 700 }}>{applyLabel}</button>
      </div>
    </Drawer>
  );
}
