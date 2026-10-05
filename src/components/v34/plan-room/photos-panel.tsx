"use client";
/**
 * Photos beside the plans (Coy, 2026-10-03: "she texted pictures. I would like
 * to be able to pull those pictures into the plan room so that I can compare
 * them to the aerial"). A panel down the right that stays open over any Plan
 * Room step — the takeoff too, full screen or not — with the job's photos one
 * at a time, large, and the photos the customer texted that aren't on the job
 * yet, brought in with a tap (/api/jobs/[id]/texted-photos).
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { call, type PlanFile } from "./shared";

interface Texted { id: string; who: string | null; sent_at: string | null; url: string | null; file_id: string | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function PhotosPanel({ jobId, files, open, onClose, onAdded, over }: {
  jobId: string; files: PlanFile[]; open: boolean; onClose: () => void; onAdded: () => void | Promise<void>; over: boolean;
}) {
  const photos = files.filter((f) => f.kind === "image" && f.url);
  const [i, setI] = useState(0);
  const [texted, setTexted] = useState<Texted[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTexted = useCallback(async () => {
    try { setTexted(((await call(`/api/jobs/${jobId}/texted-photos`, "GET")) as { photos: Texted[] }).photos); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [jobId]);
  useEffect(() => {
    if (!open || texted) return;
    const t = setTimeout(() => void loadTexted(), 0);
    return () => clearTimeout(t);
  }, [open, texted, loadTexted]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => Math.min(photos.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, photos.length]);

  const bring = async (ids: string[] | "all") => {
    setBusy(ids === "all" ? "all" : ids[0]); setErr(null);
    try {
      const r = (await call(`/api/jobs/${jobId}/texted-photos`, "POST", ids === "all" ? { all: true } : { media_ids: ids })) as { added: number; failed: Array<{ reason: string }> };
      if (r.failed.length) setErr(`${r.failed.length} couldn't be brought in: ${r.failed[0].reason}`);
      await onAdded();
      await loadTexted();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  if (!open) return null;
  const cur = photos[Math.min(i, Math.max(0, photos.length - 1))];
  const waiting = (texted ?? []).filter((t) => !t.file_id);
  const who = waiting.find((t) => t.who)?.who ?? texted?.find((t) => t.who)?.who ?? "the customer";
  return (
    <aside aria-label="Photos" className="flex flex-col"
      style={{ position: "fixed", right: 0, top: over ? 0 : "var(--sc-head)", bottom: 0, width: "min(460px, 100vw)", zIndex: 95, background: T.card, borderLeft: `1px solid ${T.hairStrong}`, boxShadow: "-8px 0 24px rgba(42,32,20,.16)" }}>
      <div className="flex items-center gap-2 px-3" style={{ height: 44, borderBottom: `1px solid ${T.hair}`, flex: "0 0 auto" }}>
        <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Photos</span>
        <span style={{ fontSize: F.xs, color: T.ink3 }}>{photos.length ? `${Math.min(i, photos.length - 1) + 1} of ${photos.length}` : "none on this job yet"}</span>
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close photos" style={{ width: 30, height: 30, fontSize: 18, cursor: "pointer", color: T.ink2 }}>×</button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {cur && (
          <div>
            <div className="relative" style={{ background: "#111" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.url ?? ""} alt={cur.name} style={{ width: "100%", maxHeight: "58vh", objectFit: "contain", display: "block" }} />
              {photos.length > 1 && (
                <>
                  <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i <= 0} aria-label="Previous photo"
                    style={{ position: "absolute", left: 6, top: "50%", marginTop: -18, width: 36, height: 36, borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 18, cursor: "pointer", opacity: i <= 0 ? 0.3 : 1 }}>‹</button>
                  <button onClick={() => setI((n) => Math.min(photos.length - 1, n + 1))} disabled={i >= photos.length - 1} aria-label="Next photo"
                    style={{ position: "absolute", right: 6, top: "50%", marginTop: -18, width: 36, height: 36, borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 18, cursor: "pointer", opacity: i >= photos.length - 1 ? 0.3 : 1 }}>›</button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5" style={{ fontSize: F.xs, color: T.ink2 }}>
              <span style={{ flex: 1, minWidth: 0, ...clip }}>{cur.name}</span>
              <a href={cur.url ?? "#"} target="_blank" rel="noreferrer" style={{ color: T.chalk, fontWeight: 600, whiteSpace: "nowrap" }}>Full size ↗</a>
            </div>
            <div className="grid gap-1 px-3 pb-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
              {photos.map((p, n) => (
                <button key={p.id} onClick={() => setI(n)} aria-label={p.name} style={{ aspectRatio: "1", padding: 0, border: `2px solid ${n === i ? T.hiviz : "transparent"}`, borderRadius: 3, overflow: "hidden", cursor: "pointer", background: T.sunk }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hair}` }}>
          <div className="flex items-center gap-2">
            <span style={{ ...eyebrow, color: T.ink3, flex: 1 }}>Texted by {who}</span>
            {waiting.length > 1 && (
              <button onClick={() => void bring("all")} disabled={!!busy}
                style={{ height: 28, padding: "0 10px", borderRadius: 3, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                {busy === "all" ? "Bringing them in…" : `Bring all ${waiting.length} in`}
              </button>
            )}
          </div>
          {texted === null && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>Looking for photos they texted…</div>}
          {texted && !texted.length && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>Nobody on this job has texted a photo.</div>}
          {texted && texted.length > 0 && !waiting.length && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>All {texted.length} texted photos are on the job.</div>}
          {waiting.length > 0 && (
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
              {waiting.map((t) => (
                <div key={t.id} className="rounded overflow-hidden" style={{ border: `1px solid ${T.hair}`, background: T.sunk }}>
                  <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: F.xs, color: T.ink3 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {t.url ? <img src={t.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "not opened yet"}
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-1" style={{ background: T.card }}>
                    <span style={{ flex: 1, fontSize: 10.5, color: T.ink3, ...clip }}>{when(t.sent_at)}</span>
                    <button onClick={() => void bring([t.id])} disabled={!!busy} aria-label="Bring onto the job"
                      style={{ fontSize: 11, fontWeight: 600, color: T.chalk, cursor: "pointer", whiteSpace: "nowrap" }}>{busy === t.id ? "…" : "+ Job"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 8, lineHeight: 1.4 }}>
            A photo brought in is a file on the job: it shows here, under a section&apos;s Photos when you set its area, and can be the proposal&apos;s cover. The text stays as it was.
          </div>
          {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
        </div>
      </div>
    </aside>
  );
}
