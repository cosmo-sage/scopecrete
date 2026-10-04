"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Phone, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { Composer } from "@/components/v34/composer";
import { DA, MergeSheet, Timeline, formatPhone, type MergeInfo, type ThreadMessage } from "@/components/v34/conversation";
import { PersonView, SamePerson, type Person } from "@/components/v34/person-view";
import { NameEditor, FileAsSheet } from "@/components/v34/contact-edit";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { useThreads } from "@/components/v34/threads-ctx";
import { threadLabel } from "@/components/v34/thread-rail";
import { RoleTag } from "@/components/v34/thread-list";
import { ThreadSearch } from "@/components/v34/thread-search";
import { InternalNotes } from "@/components/v34/internal-notes";
import { inChannel, roleOf, type Channel, type ChannelFilter } from "@/lib/v34/threads";

/**
 * One person, opened in Threads (Threads v2, Claude Design 2026-10-03): their
 * name and role, a link to their Customer / Vendor page (or their own page,
 * Contact ›), and their CHANNELS — each phone number its own (calls,
 * voicemails and texts in one timeline, filterable), then email, then chat —
 * with search beside it. ?person=1 shows their own page (person-view.tsx):
 * next steps, jobs, what Dusty read.
 */

interface ContactJob { id: string; title: string | null; status: string | null; contact_id: string | null }

export default function ChatThreadPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params?.id as string;
  const search = useSearchParams();
  const personPage = search.get("person") === "1";
  const threads = useThreads();
  const threadKey = search.get("t") ?? threads?.thread ?? null;
  const tq = threadKey ? `?t=${encodeURIComponent(threadKey)}` : "";
  const [channels, setChannels] = useState<Channel[]>([]);
  const [emails, setEmails] = useState<Array<{ id: string; subject: string | null; from: string | null; at: string | null; body: string }>>([]);
  const [channelKey, setChannelKey] = useState<string | null>(search.get("channel"));
  const [filter, setFilter] = useState<ChannelFilter>("all");
  // Lines (Claude Design package 9): the org's numbers, when it has two or more.
  const [orgLines, setOrgLines] = useState<Array<{ id: string; name: string; phone: string; color: string; provider: string | null; is_primary: boolean }>>([]);
  const [firstLine, setFirstLine] = useState<{ id: string; name: string | null; at: string } | null>(null);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const [archivedInfo, setArchivedInfo] = useState<{ at: string; reason: string | null; back: boolean } | null>(null);
  const [fromLine, setFromLine] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [, setNameConfirmed] = useState(false);
  const [, setNameSource] = useState<string | null>(null);
  const [, setAddress] = useState<string | null>(null);
  const [phones, setPhones] = useState<string[]>([]);
  const [merges, setMerges] = useState<MergeInfo[]>([]);
  const [jobs, setJobs] = useState<ContactJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Open, and optionally on a suggested match ("Also Amber").
  const [merging, setMerging] = useState<false | { preselect: string | null }>(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  // Their page, when they are a customer or a vendor (/api/people). A failure
  // here leaves the plain conversation, which still works.
  const [person, setPerson] = useState<Person | null>(null);
  useEffect(() => {
    if (!contactId) return;
    let off = false;
    fetch(`/api/people/${contactId}`).then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (off || !b?.contact) return;
        setPerson(b as Person);
      }).catch(() => {});
    return () => { off = true; };
  }, [contactId, reload]);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    fetch(`/api/threads/${contactId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        // Merged into someone else: their thread is where this history lives.
        if (data.redirect_to) {
          router.replace(`/dashboard/messages/${data.redirect_to}`);
          return;
        }
        // The API returns newest first. A conversation reads top to bottom
        // with the composer under the latest message — v34 and the desktop
        // design both — so it is turned round here and scrolled to the end.
        const ls = (Array.isArray(data.lines) ? data.lines : []) as Array<{ id: string; name: string; phone: string; color: string; provider: string | null; is_primary: boolean }>;
        const lineCss = (c: string) => (T as unknown as Record<string, string>)[c] ?? T.ink3;
        setOrgLines(ls.map((l) => ({ ...l, color: lineCss(l.color) })));
        setFirstLine(data.first_line ?? null);
        setArchivedInfo(data.archived ?? null);
        const provName: Record<string, string> = { quo: "Quo", twilio: "Twilio", telnyx: "Telnyx", own_stack: "Own stack" };
        setMessages(Array.isArray(data.messages) ? [...data.messages].reverse().map((m: ThreadMessage) => {
          const l = ls.find((x) => x.id === m.line_id);
          return l ? { ...m, line_color: lineCss(l.color), line_provider: l.provider ? provName[l.provider] ?? l.provider : null } : m;
        }) : []);
        setPhone(data.counterparty_phone ?? null);
        setName(typeof data.name === "string" ? data.name : null);
        setNameConfirmed(data.name_confirmed === true);
        setNameSource(typeof data.name_source === "string" ? data.name_source : null);
        setAddress(typeof data.address === "string" ? data.address : null);
        setPhones(Array.isArray(data.phones) ? data.phones : []);
        setMerges(Array.isArray(data.merges) ? data.merges : []);
        setChannels(Array.isArray(data.channels) ? data.channels : []);
        setEmails(Array.isArray(data.emails) ? data.emails : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contactId, reload, router]);

  // Scope on file: this contact's jobs. /api/jobs is the org's list; `jobs` is
  // small (0 rows today), so filtering here beats a second route.
  useEffect(() => {
    if (!contactId) return;
    let off = false;
    fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (off) return;
        const all = Array.isArray(b?.jobs) ? (b.jobs as ContactJob[]) : null;
        setJobs(all ? all.filter((j) => j.contact_id === contactId) : null);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [contactId, reload]);

  useEffect(() => {
    if (!loading && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [loading, messages.length]);

  async function undo(mergeId: string) {
    setUndoing(mergeId);
    try {
      const r = await fetch(`/api/contacts/merge/${mergeId}/undo`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoing(null);
    }
  }

  async function newScope() {
    setStarting(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      router.push(`/dashboard/scope/${b.job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  // A confirmed name when there is one; the number otherwise. Never a guess —
  // an unconfirmed proposal lives in the thread list's review, not here.
  const headerTitle = name ?? formatPhone(phone);
  const openJob = jobs && jobs.length > 0 ? jobs[0] : null;

  // Their own page (Contact ›): next steps, jobs, what Dusty read — as before.
  if (person && !loading && !error && personPage) {
    return (
      <div className="sc-pinned overflow-y-auto flex flex-col" style={{ background: T.slab }}>
        <div className="px-4 py-2" style={{ background: T.card, borderBottom: `1px solid ${T.hairSoft}` }}>
          <Link href={`/dashboard/messages/${contactId}${tq}`} style={{ ...eyebrow, color: T.chalk }}>‹ Back to the conversation</Link>
        </div>
        {merges.map((m) => (
          <div key={m.id} className="px-4 py-1.5 flex items-center gap-2 text-[11px]"
            style={{ background: DA.elevated, borderBottom: `1px solid ${DA.border}`, color: DA.textSecondary }}>
            <span className="flex-1 min-w-0 truncate">{m.phone ? formatPhone(m.phone) : "Another number"} was merged into this person</span>
            <button onClick={() => void undo(m.id)} disabled={undoing === m.id}
              style={{ color: DA.accent, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>
              {undoing === m.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        ))}
        <PersonView person={person} messages={messages}
          onReload={() => setReload((n) => n + 1)} onMerge={(id) => setMerging({ preselect: id ?? null })} />
        {merging && (
          <MergeSheet contactId={contactId} keepLabel={headerTitle} keepCount={messages.length}
            preselectId={merging ? merging.preselect : null}
            onClose={() => setMerging(false)}
            onMerged={() => { setMerging(false); setLoading(true); setReload((n) => n + 1); }} />
        )}
      </div>
    );
  }

  // ---- Threads v2, level 3: the open contact, one channel at a time ----
  const c = person?.contact;
  const role = c ? roleOf({ bucket: c.bucket, subtype: c.subtype, customer_id: c.customer_id ?? null, is_primary_on_customer: true, customer_people: 1 }) : "unsorted";
  const pageLink = c?.bucket === "customer" && c.customer_id
    ? { href: `/dashboard/customers/${c.customer_id}?contact=${contactId}&from=threads${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}`, label: "Customer page" }
    : c?.bucket === "vendor" ? { href: `/dashboard/vendors/${contactId}`, label: "Vendor page" }
    : { href: `/dashboard/messages/${contactId}?person=1${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}`, label: "Contact" };
  const inThreads = (threads?.custom ?? []).filter((t) => t.contact_ids.includes(contactId));
  const lastAt = messages.length ? messages[messages.length - 1].occurred_at : null;
  const meta = [
    c?.subtype_label ?? null,
    phones.length > 1 ? `${phones.length} numbers` : null,
    channels.some((x) => x.kind === "email" && x.reachable) ? "email" : null,
    inThreads.length ? `in ${inThreads.map((t) => t.name).join(", ")}` : null,
    lastAt ? `last heard ${relTime(lastAt)}` : null,
    firstLine?.name ? `first reached you on the ${firstLine.name} line, ${new Date(firstLine.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
  ].filter(Boolean).join(" · ");
  // Internal notes are a tab of their own, after the numbers (Coy, 2026-10-04).
  const nNotes = person?.notes?.length ?? 0;
  const notesTab: Channel = { key: "notes", kind: "notes", label: "Internal notes", value: null, calls: 0, texts: 0, emails: nNotes, reachable: true };
  const lastPhone = channels.reduce((at, c, i) => (c.kind === "phone" ? i : at), -1);
  const tabs = channels.length ? [...channels.slice(0, lastPhone + 1), notesTab, ...channels.slice(lastPhone + 1)] : [];
  const channel = tabs.find((x) => x.key === channelKey) ?? tabs[0] ?? null;
  const shown = channel?.kind === "phone" ? messages.filter((m) => inChannel({ channel: m.channel, counterparty: m.counterparty ?? null }, channel, filter) && (!lineFilter || m.line_id === lineFilter)) : [];
  const n = channel?.kind === "phone" ? messages.filter((m) => inChannel({ channel: m.channel, counterparty: m.counterparty ?? null }, channel, "all")) : [];
  const nCalls = n.filter((m) => m.channel === "call" || m.channel === "voicemail").length;
  const threadName = threads ? threadLabel(threads.thread, threads.custom).name : "Threads";
  const threadIds = threads && !["customers", "unsorted", "vendors", "personal", "spam", "archived"].includes(threads.thread)
    ? threads.custom?.find((t) => t.id === threads.thread)?.contact_ids ?? [] : [];
  const pickChannel = (k: string) => { setChannelKey(k); setFilter("all"); setLineFilter(null); };
  // The lines this person actually reached on this number, and the one a text or call goes from:
  // the line they last used, else the primary.
  const usedLines = orgLines.filter((l) => n.some((m) => m.line_id === l.id));
  const lastLine = [...n].reverse().find((m) => m.line_id)?.line_id ?? null;
  const defaultLine = lastLine ?? orgLines.find((l) => l.is_primary)?.id ?? orgLines[0]?.id ?? null;
  const outLine = orgLines.find((l) => l.id === (fromLine ?? defaultLine)) ?? null;
  const renameChannel = async (ch: Channel) => {
    const next = window.prompt(`Name for ${formatPhone(ch.value)} — e.g. Office, Work, Cell. Leave it blank for the default.`, ch.label);
    if (next === null || !ch.value) return;
    const r = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/phones`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: ch.value, label: next }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); window.alert(b?.error ?? "Couldn't rename it."); return; }
    const label = next.trim().slice(0, 30);
    setChannels((cs) => cs.map((c) => (c.key === ch.key ? { ...c, label: label || c.label } : c)));
  };
  const pill: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 6,
    border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const seg = (on: boolean): React.CSSProperties => ({ height: "100%", padding: "0 10px", border: "none", background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
    fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" });

  return (
    <div className="flex sc-pinned">
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: DA.bg }}>
        <div className="flex-shrink-0" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "10px 16px 0" }}>
          {/* Phone: back to the thread, by name. */}
          <div className="lg:hidden flex items-center gap-2 mb-1">
            <Link href={`/dashboard/messages${threadKey ? `?t=${encodeURIComponent(threadKey)}` : ""}`} style={{ ...eyebrow, color: T.chalk, ...clip, flex: 1 }}>‹ {threadName}</Link>
            {c && <RoleTag role={role} auto={c.bucket_state === "auto"} />}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {loading ? (
                <div style={{ fontFamily: "var(--sc-font-strong)", fontSize: 19, fontWeight: 700, color: T.ink }}>{headerTitle}</div>
              ) : (
                <NameEditor contactId={contactId} name={name} fallback={formatPhone(phone)}
                  onSaved={(v) => { setName(v); setNameConfirmed(true); setNameSource("human"); }}
                  style={{ fontFamily: "var(--sc-font-strong)", fontSize: 19, fontWeight: 700, lineHeight: 1.15, color: T.ink }} />
              )}
              {c && <span className="hidden lg:inline-flex"><RoleTag role={role} auto={c.bucket_state === "auto"} /></span>}
            </div>
            <span className="hidden lg:flex items-center gap-2">
              <Link href={pageLink.href} style={pill}>{pageLink.label} ›</Link>
              <button onClick={() => window.dispatchEvent(new Event("sc:dusty-open"))} style={{ ...pill, border: `1px solid ${T.hiviz}`, color: T.hiviz }}>Ask Dusty</button>
            </span>
            <div className="relative">
              <button onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More" style={{ ...pill, padding: "0 8px" }}>⋯</button>
              {more && (
                <div className="absolute right-0 z-20 flex flex-col rounded" style={{ top: 32, minWidth: 180, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
                  <Link href={pageLink.href} className="lg:hidden px-3 py-2" style={{ fontSize: F.sm, color: T.ink }}>{pageLink.label} ›</Link>
                  <button onClick={() => { setMore(false); window.dispatchEvent(new Event("sc:dusty-open")); }} className="lg:hidden px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>Ask Dusty</button>
                  <button onClick={() => { setMore(false); setFiling(true); }} className="px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>{c?.bucket ? "Change bucket" : "File as…"}</button>
                  <button onClick={() => { setMore(false); setMerging({ preselect: null }); }} className="px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>Same person as…</button>
                  {openJob
                    ? <Link href={`/dashboard/scope/${openJob.id}`} className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink }}>Open {openJob.title || "the job"} ›</Link>
                    : <button onClick={() => void newScope()} disabled={starting || jobs === null} className="px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>{starting ? "Starting…" : "New scope"}</button>}
                  <ArchiveButton kind="contact" id={contactId} action="archive" what="this thread" then="/dashboard/messages"
                    style={{ padding: "8px 12px", textAlign: "left", fontSize: F.sm, color: T.ink, background: "transparent", border: "none" }}>Archive</ArchiveButton>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, ...nums, ...clip }}>{loading ? "Loading…" : meta || (phone ? formatPhone(phone) : "")}</div>
          {/* The third row: the channels. Each number is its own (calls, voicemails and texts together), then email, then chat. */}
          <div className="flex items-end mt-1.5 overflow-x-auto" role="tablist" aria-label="Channels">
            {tabs.map((ch) => {
              const on = channel?.key === ch.key;
              const sub = ch.kind === "phone" ? `${formatPhone(ch.value)} · ${ch.calls} call${ch.calls === 1 ? "" : "s"} · ${ch.texts} text${ch.texts === 1 ? "" : "s"}`
                : ch.kind === "notes" ? `${nNotes} note${nNotes === 1 ? "" : "s"} · @ to tag a teammate`
                : ch.kind === "email" ? (ch.value ? `${ch.value}${ch.emails ? ` · ${ch.emails}` : ""}` : ch.emails ? `${ch.emails} filed here` : "No email on file")
                : "Not joined · invite";
              return (
                <button key={ch.key} role="tab" aria-selected={on} onClick={() => pickChannel(ch.key)} className="text-left flex-1 lg:flex-none shrink-0"
                  style={{ minWidth: 0, padding: "7px 12px 8px", borderBottom: `2px solid ${on ? T.hiviz : "transparent"}`, opacity: ch.reachable || on ? 1 : 0.5, cursor: "pointer" }}>
                  <span style={{ display: "block", fontFamily: disp, fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>{ch.kind === "chat" ? "ScopeCrete" : ch.kind === "notes" ? "Team only" : ch.kind}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--sc-font-strong)", fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {ch.label}
                    {ch.kind === "phone" && on && (
                      // Name the number (Coy: "instead of 'phone 2' it can say 'office'").
                      <span role="button" tabIndex={0} aria-label={`Rename ${ch.label}`} title="Rename this number"
                        onClick={(e) => { e.stopPropagation(); void renameChannel(ch); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void renameChannel(ch); } }}
                        style={{ fontSize: 11, color: T.ink3, cursor: "pointer", padding: "0 2px" }}>✎</span>
                    )}
                  </span>
                  <span className="hidden lg:block" style={{ fontSize: 11, color: T.ink3, ...nums, whiteSpace: "nowrap" }}>{sub}</span>
                </button>
              );
            })}
            <button onClick={() => setMerging({ preselect: null })} className="hidden lg:block shrink-0 self-center" title="Another number of theirs is a separate thread — join them"
              style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: T.ink3, padding: "0 12px", cursor: "pointer" }}>+ Number</button>
          </div>
        </div>

        {/* Toolbar: the filter (phone channels), what you're looking at, Call, search. */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap lg:flex-nowrap" style={{ padding: "8px 16px", background: T.card, borderBottom: `1px solid ${T.hairSoft}` }}>
          {channel?.kind === "phone" ? (
            <div className="flex overflow-hidden shrink-0" style={{ height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 4 }}>
              <button onClick={() => setFilter("all")} style={seg(filter === "all")}>All {n.length}</button>
              <button onClick={() => setFilter("call")} style={{ ...seg(filter === "call"), borderLeft: `1px solid ${T.hairStrong}` }}>Calls {nCalls}</button>
              <button onClick={() => setFilter("text")} style={{ ...seg(filter === "text"), borderLeft: `1px solid ${T.hairStrong}` }}>Texts {n.length - nCalls}</button>
            </div>
          ) : null}
          {channel?.kind === "phone" && usedLines.length > 1 ? (
            <div className="flex overflow-hidden shrink-0" style={{ height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 4 }} title="One channel — their number. The dot is which of yours they reached.">
              <button onClick={() => setLineFilter(null)} style={seg(!lineFilter)}>All lines</button>
              {usedLines.map((l) => (
                <button key={l.id} onClick={() => setLineFilter(l.id)} style={{ ...seg(lineFilter === l.id), borderLeft: `1px solid ${T.hairStrong}`, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 7, background: l.color, display: "inline-block" }} />{l.name}
                </button>
              ))}
            </div>
          ) : null}
          {channel?.kind !== "phone" && (
            <div className="flex overflow-hidden shrink-0" style={{ height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 4 }}>
              <button style={seg(true)}>All {channel?.kind === "email" ? emails.length : channel?.kind === "notes" ? nNotes : 0}</button>
            </div>
          )}
          <span className="hidden lg:inline" style={{ fontSize: 11.5, color: T.ink3, ...clip, flex: 1 }}>
            {channel?.kind === "phone" ? (lineFilter ? `Only what came through ${orgLines.find((l) => l.id === lineFilter)?.name ?? "that line"} ${formatPhone(orgLines.find((l) => l.id === lineFilter)?.phone ?? "")}` : usedLines.length > 1 ? "One channel — their number. The dot is which of yours they reached." : "Everything on this number, oldest first") : channel?.kind === "notes" ? "Notes for your team — never sent, and Dusty reads them" : channel?.kind === "email" ? "Emails forwarded to your intake inbox and filed on them" : "ScopeCrete chat isn't built yet"}
          </span>
          <span className="flex-1 lg:hidden" />
          {channel?.kind === "phone" && channel.value && orgLines.length > 1 && outLine ? (
            // Call from ▾ (Lines, package 9): your phone places the call — pick the same line in Quo.
            <span className="inline-flex items-center shrink-0" style={{ ...pill, padding: 0, overflow: "hidden" }}>
              <a href={`tel:${channel.value}`} className="inline-flex items-center gap-1.5 no-underline" style={{ padding: "0 8px", color: "inherit", height: "100%" }}
                aria-label={`Call ${formatPhone(channel.value)} from ${outLine.name}`} title={`Your phone dials — choose ${outLine.name} in Quo`}>
                <Phone size={12} weight="fill" /> <span className="hidden lg:inline">Call from</span>
              </a>
              <label className="inline-flex items-center gap-1" style={{ borderLeft: `1px solid ${T.hair}`, padding: "0 4px 0 6px", height: "100%" }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: outLine.color, display: "inline-block" }} />
                <select value={outLine.id} onChange={(e) => setFromLine(e.target.value)} aria-label="Call or text from line"
                  style={{ border: "none", background: "transparent", fontWeight: 600, fontSize: 12, color: T.ink, maxWidth: 90 }}>
                  {orgLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            </span>
          ) : channel?.kind === "phone" && channel.value ? (
            <a href={`tel:${channel.value}`} style={pill} aria-label={`Call ${formatPhone(channel.value)}`}><Phone size={12} weight="fill" /> <span className="hidden lg:inline">Call</span></a>
          ) : null}
          <button onClick={() => setSearching((v) => !v)} aria-label="Search this thread" aria-pressed={searching}
            className="flex items-center justify-center shrink-0 rounded" style={{ width: 28, height: 28, border: `1px solid ${searching ? T.hiviz : T.hairStrong}`, background: searching ? T.hivizDim : T.card, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={searching ? T.hiviz : T.ink2} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
          </button>
        </div>

        {/* Why they were archived — and that they're back (Coy, 2026-10-04). */}
        {!loading && archivedInfo && (() => {
          const why = archivedInfo.reason && !/^(archived|deleted\b)/.test(archivedInfo.reason) ? archivedInfo.reason : null;
          const day = new Date(archivedInfo.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return (
            <div className="px-4 py-1.5 flex items-center gap-2 flex-shrink-0" style={{ background: archivedInfo.back ? T.hivizDim : T.slab, borderBottom: `1px solid ${T.hairSoft}`, fontSize: 12.5, color: T.ink }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {archivedInfo.back ? <><b>Back</b> — they got in touch after you archived them on {day}</> : <>Archived on {day}</>}
                {why ? <>. Why: <i>{why}</i></> : archivedInfo.back ? "." : " — no reason given."}
              </span>
              {!archivedInfo.back && (
                <button onClick={() => void fetch("/api/archive/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "contact", ids: [contactId] }) })
                  .then(() => { setArchivedInfo(null); threads?.refresh(); })}
                  style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Unarchive</button>
              )}
            </div>
          );
        })()}
        {!loading && merges.map((m) => (
          <div key={m.id} className="px-4 py-1.5 flex items-center gap-2 text-[11px] flex-shrink-0"
            style={{ background: DA.elevated, borderBottom: `1px solid ${DA.border}`, color: DA.textSecondary }}>
            <span className="flex-1 min-w-0 truncate">{m.phone ? formatPhone(m.phone) : "Another number"} was merged into this thread</span>
            <button onClick={() => void undo(m.id)} disabled={undoing === m.id}
              style={{ color: DA.accent, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>
              {undoing === m.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        ))}
        {person && <SamePerson person={person} onMerge={(id) => setMerging({ preselect: id ?? null })} />}

        {!loading && !error && channel?.kind === "notes" ? (
          <div className="flex-1 min-h-0">
            <InternalNotes contactId={contactId} name={name} notes={person?.notes ?? []} onSaved={() => setReload((n) => n + 1)} />
          </div>
        ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: "12px 18px" }}>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: DA.surface }} />)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <WarningCircle size={32} color={DA.error} />
              <p className="text-sm mt-2 font-semibold" style={{ color: DA.textPrimary }}>Couldn&apos;t load this thread</p>
              <p className="text-xs mt-1 break-words" style={{ color: DA.textMuted }}>{error}</p>
            </div>
          ) : channel?.kind === "email" ? (
            emails.length ? (
              <div className="flex flex-col gap-2.5">
                {[...emails].reverse().map((e) => (
                  <div key={e.id} className="rounded" style={{ maxWidth: 640, background: T.card, border: `1px solid ${T.hair}`, padding: "10px 14px" }}>
                    <div className="flex items-baseline gap-2">
                      <span style={{ fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" }}>Email · in</span>
                      <span style={{ fontSize: 12, color: T.ink3 }}>{e.at ? new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{e.subject || "(no subject)"}</div>
                    <div style={{ fontSize: 12, color: T.ink3 }}>{e.from}</div>
                    {e.body && <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.body}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16" style={{ fontSize: F.sm, color: T.ink3 }}>No emails filed on {name ?? "them"}. Forwarded emails land in Files → Emails; file one on them and it shows here.</div>
            )
          ) : channel?.kind === "chat" ? (
            <div className="text-center py-16" style={{ fontSize: F.sm, color: T.ink3, maxWidth: 380, margin: "0 auto" }}>
              ScopeCrete chat with {name ?? "them"} isn&apos;t built yet. When it is, an invite goes from your own phone — nothing is sent for you.
            </div>
          ) : (
            <Timeline messages={shown} notes={filter === "all" ? person?.notes ?? [] : []} phone={channel?.value ?? phone} />
          )}
        </div>

        )}

        {!loading && !error && channel?.kind !== "chat" && channel?.kind !== "notes" && (
          <Composer contactId={contactId} phone={channel?.kind === "phone" ? channel.value : phone} name={name}
            only={channel?.kind === "email" ? "email" : "text"} onNoteSaved={() => setReload((n) => n + 1)}
            fromLine={orgLines.length > 1 ? { lines: orgLines, value: outLine?.id ?? null, onPick: setFromLine } : null} />
        )}
      </div>

      {searching && (
        <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:shrink-0 lg:h-full" style={{ top: "var(--sc-head)" }}>
          <div className="h-full lg:w-[340px]">
            <ThreadSearch contactId={contactId} firstName={(name ?? "").split(/\s+/)[0] || "This person"} number={channel?.kind === "phone" ? channel.value : null}
              threadName={threadName} threadContacts={threadIds}
              threadBucket={threads ? ({ customers: "customer", vendors: "vendor", personal: "personal", spam: "spam", unsorted: "unsorted" } as Record<string, string>)[threads.thread] ?? null : null} onClose={() => setSearching(false)}
              onOpen={(r) => {
                setSearching(false);
                if (r.contact_id !== contactId) { router.push(`/dashboard/messages/${r.contact_id}${tq}`); return; }
                if (r.channel) pickChannel(r.channel);
                setTimeout(() => document.getElementById(`m-${r.id}`)?.scrollIntoView({ block: "center" }), 60);
              }} />
          </div>
        </div>
      )}

      {merging && (
        <MergeSheet contactId={contactId} keepLabel={headerTitle} keepCount={messages.length}
          preselectId={merging ? merging.preselect : null}
          onClose={() => setMerging(false)}
          onMerged={() => { setMerging(false); setLoading(true); setReload((n) => n + 1); }} />
      )}

      <FileAsSheet open={filing} onClose={() => setFiling(false)} contactId={contactId}
        target={{ bucket: person?.contact.bucket ?? null, subtype: person?.contact.subtype ?? null,
                  bucket_auto: person?.contact.bucket_state === "auto" ? { reason: null } : null,
                  proposal: person?.contact.guess ? { classification: person.contact.guess } : null }}
        subtypes={person?.subtypes}
        onFiled={() => { setFiling(false); setReload((n) => n + 1); threads?.refresh(); }} />
    </div>
  );
}

