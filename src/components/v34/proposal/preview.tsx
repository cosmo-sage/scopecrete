"use client";
/**
 * Preview & send (Coy, 2026-10-03: "Mark final should be changed to: 'Preview'.
 * And it should open another panel with the preview of the proposal that the
 * customer would see when I send it. And I should have the option to send the
 * proposal via text and email … track every time the customer views the
 * proposal").
 *
 * The panel draws the document exactly as the customer gets it (read-only —
 * hidden sections, groups and lines gone), as a phone or a desktop. Sending
 * freezes the draft as a final version (the same server check as before), makes
 * its link (migration 075) with each area's map frozen as a picture, and opens
 * Coy's own Messages or mail app with the words — ScopeCrete sends nothing
 * (DECISIONS §10). Every time the customer opens the link it is listed here.
 */
import React, { useCallback, useEffect, useState } from "react";
import { T, disp, strong, nums } from "@/lib/v34/tokens";
import { ProposalDocument, type DocVM } from "./document";
import { mapPicture } from "./area-visuals";
import { sendBytes } from "@/components/v34/files-panel";
import { linkMessage, signedLine, smsHref, viewLine } from "@/lib/proposal-links";
import { firstName, startingWords, type SendExample, type Via } from "@/lib/proposal-send";
import { proposalLink, sendProposal } from "@/lib/v34/send-proposal";

export interface PropLink {
  id: string; url: string; status: string; decided_name?: string | null; decided_at?: string | null; sent_at: string | null; sent_via: string[]; view_count: number;
  first_viewed_at: string | null; last_viewed_at: string | null; revoked_at: string | null; created_at: string;
  version: { version: number } | null;
  /** SE-26-0001-A (src/lib/proposal-number.ts). */
  number?: string | null;
  events?: Array<{ event: string; occurred_at: string; user_agent: string | null }>;
}

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const device = (ua: string | null) => {
  if (!ua) return "";
  if (/iPhone/i.test(ua)) return "iPhone"; if (/iPad/i.test(ua)) return "iPad"; if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac"; if (/Windows/i.test(ua)) return "Windows"; return "a browser";
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ProposalPreview({ jobId, vm, draft, version, blocked, coverFileId, onFinalize, onClose, links, onLinks }: {
  jobId: string; vm: DocVM; draft: boolean; version: number; blocked: string | null; coverFileId: string | null;
  /** Freeze the draft (the old Mark final, without its prompt). */
  onFinalize: () => Promise<void>;
  onClose: () => void;
  links: PropLink[]; onLinks: () => void;
}) {
  const [view, setView] = useState<"phone" | "desktop">(() => (typeof window !== "undefined" && window.innerWidth < 900 ? "phone" : "desktop"));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const live = links.find((l) => !l.revoked_at && l.status !== "void" && l.version?.version === version) ?? null;
  // The words go with the send (2026-10-05): they start from how Coy sent the last one, and he can change them.
  const [via, setVia] = useState<Via>("text");
  const [examples, setExamples] = useState<SendExample[] | null>(null);
  const [words, setWords] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [sentMsg, setSentMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/proposal-sends").then((r) => r.json()).then((b) => { if (!off) setExamples(b.examples ?? []); }).catch(() => { if (!off) setExamples([]); });
    return () => { off = true; };
  }, []);
  const start = examples ? startingWords(examples, via, { first: firstName(vm.customer.name), title: vm.job.title, url: "{link}", org: vm.org.name }) : null;
  const shownWords = words ?? start?.body ?? "";
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const ensureLink = useCallback(async (): Promise<PropLink> => {
    if (live) return live;
    if (draft) { setBusy("Freezing this version…"); await onFinalize(); }
    setBusy("Making the link…");
    // What shows beside the words: each area's photos and its map (frozen as a picture).
    const d = vm.display;
    const photos: Record<string, string[]> = {};
    const maps: string[] = [];
    if (!d.hide_area_pics) for (const a of vm.areas) {
      const v = vm.visuals?.[a.id];
      if (!v || d.picsOff?.[a.id]) continue;
      if (v.photos.length) photos[a.id] = v.photos.slice(0, 4).map((p) => p.id);
      if (v.map) maps.push(a.id);
    }
    const r = await call(`/api/jobs/${jobId}/proposal/link`, "POST", { cover_file_id: d.off?.cover ? null : coverFileId, photos, maps });
    const ups = (r.uploads ?? []) as Array<{ area_id: string; signed_url: string }>;
    for (const [i, u] of ups.entries()) {
      const map = vm.visuals?.[u.area_id]?.map;
      if (!map) continue;
      setBusy(`Drawing the maps… ${i + 1} of ${ups.length}`);
      try {
        const blob = await mapPicture(map);
        await sendBytes(u.signed_url, new File([blob], "map.jpg", { type: "image/jpeg" }), () => {});
      } catch { /* the page shows the area without its map */ }
    }
    onLinks();
    return r.link as PropLink;
  }, [live, draft, onFinalize, vm, jobId, coverFileId, onLinks]);

  const send = async (how: "quo" | "messages" | "email" | "copy") => {
    setErr(null); setSentMsg(null);
    try {
      const link = await ensureLink();
      if (how === "copy") {
        await navigator.clipboard.writeText(link.url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2500);
        await call(`/api/proposal-links/${link.id}`, "PATCH", { sent: "copy" }).catch(() => {});
      } else if (how === "messages") {
        // The old way: Coy's own Messages app with the words.
        const m = linkMessage({ customer: vm.customer.name, org: vm.org.name, title: vm.job.title, url: link.url });
        window.location.href = smsHref(vm.customer.phone, words ? shownWords.replace(/\{link\}/g, link.url) : m.body);
        await call(`/api/proposal-links/${link.id}`, "PATCH", { sent: "text" }).catch(() => {});
      } else {
        setBusy(how === "quo" ? "Sending through Quo…" : "Opening your mail…");
        const r = await proposalLink(jobId); // the link just made (or the live one), with who it is for
        const out = await sendProposal({ jobId, via: how === "quo" ? "text" : "email", body: shownWords, subject: subject || start?.subject || null, email: vm.customer.email, link: r, names: [vm.customer.name] });
        setSentMsg(out);
      }
      onLinks();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Turn this link off? The customer will see that it's no longer available.")) return;
    try { await call(`/api/proposal-links/${id}`, "PATCH", { revoke: true }); onLinks(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const btn = (on: boolean): React.CSSProperties => ({ height: 36, padding: "0 14px", borderRadius: 3, fontFamily: disp, fontSize: 12.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
    background: on ? "#B85A3C" : T.card, color: on ? "#fff" : T.ink3, border: on ? "none" : `1px solid ${T.hair}`, cursor: on ? "pointer" : "default" });
  const seg = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 10px", fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: "none", cursor: "pointer" });
  const canSend = !blocked && !busy;
  const older = links.filter((l) => l !== live);

  return (
    <div className="sc-no-print fixed inset-0 flex flex-col" style={{ zIndex: 70, background: "var(--sc-doc-ground, #E9E4DA)" }} role="dialog" aria-label="Preview the proposal">
      <div className="flex items-center gap-2 flex-wrap" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "8px 12px" }}>
        <div className="flex-1" style={{ minWidth: 160 }}>
          <div style={{ fontFamily: strong, fontWeight: 600, fontSize: 14, color: T.ink }}>Preview · {vm.number}</div>
          <div style={{ fontSize: 11.5, color: T.ink3 }}>Exactly what {vm.customer.name ?? "the customer"} will see — hidden sections, groups and lines are gone.</div>
        </div>
        <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
          <button type="button" onClick={() => setView("phone")} style={seg(view === "phone")} aria-pressed={view === "phone"}>Phone</button>
          <button type="button" onClick={() => setView("desktop")} style={{ ...seg(view === "desktop"), borderLeft: `1px solid ${T.hair}` }} aria-pressed={view === "desktop"}>Desktop</button>
        </span>
        <button type="button" onClick={onClose} aria-label="Close the preview" className="rounded" style={{ width: 32, height: 32, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, fontSize: 18, cursor: "pointer" }}>×</button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row" style={{ minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto" style={{ padding: view === "phone" ? "16px 8px 40px" : "20px 16px 60px", minHeight: 0 }}>
          <div style={{ maxWidth: view === "phone" ? 390 : 720, margin: "0 auto", border: view === "phone" ? `8px solid ${T.ink}` : "none", borderRadius: view === "phone" ? 22 : 0, overflow: "hidden", background: "#fff" }}>
            <ProposalDocument vm={vm} edits={null} narrow={view === "phone"} />
          </div>
        </div>

        <aside className="shrink-0 overflow-y-auto w-full lg:w-[340px] max-h-[45dvh] lg:max-h-none" style={{ background: T.card, borderTop: `1px solid ${T.hair}`, borderLeft: `1px solid ${T.hair}`, padding: "12px 14px" }}>
          <div style={{ fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink }}>Send to {vm.customer.name ?? "the customer"}</div>
          {blocked
            ? <div className="mt-2" style={{ fontSize: 12.5, color: "#8E2B1C", background: "#F7DCD6", borderRadius: 4, padding: "8px 10px" }}>Can&apos;t send yet — {blocked}</div>
            : draft && <div className="mt-1" style={{ fontSize: 12, color: T.ink3 }}>Sending freezes this as version {version}. Changes after that start version {version + 1}, with its own link.</div>}
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
              <button type="button" onClick={() => { setVia("text"); setWords(null); }} style={seg(via === "text")} aria-pressed={via === "text"}>Text</button>
              <button type="button" onClick={() => { setVia("email"); setWords(null); }} style={{ ...seg(via === "email"), borderLeft: `1px solid ${T.hair}` }} aria-pressed={via === "email"}>Email</button>
            </span>
            <span style={{ fontSize: 11, color: T.ink3 }}>{via === "text" ? (vm.customer.phone ? `through Quo to ${vm.customer.phone}` : "no phone on file") : vm.customer.email ? `your mail, to ${vm.customer.email}` : "your mail — no email on file"}</span>
          </div>
          {via === "email" && <input value={subject || start?.subject || ""} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className="mt-2 w-full"
            style={{ height: 32, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12.5, padding: "0 8px" }} />}
          <textarea value={shownWords} onChange={(e) => setWords(e.target.value)} rows={4} aria-label="The words that go with the link" className="mt-2 w-full"
            style={{ border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12.5, lineHeight: 1.4, padding: "6px 8px", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ fontSize: 11, color: T.ink3 }}>{"{link}"} becomes the link.{start?.learned ? " Started from how you sent the last one." : ""} Dusty learns from what you send.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {via === "text"
              ? <button type="button" disabled={!canSend || !vm.customer.phone} onClick={() => void send("quo")} style={btn(canSend && !!vm.customer.phone)} title={vm.customer.phone ? `Sends through Quo to ${vm.customer.phone}` : "No phone number on the customer"}>Send text</button>
              : <button type="button" disabled={!canSend} onClick={() => void send("email")} style={btn(canSend)} title="Opens your mail with the words and the link">Email it</button>}
            <button type="button" disabled={!canSend} onClick={() => void send("copy")} style={{ ...btn(false), color: canSend ? T.ink : T.ink3, border: `1px solid ${T.hairStrong}`, cursor: canSend ? "pointer" : "default" }}>{copied ? "Copied ✓" : "Copy link"}</button>
          </div>
          <div className="mt-1.5" style={{ fontSize: 11, color: T.ink3 }}>
            {via === "text" ? <>Send text goes through Quo from your line. {vm.customer.phone && <button type="button" onClick={() => void send("messages")} disabled={!canSend} style={{ border: 0, background: "transparent", padding: 0, color: T.chalk, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Or open it in your Messages app</button>}</>
              : "Email opens your own mail app with everything filled in — you press send."}
          </div>
          {sentMsg && <div className="mt-2" style={{ fontSize: 12, color: sentMsg.ok ? "#1F5C3A" : T.red }}>{sentMsg.text}</div>}
          {busy && <div className="mt-2" style={{ fontSize: 12, color: T.ink2 }}>{busy}</div>}
          {err && <div className="mt-2" style={{ fontSize: 12, color: T.red }}>{err}</div>}

          {live && (
            <div className="mt-3" style={{ borderTop: `1px solid ${T.hairSoft}`, paddingTop: 10 }}>
              <div style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink3 }}>The link · {live.number ?? `v${version}`}</div>
              <a href={live.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.chalk, overflowWrap: "anywhere" }}>{live.url}</a>
              <div className="mt-1" style={{ fontSize: 12.5, color: T.ink }}>
                <div>{live.sent_at ? `Sent ${when(live.sent_at)}${live.sent_via.length ? ` · ${live.sent_via.map((v) => (v === "copy" ? "link copied" : v === "text" ? "by text" : "by email")).join(", ")}` : ""}` : "Not sent yet"}</div>
                <b style={{ color: live.view_count ? "#1F5C3A" : T.ink2 }}>{viewLine(live)}</b>
                {signedLine(live) && <div style={{ color: "#1F5C3A", fontWeight: 700 }}>✓ {signedLine(live)}</div>}
              </div>
              {(live.events ?? []).length > 0 && (
                <ul className="mt-1" style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, color: T.ink2 }}>
                  {(live.events ?? []).map((e, i) => <li key={i} style={nums}>{e.event === "accepted" ? "Signed" : "Opened"} {when(e.occurred_at)}{device(e.user_agent) ? ` · ${device(e.user_agent)}` : ""}</li>)}
                </ul>
              )}
              <div className="mt-1" style={{ fontSize: 11, color: T.ink3 }}>Opening it yourself while signed in isn&apos;t counted.</div>
              {live.status !== "accepted" && <button type="button" onClick={() => void revoke(live.id)} className="mt-2" style={{ fontSize: 11.5, color: T.red, border: 0, background: "transparent", cursor: "pointer", padding: 0 }}>Turn this link off</button>}
            </div>
          )}
          {older.length > 0 && (
            <details className="mt-3" style={{ fontSize: 12, color: T.ink2 }}>
              <summary style={{ cursor: "pointer" }}>Earlier links ({older.length})</summary>
              {older.map((l) => (
                <div key={l.id} style={{ marginTop: 4 }}>{l.number ?? `v${l.version?.version ?? "?"}`} · {l.revoked_at ? "turned off" : l.status === "void" ? "replaced" : l.status} · {viewLine(l)}</div>
              ))}
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
