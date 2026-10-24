"use client";
/**
 * Camera links on a job's Summary and a contact card (migration 128): make a
 * link for a person (and a section), put it in their thread with the words
 * (Coy taps Send — §10), copy it, see whether it was opened and how many shots
 * came, turn it off. Everything sent lands in Files on the job and the person.
 */
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { T, F, eyebrow, relTime } from "@/lib/v34/tokens";
import { OrgNameContext } from "@/components/v34/primitives";
import { draftKey } from "@/lib/v34/send-proposal";
import { cameraMessage, expiresLine, linkLine } from "@/lib/camera-link";

interface Link {
  id: string; url: string; job_id: string | null; section_id: string | null; contact_id: string | null; contact_name: string | null;
  expires_at: string; view_count: number; last_viewed_at: string | null; shot_count: number; last_shot_at: string | null;
}
type Person = { id: string; name: string | null; primary?: boolean };

const firstOf = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;

export function CameraLinkCard({ jobId, jobTitle, contactId, people, sections, card }: {
  jobId?: string | null; jobTitle?: string | null; contactId?: string | null;
  people: Person[]; sections?: Array<{ id?: string; name?: string | null }>; card: React.CSSProperties;
}) {
  const router = useRouter();
  const org = useContext(OrgNameContext) ?? "us";
  const [state, setState] = useState<{ supported: boolean; links: Link[] } | null>(null);
  const [who, setWho] = useState<string>(() => people.find((p) => p.primary)?.id ?? people[0]?.id ?? "");
  const [sec, setSec] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const q = jobId ? `job=${jobId}` : `contact=${contactId}`;

  const load = useCallback(() => {
    fetch(`/api/camera-links?${q}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && !j.error) setState(j); }).catch(() => {});
  }, [q]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!who && people.length) void Promise.resolve().then(() => setWho(people.find((p) => p.primary)?.id ?? people[0].id));
  }, [people, who]);

  const named = (s: string | null) => sections?.find((x) => x.id === s)?.name ?? null;
  const personName = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const words = (l: Link) => cameraMessage({ first: firstOf(l.contact_name ?? personName(l.contact_id)), org, job: jobTitle ?? null, section: named(l.section_id), url: l.url });

  const make = async (): Promise<Link | null> => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/camera-links", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId ?? null, contact_id: (jobId ? who : contactId) || null, section_id: sec || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      load();
      return j.link as Link;
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(false); }
  };
  const text = (l: Link) => {
    if (!l.contact_id) { setNote("Pick who it's for first — the words go in their thread."); return; }
    try { localStorage.setItem(draftKey(l.contact_id), JSON.stringify({ channel: "text", text: words(l) })); } catch { setNote(l.url); return; }
    router.push(`/dashboard/messages/${l.contact_id}`);
  };
  const copy = async (l: Link) => {
    try { await navigator.clipboard.writeText(l.url); setNote("Link copied."); } catch { setNote(l.url); }
  };
  const off = async (l: Link) => {
    if (!confirm("Turn this camera link off? Shots already sent stay in Files.")) return;
    setBusy(true);
    await fetch(`/api/camera-links/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) }).catch(() => {});
    setBusy(false); setNote("Link turned off."); load();
  };
  const newAndText = async () => { const l = await make(); if (l) text(l); };

  if (!state) return null;
  const btn: React.CSSProperties = { fontSize: F.xs, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, cursor: "pointer", textDecoration: "none" };
  const sel: React.CSSProperties = { fontSize: 16, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, maxWidth: "100%" };
  const named_sections = (sections ?? []).filter((s) => s.id && s.name);
  return (
    <div style={{ ...card, padding: "10px 12px" }}>
      <div style={{ ...eyebrow, color: T.ink3 }}>Camera link</div>
      <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.45, marginTop: 4 }}>
        {!state.supported ? "A link you text the customer that opens a camera on their phone — photos and video land in Files here. Waits for migration 128."
          : "Text them a link that opens a camera on their phone, no app or login. Their photos and video land in Files here."}
      </div>
      {state.supported && (
        <>
          {state.links.map((l) => (
            <div key={l.id} style={{ borderTop: `1px solid ${T.hairSoft}`, marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: F.sm, fontWeight: 600 }}>
                {l.contact_name ?? personName(l.contact_id) ?? "Anyone with the link"}{named(l.section_id) ? ` · ${named(l.section_id)}` : ""}
              </div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>{linkLine(l, (iso) => relTime(iso) ?? "")} · {expiresLine(l.expires_at)}</div>
              <div className="flex flex-wrap gap-2" style={{ marginTop: 6 }}>
                {l.contact_id && <button style={btn} disabled={busy} onClick={() => text(l)}>Text it</button>}
                <button style={btn} disabled={busy} onClick={() => void copy(l)}>Copy link</button>
                {jobId && l.shot_count > 0 && <a style={btn} href={`/dashboard/scope/${jobId}/files`}>See them in Files</a>}
                <a style={btn} href={l.url} target="_blank" rel="noreferrer">Open ↗</a>
                <button style={{ ...btn, color: T.red }} disabled={busy} onClick={() => void off(l)}>Turn off</button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2" style={{ borderTop: state.links.length ? `1px solid ${T.hairSoft}` : undefined, marginTop: 8, paddingTop: state.links.length ? 8 : 0 }}>
            {jobId && people.length > 1 && (
              <select value={who} onChange={(e) => setWho(e.target.value)} style={sel} aria-label="Who it's for">
                {people.map((p) => <option key={p.id} value={p.id}>{p.name ?? "No name"}</option>)}
              </select>
            )}
            {jobId && named_sections.length > 0 && (
              <select value={sec} onChange={(e) => setSec(e.target.value)} style={sel} aria-label="Section">
                <option value="">The whole job</option>
                {named_sections.map((s) => <option key={s.id} value={s.id as string}>{s.name}</option>)}
              </select>
            )}
            {(jobId ? who : contactId)
              ? <button style={{ ...btn, background: T.hiviz, color: T.onHiviz, border: "none" }} disabled={busy} onClick={() => void newAndText()}>
                  {jobId && people.length === 1 ? `Text ${firstOf(people[0].name) ?? "them"} a camera link` : "Text a camera link"}
                </button>
              : <span style={{ fontSize: F.xs, color: T.ink3 }}>Put a contact on this job first — the link is texted to them.</span>}
          </div>
        </>
      )}
      {note && <div style={{ marginTop: 6, fontSize: F.xs, color: T.ink3, wordBreak: "break-all" }}>{note}</div>}
    </div>
  );
}
