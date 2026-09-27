"use client";

/**
 * Dusty's activity line — under the header, on every screen.
 *
 * v34 had this bar (StreamBar) fed by ten hardcoded sentences, and it was left
 * out of the port for that reason. It is back because there is now something
 * real to say: every item comes from /api/activity, which reads the background
 * enricher's own rows (contact_enrich_runs) and pulse (sc_worker_heartbeats).
 *
 * - Collapsed: one line, cycling through the last day's real activity.
 * - Tap: the list drops down — each item with its time and detail, linking to
 *   the thread. Like a model's "thinking" disclosure: summary first, detail on
 *   demand.
 * - A reader that is not working pins the line in amber and it stops cycling.
 * - The dot pulses only while something is running: a claimed read, or a
 *   Dusty reply streaming in this tab. Otherwise it is still.
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
  waiting: number;
  last_read_at: string | null;
  items: Item[];
}

const POLL_MS = 20_000;
const CYCLE_MS = 4_000;
const DAY_MS = 86_400_000;

const DOT: Record<Tone, string> = {
  live: T.pulse, good: T.pulse, ask: "#6FA0FF", warn: "#FFB547", quiet: "rgba(255,255,255,.35)",
};

function Dot({ tone, live }: { tone: Tone; live: boolean }) {
  return (
    <span aria-hidden="true" className={live ? "sc-dot-live" : undefined}
      style={{ width: 7, height: 7, borderRadius: 999, background: DOT[tone], flex: "0 0 auto", display: "inline-block" }} />
  );
}

export function ActivityLine({ busy }: { busy: boolean }) {
  const [data, setData] = useState<Activity | null>(null);
  // Items from the last day — decided when the data arrives, not in render.
  const [recent, setRecent] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const apply = useCallback((d: Activity) => {
    setData(d);
    const cutoff = Date.now() - DAY_MS;
    setRecent(d.items.filter((i) => i.kind === "waiting" || new Date(i.at).getTime() > cutoff));
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

  const cycling = !busy && !data?.pinned && recent.length > 1 && !open && !hover;
  useEffect(() => {
    if (!cycling) return;
    const t = setInterval(() => setIdx((i) => i + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, [cycling]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const running = recent.some((i) => i.kind === "running");
  let line: { key: string; summary: string; tone: Tone; at: string | null };
  if (busy) line = { key: "busy", summary: "Dusty is working on your question…", tone: "live", at: null };
  else if (data?.pinned) line = { key: "pinned", summary: data.pinned.summary, tone: "warn", at: null };
  else if (recent.length) {
    const it = recent[idx % recent.length];
    line = { key: it.id, summary: it.summary, tone: it.tone, at: it.kind === "waiting" ? null : it.at };
  } else if (!data) {
    // Holds the row until the first answer, so the header never changes height.
    line = { key: "loading", summary: "…", tone: "quiet", at: null };
  } else {
    line = {
      key: "idle",
      summary: data?.last_read_at ? `Last read ${relTime(data.last_read_at)} ago · ${data.waiting} waiting` : "Nothing read yet",
      tone: "quiet", at: null,
    };
  }
  const live = busy || running;

  return (
    <div className="px-2.5 pb-2 sc-glass" onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }} onPointerLeave={() => setHover(false)}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Hide Dusty's activity" : "Show Dusty's activity"}
        className="w-full rounded-lg flex items-center gap-2 px-3 text-left"
        style={{ height: 30, background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer" }}>
        <Dot tone={line.tone} live={live} />
        <span key={line.key} className="sc-line-in" aria-live="polite"
          style={{ flex: 1, minWidth: 0, fontSize: F.sm, fontStyle: "italic",
                   color: line.tone === "warn" ? "#FFD08A" : "rgba(255,255,255,.86)", ...clip }}>
          {line.summary}
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
                {it.kind !== "waiting" && <span style={{ fontSize: F.xs, color: "rgba(255,255,255,.45)", ...nums }}>{relTime(it.at)}</span>}
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
            Dusty reads new threads every five minutes, app open or not
          </div>
        </div>
      )}
    </div>
  );
}
