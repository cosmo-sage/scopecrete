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

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T, F, eyebrow, agent, clip, nums, relTime } from "@/lib/v34/tokens";
import { useDustyLive } from "@/lib/v34/dusty-live";
import { usePlanOcr } from "@/lib/v34/plan-ocr-runner";

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

/**
 * The line's button (Coy, 2026-10-02): a diamond that always glows, its colour
 * and rhythm the kind of work — grey and slow when idle — with a small arrow
 * under it that says it opens. It replaced the dot on the left and the chevron
 * on the right, so the words get the whole width.
 */
function Diamond({ work, open }: { work: Work; open: boolean }) {
  const colour = `var(--sc-work-dot-${work ?? "idle"}, ${work ? WORK_DOT[work] : "#9C9385"})`;
  return (
    <span aria-hidden="true" className="flex flex-col items-center justify-center" style={{ flex: "0 0 auto", width: 14, gap: 2 }}>
      <span className={`sc-dia sc-dia-${work ?? "idle"}`} style={{ width: 9, height: 9, background: colour, color: colour, transform: "rotate(45deg)", borderRadius: 1.5, display: "block" }} />
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
        <path d="M1 1 L4 4 L7 1" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ color: "var(--sc-pencil-muted, #8A8478)" }} />
      </svg>
    </span>
  );
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
  // Reading scanned plans in this tab (migration 064): where it is, sheet by sheet.
  const ocr = usePlanOcr();
  const [data, setData] = useState<Activity | null>(null);
  // Items from the last day — decided when the data arrives, not in render.
  const [recent, setRecent] = useState<Item[]>([]);
  // What the collapsed line still has to show: new since this device last
  // looked, then Dusty's unseen musings. Each leaves the queue once shown.
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const router = useRouter();
  // The line's words: when they don't fit, they slide along (CSS, measured once per line, no state).
  const textRef = useRef<HTMLSpanElement>(null);
  // Open, the drop-down sits over everything — the plan sheets, Dusty, any sheet (Coy, 2026-10-02):
  // the header's own layer is lifted while it is down (v34-shell.css, html[data-head-drop]).
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute("data-head-drop", "open");
    return () => document.documentElement.removeAttribute("data-head-drop");
  }, [open]);

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
    if (!cycling || !current) return;
    const t = setTimeout(() => setIdx((i) => i + 1), lingerMs(current, textRef.current?.clientWidth ?? 260));
    return () => clearTimeout(t);
  }, [cycling, idx, current]);
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
  else if (ocr.running) line = { key: `ocr-${ocr.phase}-${ocr.done}`, summary: ocr.label, tone: "live", at: null };
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
  const typing = !busy && line.summary.length > 0;
  // The kind of work, for the dot: broken > answering > reading > just done.
  const work: Work = line.tone === "warn" ? "warn" : busy ? "reply" : running || ocr.running ? "read"
    : line.key !== "idle" && line.key !== "loading" && line.tone === "good" ? "done" : null;

  // Too long for the row: once typed, slide to the end, rest, slide back — over and over while it is up.
  useEffect(() => {
    const el = textRef.current;
    const inner = el?.firstElementChild as HTMLElement | null;
    if (!el || !inner) return;
    inner.removeAttribute("data-marq");
    if (busy) return;
    const t = setTimeout(() => {
      const dx = inner.scrollWidth - el.clientWidth;
      if (dx <= 8) return;
      const slide = Math.round((dx / SCROLL_PX_S) * 1000);
      inner.style.setProperty("--sc-marq-dx", `-${dx}px`);
      inner.style.setProperty("--sc-marq-ms", `${2 * slide + 5000}ms`);
      inner.setAttribute("data-marq", "1");
    }, Math.min(line.summary.length, 160) * 18 + 1200);
    return () => clearTimeout(t);
  }, [line.key, line.summary, busy]);

  // Tapping a thought takes Coy to what it came from, with Dusty open and the thought in his message box.
  const talkAbout = (it: Item) => {
    setOpen(false);
    if (it.contact_id) router.push(`/dashboard/messages/${it.contact_id}`);
    setTimeout(() => {
      window.dispatchEvent(new Event("sc:dusty-open"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: `About your thought — "${it.summary}" — ` } })), 300);
    }, it.contact_id ? 700 : 0);
  };
  const thoughts = data?.musings ?? [];

  return (
    <div className={inline ? "relative flex-1 min-w-0 sc-own-layer" : "relative px-2.5 pb-2 sc-activity-row sc-own-layer"}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Hide Dusty's activity" : "Show Dusty's activity"}
        className="w-full flex items-center gap-2 text-left"
        // Strict containment: a new line of text never makes the browser lay out the page around it.
        style={{ height: 30, padding: "0 4px 0 4px", background: "transparent", border: "none", cursor: "pointer", contain: "strict" }}>
        <Diamond key={`${work}-${line.key}`} work={work} open={open} />
        <span ref={textRef} aria-live="polite" className="sc-activity-text"
          style={{ flex: 1, minWidth: 0, color: line.tone === "warn" ? T.hivizText : undefined, ...clip }}>
          {typing ? (
            <span key={line.key} className="sc-typed" title={line.summary}
              style={{ "--sc-type-steps": Math.min(line.summary.length, 160), "--sc-type-ms": `${Math.min(line.summary.length, 160) * 18}ms` } as React.CSSProperties}>
              {line.summary}
            </span>
          ) : line.summary}
        </span>
        {line.at && <span className="sc-activity-time" style={nums}>{relTime(line.at)}</span>}
      </button>

      {open && (
        <div className={inline ? "absolute left-0 overflow-y-auto sc-drop sc-activity-drop" : "mt-1.5 overflow-y-auto sc-drop sc-activity-drop"}
          style={inline
            ? { top: "calc(100% + 8px)", width: 560, maxWidth: "calc(100vw - 120px)", maxHeight: "min(60vh, 460px)", zIndex: 60, fontFamily: agent }
            : { maxHeight: "min(60vh, 420px)", fontFamily: agent }}>
          {data?.pinned && (
            <div className="px-3 py-2" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
              <div style={{ fontSize: F.sm, color: T.hivizText }}>{data.pinned.summary}</div>
              {data.pinned.detail && <div style={{ fontSize: F.xs, color: T.ink2, marginTop: 2 }}>{data.pinned.detail}</div>}
            </div>
          )}
          {thoughts.length > 0 && (
            <div style={{ borderBottom: `1px solid ${T.hair}` }}>
              <div className="px-3 pt-2 pb-1" style={{ ...eyebrow, fontSize: F.micro, color: T.ink3 }}>Dusty&apos;s thoughts · tap one to talk about it</div>
              {thoughts.map((it) => (
                <button key={it.id} onClick={() => talkAbout(it)} className="w-full text-left px-3 py-2 flex gap-2.5 items-start"
                  style={{ borderTop: `1px solid ${T.hairSoft}`, background: current?.id === it.id ? T.sunk : "transparent", cursor: "pointer" }}>
                  <span aria-hidden="true" style={{ paddingTop: 4, color: T.ink3, fontSize: 11 }}>◆</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: F.sm, color: T.ink, lineHeight: 1.4 }}>{it.summary}</span>
                    {it.detail && <span style={{ display: "block", fontSize: F.xs, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{it.detail}{it.contact_id ? " ›" : ""}</span>}
                  </span>
                  <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(it.at)}</span>
                </button>
              ))}
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
