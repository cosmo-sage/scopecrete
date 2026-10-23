"use client";

/**
 * The Camera page — site photos and video, CompanyCam's way (migration 113;
 * Coy, 2026-10-15: "take pictures on site really quickly and then pull those
 * projects or jobs into Scopecrete" and "I can map cam and zoom into the
 * address, and it automatically creates a project from that with that address
 * … I can add a name or not … and go ahead and snap pictures and take video").
 *
 * Opens straight into the viewfinder. The strip at the top says where shots go
 * — the open job or site the phone is standing at (GPS, src/lib/capture.ts),
 * picked by hand, or the Photo inbox — and every shot is kept on the phone at
 * once and sent in the background (src/lib/v34/capture-queue.ts). + New site
 * here drops a pin (satellite, the GPS point first) and makes a site with that
 * address; a job is made from it later (New job → Start from a site).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, eyebrow, clip } from "@/lib/v34/tokens";
import { MapView, ZoomButtons, type View } from "@/components/v34/map/map-view";
import { PHOTO_MAX, THUMB_MAX, TAGS, TAG_LABEL, VIDEO_MAX_SECONDS, fitWithin, type Tag } from "@/lib/capture";
import { useAccess } from "@/lib/v34/access-ctx";
import { addShot, dropShot, retryAll, watchShots, type Shot } from "@/lib/v34/capture-queue";

type Target = { kind: "job" | "site"; id: string; label: string } | null;
interface Nearby {
  pick: { kind: "job" | "site"; id: string; label: string; dist_m: number } | null;
  near: Array<{ kind: "job" | "site"; id: string; label: string; dist_m: number }>;
  jobs: Array<{ id: string; title: string; customer: string | null; address: string | null; city: string | null }>;
  sites: Array<{ id: string; label: string; address: string | null; job_id: string | null }>;
  sites_ready: boolean;
}
interface Fix { lat: number; lng: number; acc: number }

const ON_DARK = "#fff";
const DIM = "rgba(255,255,255,.62)";
const PANEL = { background: T.card, color: T.ink } as const;
const canShoot = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const recorderMime = () => {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? null;
};
const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
function drawTo(src: CanvasImageSource, w: number, h: number, max: number): HTMLCanvasElement {
  const s = fitWithin(w, h, max);
  const c = document.createElement("canvas");
  c.width = s.w; c.height = s.h;
  c.getContext("2d")?.drawImage(src, 0, 0, s.w, s.h);
  return c;
}
const ago = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1609).toFixed(1)} mi`);

export function CameraPage() {
  const router = useRouter();
  const params = useSearchParams();
  // An onsite estimator (2026-10-23): shots go only onto one of their jobs — no sites, no inbox,
  // since the database lets them add files to their jobs alone.
  const jobsOnly = useAccess().limited;
  const video = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [ready, setReady] = useState(false);
  const [noCamera, setNoCamera] = useState(!canShoot());
  const [flash, setFlash] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gps, setGps] = useState<"finding" | "ok" | "off">("finding");
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const byHand = useRef(false);
  const [section, setSection] = useState<{ id: string; name: string } | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);
  const [tag, setTag] = useState<Tag | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [panel, setPanel] = useState<"place" | "site" | "shots" | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [rec, setRec] = useState<{ t0: number; r: MediaRecorder } | null>(null);
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => watchShots(setShots), []);

  // The camera: the back one, big for photos; 720p with sound for video.
  useEffect(() => {
    if (!canShoot()) return;
    let off = false;
    void Promise.resolve().then(() => { if (!off) setReady(false); });
    const want: MediaStreamConstraints = mode === "photo"
      ? { video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false }
      : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true };
    navigator.mediaDevices.getUserMedia(want).catch(() => navigator.mediaDevices.getUserMedia({ video: want.video, audio: false }))
      .then((s) => {
        if (off) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        setReady(true); setNoCamera(false);
      })
      .catch(() => { if (!off) setNoCamera(true); });
    return () => { off = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [mode]);

  // Where the phone is. A move of 60 m or more asks again where shots go.
  const asked = useRef<Fix | null>(null);
  const loadNearby = useCallback(async (f: Fix | null) => {
    const q = f ? `?lat=${f.lat}&lng=${f.lng}&acc=${Math.round(f.acc)}` : "";
    const r = await fetch(`/api/capture/nearby${q}`).then((x) => x.json()).catch(() => null);
    if (!r || r.error) return;
    setNearby(r as Nearby);
    if (!byHand.current) setTarget(r.pick ? { kind: r.pick.kind, id: r.pick.id, label: r.pick.label } : null);
  }, []);
  useEffect(() => {
    // ?job= or ?site= opens on that one (a job's Photos → Camera, a site's page).
    const j = params.get("job"), s = params.get("site");
    if (j || s) {
      byHand.current = true;
      const t: Target = { kind: j ? "job" : "site", id: (j ?? s) as string, label: params.get("label") ?? (j ? "This job" : "This site") };
      void Promise.resolve().then(() => setTarget(t));
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) { void Promise.resolve().then(() => loadNearby(null)).then(() => setGps("off")); return; }
    const id = navigator.geolocation.watchPosition((p) => {
      const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      setFix(f); setGps("ok");
      const a = asked.current;
      if (!a || Math.hypot((a.lat - f.lat) * 111_195, (a.lng - f.lng) * 96_000) > 60) { asked.current = f; void loadNearby(f); }
    }, () => { setGps("off"); if (!asked.current) void loadNearby(null); }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [loadNearby, params]);

  // A job's areas, for the Section pick.
  useEffect(() => {
    let off = false;
    void Promise.resolve().then(() => { if (!off) { setSection(null); setSections([]); } });
    if (target?.kind !== "job") return () => { off = true; };
    void fetch(`/api/capture/nearby?sections=${target.id}`).then((r) => r.json()).then((b) => { if (!off) setSections(b.sections ?? []); }).catch(() => {});
    return () => { off = true; };
  }, [target]);

  const keep = useCallback(async (blob: Blob, thumb: Blob | null, kind: "image" | "video", mime: string) => {
    const f = fix;
    if (jobsOnly && target?.kind !== "job") { setMsg("Pick one of your jobs first — tap the strip at the top."); setPanel("place"); return; }
    await addShot({
      client_id: crypto.randomUUID(), kind, mime, blob, thumb, taken_at: new Date().toISOString(),
      lat: f?.lat ?? null, lng: f?.lng ?? null, accuracy: f ? Math.round(f.acc) : null,
      job_id: target?.kind === "job" ? target.id : null, site_id: target?.kind === "site" ? target.id : null,
      section_id: section?.id ?? null, place: section ? `${target?.label} · ${section.name}` : target?.label ?? null,
      tag, note: note.trim() || null,
    });
    if (note) { setNote(""); setNoteOpen(false); }
  }, [fix, target, section, tag, note, jobsOnly]);

  const snap = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setFlash(true); setTimeout(() => setFlash(false), 110);
    const [full, thumb] = await Promise.all([toBlob(drawTo(v, v.videoWidth, v.videoHeight, PHOTO_MAX), 0.82), toBlob(drawTo(v, v.videoWidth, v.videoHeight, THUMB_MAX), 0.7)]);
    if (full) await keep(full, thumb, "image", "image/jpeg");
  };

  const startRec = async () => {
    const s = streamRef.current, v = video.current, mime = recorderMime();
    if (!s || !v || !mime) { setMsg("This browser can't record video here — use Phone camera."); return; }
    const thumb = v.videoWidth ? await toBlob(drawTo(v, v.videoWidth, v.videoHeight, THUMB_MAX), 0.7) : null;
    const parts: Blob[] = [];
    const r = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    r.onstop = () => {
      const type = mime.split(";")[0];
      void keep(new Blob(parts, { type }), thumb, "video", type);
      setRec(null); setSecs(0);
    };
    r.start(1000);
    setRec({ t0: Date.now(), r });
  };
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - rec.t0) / 1000);
      setSecs(s);
      if (s >= VIDEO_MAX_SECONDS && rec.r.state === "recording") rec.r.stop();
    }, 250);
    return () => clearInterval(t);
  }, [rec]);

  // The phone's own camera, when the page can't open one (or for a longer clip).
  const fromPhone = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith("video/")) { await keep(file, null, "video", file.type || "video/mp4"); continue; }
      try {
        const bmp = await createImageBitmap(file);
        const [full, thumb] = await Promise.all([toBlob(drawTo(bmp, bmp.width, bmp.height, PHOTO_MAX), 0.82), toBlob(drawTo(bmp, bmp.width, bmp.height, THUMB_MAX), 0.7)]);
        bmp.close();
        if (full) await keep(full, thumb, "image", "image/jpeg");
      } catch { setMsg(`Couldn't read ${file.name} (HEIC needs the in-page camera).`); }
    }
  };

  const pick = (t: Target) => { byHand.current = true; setTarget(t); setPanel(null); };
  const waiting = shots.filter((s) => s.state !== "done");
  const held = shots.find((s) => s.state === "held");
  const failed = waiting.filter((s) => s.state === "failed").length;
  const lastShot = shots[0];
  const lastThumb = useMemo(() => (lastShot?.thumb ? URL.createObjectURL(lastShot.thumb) : null), [lastShot]);
  useEffect(() => () => { if (lastThumb) URL.revokeObjectURL(lastThumb); }, [lastThumb]);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 70, background: "#000", color: ON_DARK }}>
      {/* Where shots go */}
      <div className="flex items-center gap-2 px-3 shrink-0" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 52 }}>
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))} aria-label="Back"
          style={{ width: 34, height: 34, fontSize: 22, color: ON_DARK, cursor: "pointer" }}>‹</button>
        <button onClick={() => setPanel(panel === "place" ? null : "place")} className="flex-1 text-left rounded-lg px-3"
          style={{ minHeight: 38, background: "rgba(255,255,255,.12)", minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: DIM }}>
            {target ? (target.kind === "job" ? "Job" : "Site") : "Going to"}{gps === "finding" ? " · finding you…" : gps === "off" ? " · no location" : ""}
          </div>
          <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>
            {target ? `${target.label}${section ? ` · ${section.name}` : ""}` : jobsOnly ? "Pick one of your jobs" : "Photo inbox — tap to pick"} ▾
          </div>
        </button>
        {target?.kind === "site" && (
          // A site becomes a job when Coy is ready: its address, pin and photos come with it.
          <Link href={`/dashboard/scope?new=1&site=${target.id}`} className="rounded-lg px-2.5 flex items-center"
            style={{ height: 38, background: "rgba(255,255,255,.12)", color: ON_DARK, fontSize: F.xs, fontWeight: 700, whiteSpace: "nowrap" }}>
            Make it a job
          </Link>
        )}
        <button onClick={() => setPanel(panel === "shots" ? null : "shots")} className="rounded-lg px-2.5"
          style={{ height: 38, background: failed || held ? T.hiviz : "rgba(255,255,255,.12)", color: failed || held ? T.onHiviz : ON_DARK, fontSize: F.xs, fontWeight: 700, cursor: "pointer" }}>
          {waiting.length ? `${waiting.length} waiting` : shots.length ? "✓ Sent" : "Shots"}
        </button>
      </div>

      {/* The viewfinder */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {!noCamera && <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />}
        {!noCamera && !ready && <div className="absolute inset-0 flex items-center justify-center" style={{ color: DIM, fontSize: F.sm }}>Opening the camera…</div>}
        {noCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: DIM, fontSize: F.sm }}>
            The camera can&apos;t open in the page here.
            <button onClick={() => fallback.current?.click()} className="rounded-lg px-4" style={{ height: 40, background: T.hiviz, color: T.onHiviz, fontWeight: 700, cursor: "pointer" }}>Use the phone&apos;s camera</button>
          </div>
        )}
        {flash && <div className="absolute inset-0" style={{ background: "#fff", opacity: 0.55 }} />}
        {rec && <div className="absolute left-1/2 -translate-x-1/2 rounded px-2" style={{ top: 10, background: "#C0261F", fontWeight: 700, fontSize: F.sm }}>● {secs}s / {VIDEO_MAX_SECONDS}s</div>}
        {msg && <button onClick={() => setMsg(null)} className="absolute left-3 right-3 rounded-lg px-3 py-2 text-left" style={{ bottom: 10, background: "rgba(0,0,0,.75)", fontSize: F.xs }}>{msg} ×</button>}
        {held && !panel && (
          <div className="absolute left-3 right-3 rounded-lg px-3 py-2" style={{ top: 10, background: "rgba(0,0,0,.75)", fontSize: F.xs }}>
            Kept on this phone. {held.error}
          </div>
        )}
        {noteOpen && (
          <div className="absolute left-3 right-3 rounded-lg p-2" style={{ bottom: 10, ...PANEL }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus rows={2} maxLength={2000} placeholder="A note on the next shot"
              className="w-full outline-none" style={{ fontSize: 16, background: "transparent", resize: "none" }} />
            <div className="flex justify-end gap-2"><button onClick={() => { setNote(""); setNoteOpen(false); }} style={{ ...eyebrow, cursor: "pointer" }}>Clear</button>
              <button onClick={() => setNoteOpen(false)} style={{ ...eyebrow, color: T.hivizText, cursor: "pointer" }}>Done</button></div>
          </div>
        )}
        {panel === "place" && <PlacePanel jobsOnly={jobsOnly} nearby={nearby} target={target} sections={sections} section={section} fix={fix}
          onPick={pick} onSection={(s) => { setSection(s); setPanel(null); }} onNewSite={() => setPanel("site")} onClose={() => setPanel(null)} />}
        {panel === "site" && <NewSite fix={fix} onClose={() => setPanel("place")}
          onMade={(s) => { pick({ kind: "site", id: s.id, label: s.label }); void loadNearby(fix); }} />}
        {panel === "shots" && <ShotsPanel shots={shots} onClose={() => setPanel(null)} />}
      </div>

      {/* Tags, Photo · Video, the shutter */}
      <div className="shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}>
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {TAGS.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)} className="rounded-full px-3"
              style={{ height: 28, fontSize: F.xs, fontWeight: 600, cursor: "pointer", background: tag === t ? T.hiviz : "rgba(255,255,255,.12)", color: tag === t ? T.onHiviz : ON_DARK }}>
              {TAG_LABEL[t]}
            </button>
          ))}
          <button onClick={() => setNoteOpen((o) => !o)} aria-label="Note on the next shot" className="rounded-full px-3"
            style={{ height: 28, fontSize: F.xs, fontWeight: 600, cursor: "pointer", background: note ? T.hiviz : "rgba(255,255,255,.12)", color: note ? T.onHiviz : ON_DARK }}>✎ Note</button>
        </div>
        <div className="flex items-center justify-between px-6" style={{ height: 96 }}>
          <button onClick={() => setPanel("shots")} aria-label="Shots on this phone" style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,.12)", cursor: "pointer" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local shot */}
            {lastThumb ? <img src={lastThumb} alt="Last shot" style={{ width: 52, height: 52, objectFit: "cover" }} /> : null}
          </button>
          {mode === "photo" ? (
            <button onClick={() => void snap()} disabled={!ready} aria-label="Take a photo"
              style={{ width: 72, height: 72, borderRadius: 36, border: "4px solid #fff", background: ready ? "rgba(255,255,255,.3)" : "transparent", cursor: "pointer" }} />
          ) : (
            <button onClick={() => (rec ? rec.r.stop() : void startRec())} disabled={!ready} aria-label={rec ? "Stop recording" : "Record a video"}
              className="flex items-center justify-center" style={{ width: 72, height: 72, borderRadius: 36, border: "4px solid #fff", cursor: "pointer" }}>
              <span style={{ width: rec ? 26 : 50, height: rec ? 26 : 50, borderRadius: rec ? 5 : 25, background: "#E0352B", transition: "all .15s" }} />
            </button>
          )}
          <div className="flex flex-col items-center gap-1" style={{ width: 52 }}>
            <button onClick={() => !rec && setMode(mode === "photo" ? "video" : "photo")} style={{ fontSize: F.xs, fontWeight: 700, color: ON_DARK, cursor: "pointer" }}>
              {mode === "photo" ? "Video" : "Photo"}
            </button>
            <button onClick={() => fallback.current?.click()} style={{ fontSize: 10, color: DIM, cursor: "pointer", lineHeight: 1.1 }}>Phone camera</button>
          </div>
        </div>
      </div>
      <input ref={fallback} type="file" accept="image/*,video/*" capture="environment" multiple hidden
        onChange={(e) => { void fromPhone(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/** Where shots go: near here first, then + New site here, sites, jobs, and the inbox. */
function PlacePanel({ jobsOnly, nearby, target, sections, section, fix, onPick, onSection, onNewSite, onClose }: {
  jobsOnly: boolean; nearby: Nearby | null; target: Target; sections: Array<{ id: string; name: string }>; section: { id: string; name: string } | null; fix: Fix | null;
  onPick: (t: Target) => void; onSection: (s: { id: string; name: string } | null) => void; onNewSite: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const low = q.trim().toLowerCase();
  const jobs = (nearby?.jobs ?? []).filter((j) => !low || `${j.title} ${j.customer ?? ""} ${j.address ?? ""}`.toLowerCase().includes(low)).slice(0, 40);
  const sites = (nearby?.sites ?? []).filter((s) => !s.job_id && (!low || `${s.label} ${s.address ?? ""}`.toLowerCase().includes(low))).slice(0, 20);
  const row = (key: string, on: boolean, title: string, sub: string | null, onClick: () => void) => (
    <button key={key} onClick={onClick} className="w-full text-left px-4 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: on ? T.hivizDim : "transparent", cursor: "pointer" }}>
      <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{title}</div>
      {sub && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{sub}</div>}
    </button>
  );
  return (
    <div className="absolute inset-0 flex flex-col" style={PANEL}>
      <div className="flex items-center gap-2 px-4 shrink-0" style={{ height: 48, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex-1" style={{ fontWeight: 700 }}>Where do these go?</div>
        <button onClick={onClose} style={{ ...eyebrow, cursor: "pointer" }}>Close</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {target?.kind === "job" && sections.length > 0 && (
          <div className="px-4 py-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
            <div style={eyebrow}>Section of {target.label}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button onClick={() => onSection(null)} className="rounded-full px-3" style={{ height: 28, fontSize: F.xs, border: `1px solid ${T.hair}`, background: !section ? T.hivizDim : T.card, cursor: "pointer" }}>Whole job</button>
              {sections.map((s) => (
                <button key={s.id} onClick={() => onSection(s)} className="rounded-full px-3" style={{ height: 28, fontSize: F.xs, border: `1px solid ${T.hair}`, background: section?.id === s.id ? T.hivizDim : T.card, cursor: "pointer" }}>{s.name}</button>
              ))}
            </div>
          </div>
        )}
        {nearby?.near.length ? <div className="px-4 pt-3 pb-1" style={eyebrow}>Near you</div> : null}
        {nearby?.near.map((p) => row(`n${p.kind}${p.id}`, target?.id === p.id, p.label, `${p.kind === "job" ? "Job" : "Site"} · ${ago(p.dist_m)} away`, () => onPick({ kind: p.kind, id: p.id, label: p.label })))}
        {jobsOnly ? null : nearby && !nearby.sites_ready ? (
          <div className="px-4 py-3" style={{ fontSize: F.xs, color: T.ink3 }}>New sites switch on with migration 113.</div>
        ) : (
          <button onClick={onNewSite} className="w-full text-left px-4 py-3" style={{ borderBottom: `1px solid ${T.hairSoft}`, color: T.hivizText, fontWeight: 700, fontSize: F.sm, cursor: "pointer" }}>
            + New site here{fix ? "" : " (drop a pin)"}
          </button>
        )}
        {!jobsOnly && row("inbox", !target, "Photo inbox", "No job yet — file them later", () => onPick(null))}
        <div className="px-4 pt-3 pb-1"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={jobsOnly ? "Search your jobs" : "Search jobs and sites"}
          className="w-full rounded-lg px-3 outline-none" style={{ height: 38, fontSize: 16, border: `1px solid ${T.hair}`, background: T.card }} /></div>
        {sites.length > 0 && <div className="px-4 pt-3 pb-1" style={eyebrow}>Sites</div>}
        {sites.map((s) => row(`s${s.id}`, target?.id === s.id, s.label, s.address, () => onPick({ kind: "site", id: s.id, label: s.label })))}
        <div className="px-4 pt-3 pb-1" style={eyebrow}>Open jobs</div>
        {!nearby && <div className="px-4 py-2" style={{ fontSize: F.xs, color: T.ink3 }}>Loading…</div>}
        {jobs.map((j) => row(`j${j.id}`, target?.id === j.id, j.title, [j.customer, j.address].filter(Boolean).join(" · ") || null, () => onPick({ kind: "job", id: j.id, label: j.title })))}
      </div>
    </div>
  );
}

/** + New site here: a pin on satellite, the GPS point first; the address at the pin; a name or not. */
function NewSite({ fix, onClose, onMade }: { fix: Fix | null; onClose: () => void; onMade: (s: { id: string; label: string }) => void }) {
  const [view, setView] = useState<View>(fix ? { lat: fix.lat, lng: fix.lng, zoom: 19 } : { lat: 30.4515, lng: -91.1871, zoom: 12 });
  const [address, setAddress] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState("");
  const [find, setFind] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setLooking(true);
      void fetch(`/api/aerial/suggest?at=${view.lat},${view.lng}`).then((r) => r.json()).then((b) => setAddress(b.address ?? null)).catch(() => setAddress(null)).finally(() => setLooking(false));
    }, 600);
    return () => clearTimeout(t);
  }, [view.lat, view.lng]);
  const search = async () => {
    if (!find.trim()) return;
    const b = await fetch(`/api/aerial/suggest?find=${encodeURIComponent(find)}`).then((r) => r.json()).catch(() => null);
    if (b?.found) setView({ lat: b.found.lat, lng: b.found.lng, zoom: 19 }); else setErr("Couldn't find that address.");
  };
  const save = async () => {
    setSaving(true); setErr(null);
    const r = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: view.lat, lng: view.lng, address, name: name.trim() || null }) });
    const b = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setErr(b.error ?? `HTTP ${r.status}`); return; }
    onMade({ id: b.site.id, label: b.site.label });
  };
  return (
    <div className="absolute inset-0 flex flex-col" style={PANEL}>
      <div className="flex items-center gap-2 px-4 shrink-0" style={{ height: 48, borderBottom: `1px solid ${T.hair}` }}>
        <button onClick={onClose} style={{ ...eyebrow, cursor: "pointer" }}>‹ Back</button>
        <div className="flex-1 text-center" style={{ fontWeight: 700 }}>New site</div>
        <span style={{ width: 40 }} />
      </div>
      <div className="flex gap-2 px-3 py-2 shrink-0">
        <input value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} placeholder="Find an address"
          className="flex-1 rounded-lg px-3 outline-none" style={{ height: 38, fontSize: 16, border: `1px solid ${T.hair}` }} />
        {fix && <button onClick={() => setView({ lat: fix.lat, lng: fix.lng, zoom: 19 })} className="rounded-lg px-2" style={{ height: 38, border: `1px solid ${T.hair}`, fontSize: F.xs, fontWeight: 600, cursor: "pointer" }}>Where I am</button>}
      </div>
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <MapView view={view} onView={setView} mode="sat">
          <div className="absolute pointer-events-none" style={{ left: "50%", top: "50%", transform: "translate(-50%, -100%)" }}>
            <svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 2 23 2 14a13 13 0 0 1 26 0c0 9-13 25-13 25z" fill="#E0352B" stroke="#fff" strokeWidth="2" /><circle cx="15" cy="14" r="4.5" fill="#fff" /></svg>
          </div>
          <ZoomButtons view={view} onView={setView} />
        </MapView>
      </div>
      <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${T.hair}`, paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        <div style={eyebrow}>Address at the pin</div>
        <div style={{ fontSize: F.sm, fontWeight: 600, minHeight: 20, ...clip }}>{looking ? "Looking…" : address ?? "No street address here — the pin is kept"}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Name it (optional)"
          className="w-full rounded-lg px-3 mt-2 outline-none" style={{ height: 38, fontSize: 16, border: `1px solid ${T.hair}` }} />
        {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
        <button onClick={() => void save()} disabled={saving} className="w-full rounded-lg mt-2" style={{ height: 44, background: T.hiviz, color: T.onHiviz, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "Saving…" : "Confirm — start shooting here"}
        </button>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<Shot["state"], string> = { waiting: "Waiting", sending: "Sending…", failed: "Will try again", held: "Kept on this phone", done: "Sent" };

/** Shots on this phone: what is waiting, what was sent this week. */
function ShotsPanel({ shots, onClose }: { shots: Shot[]; onClose: () => void }) {
  const urls = useMemo(() => new Map(shots.filter((s) => s.thumb).map((s) => [s.client_id, URL.createObjectURL(s.thumb as Blob)])), [shots]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const waiting = shots.filter((s) => s.state !== "done").length;
  return (
    <div className="absolute inset-0 flex flex-col" style={PANEL}>
      <div className="flex items-center gap-2 px-4 shrink-0" style={{ height: 48, borderBottom: `1px solid ${T.hair}` }}>
        <div className="flex-1" style={{ fontWeight: 700 }}>{waiting ? `${waiting} waiting to send` : "All sent"}</div>
        {waiting > 0 && <button onClick={() => void retryAll()} style={{ ...eyebrow, color: T.hivizText, cursor: "pointer" }}>Send now</button>}
        <button onClick={onClose} style={{ ...eyebrow, cursor: "pointer" }}>Close</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!shots.length && <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing shot on this phone this week.</div>}
        {shots.map((s) => (
          <div key={s.client_id} className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
            <div style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", background: T.sunk, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local shot */}
              {urls.get(s.client_id) ? <img src={urls.get(s.client_id)} alt="" style={{ width: 48, height: 48, objectFit: "cover" }} /> : null}
            </div>
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{s.kind === "video" ? "Video" : "Photo"} · {s.place ?? "Photo inbox"}{s.tag ? ` · ${TAG_LABEL[s.tag as Tag] ?? s.tag}` : ""}</div>
              <div style={{ fontSize: F.xs, color: s.state === "failed" ? T.red : T.ink3, ...clip }}>
                {new Date(s.taken_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {STATE_LABEL[s.state]}{s.error && s.state !== "done" ? ` — ${s.error}` : ""}
              </div>
            </div>
            {s.state === "done" && s.file_id ? <Link href={`/dashboard/files?file=${s.file_id}`} style={{ ...eyebrow, color: T.hivizText }}>Open</Link>
              : s.state !== "sending" && <button onClick={() => { if (confirm("Throw this shot away? It hasn't been sent.")) void dropShot(s.client_id); }} aria-label="Throw away" style={{ fontSize: 18, color: T.ink3, cursor: "pointer" }}>×</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
