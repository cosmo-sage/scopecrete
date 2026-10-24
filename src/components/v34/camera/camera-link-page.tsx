"use client";

/**
 * A customer's camera link — scopecrete.ai/cam/<token>, no login (migration 128;
 * Coy, 2026-10-24: "a customer can just click the link in a text message and open
 * a camera on their phone and capture images and video … uploaded to the files
 * for that job/contact").
 *
 * The Camera page's viewfinder without the picking: where shots go is fixed by
 * the link (its job, section and person). Every shot is kept on the phone first
 * and sent through the same queue (src/lib/v34/capture-queue.ts) to the link's
 * own storage folder as anon, then recorded by /api/cam/<token>.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PHOTO_MAX, THUMB_MAX, VIDEO_MAX_SECONDS, fitWithin } from "@/lib/capture";
import { addShot, retryAll, watchShots, type Shot } from "@/lib/v34/capture-queue";

interface LinkInfo {
  gone: boolean; own?: boolean; org_name: string | null; link_id?: string; org_id?: string;
  job: string | null; address: string | null; section: string | null; first_name: string | null;
  expires_at?: string; shots?: number;
}

const ON_DARK = "#fff";
const DIM = "rgba(255,255,255,.62)";
const ACCENT = "#F2A33A";
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

export function CameraLinkPage({ token }: { token: string }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/cam/${encodeURIComponent(token)}`).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (off) return;
      if (!r.ok) setErr(r.status === 404 ? "This link isn't right — ask for a new one." : String(b.error ?? "This link can't open right now."));
      else setInfo(b as LinkInfo);
    }).catch(() => { if (!off) setErr("No connection — try again in a moment."); });
    return () => { off = true; };
  }, [token]);

  if (err || info?.gone) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <div style={{ fontSize: 40 }}>📷</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{info?.gone ? "This camera link is turned off" : "Can't open this link"}</div>
          <div style={{ color: DIM, fontSize: 14 }}>{info?.gone ? `Ask ${info.org_name ?? "the contractor"} for a new one.` : err}</div>
        </div>
      </Shell>
    );
  }
  if (!info) return <Shell><div className="flex-1 flex items-center justify-center" style={{ color: DIM }}>Opening…</div></Shell>;
  return <Viewfinder token={token} info={info} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 flex flex-col" style={{ background: "#000", color: ON_DARK, fontFamily: "system-ui, sans-serif" }}>{children}</div>;
}

function Viewfinder({ token, info }: { token: string; info: LinkInfo }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [ready, setReady] = useState(false);
  const [noCamera, setNoCamera] = useState(!canShoot());
  const [flash, setFlash] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [list, setList] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [rec, setRec] = useState<{ t0: number; r: MediaRecorder } | null>(null);
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [hello, setHello] = useState(true);

  useEffect(() => watchShots(setShots, token), [token]);

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

  const folder = `${info.org_id}/camera/${info.link_id}`;
  const keep = useCallback(async (blob: Blob, thumb: Blob | null, kind: "image" | "video", mime: string) => {
    setHello(false);
    await addShot({
      client_id: crypto.randomUUID(), kind, mime, blob, thumb, taken_at: new Date().toISOString(),
      lat: null, lng: null, accuracy: null, job_id: null, site_id: null, section_id: null,
      place: info.section ?? info.job, tag: null, note: note.trim() || null,
      link: { token, folder },
    });
    if (note) { setNote(""); setNoteOpen(false); }
  }, [info, note, token, folder]);

  const snap = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setFlash(true); setTimeout(() => setFlash(false), 110);
    const [full, thumb] = await Promise.all([toBlob(drawTo(v, v.videoWidth, v.videoHeight, PHOTO_MAX), 0.82), toBlob(drawTo(v, v.videoWidth, v.videoHeight, THUMB_MAX), 0.7)]);
    if (full) await keep(full, thumb, "image", "image/jpeg");
  };
  const startRec = async () => {
    const s = streamRef.current, v = video.current, mime = recorderMime();
    if (!s || !v || !mime) { setMsg("This browser can't record video here — tap Phone camera instead."); return; }
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

  const fromPhone = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith("video/")) {
        const type = /quicktime|mov/i.test(file.type) ? "video/quicktime" : /webm/.test(file.type) ? "video/webm" : "video/mp4";
        await keep(file, null, "video", type); continue;
      }
      try {
        const bmp = await createImageBitmap(file);
        const [full, thumb] = await Promise.all([toBlob(drawTo(bmp, bmp.width, bmp.height, PHOTO_MAX), 0.82), toBlob(drawTo(bmp, bmp.width, bmp.height, THUMB_MAX), 0.7)]);
        bmp.close();
        if (full) await keep(full, thumb, "image", "image/jpeg");
      } catch { setMsg(`Couldn't read ${file.name} — try the camera here instead.`); }
    }
  };

  const waiting = shots.filter((s) => s.state !== "done");
  const sent = shots.length - waiting.length;
  const trouble = shots.find((s) => s.state === "held" || s.state === "failed");
  const lastShot = shots[0];
  const lastThumb = useMemo(() => (lastShot?.thumb ? URL.createObjectURL(lastShot.thumb) : null), [lastShot]);
  useEffect(() => () => { if (lastThumb) URL.revokeObjectURL(lastThumb); }, [lastThumb]);
  const where = [info.job, info.section].filter(Boolean).join(" · ");

  return (
    <Shell>
      <div className="flex items-center gap-2 px-3 shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)", paddingBottom: 6 }}>
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Photos for {info.org_name ?? "your contractor"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{where || "Your job"}</div>
        </div>
        <button onClick={() => setList(!list)} className="rounded-lg px-3"
          style={{ height: 36, background: trouble ? ACCENT : "rgba(255,255,255,.14)", color: trouble ? "#000" : ON_DARK, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {waiting.length ? `Sending ${waiting.length}…` : sent ? `✓ ${sent} sent` : "Sent"}
        </button>
      </div>

      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {!noCamera && <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />}
        {!noCamera && !ready && <div className="absolute inset-0 flex items-center justify-center" style={{ color: DIM, fontSize: 14 }}>Opening the camera…</div>}
        {noCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: DIM, fontSize: 14 }}>
            The camera can&apos;t open in this page. Allow the camera, or use your phone&apos;s own.
            <button onClick={() => fallback.current?.click()} className="rounded-lg px-4" style={{ height: 44, background: ACCENT, color: "#000", fontWeight: 700, cursor: "pointer" }}>Use my phone&apos;s camera</button>
          </div>
        )}
        {flash && <div className="absolute inset-0" style={{ background: "#fff", opacity: 0.55 }} />}
        {rec && <div className="absolute left-1/2 -translate-x-1/2 rounded px-2" style={{ top: 10, background: "#C0261F", fontWeight: 700, fontSize: 14 }}>● {secs}s / {VIDEO_MAX_SECONDS}s</div>}
        {hello && !list && (
          <button onClick={() => setHello(false)} className="absolute left-3 right-3 rounded-lg px-3 py-2.5 text-left" style={{ top: 10, background: "rgba(0,0,0,.72)", fontSize: 13, lineHeight: 1.35 }}>
            {info.first_name ? `Hi ${info.first_name}. ` : "Hi. "}Take photos or video of the work area — they go straight to {info.org_name ?? "your contractor"}.
            {info.own ? <span style={{ color: ACCENT }}> (You&apos;re signed in to this company — shots you take here still land on the job.)</span> : null} ×
          </button>
        )}
        {msg && <button onClick={() => setMsg(null)} className="absolute left-3 right-3 rounded-lg px-3 py-2 text-left" style={{ bottom: 10, background: "rgba(0,0,0,.78)", fontSize: 13 }}>{msg} ×</button>}
        {trouble && !list && !msg && (
          <button onClick={() => void retryAll()} className="absolute left-3 right-3 rounded-lg px-3 py-2 text-left" style={{ bottom: 10, background: "rgba(0,0,0,.78)", fontSize: 13 }}>
            Some shots are waiting on this phone{trouble.error ? ` (${trouble.error})` : ""}. Keep this page open or tap to try again.
          </button>
        )}
        {noteOpen && (
          <div className="absolute left-3 right-3 rounded-lg p-2" style={{ bottom: 10, background: "#fff", color: "#111" }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus rows={2} maxLength={2000} placeholder="A note on the next shot (optional)"
              className="w-full outline-none" style={{ fontSize: 16, background: "transparent", resize: "none" }} />
            <div className="flex justify-end gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
              <button onClick={() => { setNote(""); setNoteOpen(false); }} style={{ cursor: "pointer" }}>Clear</button>
              <button onClick={() => setNoteOpen(false)} style={{ cursor: "pointer", color: "#B4621A" }}>Done</button>
            </div>
          </div>
        )}
        {list && <ShotList shots={shots} onClose={() => setList(false)} />}
      </div>

      <div className="shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}>
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {(["photo", "video"] as const).map((m) => (
            <button key={m} onClick={() => !rec && setMode(m)} className="rounded-full px-4"
              style={{ height: 30, fontSize: 13, fontWeight: 700, cursor: "pointer", background: mode === m ? ACCENT : "rgba(255,255,255,.14)", color: mode === m ? "#000" : ON_DARK }}>
              {m === "photo" ? "Photo" : "Video"}
            </button>
          ))}
          <button onClick={() => setNoteOpen((o) => !o)} className="rounded-full px-3"
            style={{ height: 30, fontSize: 13, fontWeight: 600, cursor: "pointer", background: note ? ACCENT : "rgba(255,255,255,.14)", color: note ? "#000" : ON_DARK }}>✎ Note</button>
        </div>
        <div className="flex items-center justify-between px-6" style={{ height: 96 }}>
          <button onClick={() => setList(true)} aria-label="Your shots" style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,.14)", cursor: "pointer" }}>
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
          <button onClick={() => fallback.current?.click()} className="flex flex-col items-center" style={{ width: 52, fontSize: 11, color: DIM, cursor: "pointer", lineHeight: 1.15 }}>
            <span style={{ fontSize: 20 }}>🖼</span>Phone camera
          </button>
        </div>
      </div>
      <input ref={fallback} type="file" accept="image/*,video/*" multiple hidden
        onChange={(e) => { void fromPhone(e.target.files); e.target.value = ""; }} />
    </Shell>
  );
}

const STATE: Record<Shot["state"], string> = { waiting: "Waiting", sending: "Sending…", failed: "Will try again", held: "Kept on this phone", done: "Sent ✓" };

function ShotList({ shots, onClose }: { shots: Shot[]; onClose: () => void }) {
  const urls = useMemo(() => new Map(shots.filter((s) => s.thumb).map((s) => [s.client_id, URL.createObjectURL(s.thumb as Blob)])), [shots]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const waiting = shots.filter((s) => s.state !== "done").length;
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#fff", color: "#111" }}>
      <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: 48, borderBottom: "1px solid #e5e5e5" }}>
        <div className="flex-1" style={{ fontWeight: 700 }}>{waiting ? `${waiting} sending` : shots.length ? "All sent" : "Your shots"}</div>
        {waiting > 0 && <button onClick={() => void retryAll()} style={{ fontSize: 13, fontWeight: 700, color: "#B4621A", cursor: "pointer" }}>Send now</button>}
        <button onClick={onClose} style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Close</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!shots.length && <div className="px-4 py-6" style={{ fontSize: 14, color: "#666" }}>Nothing yet — take a photo or a video.</div>}
        {shots.map((s) => (
          <div key={s.client_id} className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", background: "#eee", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local shot */}
              {urls.get(s.client_id) ? <img src={urls.get(s.client_id)} alt="" style={{ width: 48, height: 48, objectFit: "cover" }} /> : null}
            </div>
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.kind === "video" ? "Video" : "Photo"}{s.note ? ` — ${s.note}` : ""}</div>
              <div style={{ fontSize: 12, color: s.state === "failed" || s.state === "held" ? "#C0261F" : "#666" }}>
                {new Date(s.taken_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {STATE[s.state]}{s.error && s.state !== "done" ? ` — ${s.error}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
