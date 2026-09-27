"use client";

/**
 * The Threads list — chips, rows, drift banner.
 *
 * Lives here rather than in the route so the messages LAYOUT can hold it: on
 * desktop the list and a conversation sit side by side, and a list owned by
 * the index route would unmount the moment you opened a thread, losing the
 * scroll position and refetching on every row you clicked.
 *
 * Carried over from the previous version because it was right:
 *  - voicemail glance lines are LABELLED as voicemails, not passed off as
 *    summaries
 *  - 176 of 197 contacts have no name, so the phone number IS the display name
 *    and nothing here invents one
 *  - the preview keeps a fixed minHeight so rows do not reflow as summaries land
 *  - the drift banner reads the real /api/dashboard/drift, and a failure to read
 *    it renders as UNKNOWN, never as all-clear
 *
 * Added by work order 17: the filter chips and the row expand.
 *
 * THE CHIP RULE. A chip is rendered only when there is a real source for its
 * number. v34 has eleven filters; ten appear here. `Drafts` does not, because
 * there is no outbox table in the schema — see the header of
 * src/app/api/threads/counts/route.ts. `Today` is the one count computed on
 * this side, because "today" depends on the viewer's timezone and the server
 * has no timezone to work from.
 *
 * A chip reading 0 is fine and often the point: `Quoted 0` is a true statement
 * about a query that ran. What is not fine is a chip with nothing behind it.
 *
 * No mock constants. v34's THREADS array is not imported and must not be.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { Avatar, EmptyState } from "@/components/v34/primitives";

interface Thread {
  contact_id: string;
  display_name: string;
  name_is_phone: boolean;
  phone: string | null;
  contact_type: string | null;
  contact_subtype: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  preview: string;
  preview_source: "body" | "summary" | "synthesised";
  summary_source: string | null;
  msg_count: number;
  job_status: string | null;
  job_unscoped: boolean;
  relation: string | null;
}

type Counts = Record<string, number>;

/** v34's FILTERS (L3543) minus `drafts`. `c` is the count pill's colour. */
const CHIPS: Array<{ k: string; l: string; c: string | null }> = [
  { k: "today", l: "Today", c: T.ink },
  { k: "needs", l: "Needs you", c: T.hiviz },
  { k: "unsorted", l: "Unsorted", c: T.hiviz },
  { k: "unscoped", l: "Unscoped", c: T.chalk },
  { k: "quoted", l: "Quoted", c: T.violet },
  { k: "progress", l: "Pouring", c: "#0E6F63" },
  { k: "won", l: "Won", c: null },
  { k: "lost", l: "Lost", c: null },
  { k: "vendors", l: "Vendors", c: null },
  { k: "all", l: "All", c: null },
];

/** The three you reach for. The rest live behind the funnel. */
const FRONT = ["today", "needs", "unsorted"];

/** Local midnight, so "today" means the viewer's today rather than UTC's. */
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function matches(t: Thread, k: string): boolean {
  switch (k) {
    case "all": return true;
    case "today": return isToday(t.occurred_at);
    case "needs": return t.direction === "inbound";
    case "unsorted": return t.name_is_phone;
    case "unscoped": return t.job_unscoped;
    case "quoted": return t.job_status === "quoted";
    case "progress": return t.job_status === "in_progress";
    case "won": return t.job_status === "won";
    case "lost": return t.job_status === "lost";
    case "vendors": return t.relation === "vendor" || t.relation === "sub";
    default: return true;
  }
}

/** What an empty filtered list should say — the reason, not just "nothing". */
const WHY_EMPTY: Record<string, string> = {
  today: "Nothing has come in today. The list is not broken — the phone is quiet.",
  needs: "Every thread's last word is yours. Nothing is waiting on a reply.",
  unsorted: "Every contact carrying messages has a name on it.",
  unscoped: "No job is missing its sections. There are no jobs at all yet.",
  quoted: "No job has reached quoted. Nothing has been priced — estimates is empty.",
  progress: "No job is pouring.",
  won: "No job has been won yet.",
  lost: "No job has been marked lost.",
  vendors: "No contact has a CONFIRMED vendor or sub relation. 190 of 197 carry the 'customer' default, which is a default and not a classification — nothing has actually been classified yet.",
};

/* -------------------------------------------------------------------- row */

function ThreadRow({ t, first, expanded, onToggle, onOpen }: {
  t: Thread; first: boolean; expanded: boolean; onToggle: () => void; onOpen: () => void;
}) {
  const when = relTime(t.occurred_at);
  const isVoicemail = t.summary_source === "quo_voicemail";
  const synthesised = t.preview_source === "synthesised";

  return (
    <div style={{ background: T.card, borderTop: first ? "none" : `1px solid ${T.hair}` }}>
      <button onClick={onToggle} aria-expanded={expanded}
        className="w-full px-2.5 py-2 flex gap-2.5 items-start text-left">
        <Avatar label={t.display_name} kind={t.contact_type} dim={t.name_is_phone} />
        <span style={{ minWidth: 0, flex: 1, display: "block" }}>
          <span className="flex items-baseline gap-1.5" style={{ minWidth: 0 }}>
            <span style={{
              fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.2, ...clip,
              // A phone number is a weaker identity than a name and is coloured
              // as such — but it is still the real one. Nothing is invented to
              // fill the gap.
              color: t.name_is_phone ? T.ink2 : T.ink,
            }}>{t.display_name}</span>
            <span className="flex-1" />
            {t.msg_count > 1 && <span style={{ fontSize: F.micro, color: T.ink3, ...nums }}>{t.msg_count}</span>}
            {when && <span className="shrink-0" style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>}
          </span>

          {isVoicemail && (
            <span style={{ ...eyebrow, color: T.hiviz, display: "block", marginTop: 2 }}>Voicemail</span>
          )}

          {/* Fixed height so several hundred rows gaining a summary changes no
              geometry. Unclipped once expanded. */}
          <span style={{
            display: "block", fontSize: F.sm, marginTop: 2,
            color: synthesised ? T.ink3 : T.ink2,
            fontStyle: synthesised ? "italic" : "normal",
            minHeight: "1.1rem", lineHeight: "1.15rem",
            ...(expanded
              ? { whiteSpace: "normal" as const }
              : { overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }),
          }}>{t.preview}</span>
        </span>
      </button>

      {/* The expanded region shows only what exists. v34's version offers
          "Tell Dusty what this is", an About-them channel and scope actions;
          none of those have a writer, and a button that does nothing is worse
          than no button. */}
      {expanded && (
        <div className="px-2.5 pb-2.5" style={{ paddingLeft: 46 }}>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: F.xs, color: T.ink3 }}>
            {t.channel && <span>{t.channel === "call" ? "Call" : "Text"}</span>}
            <span style={nums}>{t.msg_count} message{t.msg_count === 1 ? "" : "s"}</span>
            {t.phone && <span style={nums}>{t.phone}</span>}
            {t.occurred_at && (
              <span style={nums}>
                {new Date(t.occurred_at).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {t.name_is_phone && (
            <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4, fontStyle: "italic" }}>
              Nobody has put a name to this number yet.
            </div>
          )}

          <button onClick={onOpen} className="mt-2 rounded px-3 flex items-center gap-2"
            style={{ height: 32, border: `1px solid ${T.hair}`, background: T.card,
                     fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                     textTransform: "uppercase", cursor: "pointer" }}>
            Open thread <span style={{ color: T.hiviz }}>›</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- screen */

export function ThreadList() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [drift, setDrift] = useState<{ count: number | null; error?: string } | null>(null);

  const [filter, setFilter] = useState("all");
  const [moreFilters, setMoreFilters] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/threads")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (b?.code === "no_org") { if (!off) { setNoOrg(true); setLoading(false); } return null; }
          throw new Error(b?.error || `HTTP ${r.status}`);
        }
        return b;
      })
      .then((data) => {
        if (off || data === null) return;
        setThreads(Array.isArray(data.threads) ? data.threads : []);
        setLoading(false);
      })
      .catch((e) => { if (!off) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } });

    // Counts for everything the thread list cannot see on its own. A failure
    // here leaves `counts` null and the affected chips simply do not render —
    // it never falls back to zero.
    fetch("/api/threads/counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d?.counts) setCounts(d.counts as Counts); })
      .catch(() => {});

    // v34 has a mock constant also called DRIFT. It is not imported anywhere
    // and must never be. A drift figure that did not come from here is a bug.
    fetch("/api/dashboard/drift")
      .then((r) => r.json())
      .then((d) => { if (!off) setDrift(d); })
      .catch(() => { if (!off) setDrift({ count: null, error: "unreachable" }); });

    return () => { off = true; };
  }, []);

  // `today` is derived here; everything else comes from the counts route.
  const chipCount = useCallback((k: string): number | null => {
    if (k === "today") return loading ? null : threads.filter((t) => isToday(t.occurred_at)).length;
    if (!counts) return null;
    return typeof counts[k] === "number" ? counts[k] : null;
  }, [counts, threads, loading]);

  // Only chips with a real number. A key the API omits never reaches the row.
  const live = useMemo(() => CHIPS.filter((c) => chipCount(c.k) !== null), [chipCount]);

  const visible = useMemo(() => {
    let rows = threads.filter((t) => matches(t, filter));
    if (q) {
      rows = rows.filter((t) =>
        t.display_name.toLowerCase().includes(q)
        || (t.phone ?? "").toLowerCase().includes(q)
        || t.preview.toLowerCase().includes(q));
    }
    return rows;
  }, [threads, filter, q]);

  const hiddenActive = !FRONT.includes(filter) && filter !== "all";
  const frontChips = [
    ...(hiddenActive ? live.filter((c) => c.k === filter) : []),
    ...live.filter((c) => FRONT.includes(c.k)),
  ].slice(0, 4);

  function chipStyle(on: boolean): React.CSSProperties {
    return {
      height: 30, flex: "0 1 auto", minWidth: 0,
      border: `1px solid ${on ? T.ink : T.hair}`,
      background: on ? T.ink : T.card, color: on ? "#fff" : T.ink2,
      fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
    };
  }

  function Pill({ n, on, c }: { n: number; on: boolean; c: string | null }) {
    return (
      <span className="flex items-center justify-center rounded-full shrink-0"
        style={{ minWidth: 17, height: 17, padding: "0 4px",
                 background: on ? "rgba(255,255,255,.92)" : (n > 0 && c ? c : T.hairSoft),
                 color: on ? T.ink : (n > 0 && c ? "#fff" : T.ink3),
                 fontFamily: disp, fontSize: F.xs, fontWeight: 700, ...nums }}>{n}</span>
    );
  }

  return (
    <div>
      {/* Drift: 0 is all-clear, >0 is an outage that reached the app, and a
          failure to read it renders as UNKNOWN — never as all-clear. */}
      {drift && (drift.count === null || drift.count > 0) && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.hivizDim, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: "#C24A00" }}>
            {drift.count === null ? "Drift unknown" : `Drift ${drift.count}`}
          </span>
          <span style={{ fontSize: F.xs, color: T.ink2, ...clip }}>
            {drift.count === null
              ? "Could not read the spine-drift check."
              : "message(s) arrived but never reached the app."}
          </span>
        </div>
      )}

      {q && (
        <div className="px-3 py-1.5 flex items-center gap-2"
          style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
          <span style={eyebrow}>Searching</span>
          <span style={{ fontSize: F.sm, color: T.ink, ...clip }}>{q}</span>
          <span className="flex-1" />
          <button onClick={() => router.push("/dashboard/messages")}
            style={{ ...eyebrow, color: T.chalk }}>Clear</button>
        </div>
      )}

      {/* One row, no scrolling. The three you reach for live out here; the rest
          sit behind the funnel. If you pick one from inside it takes the front
          slot, so you can always see what you are filtered to. */}
      {live.length > 0 && (
        <div className="flex gap-1 px-2.5 pt-2.5 pb-1.5 items-center sc-chips">
          {frontChips.map(({ k, l, c }) => {
            const on = filter === k;
            const n = chipCount(k) ?? 0;
            return (
              <button key={k} onClick={() => setFilter(on ? "all" : k)}
                className="pl-2.5 pr-2 rounded flex items-center gap-1.5" style={chipStyle(on)}>
                <span style={clip}>{l}</span>
                <Pill n={n} on={on} c={c} />
              </button>
            );
          })}

          <button onClick={() => setMoreFilters((o) => !o)} aria-label="All filters"
            aria-expanded={moreFilters}
            className="rounded flex items-center justify-center shrink-0 relative ml-auto"
            style={{ width: 32, height: 30,
                     border: `1px solid ${moreFilters || hiddenActive ? T.ink : T.hair}`,
                     background: moreFilters ? T.ink : T.card }}>
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path d="M1.6 2.6h11.8L9.1 7.5v4.3l-3.2 1.6V7.5z" fill="none"
                stroke={moreFilters ? "#fff" : T.ink2} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {hiddenActive && !moreFilters && (
              <span className="absolute rounded-full"
                style={{ top: -3, right: -3, width: 8, height: 8, background: T.hiviz }} />
            )}
          </button>
        </div>
      )}

      {moreFilters && (
        <div className="mx-2.5 mb-2 rounded px-2 py-2" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
          <div className="grid grid-cols-2 gap-1">
            {live.map(({ k, l, c }) => {
              const on = filter === k;
              const n = chipCount(k) ?? 0;
              return (
                <button key={k} onClick={() => { setFilter(k); setMoreFilters(false); }}
                  className="rounded px-2.5 flex items-center justify-between gap-1.5"
                  style={{ ...chipStyle(on), height: 32 }}>
                  <span style={clip}>{l}</span>
                  <Pill n={n} on={on} c={c} />
                </button>
              );
            })}
          </div>
          {/* Says what is missing and why, rather than leaving a gap where v34
              has a chip. */}
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 8, lineHeight: 1.4 }}>
            No Drafts filter: there is no outbox in the schema yet, so a count
            would be invented rather than zero.
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
          ))}
        </div>
      ) : noOrg ? (
        <EmptyState tone="warn"
          title="This account isn't a member of any organisation"
          detail="You are signed in, but nothing is shared with this account yet. Ask for an invitation to your organisation." />
      ) : error ? (
        <EmptyState tone="warn" title="Couldn't load threads" detail={error} />
      ) : threads.length === 0 ? (
        <EmptyState title="No threads yet" detail="Calls and texts appear here as they arrive." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : `Nothing under ${CHIPS.find((c) => c.k === filter)?.l ?? filter}`}
          detail={q
            ? "This searches names, numbers and each thread's latest message. Full text over every message isn't wired yet, so a word said mid-conversation won't be found here."
            : WHY_EMPTY[filter] ?? "Nothing under this filter."} />
      ) : (
        <div>
          {visible.map((t, i) => (
            <ThreadRow key={t.contact_id} t={t} first={i === 0}
              expanded={openRow === t.contact_id}
              onToggle={() => setOpenRow(openRow === t.contact_id ? null : t.contact_id)}
              onOpen={() => router.push(`/dashboard/messages/${t.contact_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
