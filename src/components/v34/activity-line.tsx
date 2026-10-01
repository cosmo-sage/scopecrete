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
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, clip, nums, relTime } from "@/lib/v34/tokens";
import { useDustyLive } from "@/lib/v34/dusty-live";

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

const POLL_MS = 20_000;
const CYCLE_MS = 4_000;
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

function Dot({ tone, live, work }: { tone: Tone; live: boolean; work?: Work }) {
  const cls = work ? `sc-dot-${work}` : live ? "sc-dot-live" : undefined;
  return (
    <span aria-hidden="true" className={cls}
      style={{ width: work ? 8 : 7, height: work ? 8 : 7, borderRadius: 999, background: work ? WORK_DOT[work] : DOT[tone], flex: "0 0 auto", display: "inline-block" }} />
  );
}

export function ActivityLine({ busy, onWorking, inline }: {
  busy: boolean;
  /** Desktop: sit in the header row beside the logo (no row of its own). */
  inline?: boolean;
  /** True while the background reader has a read running — the header emblem spins for it. */
  onWorking?: (working: boolean) => void;
}) {
  const live = useDustyLive();
  const [data, setData] = useState<Activity | null>(null);
  // Items from the last day — decided when the data arrives, not in render.
  const [recent, setRecent] = useState<Item[]>([]);
  // What the collapsed line still has to show: new since this device last
  // looked, then Dusty's unseen musings. Each leaves the queue once shown.
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

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
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/activity")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Activity | null) => { if (!off && d) apply(d); })
        .catch(() => { /* keep the last good state */ });
    };
    load();
    const t = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => { off = true; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [apply]);

  // Walk the queue once; the last item stays until something new arrives.
  const current = queue.length ? queue[Math.min(idx, queue.length - 1)] : null;
  const cycling = !busy && !data?.pinned && idx < queue.length - 1 && !open && !hover;
  useEffect(() => {
    if (!cycling) return;
    const t = setInterval(() => setIdx((i) => i + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, [cycling]);
  // Shown means seen — it will not come round again on this device.
  useEffect(() => {
    if (!current || current.kind === "running" || busy || data?.pinned) return;
    const seen = loadSeen();
    const k = seenKey(current);
    if (!seen.has(k)) { seen.add(k); saveSeen(seen); }
  }, [current, busy, data?.pinned]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const running = recent.some((i) => i.kind === "running");
  useEffect(() => { onWorking?.(running); }, [running, onWorking]);
  let line: { key: string; summary: string; tone: Tone; at: string | null };
  if (busy) {
    // A reply streaming in this tab: its own words, the tail that fits.
    const said = (live ?? "").replace(/\s+/g, " ").trim();
    line = { key: "busy", summary: said ? (said.length > 90 ? `…${said.slice(-90)}` : said) : "Dusty is thinking…", tone: "live", at: null };
  }
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
  const working = busy || running;
  // The streamed reply already arrives a token at a time; everything else types
  // in — drawn by CSS (a stepped clip on one element), never a render per letter.
  const typing = !busy && line.summary.length > 0;
  // The kind of work, for the dot: broken > answering > reading > just done.
  const work: Work = line.tone === "warn" ? "warn" : busy ? "reply" : running ? "read"
    : line.key !== "idle" && line.key !== "loading" && line.tone === "good" ? "done" : null;

  return (
    <div className={inline ? "relative flex-1 min-w-0 sc-own-layer" : "relative px-2.5 pb-2 sc-activity-row sc-own-layer"}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Hide Dusty's activity" : "Show Dusty's activity"}
        className="w-full flex items-center gap-2 text-left"
        // Strict containment: a new line of text never makes the browser lay out the page around it.
        style={{ height: 30, padding: "0 4px 0 8px", background: "transparent", border: "none", cursor: "pointer", contain: "strict" }}>
        <Dot key={`${work}-${line.key}`} tone={line.tone} live={working} work={work} />
        <span aria-live="polite" className="sc-activity-text"
          style={{ flex: 1, minWidth: 0, color: line.tone === "warn" ? T.hivizText : undefined, ...clip }}>
          {typing ? (
            <span key={line.key} className="sc-typed"
              style={{ "--sc-type-steps": Math.min(line.summary.length, 160), "--sc-type-ms": `${Math.min(line.summary.length, 160) * 18}ms` } as React.CSSProperties}>
              {line.summary}
            </span>
          ) : line.summary}
        </span>
        {line.at && <span className="sc-activity-time" style={nums}>{relTime(line.at)}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
          style={{ flex: "0 0 auto", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="#5A5F66" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className={inline ? "absolute left-0 overflow-y-auto sc-drop sc-activity-drop" : "mt-1.5 overflow-y-auto sc-drop sc-activity-drop"}
          style={inline
            ? { top: "calc(100% + 8px)", width: 560, maxWidth: "calc(100vw - 120px)", maxHeight: "min(60vh, 460px)", zIndex: 60 }
            : { maxHeight: "min(60vh, 420px)" }}>
          {data?.pinned && (
            <div className="px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div style={{ fontSize: F.sm, color: T.hivizText }}>{data.pinned.summary}</div>
              {data.pinned.detail && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2 }}>{data.pinned.detail}</div>}
            </div>
          )}
          {(data?.items ?? []).map((it) => {
            const body = (
              <div className="px-3 py-2 flex gap-2.5 items-start" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
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
              ? <Link key={it.id} href={to} onClick={() => setOpen(false)} className="block no-underline">{body}</Link>
              : <div key={it.id}>{body}</div>;
          })}
          {!data?.items.length && !data?.pinned && (
            <div className="px-3 py-2" style={{ fontSize: F.sm, color: T.ink2 }}>Nothing read in the last week.</div>
          )}
          <div className="px-3 py-2" style={{ ...eyebrow, fontSize: F.micro, color: T.ink3 }}>
            Dusty reads new threads every minute, app open or not
          </div>
        </div>
      )}
    </div>
  );
}
