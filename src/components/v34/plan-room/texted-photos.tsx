"use client";
/**
 * The photos the customer texted, brought onto the job (Coy, 2026-10-03: "she
 * texted pictures. I would like to be able to pull those pictures into the plan
 * room"). Since 2026-10-07 it sits in the Files step's Photos folder (Coy: "move
 * this feature … to the photo file in the files tab in each job because it's
 * attached to the customer") — the side panel and its button are gone. A tap
 * brings one in through /api/jobs/[id]/texted-photos.
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { call } from "./shared";

interface Texted { id: string; who: string | null; sent_at: string | null; url: string | null; file_id: string | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function TextedPhotos({ jobId, onAdded }: { jobId: string; onAdded: () => void | Promise<void> }) {
  const [texted, setTexted] = useState<Texted[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTexted = useCallback(async () => {
    try { setTexted(((await call(`/api/jobs/${jobId}/texted-photos`, "GET")) as { photos: Texted[] }).photos); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [jobId]);
  useEffect(() => {
    const t = setTimeout(() => void loadTexted(), 0);
    return () => clearTimeout(t);
  }, [loadTexted]);

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

  const waiting = (texted ?? []).filter((t) => !t.file_id);
  const who = waiting.find((t) => t.who)?.who ?? texted?.find((t) => t.who)?.who ?? "the customer";
  if (texted && !texted.length && !err) return null;
  return (
    <div className="rounded px-3 py-2 mb-3" style={{ border: `1px solid ${T.hair}`, background: T.card }}>
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
        A photo brought in is a file on the job: it shows in Photos, under a section&apos;s Photos when you set its area, and can be the proposal&apos;s cover. The text stays as it was.
      </div>
      {err && <div style={{ fontSize: F.xs, color: T.red, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
