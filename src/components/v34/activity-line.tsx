"use client";

/**
 * Dusty's activity line — under the header, on every screen.
 *
 * v34 had this bar (StreamBar) fed by ten hardcoded sentences, and it was left
 * out of the port for that reason. It is back because there is now something
 * real to say: every item comes from /api/activity, which reads the background
 * enricher's own rows (contact_enrich_runs) and pulse (sc_worker_heartbeats).
 *
 * - Collapsed: one line. Each new thing is shown ONCE on this device, then
 *   it is gone from the line (Coy, 2026-09-28: "don't be redundant"); the
 *   drop-down keeps the history. Reminders show once a day.
 * - With nothing new: Dusty's musings — a light line he wrote about a real
 *   conversation he read (contact_enrich_runs.musing, migration 039), each
 *   once. Then just when he last read.
 * - Tap: the list drops down — each item with its time and detail, linking to
 *   the thread. Like a model's "thinking" disclosure: summary first, detail on
 *   demand.
 * - A reader that is not working pins the line in amber and it stops cycling.
 * - The dot pulses only while something is running: a claimed read, or a
 *   Dusty reply streaming in this tab. Otherwise it is still.
 * - No bubble (Coy, 2026-09-28): the words sit on the grey glass row, typed in
 *   letter by letter as each thought arrives; a live Dusty reply shows its
 *   real tokens as they stream.
 * - Desktop (Coy, 2026-09-30): `inline` puts it in the header row beside the
 *   logo, after a divider, with its drop-down anchored under it at a fixed
 *   width. The phone keeps it as a row under the header. The old emblem and
 *   the line from it to the dot are gone.
 * - The dot's colour and rhythm say what kind of work it is: reading someone
 *   (slow blue), Dusty answering (quick amber), just filed or named (one
 *   green blink), the reader broken (steady red); still when idle.
 * - Nothing in the last day: says when something last happened. Never invents
 *   something happening now.
 * - Since 2026-10-10 (Coy): background work only — calls read, transcripts,
 *   summaries, dreams, his thoughts; never the chat's own reply. No dots in
 *   front; the words in a softer green, in the ".ai"'s Manrope, small and low.
 *   A tap opens Logs → Dusty, where the history lives (`DustyLog`), not a
 *   drop-down.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, eyebrow, agent, clip, nums, relTime } from "@/lib/v34/tokens";
import { usePlanOcr } from "@/lib/v34/plan-ocr-runner";
import { onBack, shouldPoll } from "@/lib/v34/idle-poll";

type Tone = "live" | "good" | "ask" | "warn" | "quiet";
interface Item { id: string; at: string; kind: string; contact_id: string | null; href?: string | null; summary: string; detail: string | null; tone: Tone }
interface Activity {
  pinned: { summary: string; detail: string | null } | null;
  /** Dusty's light lines about conversations he read (migration 039). */
  musings?: Item[];
  waiting: number;
  last_read_at: string | null;
  items: Item[];
}

/** Every 60 s (was 20 — 2026-10-12, Supabase's Disk IO warning: ~15 reads a poll, all day); idle tabs every 5 min (idle-poll.ts). */
const POLL_MS = 60_000;
const CYCLE_MS = 4_000;
/** Musings and dreams linger (Coy, 2026-10-01: "every 15-30 seconds"); news moves on quicker. */
const MUSE_MS = 20_000;
/** A line wider than its room slides along so all of it is read (Coy, 2026-10-02), at this speed. */
const SCROLL_PX_S = 40;
/** How long a line stays: long enough to type in and slide through twice (Coy: "stay a little longer"). */
function lingerMs(it: Item, room: number): number {
  const typed = Math.min(it.summary.length, 160) * 18;
  const slide = Math.max(0, it.summary.length * 8.2 - room) / SCROLL_PX_S * 1000; // ~8px a character in the mono face
  return it.kind === "musing" ? Math.max(MUSE_MS, typed + 2 * (2 * slide + 4000) + 3000) : Math.max(CYCLE_MS, typed + slide + 3500);
}
const DAY_MS = 86_400_000;
const SEEN_KEY = "sc-activity-seen";

/** What this device has already shown. Browser storage can be missing; then everything is new. */
function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function saveSeen(seen: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-400))); } catch { /* private mode */ }
}
/** Reminders come back once a day; everything else once ever. */
const seenKey = (it: Item) => it.kind === "reminder" ? `${it.id}@${new Date().toDateString()}` : it.id;
/** Standing lines and routine reads are for the drop-down, not the line. */
const ON_LINE = (it: Item) => !["waiting", "agreement", "quiet"].includes(it.kind);

const DOT: Record<Tone, string> = {
  live: T.pulse, good: T.pulse, ask: "#3F74C9", warn: "#C98A12", quiet: "#B3AA9A",
};

type Work = "read" | "reply" | "done" | "warn" | null;
const WORK_DOT: Record<Exclude<Work, null>, string> = { read: "#3F74C9", reply: "#C98A12", done: "#2F8A5B", warn: "#B5412C" };

/** "just now", "5m ago", or "on 3 Sep" — relTime alone reads "now ago". */
function ago(iso: string | null | undefined): string {
  const r = relTime(iso);
  if (!r) return "—";
  if (r === "now") return "just now";
  return /^\d+[mhd]$/.test(r) ? `${r} ago` : `on ${r}`;
}

/** How far above the button's foot the words sit — low, under the ".ai" (Coy, 2026-10-10). */
const TEXT_DROP = 3;

function Dot({ tone, live, work }: { tone: Tone; live: boolean; work?: Work }) {
  const cls = work ? `sc-dot-${work}` : live ? "sc-dot-live" : undefined;
  return (
    <span aria-hidden="true" className={cls}
      style={{ width: work ? 8 : 7, height: work ? 8 : 7, borderRadius: 999, background: work ? WORK_DOT[work] : DOT[tone], flex: "0 0 auto", display: "inline-block" }} />
  );
}

export function ActivityLine({ onWorking, onReader, inline }: {
  /** Dusty's chat is answering — no longer shown here (background work only). */
  busy?: boolean;
  /** Desktop: sit in the header row beside the logo (no row of its own). */
  inline?: boolean;
  /** True while the background reader has a read running — the header emblem spins for it. */
  onWorking?: (working: boolean) => void;
  /** The reader's state for Dusty's emblem in the footer and header: reading, broken, or at rest. */
  onReader?: (s: "reading" | "warn" | "idle") => void;
}) {
  // Reading scanned plans in this tab (migration 064): where it is, sheet by sheet.
  const ocr = usePlanOcr();
  const [data, setData] = useState<Activity | null>(null);
  // Items from the last day — decided when the data arrives, not in render.
  const [recent, setRecent] = useState<Item[]>([]);
  // What the collapsed line still has to show: new since this device last
  // looked, then Dusty's unseen musings. Each leaves the queue once shown.
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const router = useRouter();
  // The line's words: when they don't fit, they slide along (CSS, measured once per line, no state).
  const textRef = useRef<HTMLSpanElement>(null);
  const apply = useCallback((d: Activity) => {
    setData(d);
    const cutoff = Date.now() - DAY_MS;
    setRecent(d.items.filter((i) => i.kind === "waiting" || i.kind === "agreement" || i.kind === "reminder" || new Date(i.at).getTime() > cutoff));
    const seen = loadSeen();
    const fresh = d.items.filter((i) => ON_LINE(i) && (i.kind === "running" || !seen.has(seenKey(i)))
      && (i.kind === "reminder" || new Date(i.at).getTime() > cutoff));
    const muse = (d.musings ?? []).filter((m) => !seen.has(m.id));
    setQueue([...fresh, ...muse]);
    setIdx(0);
  }, []);

  useEffect(() => {
    let off = false;
    let last = 0;
    const load = (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (!force && !shouldPoll(last)) return;
      last = Date.now();
      fetch("/api/activity")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Activity | null) => { if (!off && d) apply(d); })
        .catch(() => { /* keep the last good state */ });
    };
    const now = () => load(true);
    now();
    const t = setInterval(() => load(), POLL_MS);
    const unBack = onBack(now);
    document.addEventListener("visibilitychange", now);
    return () => { off = true; clearInterval(t); unBack(); document.removeEventListener("visibilitychange", now); };
  }, [apply]);

  // Walk the queue once; the last item stays until something new arrives.
  const current = queue.length ? queue[Math.min(idx, queue.length - 1)] : null;
  const cycling = !data?.pinned && idx < queue.length - 1 && !hover;
  useEffect(() => {
    if (!cycling || !current) return;
    const t = setTimeout(() => setIdx((i) => i + 1), lingerMs(current, textRef.current?.clientWidth ?? 260));
    return () => clearTimeout(t);
  }, [cycling, idx, current]);
  // Shown means seen — it will not come round again on this device.
  useEffect(() => {
    if (!current || current.kind === "running" || data?.pinned) return;
    const seen = loadSeen();
    const k = seenKey(current);
    if (!seen.has(k)) { seen.add(k); saveSeen(seen); }
  }, [current, data?.pinned]);

  const running = recent.some((i) => i.kind === "running");
  useEffect(() => { onWorking?.(running); }, [running, onWorking]);
  const readerState = data?.pinned ? "warn" : running || ocr.running ? "reading" : "idle";
  useEffect(() => { onReader?.(readerState); }, [readerState, onReader]);
  let line: { key: string; summary: string; tone: Tone; at: string | null };
  if (ocr.running) line = { key: `ocr-${ocr.phase}-${ocr.done}`, summary: ocr.label, tone: "live", at: null };
  else if (data?.pinned) line = { key: "pinned", summary: data.pinned.summary, tone: "warn", at: null };
  else if (current) {
    line = { key: current.id, summary: current.summary, tone: current.tone,
             at: current.kind === "reminder" || current.kind === "musing" ? null : current.at };
  } else if (!data) {
    // Holds the row until the first answer, so the header never changes height.
    line = { key: "loading", summary: "…", tone: "quiet", at: null };
  } else {
    line = {
      key: "idle",
      summary: data?.last_read_at
        ? `All caught up · last read ${ago(data.last_read_at)}${data.waiting ? ` · ${data.waiting} waiting` : ""}`
        : "Nothing read yet",
      tone: "quiet", at: null,
    };
  }
  // The streamed reply already arrives a token at a time; everything else types
  // in — drawn by CSS (a stepped clip on one element), never a render per letter.
  const typing = line.summary.length > 0;

  // Too long for the row: once typed, slide to the end, rest, slide back — over and over while it is up.
  useEffect(() => {
    const el = textRef.current;
    const inner = el?.firstElementChild as HTMLElement | null;
    if (!el || !inner) return;
    inner.removeAttribute("data-marq");
    const t = setTimeout(() => {
      const dx = inner.scrollWidth - el.clientWidth;
      if (dx <= 8) return;
      const slide = Math.round((dx / SCROLL_PX_S) * 1000);
      inner.style.setProperty("--sc-marq-dx", `-${dx}px`);
      inner.style.setProperty("--sc-marq-ms", `${2 * slide + 5000}ms`);
      inner.setAttribute("data-marq", "1");
    }, Math.min(line.summary.length, 160) * 18 + 1200);
    return () => clearTimeout(t);
  }, [line.key, line.summary]);

  return (
    <div className={inline ? "relative flex-1 min-w-0 sc-own-layer" : "relative px-2.5 pb-2 sc-activity-row sc-own-layer"}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}>
      <button onClick={() => router.push("/dashboard/more/logs?tab=dusty")}
        aria-label="Dusty's activity — open the log"
        className="w-full flex items-center gap-2 text-left"
        // Strict containment: a new line of text never makes the browser lay out the page around it.
        style={{ height: 30, padding: "0 4px 0 4px", background: "transparent", border: "none", cursor: "pointer", contain: "strict" }}>
        <span ref={textRef} aria-live="polite" className="sc-activity-text"
          // Low, on the level of the wordmark's ".ai" (Coy, 2026-10-10).
          style={{ flex: 1, minWidth: 0, alignSelf: "flex-end", lineHeight: "16px", paddingBottom: TEXT_DROP, color: line.tone === "warn" ? T.hivizText : undefined, animation: line.tone === "warn" ? "none" : undefined, ...clip }}>
          {typing ? (
            <span key={line.key} className="sc-typed" title={line.summary}
              style={{ "--sc-type-steps": Math.min(line.summary.length, 160), "--sc-type-ms": `${Math.min(line.summary.length, 160) * 18}ms` } as React.CSSProperties}>
              {line.summary}
            </span>
          ) : line.summary}
        </span>
        {line.at && <span className="sc-activity-time" style={{ ...nums, alignSelf: "flex-end", lineHeight: "16px", paddingBottom: TEXT_DROP }}>{relTime(line.at)}</span>}
      </button>
    </div>
  );
}

/** What kind of line a ticker item is — each its own colour (Coy, 2026-10-21: "different colors for
 *  different kinds of thoughts: dreams, activities"). */
export type TickKind = "dream" | "thought" | "reading" | "mail" | "proposal" | "opened" | "reminder" | "warn" | "plans";
export function tickKind(it: { id: string; kind: string; tone?: string }): TickKind {
  if (it.tone === "warn") return "warn";
  if (it.kind === "musing") return it.id.startsWith("dream-") ? "dream" : "thought";
  if (it.id.startsWith("bidopen-")) return "opened";
  if (it.kind === "email" || it.kind === "bid") return "mail";
  if (it.kind === "proposal") return "proposal";
  if (it.kind === "reminder") return "reminder";
  return "reading";
}
export const TICK_LABEL: Record<TickKind, string> = {
  dream: "Dream", thought: "Thought", reading: "Reading", mail: "Mail", proposal: "Proposal", opened: "Opened", reminder: "Due", warn: "Needs you", plans: "Plans",
};
/** The banner's pace, pixels a second — slow, to read as it goes by. */
const TICK_PX_S = 45;

/** Dusty's thoughts as a banner across the very top of the app (Coy, 2026-10-21: "moved to the very
 *  top of the site above everything else on a little row that is the full width of the page. It can
 *  scroll across slowly as a banner"). Everything of the last day and his recent thoughts and dreams,
 *  one after another, each in its kind's colour; it pauses under the pointer, a tap opens what it
 *  came from (a thought opens Dusty on it), and a still list scrolls by hand under reduced motion. */
export function DustyTicker({ onReader }: { onReader?: (s: "reading" | "warn" | "idle") => void }) {
  const ocr = usePlanOcr();
  const [data, setData] = useState<Activity | null>(null);
  // Items of the last day — decided when the data arrives, not in render.
  const [news, setNews] = useState<Item[]>([]);
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false;
    let last = 0;
    const load = (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (!force && !shouldPoll(last)) return;
      last = Date.now();
      fetch("/api/activity").then((r) => (r.ok ? r.json() : null))
        .then((d: Activity | null) => {
          if (off || !d) return;
          const cutoff = Date.now() - DAY_MS;
          setData(d);
          setNews(d.items.filter((i) => ON_LINE(i) && (i.kind === "running" || i.kind === "reminder" || new Date(i.at).getTime() > cutoff)));
        }).catch(() => { /* keep the last */ });
    };
    const now = () => load(true);
    now();
    const t = setInterval(() => load(), POLL_MS);
    const unBack = onBack(now);
    document.addEventListener("visibilitychange", now);
    return () => { off = true; clearInterval(t); unBack(); document.removeEventListener("visibilitychange", now); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.ticker = "on";
    return () => { delete document.documentElement.dataset.ticker; };
  }, []);

  const running = news.some((i) => i.kind === "running");
  const readerState = data?.pinned ? "warn" : running || ocr.running ? "reading" : "idle";
  useEffect(() => { onReader?.(readerState); }, [readerState, onReader]);

  type Tick = { id: string; kind: TickKind; text: string; at: string | null; go: () => void };
  const toLog = () => router.push("/dashboard/more/logs?tab=dusty");
  const talkAbout = (it: Item) => {
    if (it.contact_id) router.push(`/dashboard/messages/${it.contact_id}`);
    setTimeout(() => {
      window.dispatchEvent(new Event("sc:dusty-open"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `About your thought — "${it.summary}" — ` } })), 300);
    }, it.contact_id ? 700 : 0);
  };
  const ticks: Tick[] = [];
  if (data?.pinned) ticks.push({ id: "pinned", kind: "warn", text: data.pinned.summary, at: null, go: toLog });
  if (ocr.running) ticks.push({ id: "ocr", kind: "plans", text: ocr.label, at: null, go: () => {} });
  for (const it of news) {
    const to = it.href ?? (it.contact_id ? `/dashboard/messages/${it.contact_id}` : null);
    ticks.push({ id: it.id, kind: tickKind(it), text: it.summary, at: it.kind === "reminder" ? null : it.at, go: to ? () => router.push(to) : toLog });
  }
  for (const m of (data?.musings ?? []).slice(0, 12)) ticks.push({ id: m.id, kind: tickKind(m), text: m.summary, at: m.at, go: () => talkAbout(m) });
  if (!ticks.length) {
    ticks.push({ id: "idle", kind: "thought", at: null, go: toLog,
      text: !data ? "…" : data.last_read_at ? `All caught up · last read ${ago(data.last_read_at)}${data.waiting ? ` · ${data.waiting} waiting` : ""}` : "Nothing read yet" });
  }
  const sig = ticks.map((t) => t.id).join("|");

  // One pass of the track takes its width at TICK_PX_S; the copy after it makes the loop seamless.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    el.style.setProperty("--sc-tick-ms", `${Math.max(20_000, Math.round((half / TICK_PX_S) * 1000))}ms`);
  }, [sig]);

  const row = (copy: number) => ticks.map((t) => (
    <button key={`${copy}-${t.id}`} type="button" className="sc-tick" data-kind={t.kind} onClick={t.go}
      tabIndex={copy ? -1 : 0} aria-hidden={copy ? true : undefined} title={t.text}>
      <span className="sc-tick-k">{TICK_LABEL[t.kind]}</span>
      <span className="sc-tick-t">{t.text}</span>
      {t.at && <span className="sc-tick-at">{relTime(t.at)}</span>}
    </button>
  ));
  return (
    <div className="sc-ticker" role="marquee" aria-label="What Dusty is doing and thinking">
      <div ref={trackRef} className="sc-ticker-track" key={sig}>
        <div className="sc-ticker-run">{row(0)}</div>
        <div className="sc-ticker-run" aria-hidden="true">{row(1)}</div>
      </div>
    </div>
  );
}

/** Logs → Dusty (Coy, 2026-10-10: "The history of dusty's thoughts should be
 *  in the logs page instead of being a drop down from the header"): what was
 *  the header's drop-down — the reader's warning, his thoughts (tap one to talk
 *  about it) and every background read of the last week. */
export function DustyLog() {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    let off = false;
    fetch("/api/activity")
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Activity) => { if (!off) setData(d); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);
  // Tapping a thought takes Coy to what it came from, with Dusty open and the thought in his message box.
  const talkAbout = (it: Item) => {
    if (it.contact_id) router.push(`/dashboard/messages/${it.contact_id}`);
    setTimeout(() => {
      window.dispatchEvent(new Event("sc:dusty-open"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `About your thought — "${it.summary}" — ` } })), 300);
    }, it.contact_id ? 700 : 0);
  };
  const section = (title: string, children: React.ReactNode) => (
    <section className="mx-3 mt-3 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}`, fontFamily: agent }}>
      <div className="px-3 py-2" style={{ ...eyebrow, color: T.ink, borderBottom: `1px solid ${T.hairSoft}` }}>{title}</div>
      {children}
    </section>
  );
  if (error) return <div className="mx-3 mt-3" style={{ fontSize: F.sm, color: T.red }}>Couldn&apos;t load Dusty&apos;s log: {error}</div>;
  if (!data) return <div className="p-3"><div className="rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} /></div>;
  const thoughts = data.musings ?? [];
  return (
    <div className="mx-auto" style={{ maxWidth: 760, paddingBottom: 24 }}>
      {data.pinned && (
        <div role="alert" className="mx-3 mt-3 rounded px-3 py-2" style={{ background: T.hivizDim, border: `1px solid ${T.hair}` }}>
          <div style={{ fontSize: F.sm, color: T.hivizText }}>{data.pinned.summary}</div>
          {data.pinned.detail && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2 }}>{data.pinned.detail}</div>}
        </div>
      )}
      {section("Dusty's thoughts · tap one to talk about it", thoughts.length === 0
        ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>No thoughts in the last three days.</div>
        : thoughts.map((it, i) => (
          <button key={it.id} onClick={() => talkAbout(it)} className="w-full text-left px-3 py-2 flex gap-2.5 items-start"
            style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", background: "transparent", cursor: "pointer" }}>
            <span aria-hidden="true" style={{ paddingTop: 4, color: T.ink3, fontSize: 11 }}>◆</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: F.sm, color: T.ink, lineHeight: 1.4 }}>{it.summary}</span>
              {it.detail && <span style={{ display: "block", fontSize: F.xs, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{it.detail}{it.contact_id ? " ›" : ""}</span>}
            </span>
            <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(it.at)}</span>
          </button>
        )))}
      {section("Background work · the last week", data.items.length === 0
        ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing read in the last week.</div>
        : data.items.map((it, i) => {
          const body = (
            <div className="px-3 py-2 flex gap-2.5 items-start" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <span style={{ paddingTop: 5 }}><Dot tone={it.tone} live={it.kind === "running"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: F.sm, color: T.ink, lineHeight: 1.35 }}>{it.summary}</span>
                {it.detail && <span style={{ display: "block", fontSize: F.xs, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{it.detail}</span>}
              </span>
              {it.kind !== "waiting" && it.kind !== "agreement" && it.kind !== "reminder" && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(it.at)}</span>}
            </div>
          );
          const to = it.href ?? (it.contact_id ? `/dashboard/messages/${it.contact_id}` : null);
          return to
            ? <Link key={it.id} href={to} className="block no-underline" style={{ color: T.ink }}>{body}</Link>
            : <div key={it.id}>{body}</div>;
        }))}
      <div className="px-4 py-2" style={{ ...eyebrow, fontSize: F.micro, color: T.ink3 }}>
        Dusty reads new threads every minute, app open or not
      </div>
    </div>
  );
}
