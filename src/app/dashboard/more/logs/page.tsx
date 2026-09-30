"use client";

/**
 * Logs — what happened behind the scenes, in plain words (Coy, 2026-09-28).
 *
 * Data checks: a message that never reached the app is an ALARM (the 21
 * August outage, DECISIONS §2a); a note on a message that did arrive is only
 * something to know. Then Dusty's reads, and "Same person" merges. This is
 * what the database already records — there is no log of every tap yet.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, relTime } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";

interface Logs {
  checks: Array<{ at: string; severity: "alarm" | "note"; title: string; detail: string }>;
  reads: Array<{ id: string; at: string; outcome: string; note: string | null; contact_id: string; who: string | null }>;
  merges: Array<{ id: string; at: string; undone_at: string | null; winner_id: string; winner: string | null; loser: string | null }>;
}

const OUTCOME: Record<string, string> = {
  proposed: "Suggested", named: "Named", filed: "Filed", summarized: "Summary updated", unchanged: "Nothing new",
  no_words: "Nothing to read", model_error: "Couldn't read", failed: "Failed", abandoned: "Timed out", running: "Reading…", skipped: "Skipped",
};

export default function LogsScreen() {
  const [logs, setLogs] = useState<Logs | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined = not asked yet; null = couldn't read (shown as unknown).
  const [drift, setDrift] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    fetch("/api/dashboard/drift").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setDrift(typeof d?.count === "number" ? d.count : null); })
      .catch(() => { if (!off) setDrift(null); });
    fetch("/api/logs")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setLogs(b as Logs); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);

  const section = (title: string, children: React.ReactNode) => (
    <section className="mx-3 mt-3 rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
      <div className="px-3 py-2" style={{ ...eyebrow, color: T.ink, borderBottom: `1px solid ${T.hairSoft}` }}>{title}</div>
      {children}
    </section>
  );
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  if (error) return <EmptyState tone="warn" title="Couldn't load the logs" detail={error} />;
  if (!logs) return <div className="p-3"><div className="rounded animate-pulse" style={{ height: 120, background: T.hairSoft }} /></div>;
  const alarms = logs.checks.filter((c) => c.severity === "alarm").length;

  return (
    <div style={{ paddingBottom: 24, maxWidth: 760 }} className="mx-auto">
      <div className="px-3 pt-3">
        <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>Logs</h1>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>What happened behind the scenes. Nothing here needs you unless it is red.</div>
      </div>

      {/* The drift alarm (DECISIONS §2a) — out of the header since 2026-09-30,
          so it is loud here: a red banner while anything is missing, and
          "unknown" (never "clear") when the count can't be read. */}
      {drift !== undefined && drift !== 0 && (
        <div role="alert" className="mx-3 mt-3 rounded px-3 py-2"
          style={{ background: drift === null ? T.hairSoft : T.red, color: drift === null ? T.ink : "#fff", fontSize: F.sm, lineHeight: 1.4 }}>
          {drift === null
            ? "Couldn't check whether every call and text reached the app. This is unknown, not clear."
            : `${drift} ${drift === 1 ? "event" : "events"} reached your lines but never reached the app. Listed under Data checks below.`}
        </div>
      )}

      {section(`Data checks · ${alarms ? `${alarms} missing` : "nothing missing"}`,
        logs.checks.length === 0
          ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Every call and text that reached your lines reached the app.</div>
          : logs.checks.map((c, i) => (
            <div key={i} className="px-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <div className="flex items-baseline gap-2">
                <span style={{ ...eyebrow, color: c.severity === "alarm" ? T.red : T.ink3 }}>{c.severity === "alarm" ? "Missing" : "Note"}</span>
                <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, flex: 1 }}>{c.title}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when(c.at)}</span>
              </div>
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.4, marginTop: 2 }}>{c.detail}</div>
            </div>
          )))}

      {section("Dusty's reads",
        logs.reads.length === 0
          ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>No reads yet.</div>
          : logs.reads.map((r, i) => (
            <Link key={r.id} href={`/dashboard/messages/${r.contact_id}`} className="block px-3 py-1.5 no-underline"
              style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink }}>
              <div className="flex items-baseline gap-2">
                <span style={{ ...eyebrow, color: ["model_error", "failed", "abandoned"].includes(r.outcome) ? T.red : T.ink3, width: 110, flexShrink: 0 }}>
                  {OUTCOME[r.outcome] ?? r.outcome}
                </span>
                <span style={{ fontSize: F.sm, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who ?? "Unknown number"}</span>
                <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{relTime(r.at)}</span>
              </div>
              {r.note && <div style={{ fontSize: F.xs, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 118 }}>{r.note}</div>}
            </Link>
          )))}

      {section("Same-person merges",
        logs.merges.length === 0
          ? <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>None yet.</div>
          : logs.merges.map((m, i) => (
            <Link key={m.id} href={`/dashboard/messages/${m.winner_id}`} className="block px-3 py-2 no-underline"
              style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", color: T.ink, fontSize: F.sm }}>
              {m.loser ?? "A number"} → {m.winner ?? "a contact"}
              <span style={{ fontSize: F.xs, color: T.ink3 }}> · {when(m.at)}{m.undone_at ? " · undone" : ""}</span>
            </Link>
          )))}
    </div>
  );
}
