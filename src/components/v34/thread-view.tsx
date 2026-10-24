"use client";

import { Emblem } from "@/components/site/marks";
import { askDustyBrief } from "@/lib/v34/dusty-brief";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, WarningCircle, Envelope, Sparkle, NotePencil, CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums } from "@/lib/v34/tokens";
import { Composer } from "@/components/v34/composer";
import { DA, MergeSheet, Timeline, formatPhone, type MergeInfo, type ThreadMessage, type ThreadEmail } from "@/components/v34/conversation";
import { ContactThreadHead, FilterBar, SearchPill, useReading, useSpacesNav } from "@/components/v34/contact-thread-head";
import { scoped, readSize, readFont, readBg, type CtFilter } from "@/lib/v34/contact-thread";
import { SamePerson, type Person } from "@/components/v34/person-view";
import { ContactCard } from "@/components/v34/contact-card";
import { NameEditor, FileAsSheet } from "@/components/v34/contact-edit";
import { ArchiveButton } from "@/components/v34/archive-actions";
import { useThreads } from "@/components/v34/threads-ctx";
import { threadLabel } from "@/components/v34/thread-rail";
import { InitialsBox, RoleTag } from "@/components/v34/thread-list";
import { ThreadSearch } from "@/components/v34/thread-search";
import { InternalNotes } from "@/components/v34/internal-notes";
import { inChannel, roleOf, type Channel, type ChannelFilter } from "@/lib/v34/threads";
import { useLiveThreads } from "@/lib/v34/live-threads";
import { useLiveCalls } from "@/lib/v34/alerts-live";
import { liveCallFor } from "@/lib/alerts";
import { usePref } from "@/lib/v34/prefs";
import { TEXT_SIZES, textSize } from "@/lib/v34/text-size";
import { LiveCallBadge, LiveDot } from "@/components/v34/incoming-alerts";

/**
 * One person, opened in Threads (Threads v2, Claude Design 2026-10-03): their
 * name and role, a link to their Customer / Vendor page (or their own page,
 * Contact ›), and their CHANNELS — each phone number its own (calls,
 * voicemails and texts in one timeline, filterable), then email, then chat —
 * with search beside it. ?person=1 shows their own page (person-view.tsx):
 * next steps, jobs, what Dusty read.
 */

interface ContactJob { id: string; title: string | null; status: string | null; contact_id: string | null }

export function ThreadView({ contactId, embedded = false }: {
  contactId: string;
  /** Inside the customer page's Threads tab (Coy, 2026-10-07): not pinned to the screen, no way back to the list. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const personPage = !embedded && search.get("person") === "1";
  // Embedded (the customer page's Threads tab) the thread fills the screen down to its bottom edge,
  // so the text box sits at the bottom without scrolling (Coy, 2026-10-07: "fixed to the bottom of
  // screen. Right now i have to scroll down to see it"). Measured from where the thread starts.
  const [embedH, setEmbedH] = useState<number | null>(null);
  const embedRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || !embedded) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const foot = window.innerWidth >= 1024 ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sc-foot")) || 0;
      setEmbedH(Math.max(360, Math.round(window.innerHeight - top - foot)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [embedded]);
  const threads = useThreads();
  const threadKey = search.get("t") ?? threads?.thread ?? null;
  const tq = threadKey ? `?t=${encodeURIComponent(threadKey)}` : "";
  const [channels, setChannels] = useState<Channel[]>([]);
  const [emails, setEmails] = useState<ThreadEmail[]>([]);
  const [channelKey, setChannelKey] = useState<string | null>(search.get("channel"));
  // Under Spaces (Claude Design "Contact Thread", 2026-10-23): one timeline of every channel, a Phone or
  // Email filter, search scoped to it, Notes beside it and reading settings kept on the device.
  const spaces = useSpacesNav() && !embedded;
  const [reading] = useReading();
  const [ctFilter, setCtFilter] = useState<CtFilter>(() => (search.get("channel") ?? "").startsWith("email") ? "email" : "all");
  const [notesOpen, setNotesOpen] = useState(search.get("channel") === "notes");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ChannelFilter>("all");
  // The fold button is gone (Coy, 2026-10-09: "can be removed completely"); on a phone the open
  // number's tab drops down All · Calls · Texts instead of a select in the toolbar.
  const [tabMenu, setTabMenu] = useState<number | null>(null);
  // Lines (Claude Design package 9): the org's numbers, when it has two or more.
  const [orgLines, setOrgLines] = useState<Array<{ id: string; name: string; phone: string; color: string; provider: string | null; is_primary: boolean }>>([]);
  const [firstLine, setFirstLine] = useState<{ id: string; name: string | null; at: string } | null>(null);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const [archivedInfo, setArchivedInfo] = useState<{ at: string; reason: string | null; back: boolean } | null>(null);
  const [fromLine, setFromLine] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);
  // The conversation's text size, like Dusty's chat (Coy, 2026-10-09), saved to the account.
  const [sizeKey, setSizeKey] = usePref<string>("thread_font", "m");
  const size = textSize(sizeKey);
  const liveCalls = useLiveCalls();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [, setNameConfirmed] = useState(false);
  const [, setNameSource] = useState<string | null>(null);
  const [, setAddress] = useState<string | null>(null);
  const [, setPhones] = useState<string[]>([]);
  const [merges, setMerges] = useState<MergeInfo[]>([]);
  const [jobs, setJobs] = useState<ContactJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Their next text or call appears here as it lands (live-threads.ts).
  useLiveThreads(() => setReload((n) => n + 1), contactId);
  // Open, and optionally on a suggested match ("Also Amber").
  const [merging, setMerging] = useState<false | { preselect: string | null }>(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  // Their page, when they are a customer or a vendor (/api/people). A failure
  // here leaves the plain conversation, which still works.
  const [person, setPerson] = useState<Person | null>(null);
  // Why their card couldn't load — said on the card's page, never a silent fall back to the thread (2026-10-09).
  const [personErr, setPersonErr] = useState<string | null>(null);
  useEffect(() => {
    if (!contactId) return;
    let off = false;
    fetch(`/api/people/${contactId}`).then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        return b;
      })
      .then((b) => {
        if (off || !b?.contact) return;
        setPersonErr(null);
        setPerson(b as Person);
      }).catch((e) => { if (!off) setPersonErr(e instanceof Error ? e.message : String(e)); });
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
        // AI Chat is coming soon: kept in the API, not shown (Coy, 2026-10-05).
        setChannels(Array.isArray(data.channels) ? (data.channels as Channel[]).filter((c) => c.kind !== "chat") : []);
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

  // Their own page (Contact ›): a simple contact card. A vendor gets one too, with
  // Vendor page › beside it (Coy, 2026-10-09: the breadcrumb's contact and vendor
  // links both went to the vendor page).
  if (personPage && !person && personErr) {
    return (
      <div className="sc-pinned overflow-y-auto" style={{ background: T.slab, padding: 16 }}>
        <Link href={`/dashboard/messages/${contactId}${tq}`} style={{ ...eyebrow, color: T.chalk }}>‹ Back</Link>
        <div role="alert" style={{ marginTop: 12, fontSize: F.sm, color: T.red }}>Couldn&apos;t load their card: {personErr}</div>
      </div>
    );
  }
  if (person && !loading && !error && personPage) {
    const vendHref = person.contact.bucket === "vendor"
      ? `/dashboard/vendors/${contactId}?from=threads${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}` : null;
    const custHref = person.contact.bucket === "customer" && person.contact.customer_id
      ? `/dashboard/customers/${person.contact.customer_id}?contact=${contactId}&from=threads${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}` : null;
    return (
      <div className="sc-pinned overflow-y-auto flex flex-col" style={{ background: T.slab }}>
        {/* A simple contact page — the numbers, emails and address, and where they're changed (Coy, 2026-10-06). */}
        <ContactCard person={person} back={{ href: `/dashboard/messages/${contactId}${tq}`, label: "Back" }}
          textHref={`/dashboard/messages/${contactId}${tq}`} customerHref={custHref} vendorHref={vendHref} startEditing={search.get("edit") === "1"}
          onReload={() => setReload((n) => n + 1)} onJoin={(id) => setMerging({ preselect: id ?? null })} />
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
    : c?.bucket === "vendor" ? { href: `/dashboard/vendors/${contactId}?from=threads${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}`, label: "Vendor page" }
    : { href: `/dashboard/messages/${contactId}?person=1${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}`, label: "Contact" };
  // Their own contact card, where numbers, emails and the address are changed (Coy, 2026-10-07: "Edit Contact").
  const cardHref = `/dashboard/messages/${contactId}?person=1${threadKey ? `&t=${encodeURIComponent(threadKey)}` : ""}`;
  // ⋯ Edit contact opens the card with its editor already open (Coy, 2026-10-10).
  const editHref = `${cardHref}&edit=1`;
  // The breadcrumb's last link: a vendor's page, else their customer's page — the same name again for a homeowner.
  const crumbOrg = c?.bucket === "vendor"
    ? { href: pageLink.href, label: c.company || name || formatPhone(phone), kind: "Vendor", color: T.chalk }
    : c?.customer_id ? { href: `/dashboard/customers/${c.customer_id}`, label: c.customer_name || c.company || name || formatPhone(phone), kind: "Customer", color: T.chalk }
    : null;
  // Where they first reached you lives in Internal notes now, not the header (Coy, 2026-10-05).
  const leadSource = firstLine?.name ? `First reached you on the ${firstLine.name} line, ${new Date(firstLine.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : null;
  // Internal notes are a tab of their own, first on the left (Coy, 2026-10-04) — but a person
  // still opens on their conversation, not on the notes.
  const nNotes = person?.notes?.length ?? 0;
  const notesTab: Channel = { key: "notes", kind: "notes", label: "Notes", value: null, calls: 0, texts: 0, emails: nNotes, reachable: true };
  // Notes open from the ⋯ menu on the name's row, not a tab (Coy, 2026-10-06).
  const tabs = channels;
  const channel = channelKey === "notes" ? notesTab : tabs.find((x) => x.key === channelKey) ?? channels[0] ?? null;
  const phoneTabs = tabs.filter((c) => c.kind === "phone");
  const shownPhoneKey = channel?.kind === "phone" ? channel.key : phoneTabs[0]?.key ?? null;
  const shown = channel?.kind === "phone" ? messages.filter((m) => inChannel({ channel: m.channel, counterparty: m.counterparty ?? null }, channel, filter) && (!lineFilter || m.line_id === lineFilter)) : [];
  const n = channel?.kind === "phone" ? messages.filter((m) => inChannel({ channel: m.channel, counterparty: m.counterparty ?? null }, channel, "all")) : [];
  const nCalls = n.filter((m) => m.channel === "call" || m.channel === "voicemail").length;
  const threadName = threads ? threadLabel(threads.thread, threads.custom).name : "Threads";
  const threadIds = threads && !["customers", "unsorted", "vendors", "personal", "spam", "archived"].includes(threads.thread)
    ? threads.custom?.find((t) => t.id === threads.thread)?.contact_ids ?? [] : [];
  // A call happening now on one of their numbers (Coy, 2026-10-06: "if there is an active phone
  // call I would like that thread channel to show it's active") — from Quo's ring (migration 086).
  const liveHere = channel?.kind === "phone" ? liveCallFor(liveCalls, contactId, channel.value) : null;
  const liveAny = liveHere ?? liveCallFor(liveCalls, contactId) ?? channels.map((x) => x.kind === "phone" ? liveCallFor(liveCalls, contactId, x.value) : null).find(Boolean) ?? null;
  const pickChannel = (k: string) => { setChannelKey(k); setFilter("all"); setLineFilter(null); };
  // The lines this person actually reached on this number, and the one a text or call goes from:
  // the line they last used, else the primary.
  const usedLines = orgLines.filter((l) => n.some((m) => m.line_id === l.id));
  const lastLine = [...n].reverse().find((m) => m.line_id)?.line_id ?? null;
  const defaultLine = lastLine ?? orgLines.find((l) => l.is_primary)?.id ?? orgLines[0]?.id ?? null;
  const outLine = orgLines.find((l) => l.id === (fromLine ?? defaultLine)) ?? null;
  const pill: React.CSSProperties = { height: 28, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 6,
    border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink2, fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" };
  const seg = (on: boolean): React.CSSProperties => ({ height: "100%", padding: "0 10px", border: "none", background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
    fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" });

  if (spaces) {
    const phonesList = phoneTabs.filter((p) => p.value).map((p) => ({ value: p.value as string, label: p.label }));
    const emailList = channels.filter((x) => x.kind === "email" && x.value).map((x) => x.value as string);
    const newEmailHref = `/dashboard/messages/email/new?contact=${contactId}${emailList[0] ? `&to=${encodeURIComponent(emailList[0])}` : ""}`;
    const view = scoped(ctFilter, q, { messages, emails, notes: person?.notes ?? [] });
    const who = name ?? formatPhone(phone);
    const textTo = phoneTabs.find((p) => p.key === channelKey)?.value ?? phone;
    const action = ctFilter === "email"
      ? <Link href={newEmailHref} style={{ ...pill, borderRadius: 999, background: T.chalk, color: "#fff", border: "none" }}><Envelope size={13} /> New email</Link>
      : textTo ? <a href={`tel:${textTo}`} style={{ ...pill, borderRadius: 999, background: T.green, color: "#fff", border: "none" }}><Phone size={13} weight="fill" /> Call</a> : null;
    const menuItem: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: F.sm, color: T.ink, background: "transparent", border: "none", display: "block", width: "100%" };
    return (
      <div className="flex sc-pinned sc-pinned-full">
        <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: DA.bg }}>
          <ContactThreadHead name={name} phone={phone} loading={loading} cardHref={cardHref}
            org={crumbOrg && crumbOrg.label !== name ? { href: crumbOrg.href, label: crumbOrg.label, kind: crumbOrg.kind } : null}
            phones={phonesList} emails={emailList} newEmailHref={newEmailHref}
            filter={ctFilter} onFilter={(f) => { setCtFilter(f); setNotesOpen(false); }}
            notesOpen={notesOpen} onNotes={() => setNotesOpen((v) => !v)} nNotes={nNotes}
            searching={searching} onSearch={() => { setSearching((v) => !v); setQ(""); }}
            menu={(close) => (<>
              <Link href={cardHref} onClick={close} style={menuItem}>Contact details</Link>
              <button onClick={() => { close(); setNotesOpen(true); }} style={menuItem}>All notes{nNotes ? ` (${nNotes})` : ""}</button>
              <button onClick={() => { close(); askDustyBrief(); }} style={menuItem}>Where things stand</button>
              {pageLink.label !== "Contact" && <Link href={pageLink.href} onClick={close} style={menuItem}>{pageLink.label} ›</Link>}
              <button onClick={() => { close(); setFiling(true); }} style={menuItem}>Move thread</button>
              {orgLines.length > 1 && outLine && (
                // Which of your lines a call or text goes from — in ⋯, not under the text box (Coy, 2026-10-24).
                <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "6px 0" }}>
                  <span style={{ ...eyebrow, fontSize: 11, color: T.ink3, padding: "0 12px" }}>Call or text from</span>
                  {orgLines.map((l) => (
                    <button key={l.id} onClick={() => { close(); setFromLine(l.id); }} style={{ ...menuItem, fontWeight: l.id === outLine.id ? 600 : 400 }}>
                      {l.name}{l.id === outLine.id ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              {!openJob && <button onClick={() => { close(); void newScope(); }} disabled={starting || jobs === null} style={menuItem}>{starting ? "Starting…" : "New scope"}</button>}
              <ArchiveButton kind="contact" id={contactId} action="archive" what="this thread" then="/dashboard/messages" style={menuItem}>Archive</ArchiveButton>
            </>)} />
          {searching && <SearchPill filter={ctFilter} q={q} onQ={setQ} count={view.count} onDone={() => { setSearching(false); setQ(""); }} />}
          {!notesOpen && (
            <FilterBar filter={ctFilter} count={view.count}
              sub={ctFilter === "email" ? (emailList.join(" · ") || "No email on file") : (phonesList.map((p) => formatPhone(p.value)).join(" · ") || "No number on file")}
              action={action} onAll={() => setCtFilter("all")} />
          )}
          {liveAny && (
            <div className="flex items-center gap-2 flex-shrink-0" role="status" style={{ padding: "7px 16px", background: T.greenDim, borderBottom: `1px solid ${T.hairSoft}` }}>
              <LiveCallBadge call={liveAny} />
              <span className="min-w-0" style={{ fontSize: 12, color: T.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {liveAny.direction === "outbound" ? "to" : "from"} {formatPhone(liveAny.phone)}{liveAny.line ? ` · via ${liveAny.line}` : ""}
              </span>
            </div>
          )}
          {person && <SamePerson person={person} onMerge={(id) => setMerging({ preselect: id ?? null })} />}
          {!loading && !error && notesOpen ? (
            <div className="flex-1 min-h-0" style={{ zoom: readSize(reading).z, fontFamily: readFont(reading).css }}>
              <InternalNotes contactId={contactId} name={name} notes={person?.notes ?? []} leadSource={leadSource} onSaved={() => setReload((n) => n + 1)}
                merges={merges.map((m) => ({ id: m.id, label: `${m.phone ? formatPhone(m.phone) : "Another number"} was merged into this thread`, at: m.merged_at }))}
                onUndoMerge={(id) => void undo(id)} undoing={undoing} />
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: "12px 18px", background: readBg(reading).css }}>
              <div style={{ zoom: readSize(reading).z, fontFamily: readFont(reading).css, lineHeight: 1.5 }}>
                {loading ? (
                  <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: DA.surface }} />)}</div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <WarningCircle size={32} color={DA.error} />
                    <p className="text-sm mt-2 font-semibold" style={{ color: DA.textPrimary }}>Couldn&apos;t load this thread</p>
                    <p className="text-xs mt-1 break-words" style={{ color: DA.textMuted }}>{error}</p>
                  </div>
                ) : view.count === 0 && ctFilter !== "all" && !q ? (
                  <div className="flex flex-col items-center gap-3 text-center py-16" style={{ fontSize: F.sm, color: T.ink3 }}>
                    <span>{ctFilter === "email" ? `No emails with ${who} yet.` : `No calls or texts with ${who} yet.`}</span>{action}
                  </div>
                ) : view.count === 0 && q ? (
                  <div className="text-center py-16" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing matches “{q}”.</div>
                ) : (
                  <Timeline messages={view.messages} emails={view.emails} notes={view.notes} phone={phone} />
                )}
              </div>
            </div>
          )}
          {!loading && !error && !notesOpen && (
            <Composer contactId={contactId} phone={textTo} name={name}
              only={ctFilter === "email" ? "email" : "text"} onNoteSaved={() => setReload((n) => n + 1)} onSent={() => setReload((n) => n + 1)}
              fromLine={orgLines.length > 1 ? { lines: orgLines, value: outLine?.id ?? null, onPick: setFromLine } : null} />
          )}
        </div>
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

  return (
    <div ref={embedded ? embedRef : undefined} className={embedded ? "flex" : "flex sc-pinned sc-pinned-full"}
      style={embedded ? { height: embedH ?? "calc(100dvh - var(--sc-head) - 64px)", minHeight: 360 } : undefined}>
      <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: DA.bg }}>
        <div className="flex-shrink-0" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, padding: "10px 16px 0" }}>
          {/* Phone: back to the thread, by name. A little more room between the buttons (Coy, 2026-10-09). */}
          <div className="flex items-center gap-3 lg:gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {/* Phone: the thread's back link sits top left, on the buttons' row (Coy, 2026-10-09), and says
                  Threads whichever list it returns to (Coy, 2026-10-09: "so that I know that I'm just going back to the main threads page"). */}
              {!embedded && (
                <Link href={`/dashboard/messages${threadKey ? `?t=${encodeURIComponent(threadKey)}` : ""}`} className="sc-back-link lg:hidden min-w-0"
                  style={{ ...eyebrow, fontSize: 14, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>‹ Threads</Link>
              )}
              {/* Threads v3 under Spaces (Claude Design, 2026-10-19): a square with their initials, the name and
                  tag, and under it which channel this is — "Cell · (225) 320-4143" — on every size. */}
              {!embedded && (
                <span className="sc-spaces-only min-w-0" style={{ flex: 1 }}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0"><InitialsBox name={name || null} size={38} /></span>
                    <span className="min-w-0 flex flex-col">
                      <span className="flex items-center gap-2 min-w-0">
                        <Link href={cardHref} className="min-w-0" title="Their contact card"
                          style={{ fontFamily: "var(--sc-font-strong)", fontSize: 16, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {loading ? headerTitle : (name || formatPhone(phone))}
                        </Link>
                        {/* "Jeremy Wright w/ Gulfline Paving", the company opening its customer or vendor page; no role tag
                            here — who they are is on the contact card (Coy, 2026-10-22). */}
                        {!loading && crumbOrg && crumbOrg.label !== name && (
                          <span className="min-w-0" style={{ fontSize: 14, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            w/ <Link href={crumbOrg.href} title={`${crumbOrg.kind} page`} style={{ color: crumbOrg.color, fontWeight: 600 }}>{crumbOrg.label}</Link>
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...nums }}>
                        {channel?.kind === "phone" && channel.value ? `${channel.label} · ${formatPhone(channel.value)}`
                          : channel?.kind === "email" ? (channel.value ?? "Email")
                          : channel?.kind === "notes" ? "Internal notes" : ""}
                      </span>
                    </span>
                  </span>
                </span>
              )}
              {/* On a phone the name is in the breadcrumb rows below; this row keeps the buttons (Coy, 2026-10-09). */}
              <span className={embedded ? "contents" : "hidden lg:contents sc-old-nav-only"}>
              {loading ? (
                <div style={{ fontFamily: "var(--sc-font-strong)", fontSize: "var(--sc-thread-name)", fontWeight: 700, color: T.ink }}>{headerTitle}</div>
              ) : (
                <NameEditor contactId={contactId} name={name} fallback={formatPhone(phone)}
                  onSaved={(v) => { setName(v); setNameConfirmed(true); setNameSource("human"); }}
                  style={{ fontFamily: "var(--sc-font-strong)", fontSize: "var(--sc-thread-name)", fontWeight: 700, lineHeight: 1.15, color: T.ink }} />
              )}
              {/* The customer or vendor they speak for, beside the name (Coy, 2026-10-09: "John Freeling · Icon Technologies"). */}
              {!loading && c?.company && (
                <span title={c.company} style={{ fontSize: "var(--sc-thread-co)", fontWeight: 500, color: T.ink2, minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {c.company}</span>
              )}
              </span>
              {/* No tag on a phone: the thread's name at the left already says it (Coy, 2026-10-05). */}
              {c && <span className={`hidden lg:inline-flex${embedded ? "" : " sc-old-nav-only"}`}><RoleTag role={role} auto={c.bucket_state === "auto"} /></span>}
            </div>
            {/* Notes is an icon beside the menu (Coy, 2026-10-07), its count on it. */}
            <button onClick={() => pickChannel(channel?.kind === "notes" ? (channels[0]?.key ?? "") : "notes")} aria-pressed={channel?.kind === "notes"}
              aria-label={`Internal notes${nNotes ? ` (${nNotes})` : ""}`} title="Internal notes"
              style={{ ...pill, padding: "0 7px", gap: 3, ...(channel?.kind === "notes" ? { borderColor: T.hiviz, background: T.hivizDim, color: T.ink } : {}) }}>
              <NotePencil size={15} />{nNotes ? <span style={{ fontSize: 11, ...nums }}>{nNotes}</span> : null}
            </button>
            {/* Call on the top row on a phone (Coy, 2026-10-09); the desktop keeps Call from ▾ in the toolbar. */}
            {channel?.kind === "phone" && channel.value && (
              <a href={`tel:${channel.value}`} className={`flex items-center justify-center shrink-0${embedded ? " lg:hidden" : " sc-thread-call"}`} style={{ ...pill, padding: "0 8px" }}
                aria-label={`Call ${formatPhone(channel.value)}${outLine ? ` from ${outLine.name}` : ""}`} title={outLine ? `Your phone dials — choose ${outLine.name} in Quo` : undefined}>
                <Phone size={15} weight="fill" /><span className="sc-spaces-only">Call</span>
              </a>
            )}
            {/* Search sits beside Notes on the top row (Coy, 2026-10-09). */}
            <button onClick={() => setSearching((v) => !v)} aria-label="Search this thread" aria-pressed={searching} title="Search this thread"
              className="flex items-center justify-center shrink-0" style={{ ...pill, padding: "0 8px", ...(searching ? { borderColor: T.hiviz, background: T.hivizDim } : {}) }}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke={searching ? T.hiviz : T.ink2} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
            </button>
            <span className="flex items-center shrink-0">
              {/* The ScopeCrete emblem is the AI (Coy, 2026-10-06), its own button beside ⋯ on every size (2026-10-09): Dusty opens with where this thread stands and the next steps. */}
              <button onClick={askDustyBrief} aria-label="Ask Dusty where this stands and the next steps" title="Dusty: where this stands and the next steps"
                className="flex items-center justify-center" style={{ ...pill, padding: "0 6px", border: `1px solid ${T.hiviz}` }}><Emblem size={22} spin /></button>
            </span>
            <div className="relative">
              <button onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More" style={{ ...pill, padding: "0 8px" }}>⋯</button>
              {more && (
                <div className="absolute right-0 z-20 flex flex-col rounded" style={{ top: 32, minWidth: 180, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
                  <Link href={editHref} className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink }}>Edit contact</Link>
                  {pageLink.label !== "Contact" && !embedded && <Link href={pageLink.href} className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink }}>{pageLink.label} ›</Link>}
                  <button onClick={() => { setMore(false); setFiling(true); }} className="px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>Move thread</button>
                  {channel?.kind === "phone" && channel.value && orgLines.length > 1 && outLine && (
                    // Which of your lines a call or text goes from — here on a phone, in the toolbar on a desktop (Coy, 2026-10-09).
                    <div className="lg:hidden flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "6px 0" }}>
                      <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Call or text from</span>
                      {orgLines.map((l) => (
                        <button key={l.id} onClick={() => { setFromLine(l.id); setMore(false); }} className="px-3 py-1.5 text-left flex items-center gap-2"
                          style={{ fontSize: F.sm, color: T.ink, fontWeight: l.id === outLine.id ? 600 : 400 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 7, background: l.color, display: "inline-block" }} />
                          {l.name}{l.id === outLine.id ? " ✓" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Text size for the conversation (Coy, 2026-10-09: "similar to how the font in the dusty chat works"). */}
                  <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "6px 0" }}>
                    <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Text size</span>
                    <div className="flex gap-1 px-3 pt-1" role="radiogroup" aria-label="Text size">
                      {TEXT_SIZES.map((f) => (
                        <button key={f.key} role="radio" aria-checked={f.key === size.key} aria-label={f.label} title={f.label} onClick={() => setSizeKey(f.key)}
                          style={{ flex: 1, height: 30, borderRadius: 6, border: `1px solid ${f.key === size.key ? T.hiviz : T.hairStrong}`, background: f.key === size.key ? T.hivizDim : T.card,
                            color: T.ink, fontFamily: disp, fontWeight: 600, fontSize: Math.round(13 * f.z), cursor: "pointer" }}>A</button>
                      ))}
                    </div>
                  </div>
                  {/* Merge is on the contact card; the job opens from the customer page (Coy, 2026-10-07). */}
                  {!openJob && <button onClick={() => void newScope()} disabled={starting || jobs === null} className="px-3 py-2 text-left" style={{ fontSize: F.sm, color: T.ink }}>{starting ? "Starting…" : "New scope"}</button>}
                  <ArchiveButton kind="contact" id={contactId} action="archive" what="this thread" then="/dashboard/messages"
                    style={{ padding: "8px 12px", textAlign: "left", fontSize: F.sm, color: T.ink, background: "transparent", border: "none" }}>Archive</ArchiveButton>
                </div>
              )}
            </div>
          </div>
          {/* Phone: under the buttons, the person, then their customer or vendor, one per row (Coy, 2026-10-09: "stack them"), each saying what it opens in its own colour. */}
          {!embedded && (
            // The labels in one column and the names lined up beside them (Coy, 2026-10-09: "better symmetry").
            <nav aria-label="Where you are" className="lg:hidden grid mt-1.5 min-w-0 items-baseline sc-old-nav-only"
              style={{ ...eyebrow, fontSize: 13, whiteSpace: "nowrap", gridTemplateColumns: "auto auto minmax(0, 1fr)", columnGap: 8, rowGap: 3 }}>
              <span style={{ color: T.ink3 }}>Contact</span>
              <span aria-hidden style={{ color: T.hairStrong }}>|</span>
              <Link href={cardHref} className="min-w-0" style={{ color: T.green, overflow: "hidden", textOverflow: "ellipsis" }}>{loading ? headerTitle : (name || formatPhone(phone))}</Link>
              {!loading && crumbOrg && (<>
                <span style={{ color: T.ink3 }}>{crumbOrg.kind}</span>
                <span aria-hidden style={{ color: T.hairStrong }}>|</span>
                <Link href={crumbOrg.href} className="min-w-0" style={{ color: crumbOrg.color, overflow: "hidden", textOverflow: "ellipsis" }}>{crumbOrg.label}</Link>
              </>)}
            </nav>
          )}
          {/* The third row: the channels. Each number is its own (calls, voicemails and texts together), then email, then chat. */}
          <div className="flex items-stretch gap-1.5 mt-2 pb-2.5 overflow-x-auto" role="tablist" aria-label="Channels">
            {tabs.map((ch) => {
              const on = channel?.key === ch.key;
              // On a phone only one number shows — the open one, else the first; the others are in its drop-down
              // (Coy, 2026-10-09: "not enough room on the header for two phone numbers").
              const spare = ch.kind === "phone" && ch.key !== shownPhoneKey;
              const chLive = ch.kind === "phone" ? liveCallFor(liveCalls, contactId, ch.value) : null;
              const sub = ch.kind === "phone" ? `${ch.calls} call${ch.calls === 1 ? "" : "s"} · ${ch.texts} text${ch.texts === 1 ? "" : "s"}`
                : ch.kind === "notes" ? `${nNotes} note${nNotes === 1 ? "" : "s"}`
                : ch.kind === "email" ? (ch.value ? `${ch.value}${ch.emails ? ` · ${ch.emails}` : ""}` : ch.emails ? `${ch.emails} filed here` : "No email on file")
                : "Not joined · invite";
              return (
                <button key={ch.key} role="tab" aria-selected={on} aria-haspopup={on && ch.kind === "phone" ? "menu" : undefined}
                  onClick={(e) => {
                    // On a phone a second tap on the open number drops down All · Calls · Texts (Coy, 2026-10-09).
                    if (on && ch.kind === "phone" && !window.matchMedia("(min-width: 1024px)").matches) {
                      const el = e.currentTarget; const bar = el.parentElement;
                      setTabMenu((x) => (x === null ? el.offsetLeft - (bar?.scrollLeft ?? 0) : null));
                      return;
                    }
                    setTabMenu(null); pickChannel(ch.key);
                  }} className={`sc-ch-tab text-left flex-1 lg:flex-none shrink-0${spare ? " hidden lg:block" : ""}`}
                  // Rounded buttons, the open one filled (Coy, 2026-10-09: "more like beautiful buttons").
                  style={{ minWidth: 0, padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? (chLive ? T.green : T.hiviz) : chLive ? T.green : T.hairStrong}`,
                    background: on ? T.hivizDim : T.card, boxShadow: on ? "0 1px 3px rgba(0,0,0,.10)" : "none", opacity: ch.reachable || on ? 1 : 0.5, cursor: "pointer" }}>
                  {/* An icon and a short name, one line (Coy, 2026-10-05): ☎ Cell, ✉, ✦ AI Chat, Notes. */}
                  <span aria-label={ch.kind === "email" ? "Email" : undefined} className="justify-center lg:justify-start" style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--sc-font-strong)", fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: "nowrap" }}>
                    {ch.kind === "phone" ? <Phone size={13} weight="fill" color={T.ink3} />
                      : ch.kind === "email" ? <Envelope size={16} color={T.ink2} />
                      : ch.kind === "chat" ? <Sparkle size={13} color={T.ink3} />
                      : <NotePencil size={13} color={T.ink3} />}
                    {/* The number, then its name (Coy, 2026-10-09: "(225) 320-4143 Cell"); renamed on the contact card, not here (Coy, 2026-10-09). */}
                    {ch.kind === "email" ? null : ch.kind === "phone" && ch.value ? <>{formatPhone(ch.value)} <span style={{ color: T.ink3, fontWeight: 500 }}>{ch.label}</span></> : ch.label}
                    {chLive && <LiveDot size={8} />}
                    {on && ch.kind === "phone" && (
                      <span className="lg:hidden inline-flex items-center gap-0.5" style={{ color: T.ink2, fontWeight: 500 }}>
                        {filter === "call" ? "· Calls" : filter === "text" ? "· Texts" : ""}<CaretDown size={11} />
                      </span>
                    )}
                  </span>
                  {chLive ? <span className="hidden lg:block"><LiveCallBadge call={chLive} compact /></span>
                    : <span className="hidden lg:block sc-ch-sub" style={{ fontSize: 11, color: T.ink3, ...nums, whiteSpace: "nowrap" }}>{sub}</span>}
                </button>
              );
            })}
          </div>
          {tabMenu !== null && channel?.kind === "phone" && (
            <div className="lg:hidden relative">
              <div role="menu" aria-label="Show" className="absolute z-30 flex flex-col rounded"
                style={{ top: -6, left: Math.max(0, tabMenu), minWidth: 150, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
                {([["all", "All", n.length], ["call", "Calls", nCalls], ["text", "Texts", n.length - nCalls]] as const).map(([k, label, count]) => (
                  <button key={k} role="menuitemradio" aria-checked={filter === k} onClick={() => { setFilter(k); setTabMenu(null); }}
                    className="px-3 py-2 text-left flex items-center justify-between gap-3" style={{ fontSize: F.sm, color: T.ink, fontWeight: filter === k ? 600 : 400 }}>
                    <span>{label}{filter === k ? " ✓" : ""}</span><span style={{ color: T.ink3, ...nums }}>{count}</span>
                  </button>
                ))}
                {phoneTabs.length > 1 && (
                  <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "4px 0" }}>
                    <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Their numbers</span>
                    {phoneTabs.map((p) => (
                      <button key={p.key} role="menuitemradio" aria-checked={channel?.key === p.key} onClick={() => { setTabMenu(null); pickChannel(p.key); }}
                        className="px-3 py-1.5 text-left flex items-center justify-between gap-3" style={{ fontSize: F.sm, color: T.ink, fontWeight: channel?.key === p.key ? 600 : 400, whiteSpace: "nowrap" }}>
                        <span>{p.value ? formatPhone(p.value) : p.label} <span style={{ color: T.ink3, fontWeight: 400 }}>{p.value ? p.label : ""}</span>{channel?.key === p.key ? " ✓" : ""}</span>
                        {liveCallFor(liveCalls, contactId, p.value) ? <LiveDot size={8} /> : <span style={{ color: T.ink3, ...nums }}>{p.calls + p.texts}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {usedLines.length > 1 && (
                  <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hairSoft}`, padding: "4px 0" }}>
                    <span className="px-3" style={{ ...eyebrow, fontSize: 11, color: T.ink3 }}>Which of your lines</span>
                    {[{ id: null as string | null, name: "All lines" }, ...usedLines].map((l) => (
                      <button key={l.id ?? "all"} role="menuitemradio" aria-checked={lineFilter === l.id} onClick={() => { setLineFilter(l.id); setTabMenu(null); }}
                        className="px-3 py-1.5 text-left" style={{ fontSize: F.sm, color: T.ink, fontWeight: lineFilter === l.id ? 600 : 400 }}>
                        {l.name}{lineFilter === l.id ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toolbar: the filter (phone channels), what you're looking at, Call, search. */}
        {/* On a phone the toolbar is gone (Coy, 2026-10-09): Call and search are on the top row, the filters in the number's tab. */}
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0 flex-nowrap" style={{ padding: "8px 16px", background: T.card, borderBottom: `1px solid ${T.hairSoft}` }}>
          {/* All · Calls · Texts and the line filter are drop-downs, so the row fits a phone with Call and search
              (Coy, 2026-10-05: "make this a drop down" — "on the same row as the calls/text buttons"). */}
          {channel?.kind === "phone" ? (
            // On a phone the number's own tab drops this down (Coy, 2026-10-09); the desktop keeps the select.
            <select value={filter} onChange={(e) => setFilter(e.target.value as ChannelFilter)} aria-label="Show" className="hidden lg:block"
              style={{ ...pill, padding: "0 6px", minWidth: 0, flex: "0 1 auto" }}>
              <option value="all">All {n.length}</option>
              <option value="call">Calls {nCalls}</option>
              <option value="text">Texts {n.length - nCalls}</option>
            </select>
          ) : null}
          {channel?.kind === "phone" && usedLines.length > 1 ? (
            <select value={lineFilter ?? ""} onChange={(e) => setLineFilter(e.target.value || null)} aria-label="Which of your lines"
              title="One channel — their number. The dot is which of yours they reached." style={{ ...pill, padding: "0 6px", minWidth: 0, flex: "0 1 auto", maxWidth: 110 }}>
              <option value="">All lines</option>
              {usedLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null}
          {channel?.kind !== "phone" && (
            <div className="flex overflow-hidden shrink-0" style={{ height: 28, border: `1px solid ${T.hairStrong}`, borderRadius: 4 }}>
              <button style={seg(true)}>All {channel?.kind === "email" ? emails.length : channel?.kind === "notes" ? nNotes : 0}</button>
            </div>
          )}
          <span className="flex-1" />
          {channel?.kind === "phone" && channel.value && orgLines.length > 1 && outLine ? (
            // Call from ▾ (Lines, package 9): your phone places the call — pick the same line in Quo.
            <span className="inline-flex items-center shrink-0" style={{ ...pill, padding: 0, overflow: "hidden" }}>
              <a href={`tel:${channel.value}`} className="inline-flex items-center gap-1.5 no-underline" style={{ padding: "0 8px", color: "inherit", height: "100%" }}
                aria-label={`Call ${formatPhone(channel.value)} from ${outLine.name}`} title={`Your phone dials — choose ${outLine.name} in Quo`}>
                <Phone size={12} weight="fill" /> <span className="hidden lg:inline">Call from</span>
              </a>
              {/* On a phone the line is picked in ⋯ (Coy, 2026-10-09: "less cluttered"). */}
              <label className="hidden lg:inline-flex items-center gap-1" style={{ borderLeft: `1px solid ${T.hair}`, padding: "0 4px 0 6px", height: "100%" }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: outLine.color, display: "inline-block" }} />
                <select value={outLine.id} onChange={(e) => setFromLine(e.target.value)} aria-label="Call or text from line"
                  style={{ border: "none", background: "transparent", fontWeight: 600, fontSize: 12, color: T.ink, maxWidth: 76 }}>
                  {orgLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            </span>
          ) : channel?.kind === "phone" && channel.value ? (
            <a href={`tel:${channel.value}`} style={pill} aria-label={`Call ${formatPhone(channel.value)}`}><Phone size={12} weight="fill" /> <span className="hidden lg:inline">Call</span></a>
          ) : null}
        </div>

        {/* The call happening now. */}
        {liveAny && (
          <div className="flex items-center gap-2 flex-shrink-0" role="status"
            style={{ padding: "7px 16px", background: T.greenDim, borderBottom: `1px solid ${T.hairSoft}` }}>
            <LiveCallBadge call={liveAny} />
            <span className="min-w-0" style={{ fontSize: 12, color: T.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {liveAny.direction === "outbound" ? "to" : "from"} {formatPhone(liveAny.phone)}{liveAny.line ? ` · via ${liveAny.line}` : ""}
              {liveHere ? "" : channel?.kind === "phone" ? " · on their other number" : ""}
            </span>
          </div>
        )}

        {/* Search drops down over the chat, its full width (Coy, 2026-10-05). */}
        {searching && (
          <div className="flex-shrink-0" style={{ position: "relative", zIndex: 20 }}>
            <ThreadSearch contactId={contactId} firstName={(name ?? "").split(/\s+/)[0] || "this person"}
              threadName={threadName} threadContacts={threadIds}
              threadBucket={threads ? ({ all: "all", customers: "customer", vendors: "vendor", personal: "personal", spam: "spam", unsorted: "unsorted" } as Record<string, string>)[threads.thread] ?? null : null} onClose={() => setSearching(false)}
              onOpen={(r) => {
                setSearching(false);
                if (r.contact_id !== contactId) { router.push(`/dashboard/messages/${r.contact_id}${tq}`); return; }
                if (r.channel) pickChannel(r.channel);
                setTimeout(() => document.getElementById(`m-${r.id}`)?.scrollIntoView({ block: "center" }), 60);
              }} />
          </div>
        )}

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
        {person && <SamePerson person={person} onMerge={(id) => setMerging({ preselect: id ?? null })} />}

        {!loading && !error && channel?.kind === "notes" ? (
          <div className="flex-1 min-h-0" style={{ zoom: size.z }}>
            <InternalNotes contactId={contactId} name={name} notes={person?.notes ?? []} leadSource={leadSource} onSaved={() => setReload((n) => n + 1)}
              merges={merges.map((m) => ({ id: m.id, label: `${m.phone ? formatPhone(m.phone) : "Another number"} was merged into this thread`, at: m.merged_at }))}
              onUndoMerge={(id) => void undo(id)} undoing={undoing} />
          </div>
        ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: "12px 18px" }}>
          <div style={{ zoom: size.z }}>
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
                    {e.body && <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.body}</div>}
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
        </div>

        )}

        {!loading && !error && channel?.kind !== "chat" && channel?.kind !== "notes" && (
          <Composer contactId={contactId} phone={channel?.kind === "phone" ? channel.value : phone} name={name}
            only={channel?.kind === "email" ? "email" : "text"} onNoteSaved={() => setReload((n) => n + 1)} onSent={() => setReload((n) => n + 1)}
            fromLine={orgLines.length > 1 ? { lines: orgLines, value: outLine?.id ?? null, onPick: setFromLine } : null} />
        )}
      </div>


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

