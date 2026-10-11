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
import React, { useEffect, useState } from "react";
import { T, disp, strong, nums } from "@/lib/v34/tokens";
import { ProposalDocument, type DocVM } from "./document";
import { mapPicture } from "./area-visuals";
import { sendBytes } from "@/components/v34/files-panel";
import { linkMessage, signedLine, smsHref, viewLine } from "@/lib/proposal-links";
import { firstName, greetingSlot, startingWords, type SendExample, type Via } from "@/lib/proposal-send";
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
/** Someone the proposal can go to: one of the customer's people, or one of Coy's own (Coy, 2026-10-10). */
interface Who { key: string; contact_id: string | null; name: string | null; phone: string | null; email: string | null; note: string | null; internal: boolean }
const fmtPhone = (p: string) => p.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

const openUrl = (u: string) => { window.location.href = u; };

/** A text to each person ticked, one after another; what happened to each, in one line. */
async function textEach(list: Who[], step: (i: number) => void, one: (w: Who) => Promise<{ ok: boolean; text: string }>) {
  const said: string[] = [];
  let ok = true;
  for (let i = 0; i < list.length; i++) {
    step(i);
    const out = await one(list[i]);
    ok = ok && out.ok;
    said.push(list.length > 1 ? `${list[i].name ?? "?"}: ${out.text}` : out.text);
  }
  return { ok, text: said.join(" · ") };
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ProposalPreview({ jobId, vm, draft, version, blocked: blockedIn, coverFileId, onFinalize, onClose, links, onLinks, onOpenVersion }: {
  jobId: string; vm: DocVM; draft: boolean; version: number; blocked: string | null; coverFileId: string | null | undefined;
  /** Show another version on the Proposal tab — the signed one, when this older one can't go out. */
  onOpenVersion?: (version: number) => void;
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
  // An older version picked on the Proposal tab goes out again on its own link (Coy, 2026-10-11) —
  // unless the customer signed a newer one: then that is the one to send.
  const signedNewer = !draft && !live ? links.find((l) => !l.revoked_at && l.status === "accepted" && (l.version?.version ?? 0) > version) ?? null : null;
  const replaces = !draft && !live && !signedNewer ? links.find((l) => !l.revoked_at && l.status !== "void" && (l.version?.version ?? 0) !== version) ?? null : null;
  const blocked = blockedIn ?? (signedNewer ? `the customer signed ${signedNewer.number ?? `version ${signedNewer.version?.version}`} — send that one, or start a new version` : null);
  // The words go with the send (2026-10-05): they start from how Coy sent the last one, and he can change them.
  const [via, setVia] = useState<Via>("text");
  const [examples, setExamples] = useState<SendExample[] | null>(null);
  const [words, setWords] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [sentMsg, setSentMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Who it goes to (Coy, 2026-10-10: "select which of the customer contacts I send the quote to via text …
  // select multiple contacts inside the customer or internal users"). The job's person is ticked to start.
  const [people, setPeople] = useState<Who[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    let off = false;
    fetch(`/api/jobs/${jobId}/proposal/recipients`).then((r) => r.json()).then((b) => {
      if (off) return;
      const c = ((b.contacts ?? []) as Array<{ contact_id: string; name: string | null; phone: string | null; email: string | null; role: string | null }>)
        .map((x): Who => ({ key: `c:${x.contact_id}`, contact_id: x.contact_id, name: x.name, phone: x.phone, email: x.email, note: x.role, internal: false }));
      const m = ((b.members ?? []) as Array<{ user_id: string; name: string | null; email: string | null; role: string; contact_id: string | null; phone: string | null }>)
        .filter((x) => !c.some((y) => y.contact_id && y.contact_id === x.contact_id))
        .map((x): Who => ({ key: `u:${x.user_id}`, contact_id: x.contact_id, name: x.name ?? x.email, phone: x.phone, email: x.email, note: x.role === "field" ? "Onsite estimator" : x.role === "owner" ? "Owner" : "Member", internal: true }));
      setPeople([...c, ...m]);
      setPicked(new Set(c.length ? [c[0].key] : []));
    }).catch(() => { if (!off) setPeople([]); });
    return () => { off = true; };
  }, [jobId]);
  const chosen = (people ?? []).filter((w) => picked.has(w.key));
  const textable = chosen.filter((w) => w.contact_id && w.phone);
  const mailable = chosen.filter((w) => w.email);
  const flip = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  useEffect(() => {
    let off = false;
    fetch("/api/proposal-sends").then((r) => r.json()).then((b) => { if (!off) setExamples(b.examples ?? []); }).catch(() => { if (!off) setExamples([]); });
    return () => { off = true; };
  }, []);
  // Greet the person, not the company ("Hi Gulfline" — Coy, 2026-10-10), and show the real link once there is one.
  const greet = vm.customer.person ?? vm.customer.name;
  const start = examples ? startingWords(examples, via, { first: firstName(greet), title: vm.job.title, url: live?.url ?? "{link}", org: vm.org.name, names: [vm.customer.name, vm.customer.person] }) : null;
  const shownWords = words ?? start?.body ?? "";
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const ensureLink = async (): Promise<PropLink> => {
    // A link already made is sent again; asking the server for it brings in photos filed on the areas
    // since (2026-10-11). A signed one stays exactly as signed.
    if (live && live.status === "accepted") return live;
    if (draft && !live) { setBusy("Freezing this version…"); await onFinalize(); }
    setBusy(live ? "Updating the link's photos…" : "Making the link…");
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
    const r = await call(`/api/jobs/${jobId}/proposal/link`, "POST", { cover_file_id: d.off?.cover ? null : coverFileId ?? undefined, photos, maps, ...(draft ? {} : { version }) });
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
  };

  const send = async (how: "quo" | "messages" | "email" | "copy") => {
    setErr(null); setSentMsg(null);
    try {
      const link = await ensureLink();
      if (how === "copy") {
        // Only say Copied when it was: a failed write left whatever was on the clipboard before (Coy pasted an invite link, 2026-10-10).
        const ok = await navigator.clipboard.writeText(link.url).then(() => true, () => false);
        if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
        else setErr(`Couldn't copy — select the link below and copy it: ${link.url}`);
        await call(`/api/proposal-links/${link.id}`, "PATCH", { sent: "copy" }).catch(() => {});
      } else if (how === "messages") {
        // The old way: Coy's own Messages app with the words.
        const m = linkMessage({ customer: vm.customer.name, org: vm.org.name, title: vm.job.title, url: link.url });
        openUrl(smsHref(textable[0]?.phone ?? vm.customer.phone, words ? shownWords.replace(/\{link\}/g, link.url) : m.body));
        await call(`/api/proposal-links/${link.id}`, "PATCH", { sent: "text" }).catch(() => {});
      } else if (how === "quo") {
        // A text each, through Quo, greeting each by their own first name.
        const r = await proposalLink(jobId, draft ? null : version); // the link just made (or the live one), with who it is for
        setSentMsg(await textEach(textable, (i) => setBusy(`Sending through Quo… ${i + 1} of ${textable.length}`),
          (w) => sendProposal({ jobId, via: "text", body: greetingSlot(shownWords), contactId: w.contact_id, contactName: w.name, link: r, names: [vm.customer.name, vm.customer.person] })));
      } else {
        // One email to everyone ticked; with several the greeting carries no name.
        setBusy("Opening your mail…");
        const r = await proposalLink(jobId, draft ? null : version);
        const one = mailable.length === 1 ? mailable[0] : null;
        const body = one ? greetingSlot(shownWords) : greetingSlot(shownWords).replace(/\{first\}/g, "").replace(/[ \t]+([,.!?])/g, "$1");
        const out = await sendProposal({ jobId, via: "email", body, subject: subject || start?.subject || null, email: mailable.map((w) => w.email).join(","),
          contactId: one?.contact_id ?? null, contactName: one?.name ?? null, link: r, names: [vm.customer.name, vm.customer.person] });
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
  // Sent already: the same buttons resend it (Coy, 2026-10-11: "I don't see a way to resend proposals").
  const again = !!live?.sent_at;
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
          <div style={{ fontFamily: disp, fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink }}>Send to</div>
          {people === null ? <div className="mt-1" style={{ fontSize: 12, color: T.ink3 }}>Loading who it can go to…</div>
            : people.length === 0 ? <div className="mt-1" style={{ fontSize: 12, color: T.ink3 }}>Nobody on this job or its customer yet.</div>
            : (
              <div className="mt-1 flex flex-col" style={{ gap: 2 }}>
                {people.map((w, i) => {
                  const can = via === "text" ? !!(w.contact_id && w.phone) : !!w.email;
                  return (
                    <React.Fragment key={w.key}>
                      {w.internal && !people[i - 1]?.internal && <div className="mt-1.5" style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>Your team</div>}
                      <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: can ? T.ink : T.ink3, cursor: "pointer", padding: "3px 0" }}>
                        <input type="checkbox" checked={picked.has(w.key)} onChange={() => flip(w.key)} />
                        <span className="min-w-0 flex-1">
                          <b style={{ fontWeight: 600 }}>{w.name ?? "No name"}</b>{w.note ? <span style={{ color: T.ink3 }}> · {w.note}</span> : null}
                          <span className="block" style={{ fontSize: 11, color: T.ink3 }}>
                            {via === "text" ? (w.phone && w.contact_id ? fmtPhone(w.phone) : "no phone to text") : (w.email ?? "no email on file")}
                          </span>
                        </span>
                      </label>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          {blocked
            ? <div className="mt-2" style={{ fontSize: 12.5, color: "#8E2B1C", background: "#F7DCD6", borderRadius: 4, padding: "8px 10px" }}>
                Can&apos;t send {signedNewer && !blockedIn ? "this version" : "yet"} — {blocked}
                {signedNewer && !blockedIn && onOpenVersion && signedNewer.version && (
                  <button type="button" onClick={() => onOpenVersion(signedNewer.version!.version)} style={{ display: "block", marginTop: 6, border: 0, background: "transparent", padding: 0, color: T.chalk, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                    Open {signedNewer.number ?? `version ${signedNewer.version.version}`} to copy or resend it ›
                  </button>
                )}
              </div>
            : again
              ? <div className="mt-1" style={{ fontSize: 12, color: T.ink2 }}>{live?.status === "accepted"
                  ? "Signed by the customer. Resending shows them the signed copy; photos added since go on a New version."
                  : `Sent ${when(live!.sent_at!)}. Resending uses the same link, with any photos added to its sections since.`}</div>
              : replaces ? <div className="mt-1" style={{ fontSize: 12, color: T.ink2 }}>This version&apos;s link was replaced by {replaces.number ?? `version ${replaces.version?.version}`}. Sending it again makes it the customer&apos;s link, and {replaces.number ?? "that one"} shows them &quot;replaced&quot;.</div>
              : draft && <div className="mt-1" style={{ fontSize: 12, color: T.ink3 }}>Sending freezes this as version {version}. Changes after that start version {version + 1}, with its own link.</div>}
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
              <button type="button" onClick={() => { setVia("text"); setWords(null); }} style={seg(via === "text")} aria-pressed={via === "text"}>Text</button>
              <button type="button" onClick={() => { setVia("email"); setWords(null); }} style={{ ...seg(via === "email"), borderLeft: `1px solid ${T.hair}` }} aria-pressed={via === "email"}>Email</button>
            </span>
            <span style={{ fontSize: 11, color: T.ink3 }}>{via === "text"
              ? (textable.length ? `through Quo, a text to each of ${textable.length}` : "tick someone with a phone")
              : mailable.length ? `your mail, one email to ${mailable.length}` : "your mail — tick someone with an email"}</span>
          </div>
          {via === "email" && <input value={subject || start?.subject || ""} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className="mt-2 w-full"
            style={{ height: 32, border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12.5, padding: "0 8px" }} />}
          <textarea value={shownWords} onChange={(e) => setWords(e.target.value)} rows={4} aria-label="The words that go with the link" className="mt-2 w-full"
            style={{ border: `1px solid ${T.hair}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: 12.5, lineHeight: 1.4, padding: "6px 8px", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ fontSize: 11, color: T.ink3 }}>{live ? "" : "{link} becomes the link once it's made."}{start?.learned ? " Started from how you sent the last one." : ""} Dusty learns from what you send.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {via === "text"
              ? <button type="button" disabled={!canSend || !textable.length} onClick={() => void send("quo")} style={btn(canSend && !!textable.length)} title={textable.length ? `Sends through Quo to ${textable.map((w) => w.name).join(", ")}` : "Tick someone with a phone"}>{textable.length > 1 ? `${again ? "Resend" : "Send"} ${textable.length} texts` : again ? "Resend text" : "Send text"}</button>
              : <button type="button" disabled={!canSend} onClick={() => void send("email")} style={btn(canSend)} title="Opens your mail with the words and the link">{again ? "Email it again" : "Email it"}</button>}
            <button type="button" disabled={!canSend} onClick={() => void send("copy")} style={{ ...btn(false), color: canSend ? T.ink : T.ink3, border: `1px solid ${T.hairStrong}`, cursor: canSend ? "pointer" : "default" }}>{copied ? "Copied ✓" : "Copy link"}</button>
          </div>
          <div className="mt-1.5" style={{ fontSize: 11, color: T.ink3 }}>
            {via === "text" ? <>Send text goes through Quo from your line. {(textable[0]?.phone ?? vm.customer.phone) && <button type="button" onClick={() => void send("messages")} disabled={!canSend} style={{ border: 0, background: "transparent", padding: 0, color: T.chalk, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Or open it in your Messages app</button>}</>
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
