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
 *   real tokens as they stream. A thin line drops from the header emblem to
 *   the dot, so the mark, the thinking and the words read as one thing — a
 *   pulse runs down it while Dusty is working, in step with the emblem.
 * - Nothing in the last day: says when something last happened. Never invents
 *   something happening now.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, clip, nums, relTime } from "@/lib/v34/tokens";

type Tone = "live" | "good" | "ask" | "warn" | "quiet";
interface Item { id: string; at: string; kind: string; contact_id: string | null; summary: string; detail: string | null; tone: Tone }
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
  live: T.pulse, good: T.pulse, ask: "#6FA0FF", warn: "#FFB547", quiet: "rgba(255,255,255,.35)",
};

function Dot({ tone, live }: { tone: Tone; live: boolean }) {
  return (
    <span aria-hidden="true" className={live ? "sc-dot-live" : undefined}
      style={{ width: 7, height: 7, borderRadius: 999, background: DOT[tone], flex: "0 0 auto", display: "inline-block" }} />
  );
}

/** Types `text` in, a letter at a time, whenever `k` changes. Reduced motion: whole. */
function useTyped(text: string, k: string): string {
  const [shown, setShown] = useState({ k, n: text.length });
  useEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setShown({ k, n });
      if (n >= text.length) clearInterval(t);
    }, 18);
    return () => clearInterval(t);
  }, [k, text]);
  return shown.k === k ? text.slice(0, shown.n) : "";
}

export function ActivityLine({ busy, live, onWorking }: {
  busy: boolean; live?: string;
  /** True while the background reader has a read running — the header emblem spins for it. */
  onWorking?: (working: boolean) => void;
}) {
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
        ? `All caught up · last read ${relTime(data.last_read_at)} ago${data.waiting ? ` · ${data.waiting} waiting` : ""}`
        : "Nothing read yet",
      tone: "quiet", at: null,
    };
  }
  const working = busy || running;
  // The streamed reply already arrives a token at a time; everything else types in.
  const typed = useTyped(line.summary, line.key);
  const text = busy ? line.summary : typed;
  const lineColour = line.tone === "warn" ? "#FFB547" : "rgba(255,255,255,.28)";

  return (
    <div className="relative px-2.5 pb-2 sc-glass" onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}>
      {/* From the emblem (centre 22px from the edge, bottom ~15px above this
          row) down to the dot. */}
      <span aria-hidden="true" className={working ? "sc-thread-live" : undefined}
        style={{ position: "absolute", left: 21.25, top: -15, height: 30, width: 1.5, borderRadius: 1,
                 background: working ? undefined : lineColour }} />
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Hide Dusty's activity" : "Show Dusty's activity"}
        className="w-full flex items-center gap-2 text-left"
        style={{ height: 30, padding: "0 4px 0 8px", background: "transparent", border: "none", cursor: "pointer" }}>
        <Dot tone={line.tone} live={working} />
        <span aria-live="polite"
          style={{ flex: 1, minWidth: 0, fontSize: F.sm, fontStyle: "italic",
                   color: line.tone === "warn" ? "#FFD08A" : "rgba(255,255,255,.86)", ...clip }}>
          {text}
          {!busy && text.length < line.summary.length && <span className="sc-caret" aria-hidden="true">▍</span>}
        </span>
        {line.at && <span style={{ fontSize: F.xs, color: "rgba(255,255,255,.45)", ...nums }}>{relTime(line.at)}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
          style={{ flex: "0 0 auto", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg overflow-y-auto sc-drop lg:max-w-[760px]"
          style={{ maxHeight: "min(60vh, 420px)", background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.08)" }}>
          {data?.pinned && (
            <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontSize: F.sm, color: "#FFD08A" }}>{data.pinned.summary}</div>
              {data.pinned.detail && <div style={{ fontSize: F.xs, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{data.pinned.detail}</div>}
            </div>
          )}
          {(data?.items ?? []).map((it) => {
            const body = (
              <div className="px-3 py-2 flex gap-2.5 items-start" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ paddingTop: 5 }}><Dot tone={it.tone} live={it.kind === "running"} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: F.sm, color: "rgba(255,255,255,.9)", lineHeight: 1.35 }}>{it.summary}</span>
                  {it.detail && <span style={{ display: "block", fontSize: F.xs, color: "rgba(255,255,255,.55)", lineHeight: 1.4, marginTop: 2 }}>{it.detail}</span>}
                </span>
                {it.kind !== "waiting" && it.kind !== "agreement" && it.kind !== "reminder" && <span style={{ fontSize: F.xs, color: "rgba(255,255,255,.45)", ...nums }}>{relTime(it.at)}</span>}
              </div>
            );
            return it.contact_id
              ? <Link key={it.id} href={`/dashboard/messages/${it.contact_id}`} onClick={() => setOpen(false)} className="block no-underline">{body}</Link>
              : <div key={it.id}>{body}</div>;
          })}
          {!data?.items.length && !data?.pinned && (
            <div className="px-3 py-2" style={{ fontSize: F.sm, color: "rgba(255,255,255,.6)" }}>Nothing read in the last week.</div>
          )}
          <div className="px-3 py-2" style={{ ...eyebrow, fontSize: F.micro, color: "rgba(255,255,255,.4)" }}>
            Dusty reads new threads every minute, app open or not
          </div>
        </div>
      )}
    </div>
  );
}
