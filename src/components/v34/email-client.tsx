"use client";
/**
 * Email in Threads (migration 100; Claude Design "Email Client v2").
 *
 *   EmailInbox        — the list pane for an email thread: Inbox · Needs reply ·
 *                       Sent · Drafts · Unfiled, search, Compose.
 *   EmailConversation — one conversation: its filing, Dusty's read, every
 *                       message oldest first, Reply / Reply all / Forward /
 *                       Archive.
 *   EmailComposer     — To / Cc from Contacts, attach from Files, templates,
 *                       Dusty's draft, Save draft, and a two-tap Send.
 *
 * Nothing goes out without Coy's tap (DECISIONS §10): Dusty's draft lands in
 * the box, and Send asks once more who it goes to. Sending is
 * POST /api/emails/send (AgentMail, AGENTMAIL_API_KEY on the server).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { T, F, disp, eyebrow, nums, clip, relTime, BUCKET } from "@/lib/v34/tokens";
import { EmptyState, MenuButton, Sheet, SearchBubble } from "@/components/v34/primitives";
import { useThreads } from "@/components/v34/threads-ctx";
import { useLiveThreads } from "@/lib/v34/live-threads";
import { askDusty } from "@/components/v34/budget-tabs";
import { DustyEmblem } from "@/components/v34/dusty-avatar";
import { isHorizontal } from "@/lib/swipe";
import { sendBytes } from "@/components/v34/files-panel";
import {
  MAIL_TABS, TEMPLATES, cleanSubject, fillTemplate, firstName, forwardBody, forwardSubject, isEmail, parseAddresses,
  replySubject, replyTargets, vendorFromEmail, writerOf, type ComposeMode, type Conversation, type MailRow, type MailTab,
} from "@/lib/email-client";

// ── shared bits ─────────────────────────────────────────────────────────────

async function call<X = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<X & { _status: number }> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return { ...b, _status: r.status };
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const convHref = (key: string, threadId?: string | null, extra?: string) =>
  `/dashboard/messages/email/${encodeURIComponent(key)}${threadId || extra ? `?${[threadId ? `t=${encodeURIComponent(threadId)}` : null, extra].filter(Boolean).join("&")}` : ""}`;

const btn = (primary = false, on = true): React.CSSProperties => ({
  height: 32, padding: "0 12px", borderRadius: 4, cursor: on ? "pointer" : "not-allowed", opacity: on ? 1 : 0.5,
  border: primary ? "none" : `1px solid ${T.hairStrong}`, background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink2,
  fontFamily: disp, fontSize: F.xs, fontWeight: primary ? 700 : 600, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap",
});
const field: React.CSSProperties = { height: 36, width: "100%", border: `1px solid ${T.hairStrong}`, borderRadius: 4, padding: "0 10px", background: T.card, color: T.ink, fontSize: F.sm };
const bucketColor = (b: string | null | undefined) => (b === "customer" ? BUCKET.customer : b === "vendor" ? BUCKET.vendor : b === "personal" ? BUCKET.personal : b === "unsorted" ? BUCKET.unsorted : T.ink3);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const initials = (s: string | null | undefined) => (s ?? "?").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function MailIcon({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="10" rx="1" /><path d="M3.5 5.5l6.5 5 6.5-5" /></svg>;
}

type ConvView = Conversation & { customer_name: string | null; job_title: string | null; contact_name: string | null; bucket?: string | null };
interface DraftRow { id: string; conversation: string | null; mode: ComposeMode; to_addresses: string[]; cc_addresses: string[]; subject: string | null; body: string | null; file_ids: string[]; by: "coy" | "dusty"; reply_to_email_id?: string | null; contact_id?: string | null; customer_id?: string | null; job_id?: string | null; updated_at: string }

// ── L2: the inbox ───────────────────────────────────────────────────────────

/** The list pane for an email thread (a rule thread showing only email). */
export function EmailInbox({ threadId, title, sub, folded, onEditRule }: { threadId?: string | null; title: string; sub?: string | null; folded?: boolean; onEditRule?: () => void }) {
  const ctx = useThreads();
  const [tab, setTab] = useState<MailTab>("inbox");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<{ ready: boolean; counts: Record<MailTab, number>; conversations: ConvView[]; drafts: DraftRow[]; can_send: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useLiveThreads(() => setTick((n) => n + 1));
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") setTick((n) => n + 1); }, 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      call<{ ready: boolean; counts: Record<MailTab, number>; conversations: ConvView[]; drafts: DraftRow[]; can_send: boolean }>(`/api/emails/threads?tab=${tab}&q=${encodeURIComponent(q)}`)
        .then((b) => { if (!off) { setData(b); setErr(null); } }).catch((e) => { if (!off) setErr(errText(e)); });
    }, q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [tab, q, tick]);

  if (folded) {
    return (
      <div className="flex flex-col items-center">
        <button onClick={() => ctx?.setFolded(false)} aria-label="Show the list" className="flex items-center justify-center" style={{ width: "100%", height: 46, color: T.ink2, cursor: "pointer", borderBottom: `1px solid ${T.hairSoft}` }}>›</button>
        <div style={{ ...eyebrow, fontSize: 9, color: T.hiviz, padding: "4px 0" }}>{data?.counts.reply || ""}</div>
      </div>
    );
  }
  const composeHref = `/dashboard/messages/email/new${threadId ? `?t=${encodeURIComponent(threadId)}` : ""}`;
  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      <div className="sticky top-[var(--sc-head)] lg:top-0" style={{ zIndex: 6, background: T.card, padding: "12px 12px 0 14px", borderBottom: `1px solid ${T.hairSoft}` }}>
        <div className="flex items-center gap-2">
          <MenuButton onClick={() => ctx?.setDrawer(true)} label="Threads" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
              <span className="sc-page-title" style={{ fontFamily: disp, fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: T.hiviz, lineHeight: 1.1, ...clip }}>{title}</span>
            </div>
            {sub && <div style={{ fontSize: 11.5, color: T.ink3, ...clip }}>{sub}</div>}
          </div>
          <button onClick={() => setSearching((s) => !s)} aria-label="Search email" className="shrink-0 flex items-center justify-center rounded" style={{ width: 30, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5" /><path d="M12.5 12.5l4 4" strokeLinecap="round" /></svg>
          </button>
          {onEditRule && <button onClick={onEditRule} className="shrink-0 rounded px-2" style={{ ...eyebrow, height: 28, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.chalk, cursor: "pointer" }}>Edit rule</button>}
          <Link href={composeHref} className="hidden lg:flex shrink-0 items-center gap-1.5" style={{ ...btn(true), height: 28, display: undefined, textDecoration: "none", alignItems: "center" }}>
            <MailIcon size={13} /> Compose
          </Link>
        </div>
        {searching && <div style={{ paddingTop: 8 }}><SearchBubble value={q} onChange={setQ} onClose={() => { setQ(""); setSearching(false); }} placeholder="Search subject, people, words" /></div>}
        <div className="flex gap-1 overflow-x-auto" style={{ paddingTop: 8, scrollbarWidth: "none" }}>
          {MAIL_TABS.map((t) => {
            const on = tab === t.k, n = data?.counts[t.k] ?? 0;
            return (
              <button key={t.k} onClick={() => setTab(t.k)} aria-pressed={on} className="shrink-0 flex items-center gap-1"
                style={{ height: 32, padding: "0 8px", borderBottom: `2px solid ${on ? T.hiviz : "transparent"}`, color: on ? T.ink : T.ink3, fontSize: F.xs, fontWeight: on ? 700 : 500, cursor: "pointer", background: "none" }}>
                {t.label}{n ? <span style={{ ...nums, fontSize: 10.5, padding: "0 5px", borderRadius: 8, background: t.k === "reply" && n ? T.hiviz : T.hairSoft, color: t.k === "reply" && n ? T.onHiviz : T.ink2 }}>{n}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {data && !data.can_send && data.ready && (
        <div style={{ fontSize: 11.5, color: T.ink2, padding: "8px 14px", background: T.hairSoft, borderBottom: `1px solid ${T.hairSoft}` }}>
          Sending is off until AGENTMAIL_API_KEY is set in Vercel. You can read, file and draft.
        </div>
      )}
      {err ? <EmptyState tone="warn" title="Couldn't read email" detail={err} />
        : !data ? <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 58, background: T.hairSoft }} />)}</div>
        : !data.ready ? <EmptyState title="Email conversations aren't switched on yet" detail="They switch on with migration 100. Until then, emails are listed in Files → Emails." />
        : tab === "drafts" ? (
          data.drafts.length === 0 ? <EmptyState title="No drafts" detail="A draft you save, or one Dusty writes, waits here until you send it." /> : (
            <div>{data.drafts.map((d) => (
              <Link key={d.id} href={d.conversation ? convHref(d.conversation, threadId, `draft=${d.id}`) : `/dashboard/messages/email/new?draft=${d.id}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontSize: F.sm, fontWeight: 600, ...clip, flex: 1, minWidth: 0 }}>{d.to_addresses.join(", ") || "No one yet"}</span>
                    <span style={{ fontSize: 11, color: T.ink3, ...nums }}>{relTime(d.updated_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.ink2, ...clip }}><span style={{ color: T.red, fontWeight: 600 }}>Draft{d.by === "dusty" ? " · Dusty" : ""}</span> · {d.subject || "(no subject)"}</div>
                  <div style={{ fontSize: 12, color: T.ink3, ...clip }}>{(d.body ?? "").replace(/\s+/g, " ").slice(0, 140)}</div>
                </div>
              </Link>
            ))}</div>
          )
        ) : data.conversations.length === 0 ? (
          <EmptyState title={q ? "Nothing matches" : tab === "reply" ? "Nothing waiting on you" : tab === "sent" ? "Nothing sent yet" : tab === "unfiled" ? "Everything is filed" : "No email yet"}
            detail={tab === "inbox" && !q ? "Emails forwarded to the intake inbox, and replies to what you send, land here." : undefined} />
        ) : (
          <div>{data.conversations.map((c) => <SwipeArchive key={c.key} c={c} onDone={() => setTick((n) => n + 1)}><ConvRow c={c} threadId={threadId} /></SwipeArchive>)}</div>
        )}
      <Link href={composeHref} aria-label="Compose" className="lg:hidden flex items-center justify-center"
        style={{ position: "fixed", right: 16, bottom: "calc(var(--sc-foot) + 16px)", width: 54, height: 54, borderRadius: 27, background: T.hiviz, color: T.onHiviz, boxShadow: "0 4px 14px rgba(0,0,0,.25)", zIndex: 8 }}>
        <MailIcon size={22} />
      </Link>
    </div>
  );
}

function ConvRow({ c, threadId }: { c: ConvView; threadId?: string | null }) {
  const who = c.last_direction === "out" && !c.has_in ? `To ${c.contact_name ?? c.writer.address ?? "someone"}` : c.writer.name || c.contact_name || c.writer.address || "Someone";
  const filedOn = c.job_title || c.customer_name;
  return (
    <Link href={convHref(c.key, threadId)} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
      <div className="flex items-start gap-2.5 px-3 py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, background: c.unread ? `color-mix(in srgb, ${T.hiviz} 5%, var(--sc-card))` : undefined }}>
        <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 30, height: 30, border: `1px solid ${bucketColor(c.filed ? c.bucket ?? "customer" : "unsorted")}`, color: bucketColor(c.filed ? c.bucket ?? "customer" : "unsorted"), marginTop: 1 }}><MailIcon /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-baseline gap-2">
            {c.unread && <span aria-label="unread" style={{ width: 7, height: 7, borderRadius: 4, background: T.hiviz, flexShrink: 0, alignSelf: "center" }} />}
            <span style={{ fontSize: F.sm, fontWeight: c.unread || c.needs_reply ? 700 : 500, ...clip, flex: 1, minWidth: 0 }}>{who}{c.count > 1 ? <span style={{ color: T.ink3, fontWeight: 400 }}> · {c.count}</span> : null}</span>
            <span style={{ fontSize: 11, color: T.ink3, ...nums, flexShrink: 0 }}>{relTime(c.last_at)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: T.ink, fontWeight: c.unread ? 600 : 500, ...clip }}>{c.subject}</div>
          <div style={{ fontSize: 12, color: T.ink3, ...clip }}>{c.snippet}</div>
          <div className="flex flex-wrap items-center gap-1" style={{ marginTop: 3 }}>
            {c.needs_reply && <Tag color={T.hiviz}>Needs reply</Tag>}
            {c.quarantined && <Tag color={T.red}>Held</Tag>}
            {!c.filed && !c.quarantined && <Tag color={T.ink3}>Unfiled</Tag>}
            {filedOn && <Tag color={bucketColor("customer")}>{filedOn}</Tag>}
            {c.files > 0 && <span style={{ fontSize: 10.5, color: T.ink3 }}>📎 {c.files}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Swipe a row left on a phone for Archive (Coy, 2026-10-12). */
function SwipeArchive({ c, onDone, children }: { c: ConvView; onDone: () => void; children: React.ReactNode }) {
  const W = 88;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const at = useRef<{ x: number; y: number; dx: number; h: boolean | null } | null>(null);
  const go = async () => {
    setBusy(true);
    try { await call(`/api/emails/threads/${encodeURIComponent(c.key)}`, "PATCH", { archive: !c.archived }); setDx(0); onDone(); }
    catch (e) { window.alert(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="relative overflow-hidden">
      <div className="absolute top-0 bottom-0 right-0 flex" aria-hidden={dx ? undefined : true}>
        <button type="button" tabIndex={dx ? 0 : -1} disabled={busy} onClick={() => void go()} aria-label={c.archived ? "Unarchive" : "Archive"}
          style={{ width: W, background: T.ink2, color: "#fff", ...eyebrow, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
          <ArchiveIcon size={18} />{busy ? "…" : c.archived ? "Unarchive" : "Archive"}
        </button>
      </div>
      <div
        onTouchStart={(e) => { const t = e.touches[0]; at.current = { x: t.clientX, y: t.clientY, dx, h: null }; }}
        onTouchMove={(e) => {
          const a = at.current; if (!a) return;
          const t = e.touches[0]; const mx = t.clientX - a.x, my = t.clientY - a.y;
          if (a.h === null) { if (Math.abs(mx) < 6 && Math.abs(my) < 6) return; a.h = isHorizontal(mx, my); if (a.h) setDrag(true); }
          if (a.h) setDx(Math.max(-W, Math.min(0, a.dx + mx)));
        }}
        onTouchEnd={() => { const a = at.current; at.current = null; if (a?.h) setDx((d) => (d < -W / 2 ? -W : 0)); setDrag(false); }}
        onClickCapture={(e) => { if (dx) { e.stopPropagation(); e.preventDefault(); setDx(0); } }}
        style={{ position: "relative", background: T.card, transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .18s ease" }}>
        {children}
      </div>
    </div>
  );
}

const ico = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function ArchiveIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></svg>;
}
function TrashIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>;
}
function StarIcon({ size = 20, on }: { size?: number; on: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} fill={on ? "currentColor" : "none"} aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" /></svg>;
}
function ReplyIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M10 6l-6 6 6 6M4 12h10a6 6 0 0 1 6 6" /></svg>;
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 10, lineHeight: "16px", padding: "0 5px", borderRadius: 3, border: `1px solid ${color}`, color, maxWidth: 180, ...clip }}>{children}</span>;
}

// ── L3: one conversation ────────────────────────────────────────────────────

interface FileLite { id: string; name: string; url?: string | null; mime_type?: string | null; byte_size?: number | null }
interface Msg extends MailRow { text_body: string | null; attachments: Array<{ id: string; name: string; fetch_state: string; fetch_error: string | null; file: FileLite | null }>; sent_files: FileLite[] }
interface ConvData {
  conversation: ConvView;
  messages: Msg[];
  state: { summary: string | null; asks: Array<{ text: string; due: string | null; tone: string }> | null; triage: string | null; read_for: number | null; archived_at: string | null } | null;
  filing: { match: string | null; note: string | null; suggested_customer_id: string | null; suggested_customer_name: string | null; person_emails: string[] };
  options: { customers: Array<{ id: string; name: string }>; vendors?: Array<{ id: string; name: string }>; jobs: Array<{ id: string; title: string | null; customer_id: string | null; status: string | null }> };
  drafts: DraftRow[];
  inboxes: string[]; ours: string[]; signature: string; can_send: boolean;
}

export function EmailConversation({ convKey, threadId, draftId }: { convKey: string; threadId?: string | null; draftId?: string | null }) {
  const [d, setD] = useState<ConvData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [compose, setCompose] = useState<{ mode: ComposeMode; draft?: DraftRow } | null>(null);
  // The draft named in the address that was opened last — a later one (Dusty's next draft) opens too.
  const opened = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useLiveThreads(reload);
  useEffect(() => {
    let off = false;
    call<ConvData>(`/api/emails/threads/${encodeURIComponent(convKey)}`).then((b) => {
      if (off) return;
      setD(b); setErr(null);
      // A draft named in the address opens in the composer, once.
      const dr = draftId && opened.current !== draftId ? b.drafts.find((x) => x.id === draftId) : null;
      if (dr) { opened.current = dr.id; setCompose({ mode: dr.mode, draft: dr }); }
    }).catch((e) => { if (!off) setErr(errText(e)); });
    return () => { off = true; };
  }, [convKey, tick, draftId]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  const patch = async (b: Record<string, unknown>, msg?: string) => {
    try { await call(`/api/emails/threads/${encodeURIComponent(convKey)}`, "PATCH", b); if (msg) flash(msg); reload(); } catch (e) { flash(errText(e)); }
  };

  const leave = () => { if (window.matchMedia("(max-width: 1023.98px)").matches) router.push(threadId ? `/dashboard/messages?t=${encodeURIComponent(threadId)}` : "/dashboard/messages"); };
  const archive = async () => {
    if (!d) return;
    const was = d.conversation.archived;
    await patch({ archive: !was }, was ? "Back in the inbox." : "Archived — it comes back if they write again.");
    if (!was) leave();
  };
  const askAbout = () => { if (d) askDusty(`About the email "${cleanSubject(d.conversation.subject)}" from ${d.conversation.writer.name ?? d.conversation.writer.address ?? "them"}: `, false); };

  if (err) return <EmptyState tone="warn" title="Couldn't open this email" detail={err} />;
  if (!d) return <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="rounded animate-pulse" style={{ height: 80, background: T.hairSoft }} />)}</div>;
  const c = d.conversation;
  const back = threadId ? `/dashboard/messages?t=${encodeURIComponent(threadId)}` : "/dashboard/messages";
  const people = c.people.length;
  return (
    <div className="flex flex-col" style={{ minHeight: "100%", background: T.paper }}>
      {/* Header */}
      <div className="sticky top-[var(--sc-head)] lg:top-0" style={{ zIndex: 5, background: T.card, borderBottom: `1px solid ${T.hairSoft}`, padding: "10px 14px" }}>
        <div className="flex items-start gap-2">
          <Link href={back} className="lg:hidden shrink-0" style={{ fontSize: F.xs, color: T.ink2, textDecoration: "none", paddingTop: 3 }}>‹ Email</Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: disp, fontSize: 18, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>{cleanSubject(c.subject) || "(no subject)"}</div>
            <div style={{ fontSize: 11.5, color: T.ink3 }}>
              {c.count} message{c.count === 1 ? "" : "s"} · {people} {people === 1 ? "person" : "people"}{c.files ? ` · ${c.files} file${c.files === 1 ? "" : "s"}` : ""} · last {relTime(c.last_at)}
              {c.archived ? " · archived" : ""}{d.state?.triage === "fyi" ? " · FYI" : ""}
            </div>
          </div>
          <PhoneMenu items={[
            { label: "Reply all", on: () => setCompose({ mode: "reply_all" }) },
            { label: "Forward", on: () => setCompose({ mode: "forward" }) },
            { label: d.state?.triage === "fyi" ? "Mark needs reply" : "Mark FYI — no reply needed", on: () => void patch({ fyi: d.state?.triage !== "fyi" }, d.state?.triage === "fyi" ? "Marked as needing a reply." : "Marked FYI — no reply needed.") },
            { label: c.archived ? "Unarchive" : "Archive", on: () => void archive() },
            { label: "Dusty: draft a reply", on: () => setCompose({ mode: "reply" }), off: !c.filed },
            { label: "Ask Dusty about it", on: () => askAbout() },
          ]} />
        </div>
        <div className="hidden lg:flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
          <button style={btn(true)} onClick={() => setCompose({ mode: "reply" })}>Reply</button>
          <button style={btn()} onClick={() => setCompose({ mode: "reply_all" })}>Reply all</button>
          <button style={btn()} onClick={() => setCompose({ mode: "forward" })}>Forward</button>
          <button style={btn()} onClick={() => void patch({ archive: !c.archived }, c.archived ? "Back in the inbox." : "Archived — it comes back if they write again.")}>{c.archived ? "Unarchive" : "Archive"}</button>
          <button style={btn()} onClick={() => void patch({ fyi: d.state?.triage !== "fyi" }, d.state?.triage === "fyi" ? "Marked as needing a reply." : "Marked FYI — no reply needed.")}>{d.state?.triage === "fyi" ? "Needs reply" : "FYI only"}</button>
        </div>
      </div>

      <FilingStrip key={c.filed ? "filed" : "unfiled"} d={d} onPatch={patch} />
      <DustyCard convKey={convKey} d={d} onDraft={() => setCompose({ mode: "reply" })} flash={flash} />

      {d.drafts.length > 0 && !compose && (
        <div style={{ margin: "8px 14px 0", padding: "8px 10px", border: `1px dashed ${T.red}`, borderRadius: 4, fontSize: 12, color: T.ink2 }}>
          {d.drafts.map((dr) => (
            <div key={dr.id} className="flex items-center gap-2">
              <span style={{ color: T.red, fontWeight: 600 }}>Draft{dr.by === "dusty" ? " · Dusty" : ""}</span>
              <span style={{ ...clip, flex: 1, minWidth: 0 }}>to {dr.to_addresses.join(", ") || "no one yet"} · {relTime(dr.updated_at)}</span>
              <button style={{ ...btn(), height: 26 }} onClick={() => setCompose({ mode: dr.mode, draft: dr })}>Open</button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-col gap-2" style={{ padding: "10px 14px 90px" }}>
        {d.messages.map((m, i) => <MessageCard key={m.id} m={m} ours={d.ours} startOpen={i === d.messages.length - 1} />)}
      </div>

      {compose && (
        <EmailComposer key={compose.draft?.id ?? compose.mode}
          mode={compose.mode} draft={compose.draft ?? null} messages={d.messages} ours={d.ours}
          conversation={convKey} replyToId={compose.mode === "new" ? null : ([...d.messages].reverse().find((m) => m.direction !== "out")?.id ?? d.messages[d.messages.length - 1]?.id ?? null)}
          filing={{ customer_id: c.customer_id, contact_id: c.contact_id, job_id: c.job_id, job_title: c.job_title, filed: c.filed }}
          canSend={d.can_send} signature={d.signature} convKeyForDusty={convKey}
          onClose={() => { setCompose(null); reload(); }}
          onSent={(m) => { setCompose(null); flash(m); reload(); router.refresh(); }}
          quoted={compose.mode === "forward" ? null : (() => {
            const m = [...d.messages].reverse().find((x) => x.direction !== "out") ?? d.messages[d.messages.length - 1];
            return m ? <MessageCard m={m} ours={d.ours} startOpen /> : null;
          })()}
        />
      )}

      {/* Phone bar: Dusty · ⭐ · Archive · Delete … Reply (Coy, 2026-10-12) */}
      {!compose && (
        <PhoneBar
          starred={c.needs_reply}
          archived={c.archived}
          onDusty={askAbout}
          onStar={() => {
            if (c.needs_reply) void patch({ fyi: true }, "Unstarred — marked FYI, no reply needed.");
            else if (c.last_direction === "out") flash("Nothing to answer — the last word is yours.");
            else void patch({ fyi: false }, "Starred — it waits under Needs reply.");
          }}
          onArchive={() => void archive()}
          onDelete={() => {
            if (!window.confirm("Delete this email? It leaves the inbox and comes back only if they write again. Emails stay on record, like every call and text.")) return;
            void patch({ archive: true, fyi: true }, "Deleted from the inbox.").then(leave);
          }}
          onReply={(mode) => setCompose({ mode })}
        />
      )}
      {toast && <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(var(--sc-foot) + 70px)", background: T.dark, color: "#fff", padding: "8px 14px", borderRadius: 6, fontSize: F.sm, zIndex: 60, maxWidth: "90vw" }}>{toast}</div>}
    </div>
  );
}

/** ☰ at the top right of an email on a phone — what the top buttons were. */
function PhoneMenu({ items }: { items: Array<{ label: string; on: () => void; off?: boolean }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden shrink-0" style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="More" aria-expanded={open} className="flex items-center justify-center rounded"
        style={{ width: 34, height: 32, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
        <div role="menu" style={{ position: "absolute", right: 0, top: 38, zIndex: 21, minWidth: 220, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 4 }}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.off} onClick={() => { setOpen(false); it.on(); }} className="w-full text-left"
              style={{ display: "block", padding: "10px 12px", fontSize: F.sm, color: it.off ? T.ink3 : T.ink, background: "none", cursor: it.off ? "default" : "pointer", borderRadius: 4 }}>
              {it.label}
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}

/** The bottom bar on a phone: Dusty, ⭐, Archive, Delete, and Reply opening Reply · Reply all · Forward. */
function PhoneBar({ starred, archived, onDusty, onStar, onArchive, onDelete, onReply }: {
  starred: boolean; archived: boolean; onDusty: () => void; onStar: () => void; onArchive: () => void; onDelete: () => void; onReply: (m: ComposeMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const b: React.CSSProperties = { width: 46, height: 44, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, background: "none", cursor: "pointer", borderRadius: 22 };
  return (
    <div className="lg:hidden flex items-center" style={{ position: "fixed", left: 0, right: 0, bottom: "var(--sc-foot)", padding: "4px 10px", background: T.card, borderTop: `1px solid ${T.hair}`, zIndex: 7 }}>
      <button style={b} onClick={onDusty} aria-label="Ask Dusty about this email"><DustyEmblem size={28} hidden /></button>
      <button style={{ ...b, color: starred ? T.hiviz : T.ink2 }} onClick={onStar} aria-label={starred ? "Starred — needs reply" : "Star — needs reply"} aria-pressed={starred}><StarIcon on={starred} /></button>
      <button style={b} onClick={onArchive} aria-label={archived ? "Unarchive" : "Archive"}><ArchiveIcon /></button>
      <button style={b} onClick={onDelete} aria-label="Delete"><TrashIcon /></button>
      <span style={{ flex: 1 }} />
      <div style={{ position: "relative" }}>
        {open && (<>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 8 }} />
          <div role="menu" style={{ position: "absolute", right: 0, bottom: 52, zIndex: 9, minWidth: 170, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 4 }}>
            {([["reply", "Reply"], ["reply_all", "Reply all"], ["forward", "Forward"]] as Array<[ComposeMode, string]>).map(([m, label]) => (
              <button key={m} role="menuitem" onClick={() => { setOpen(false); onReply(m); }} className="w-full text-left"
                style={{ display: "block", padding: "11px 12px", fontSize: F.sm, color: T.ink, background: "none", cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </>)}
        <button onClick={() => setOpen((o) => !o)} aria-label="Reply" aria-expanded={open} className="flex items-center gap-1.5"
          style={{ height: 40, padding: "0 16px", borderRadius: 20, background: T.hiviz, color: T.onHiviz, cursor: "pointer", fontSize: F.sm, fontWeight: 700 }}>
          <ReplyIcon size={18} /> <span aria-hidden="true">▴</span>
        </button>
      </div>
    </div>
  );
}

function MessageCard({ m, ours, startOpen }: { m: Msg; ours: string[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const w = writerOf(m);
  const out = m.direction === "out";
  const mine = new Set(ours);
  const forwarded = !out && m.original_from_address && mine.has((m.from_address ?? "").toLowerCase());
  const files = [...m.attachments.map((a) => ({ id: a.file?.id ?? a.id, name: a.name, file: a.file, state: a.fetch_state, err: a.fetch_error })), ...m.sent_files.map((f) => ({ id: f.id, name: f.name, file: f, state: "fetched", err: null }))];
  return (
    <div style={{ border: `1px solid ${out ? `color-mix(in srgb, ${T.hiviz} 35%, ${T.hair})` : T.hair}`, borderRadius: 6, background: T.card, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left flex items-start gap-2.5" style={{ padding: "10px 12px", cursor: "pointer", background: "none" }}>
        <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: out ? T.hiviz : T.hairSoft, color: out ? T.onHiviz : T.ink2, fontSize: 11, fontWeight: 700 }}>{out ? "You" : initials(w.name || w.address)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: F.sm, fontWeight: 600, ...clip, flex: 1, minWidth: 0 }}>{out ? "You" : w.name || w.address}{!out && w.name && w.address ? <span style={{ color: T.ink3, fontWeight: 400 }}> &lt;{w.address}&gt;</span> : null}</span>
            <span style={{ fontSize: 11, color: T.ink3, ...nums, flexShrink: 0 }}>{when(m.sent_at ?? m.created_at)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: T.ink3, ...clip }}>
            {open ? <>to {(m.to_addresses ?? []).join(", ") || "—"}{(m.cc_addresses ?? []).length ? ` · cc ${(m.cc_addresses ?? []).join(", ")}` : ""}{forwarded ? " · forwarded to the inbox" : ""}</> : (m.text_body ?? "").replace(/\s+/g, " ").slice(0, 120)}
          </div>
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px 52px" }}>
          <div style={{ fontSize: F.sm, color: T.ink, lineHeight: 1.5, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{(m.text_body ?? "").trim() || <span style={{ color: T.ink3 }}>No text came through with this email.</span>}</div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
              {files.map((f) => f.file
                ? <Link key={f.id} href={`/dashboard/files?file=${f.file.id}`} style={{ fontSize: 11.5, padding: "4px 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 4, color: T.ink2, textDecoration: "none", maxWidth: 240, ...clip }}>📎 {f.name}</Link>
                : <span key={f.id} title={f.err ?? undefined} style={{ fontSize: 11.5, padding: "4px 8px", border: `1px dashed ${T.hair}`, borderRadius: 4, color: T.ink3, maxWidth: 240, ...clip }}>📎 {f.name} · {f.state === "held" ? "held until filed" : f.state === "failed" ? "couldn't fetch" : "fetching"}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilingStrip({ d, onPatch }: { d: ConvData; onPatch: (b: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const c = d.conversation;
  const [editing, setEditing] = useState(!c.filed);
  const [newVendor, setNewVendor] = useState(false);
  const vendors = d.options.vendors ?? [];
  const onVendor = !c.customer_id && !!c.contact_id && vendors.some((v) => v.id === c.contact_id);
  const jobs = d.options.jobs.filter((j) => !c.customer_id || j.customer_id === c.customer_id || j.id === c.job_id);
  const writer = c.writer.address;
  const personMissing = c.contact_id && writer && !d.filing.person_emails.includes(writer.toLowerCase());
  const addAddress = async () => {
    try { await call(`/api/contacts/${c.contact_id}/emails`, "POST", { email: writer }); await onPatch({}, `${writer} is on ${c.contact_name ?? "them"} now — their next email files itself.`); } catch (e) { await onPatch({}, errText(e)); }
  };
  return (
    <div style={{ margin: "10px 14px 0", padding: "8px 10px", borderRadius: 6, border: `1px solid ${c.quarantined ? T.red : c.filed ? T.hair : T.hiviz}`, background: T.card, fontSize: 12.5 }}>
      {c.quarantined && <div style={{ color: T.red, marginBottom: 6 }}>Held: it didn&apos;t come from one of your forwarders, so its files wait until you file it.</div>}
      {!editing && c.filed ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span style={eyebrow}>Filed on</span>
          {c.customer_id && <Link href={`/dashboard/customers/${c.customer_id}`} style={{ color: T.ink, fontWeight: 600 }}>{c.customer_name ?? "Customer"} ›</Link>}
          {onVendor && <Link href={`/dashboard/vendors/${c.contact_id}`} style={{ color: T.ink, fontWeight: 600 }}>Vendor · {vendors.find((v) => v.id === c.contact_id)?.name ?? c.contact_name ?? "Vendor"} ›</Link>}
          {c.contact_name && !onVendor && <span style={{ color: T.ink2 }}>· {c.contact_name}</span>}
          {c.job_id && <Link href={`/dashboard/scope/${c.job_id}`} style={{ color: T.ink2 }}>· {c.job_title ?? "Job"} ›</Link>}
          {d.filing.match && d.filing.match !== "coy" && <span style={{ fontSize: 10.5, color: T.ink3 }}>{d.filing.match === "exact" ? "auto" : d.filing.match}</span>}
          <span style={{ flex: 1 }} />
          <button style={{ ...btn(), height: 26 }} onClick={() => setEditing(true)}>Change</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {d.filing.suggested_customer_id && !c.customer_id && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Looks like <b>{d.filing.suggested_customer_name ?? "a customer"}</b> (same company domain).</span>
              <button style={{ ...btn(true), height: 26 }} onClick={() => void onPatch({ accept_suggestion: true }, "Filed.")}>File it there</button>
            </div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label className="flex flex-col gap-0.5"><span style={eyebrow}>Customer</span>
              <select value={c.customer_id ?? ""} onChange={(e) => void onPatch({ customer_id: e.target.value || null, ...(e.target.value ? {} : { job_id: null, contact_id: null }) }, e.target.value ? "Filed." : "Taken off.")} style={field}>
                <option value="">— not filed —</option>
                {d.options.customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-0.5"><span style={eyebrow}>Job</span>
              <select value={c.job_id ?? ""} onChange={(e) => void onPatch({ job_id: e.target.value || null }, e.target.value ? "On the job — its files went with it." : "Off the job.")} style={field}>
                <option value="">— no job —</option>
                {jobs.map((x) => <option key={x.id} value={x.id}>{x.title || "Untitled job"}</option>)}
              </select></label>
            <label className="flex flex-col gap-0.5"><span style={eyebrow}>Vendor</span>
              <select value={onVendor ? c.contact_id ?? "" : ""} onChange={(e) => void onPatch(e.target.value ? { contact_id: e.target.value, customer_id: null } : { contact_id: null }, e.target.value ? "Filed on the vendor — its files went to their page." : "Taken off the vendor.")} style={field}>
                <option value="">— not a vendor —</option>
                {vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
          </div>
          {newVendor && <NewVendorForm d={d} onDone={async (id, name, made) => { setNewVendor(false); if (id) await onPatch({ contact_id: id, customer_id: null }, made ? `${name} is a vendor now, and this email is on their page.` : `Filed on ${name}.`); }} />}
          <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 11.5, color: T.ink3 }}>
            {d.filing.note && <span>{d.filing.note}</span>}
            <span style={{ flex: 1 }} />
            {!newVendor && <button onClick={() => setNewVendor(true)} style={{ color: T.ink2, cursor: "pointer", background: "none", textDecoration: "underline" }}>New vendor from this ›</button>}
            <Link href="/dashboard/customers?new=1" style={{ color: T.ink2 }}>New customer from this ›</Link>
            {c.filed && <button style={{ ...btn(), height: 26 }} onClick={() => setEditing(false)}>Done</button>}
          </div>
        </div>
      )}
      {personMissing && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: T.ink2 }}>
          {writer} isn&apos;t on {c.contact_name ?? "this person"} yet. <button onClick={() => void addAddress()} style={{ color: T.hiviz, fontWeight: 600, cursor: "pointer", background: "none" }}>Add it</button>
        </div>
      )}
    </div>
  );
}

/** New vendor from this email (Coy, 2026-10-12): filled from what it shows (`vendorFromEmail()`),
 *  made through + Vendor's own POST /api/vendors on Coy's tap, then the email is filed on them.
 *  A phone or email already on someone is a 409 naming them: file it on them instead. */
function NewVendorForm({ d, onDone }: { d: ConvData; onDone: (id: string | null, name: string, made: boolean) => Promise<void> }) {
  const seed = useMemo(() => vendorFromEmail(d.messages, d.ours), [d.messages, d.ours]);
  const [v, setV] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string | null } | null>(null);
  const make = async () => {
    setBusy(true); setErr(null); setExisting(null);
    try {
      const r = await fetch("/api/vendors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: v.name, email: v.email || null, phone: v.phone || null }) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing) { setExisting(b.existing); setErr(b.error ?? "They're already one of your contacts."); return; }
      if (!r.ok) { setErr(b.error ?? `HTTP ${r.status}`); return; }
      await onDone(b.vendor.id as string, v.name, true);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const box = (k: keyof typeof v, label: string, ph: string) => (
    <label className="flex flex-col gap-0.5" style={{ flex: "1 1 160px" }}><span style={eyebrow}>{label}</span>
      <input value={v[k]} placeholder={ph} onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))} style={field} /></label>
  );
  return (
    <div style={{ padding: 8, borderRadius: 6, border: `1px solid ${T.hairStrong}`, background: T.paper }}>
      <div style={{ ...eyebrow, marginBottom: 4 }}>New vendor</div>
      <div className="flex flex-wrap gap-2">{box("name", "Name", "Company")}{box("email", "Email", "sales@…")}{box("phone", "Phone", "(225) …")}</div>
      {err && <div style={{ color: T.red, fontSize: 11.5, marginTop: 6 }}>{err}{existing && <> <button onClick={() => void onDone(existing.id, existing.name ?? "them", false)} style={{ color: T.hiviz, fontWeight: 600, cursor: "pointer", background: "none" }}>File it on {existing.name ?? "them"}</button></>}</div>}
      <div className="flex gap-2" style={{ marginTop: 8 }}>
        <button style={{ ...btn(true), height: 28 }} disabled={busy || !v.name.trim()} onClick={() => void make()}>{busy ? "Adding…" : "Add vendor and file it"}</button>
        <button style={{ ...btn(), height: 28 }} onClick={() => void onDone(null, "", false)}>Cancel</button>
      </div>
    </div>
  );
}

function DustyCard({ convKey, d, onDraft, flash }: { convKey: string; d: ConvData; onDraft: () => void; flash: (m: string) => void }) {
  const [read, setRead] = useState<{ summary: string; asks: Array<{ text: string; due: string | null; tone: string }> } | null>(d.state?.summary ? { summary: d.state.summary, asks: d.state.asks ?? [] } : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const stale = !d.state?.summary || d.state.read_for !== d.messages.length;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    const k = `${convKey}:${d.messages.length}`;
    if (!stale || asked.current === k) return;
    asked.current = k;
    setBusy(true);
    call<{ summary: string; asks: Array<{ text: string; due: string | null; tone: string }> }>(`/api/emails/threads/${encodeURIComponent(convKey)}/dusty`, "POST", { do: "read" })
      .then((b) => { setRead({ summary: b.summary, asks: b.asks ?? [] }); setErr(null); }).catch((e) => setErr(errText(e))).finally(() => setBusy(false));
  }, [convKey, d.messages.length, stale]);
  const toneColor = (t: string) => (t === "due" ? T.red : t === "you" ? T.hiviz : T.ink3);
  const addAsk = async (text: string) => {
    const c = d.conversation;
    if (!c.contact_id) { flash("File it on a person first — next steps live on a person."); return; }
    try { await call(`/api/people/${c.contact_id}/tasks`, "POST", { title: text, ...(c.job_id ? { job_id: c.job_id } : {}) }); flash(`Added to ${c.contact_name ?? "their"} next steps.`); } catch (e) { flash(errText(e)); }
  };
  return (
    <div style={{ margin: "8px 14px 0", padding: "8px 10px", borderRadius: 6, background: `color-mix(in srgb, ${T.hiviz} 6%, var(--sc-card))`, border: `1px solid ${T.hairSoft}` }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left" style={{ cursor: "pointer", background: "none" }}>
        <span style={{ ...eyebrow, color: T.hiviz }}>Dusty&apos;s read</span>
        {busy && <span style={{ fontSize: 11, color: T.ink3 }}>reading…</span>}
        <span style={{ flex: 1 }} />
        <span style={{ color: T.ink3, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ fontFamily: "var(--sc-font-agent)", fontSize: 13, color: T.ink, marginTop: 4 }}>
          {err ? <div style={{ color: T.red, fontSize: 12 }}>{err}</div>
            : !read ? <div style={{ color: T.ink3 }}>{busy ? "Reading the conversation…" : "Not read yet."}</div>
            : <>
              <div style={{ lineHeight: 1.45 }}>{read.summary}</div>
              {read.asks.length > 0 && (
                <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none" }}>
                  {read.asks.map((a, i) => (
                    <li key={i} className="flex items-center gap-2" style={{ padding: "3px 0", fontSize: 12.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: toneColor(a.tone), flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>{a.text}{a.due ? <span style={{ color: toneColor(a.tone), fontWeight: 600 }}> · {a.due}</span> : null}</span>
                      <button onClick={() => void addAsk(a.text)} title="Add to their next steps" style={{ fontSize: 11, color: T.ink2, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "1px 6px", cursor: "pointer", background: T.card, flexShrink: 0 }}>+ Next step</button>
                    </li>
                  ))}
                </ul>
              )}
            </>}
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
            <button style={{ ...btn(), height: 28 }} onClick={onDraft} disabled={!d.conversation.filed} title={d.conversation.filed ? undefined : "File it on a customer first"}>Draft a reply</button>
            <button style={{ ...btn(), height: 28 }} onClick={() => askDusty(`About the email "${cleanSubject(d.conversation.subject)}" from ${d.conversation.writer.name ?? d.conversation.writer.address ?? "them"}: `, false)}>Ask Dusty</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The composer ────────────────────────────────────────────────────────────

interface Filing { customer_id: string | null; contact_id: string | null; job_id: string | null; job_title?: string | null; filed?: boolean }

function AddressField({ label, list, onChange }: { label: string; list: string[]; onChange: (l: string[]) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; name: string | null; email: string; role: string }>>([]);
  const [bad, setBad] = useState<string | null>(null);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || isEmail(q)) return;
    let off = false;
    const t = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=8`).then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((b: { contacts: Array<{ id: string; name: string | null; role_label: string; emails: Array<{ address: string }> }> }) => {
          if (off) return;
          setHits(b.contacts.flatMap((c) => c.emails.map((e) => ({ id: `${c.id}:${e.address}`, name: c.name, email: e.address.toLowerCase(), role: c.role_label }))).slice(0, 8));
        }).catch(() => {});
    }, 200);
    return () => { off = true; clearTimeout(t); };
  }, [text]);
  const commit = (raw: string) => {
    const { ok, bad: b } = parseAddresses(raw);
    if (ok.length) onChange([...new Set([...list, ...ok])]);
    setBad(b.length ? `${b[0]} isn't an email address.` : null);
    setText(b.join(", "));
    setHits([]);
  };
  return (
    <div style={{ position: "relative", borderBottom: `1px solid ${T.hairSoft}`, padding: "4px 0" }}>
      <div className="flex flex-wrap items-center gap-1">
        <span style={{ ...eyebrow, width: 28 }}>{label}</span>
        {list.map((a) => (
          <span key={a} className="flex items-center gap-1" style={{ fontSize: 12, padding: "2px 6px", borderRadius: 10, background: T.hairSoft, color: T.ink }}>
            {a}<button aria-label={`Remove ${a}`} onClick={() => onChange(list.filter((x) => x !== a))} style={{ color: T.ink3, cursor: "pointer", background: "none" }}>×</button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label={label}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") { if (text.trim()) { e.preventDefault(); commit(text); } } else if (e.key === "Backspace" && !text && list.length) onChange(list.slice(0, -1)); }}
          onBlur={() => { if (text.trim()) setTimeout(() => commit(text), 150); }}
          placeholder={list.length ? "" : "Name or email"} style={{ flex: 1, minWidth: 140, height: 30, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: F.sm }} />
      </div>
      {bad && <div style={{ fontSize: 11, color: T.red }}>{bad}</div>}
      {hits.length > 0 && text.trim().length >= 2 && !isEmail(text.trim()) && (
        <div style={{ position: "absolute", left: 28, right: 0, top: "100%", zIndex: 20, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.15)" }}>
          {hits.map((h) => (
            <button key={h.id} onMouseDown={(e) => { e.preventDefault(); onChange([...new Set([...list, h.email])]); setText(""); setHits([]); }} className="w-full text-left flex items-baseline gap-2" style={{ padding: "8px 10px", cursor: "pointer", background: "none", borderBottom: `1px solid ${T.hairSoft}` }}>
              <span style={{ fontSize: F.sm, fontWeight: 600 }}>{h.name ?? h.email}</span>
              <span style={{ fontSize: 11.5, color: T.ink3, ...clip, flex: 1, minWidth: 0 }}>{h.email}</span>
              <span style={{ fontSize: 10.5, color: T.ink3 }}>{h.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachSheet({ open, onClose, jobId, contactId, picked, onPick }: { open: boolean; onClose: () => void; jobId: string | null; contactId: string | null; picked: FileLite[]; onPick: (f: FileLite) => void }) {
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<FileLite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [up, setUp] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    let off = false;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim()); else if (jobId) params.set("job", jobId); else if (contactId) params.set("contact", contactId);
    const t = setTimeout(() => {
      call<{ files: FileLite[] }>(`/api/files/search?${params}`).then((b) => { if (!off) { setFiles(b.files ?? []); setErr(null); } }).catch((e) => { if (!off) setErr(errText(e)); });
    }, q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [open, q, jobId, contactId]);
  const upload = async (list: FileList | null) => {
    const fs = Array.from(list ?? []);
    for (const f of fs) {
      setUp(`Uploading ${f.name}…`);
      try {
        const made = await call<{ file: { id: string }; upload: { signed_url: string } }>("/api/files", "POST", { name: f.name, mime: f.type, size: f.size, ...(jobId ? { job_id: jobId } : { contact_id: contactId }) });
        await sendBytes(made.upload.signed_url, f, () => {});
        await call(`/api/files/${made.file.id}/done`, "POST");
        onPick({ id: made.file.id, name: f.name, byte_size: f.size, mime_type: f.type });
      } catch (e) { setErr(errText(e)); }
    }
    setUp(null);
  };
  const has = new Set(picked.map((f) => f.id));
  return (
    <Sheet open={open} onClose={onClose} title="Attach from Files" sub={jobId ? "This job's files first — search for anything else." : "Search your Files."}>
      <div className="px-4 py-3 flex flex-col gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, a job, a person" style={field} aria-label="Search files" />
        {err && <div style={{ color: T.red, fontSize: 12 }}>{err}</div>}
        {!files ? <div style={{ color: T.ink3, fontSize: 12 }}>Loading…</div> : files.length === 0 ? <div style={{ color: T.ink3, fontSize: 12 }}>No files{q ? " match" : " here yet"}.</div> : (
          <div className="flex flex-col">{files.slice(0, 60).map((f) => (
            <button key={f.id} onClick={() => onPick(f)} disabled={has.has(f.id)} className="flex items-center gap-2 text-left" style={{ padding: "8px 4px", borderBottom: `1px solid ${T.hairSoft}`, cursor: has.has(f.id) ? "default" : "pointer", background: "none", opacity: has.has(f.id) ? 0.5 : 1 }}>
              <span style={{ fontSize: F.sm, ...clip, flex: 1, minWidth: 0 }}>{f.name}</span>
              <span style={{ fontSize: 11, color: T.ink3, ...nums }}>{f.byte_size ? `${Math.max(1, Math.round(f.byte_size / 1024))} KB` : ""}</span>
              <span style={{ fontSize: 11, color: has.has(f.id) ? T.green : T.hiviz, fontWeight: 600 }}>{has.has(f.id) ? "✓" : "+"}</span>
            </button>
          ))}</div>
        )}
        <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
          <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <button style={btn(false, !!(jobId || contactId))} disabled={!(jobId || contactId)} onClick={() => input.current?.click()}>Upload from this device</button>
          {!(jobId || contactId) && <span style={{ fontSize: 11, color: T.ink3 }}>File the email on a job or person to upload new files.</span>}
          {up && <span style={{ fontSize: 11.5, color: T.ink2 }}>{up}</span>}
        </div>
      </div>
    </Sheet>
  );
}

export function EmailComposer({ mode, draft, messages = [], ours = [], conversation = null, replyToId = null, filing, canSend, signature, convKeyForDusty, initialTo, initialBody, initialSubject, draftFiles, onClose, onSent, asPage, quoted }: {
  mode: ComposeMode; draft?: DraftRow | null; messages?: MailRow[]; ours?: string[]; conversation?: string | null; replyToId?: string | null;
  filing: Filing; canSend: boolean; signature: string; convKeyForDusty?: string | null; initialTo?: string[]; initialBody?: string; initialSubject?: string; draftFiles?: FileLite[];
  onClose: () => void; onSent: (msg: string, conversation?: string | null) => void; asPage?: boolean;
  /** The email being answered, shown under the box when the composer covers the screen (phone). */
  quoted?: React.ReactNode;
}) {
  const phone = usePhone();
  const [showQuoted, setShowQuoted] = useState(true);
  const last = messages[messages.length - 1] as (MailRow & { text_body?: string | null; sent_files?: FileLite[]; attachments?: Array<{ file: FileLite | null }> }) | undefined;
  const first = useMemo(() => {
    if (draft) return { to: draft.to_addresses, cc: draft.cc_addresses, subject: draft.subject ?? "", body: draft.body ?? "" };
    const t = replyTargets(messages, mode, ours);
    const subject = mode === "forward" ? forwardSubject(last?.subject) : mode === "new" ? initialSubject ?? "" : replySubject(last?.subject);
    return { to: initialTo?.length ? initialTo : t.to, cc: t.cc, subject, body: mode === "forward" && last ? forwardBody(last) : initialBody ?? "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [to, setTo] = useState<string[]>(first.to);
  const [cc, setCc] = useState<string[]>(first.cc);
  const [showCc, setShowCc] = useState(first.cc.length > 0);
  const [subject, setSubject] = useState(first.subject);
  const [body, setBody] = useState(first.body);
  const [files, setFiles] = useState<FileLite[]>(() => {
    if (draft) {
      // A saved draft brings its files back (names from this conversation's files, or the compose read).
      const known = new Map([...(draftFiles ?? []), ...messages.flatMap((m) => [...((m as Msg).sent_files ?? []), ...((m as Msg).attachments ?? []).map((a) => a.file).filter((f): f is FileLite => !!f)])].map((f) => [f.id, f]));
      return draft.file_ids.map((id) => known.get(id) ?? { id, name: "Attached file" });
    }
    if (mode !== "forward" || !last) return [];
    return [...(last.attachments ?? []).map((a) => a.file).filter((f): f is FileLite => !!f), ...(last.sent_files ?? [])].slice(0, 10);
  });
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [attach, setAttach] = useState(false);
  const [tpl, setTpl] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);


  const lastIn = [...messages].reverse().find((m) => m.direction !== "out");
  const who = lastIn ? writerOf(lastIn).name : null;
  const applyTemplate = (k: string) => {
    const t = TEMPLATES.find((x) => x.k === k);
    if (!t) return;
    const v = { first: firstName(who), job: filing.job_title ?? null };
    if (!subject.trim() || mode === "new") setSubject(fillTemplate(t.subject, v));
    setBody((b) => (b.trim() ? `${fillTemplate(t.body, v)}\n\n${b}` : fillTemplate(t.body, v)));
    setTpl(false);
  };
  const dustyDraft = async () => {
    if (!convKeyForDusty) return;
    setBusy("Dusty is drafting…"); setErr(null);
    try {
      const b = await call<{ body: string; used: string | null }>(`/api/emails/threads/${encodeURIComponent(convKeyForDusty)}/dusty`, "POST", { do: "draft" });
      setBody((cur) => (cur.trim() && mode !== "forward" ? `${b.body}\n\n${cur}` : mode === "forward" ? `${b.body}${cur}` : b.body));
      setNote(b.used ? `Dusty drew on ${b.used}. Check anything in [brackets] before you send.` : "Check anything in [brackets] before you send.");
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const payload = () => ({
    mode, conversation, reply_to_email_id: replyToId, to, cc: showCc ? cc : [], subject, body, file_ids: files.map((f) => f.id),
    customer_id: filing.customer_id, contact_id: filing.contact_id, job_id: filing.job_id,
  });
  const saveDraft = async (close: boolean) => {
    setBusy("Saving…"); setErr(null);
    try {
      const b = await call<{ draft: { id: string } }>("/api/emails/drafts", "POST", { ...payload(), id: draftId ?? undefined });
      setDraftId(b.draft.id);
      if (close) onClose(); else setNote("Draft saved.");
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const discard = async () => {
    if (draftId) { try { await call(`/api/emails/drafts/${draftId}`, "DELETE"); } catch { /* the draft stays; nothing sent */ } }
    onClose();
  };
  const send = async () => {
    setBusy("Sending…"); setErr(null);
    try {
      const b = await call<{ sent: boolean; recorded: boolean; error?: string; conversation?: string }>("/api/emails/send", "POST", { ...payload(), draft_id: draftId ?? undefined });
      if (b._status === 207) onSent(b.error ?? "Sent, but it couldn't be saved here.", null);
      else onSent(`Sent to ${to[0]}${to.length + cc.length > 1 ? ` and ${to.length + cc.length - 1} more` : ""}.`, b.conversation ?? null);
    } catch (e) { setErr(errText(e)); setConfirm(false); } finally { setBusy(null); }
  };
  const ready = to.length > 0 && body.trim().length > 0 && canSend && !busy;
  const inbox = ours[0];

  const inner = (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <AddressField label="To" list={to} onChange={setTo} />
      {showCc ? <AddressField label="Cc" list={cc} onChange={setCc} /> : <button onClick={() => setShowCc(true)} style={{ alignSelf: "flex-start", fontSize: 11.5, color: T.ink2, cursor: "pointer", background: "none" }}>+ Cc</button>}
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" style={{ ...field, border: "none", borderBottom: `1px solid ${T.hairSoft}`, borderRadius: 0, padding: "0 2px", fontWeight: 600 }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write it here" aria-label="Message" rows={asPage ? 14 : 9}
        style={{ width: "100%", border: `1px solid ${T.hairSoft}`, borderRadius: 4, padding: 10, background: T.card, color: T.ink, fontSize: F.sm, lineHeight: 1.5, resize: "vertical" }} />
      {signature && <div style={{ fontSize: 11.5, color: T.ink3, whiteSpace: "pre-line" }}>{signature}</div>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span key={f.id} className="flex items-center gap-1" style={{ fontSize: 11.5, padding: "3px 8px", border: `1px solid ${T.hairStrong}`, borderRadius: 4, color: T.ink2, maxWidth: 240 }}>
              <span style={clip}>📎 {f.name}</span><button aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((x) => x.id !== f.id))} style={{ cursor: "pointer", color: T.ink3, background: "none" }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5" style={{ position: "relative" }}>
        <button style={btn()} onClick={() => setAttach(true)} disabled={files.length >= 10}>📎 Attach</button>
        <button style={btn()} onClick={() => setTpl((t) => !t)}>Templates ▾</button>
        {convKeyForDusty && <button style={btn(false, !!filing.filed && !busy)} disabled={!filing.filed || !!busy} title={filing.filed ? undefined : "File it on a customer first"} onClick={() => void dustyDraft()}>Dusty draft</button>}
        <span style={{ flex: 1 }} />
        <button style={btn(false, !busy)} disabled={!!busy} onClick={() => void saveDraft(true)}>Save draft</button>
        <button style={btn(true, ready)} disabled={!ready} onClick={() => setConfirm(true)}>Send</button>
        {tpl && (
          <div style={{ position: "absolute", left: 0, bottom: "100%", zIndex: 20, background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.15)", minWidth: 240 }}>
            {TEMPLATES.map((t) => (
              <button key={t.k} onClick={() => applyTemplate(t.k)} className="w-full text-left" style={{ padding: "8px 10px", cursor: "pointer", background: "none", borderBottom: `1px solid ${T.hairSoft}`, display: "block" }}>
                <div style={{ fontSize: F.sm, fontWeight: 600 }}>{t.label}</div><div style={{ fontSize: 11, color: T.ink3 }}>{t.sub}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {busy && <div style={{ fontSize: 12, color: T.ink2 }}>{busy}</div>}
      {note && <div style={{ fontSize: 12, color: T.ink2 }}>{note}</div>}
      {err && <div style={{ fontSize: 12, color: T.red }}>{err}</div>}
      {!canSend && <div style={{ fontSize: 11.5, color: T.ink3 }}>Sending is off until AGENTMAIL_API_KEY is set in Vercel — Save draft keeps it for later.</div>}
      {inbox && <div style={{ fontSize: 11, color: T.ink3 }}>Goes out from {inbox}. Replies land right back in this thread.</div>}
      {confirm && (
        <div style={{ padding: 10, borderRadius: 6, border: `1px solid ${T.hiviz}`, background: `color-mix(in srgb, ${T.hiviz} 8%, var(--sc-card))` }}>
          <div style={{ fontSize: F.sm, fontWeight: 600 }}>Send to {to.join(", ")}?</div>
          <div style={{ fontSize: 12, color: T.ink2 }}>{showCc && cc.length ? `cc ${cc.length} · ` : ""}{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} · ` : ""}“{subject || "(no subject)"}”</div>
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button style={btn(true, !busy)} disabled={!!busy} onClick={() => void send()}>Yes, send it</button>
            <button style={btn()} onClick={() => setConfirm(false)}>Not yet</button>
          </div>
        </div>
      )}
      <AttachSheet open={attach} onClose={() => setAttach(false)} jobId={filing.job_id} contactId={filing.contact_id} picked={files}
        onPick={(f) => setFiles((xs) => (xs.some((x) => x.id === f.id) || xs.length >= 10 ? xs : [...xs, f]))} />
    </div>
  );

  if (asPage) return inner;
  const title = mode === "forward" ? "Forward" : mode === "reply_all" ? "Reply all" : mode === "reply" ? "Reply" : "New email";
  const head = (
    <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
      <span style={{ ...eyebrow, color: T.hiviz }}>{title}</span>
      <span style={{ flex: 1 }} />
      <button onClick={() => void discard()} style={{ fontSize: 11.5, color: T.ink3, cursor: "pointer", background: "none" }}>{draftId ? "Delete draft" : "Discard"}</button>
      <button onClick={() => void saveDraft(true)} aria-label="Close and keep a draft" style={{ fontSize: phone ? 24 : 18, color: T.ink2, cursor: "pointer", background: "none", lineHeight: 1, padding: phone ? "0 4px" : 0 }}>×</button>
    </div>
  );
  // On a phone the composer covers the whole screen, header and footer too (Coy, 2026-10-11:
  // "it needs to be a full overlay panel up to the top … I can't view the whole email"), with the
  // email being answered under the box. Portalled so no ancestor can clip or shift it.
  if (phone) {
    return createPortal(
      <div role="dialog" aria-label={title} className="flex flex-col"
        style={{ position: "fixed", inset: 0, zIndex: 60, background: T.card, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "10px 14px 6px", borderBottom: `2px solid ${T.hiviz}`, flexShrink: 0 }}>{head}</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 14px calc(16px + env(safe-area-inset-bottom))" }}>
          {inner}
          {quoted && (
            <div style={{ marginTop: 14 }}>
              <button onClick={() => setShowQuoted((v) => !v)} style={{ ...eyebrow, color: T.ink2, cursor: "pointer", background: "none", marginBottom: 6 }}>
                {showQuoted ? "▾" : "▸"} The email you’re answering
              </button>
              {showQuoted && quoted}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 8, margin: "0 0 0", background: T.card, borderTop: `2px solid ${T.hiviz}`, boxShadow: "0 -6px 18px rgba(0,0,0,.12)", padding: "10px 14px calc(12px + env(safe-area-inset-bottom))", maxHeight: "85dvh", overflowY: "auto" }}>
      {head}
      {inner}
    </div>
  );
}

/** Under lg (1024px), where the composer covers the screen. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/** A new email, from Compose or a person's Email channel (`?to=`, `?contact=`, `?body=`, `?draft=`). */
export function NewEmail({ threadId, to, contactId, draftId, body, subject }: { threadId?: string | null; to?: string | null; contactId?: string | null; draftId?: string | null; body?: string | null; subject?: string | null }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<{ can_send: boolean; signature: string; ours: string[]; draft: DraftRow | null; draftFiles: FileLite[]; to: string[]; filing: Filing } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const qs = new URLSearchParams();
      if (contactId) qs.set("contact", contactId);
      if (draftId) qs.set("draft", draftId);
      const b = await call<{ can_send: boolean; inboxes: string[]; signature: string; draft: DraftRow | null; draft_files: FileLite[]; to: string[]; filing: Filing }>(`/api/emails/compose?${qs}`);
      const addr = to && isEmail(to) ? [to.toLowerCase()] : b.to;
      if (!off) setCtx({ can_send: b.can_send, signature: b.signature, ours: b.inboxes, draft: b.draft, draftFiles: b.draft_files ?? [], to: addr, filing: { ...b.filing, filed: false } });
    })().catch((e) => { if (!off) setErr(errText(e)); });
    return () => { off = true; };
  }, [draftId, to, contactId]);
  const back = threadId ? `/dashboard/messages?t=${encodeURIComponent(threadId)}` : "/dashboard/messages";
  return (
    <div style={{ padding: "12px 14px 90px", background: T.card, minHeight: "100%" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <Link href={back} style={{ fontSize: F.xs, color: T.ink2, textDecoration: "none" }}>‹ Email</Link>
        <span style={{ fontFamily: disp, fontSize: 18, fontWeight: 700, textTransform: "uppercase" }}>New email</span>
      </div>
      {err ? <EmptyState tone="warn" title="Can't write email yet" detail={err} />
        : !ctx ? <div className="rounded animate-pulse" style={{ height: 240, background: T.hairSoft }} />
        : <EmailComposer asPage mode="new" draft={ctx.draft} ours={ctx.ours} filing={ctx.filing} canSend={ctx.can_send} signature={ctx.signature}
            initialTo={ctx.to} initialBody={body ?? undefined} initialSubject={subject ?? undefined} draftFiles={ctx.draftFiles} onClose={() => router.push(back)}
            onSent={(_m, conv) => router.push(conv ? convHref(conv, threadId) : back)} />}
    </div>
  );
}
