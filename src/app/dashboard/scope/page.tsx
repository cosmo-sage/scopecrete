"use client";

/**
 * Scope — jobs, the spine of the product (DECISIONS.md §1, §2).
 *
 * Reads /api/jobs, which is now a real writer as well as a reader. Until work
 * order 13 nothing in the system created a `jobs` row, so this screen was empty
 * for a structural reason rather than a wiring one.
 *
 * The old empty-state copy said "A job is created when a scope is built and
 * won." That is wrong and was teaching a workflow the database does not
 * implement: `status` DEFAULTS to 'lead', and won_at / lost_at / declined_at
 * arrive later. A job is the container from first contact, not the reward for
 * winning.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, relTime } from "@/lib/v34/tokens";
import { EmptyState, Badge } from "@/components/v34/primitives";

interface Job {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  origin: string | null;
  confirmed_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string | null;
  counts_toward_value: boolean;
}

export default function ScopeScreen() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/jobs");
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (b?.code === "no_org") { setNoOrg(true); setJobs([]); return; }
        throw new Error(b?.error || `HTTP ${r.status}`);
      }
      setJobs(Array.isArray(b.jobs) ? b.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Accepting is one job at a time and goes through PATCH {accept:true}. The
  // route sets confirmed_at/confirmed_by; the client never sends them.
  async function accept(id: string) {
    setAccepting(id);
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(null);
    }
  }

  if (noOrg) {
    return <EmptyState tone="warn" title="This account isn't a member of any organisation"
      detail="You are signed in, but nothing is shared with this account yet." />;
  }
  if (error) return <EmptyState tone="warn" title="Couldn't load jobs" detail={error} />;

  if (jobs === null) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded animate-pulse" style={{ height: 56, background: T.hairSoft }} />
        ))}
      </div>
    );
  }

  const counted = jobs.filter((j) => j.counts_toward_value).length;
  const unreviewed = jobs.length - counted;

  return (
    <div>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div style={eyebrow}>Scope</div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05 }}>
          Jobs and sections
        </div>
        {jobs.length > 0 && (
          <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, ...nums }}>
            {counted} job{counted === 1 ? "" : "s"}
            {unreviewed > 0 && ` · ${unreviewed} awaiting your review`}
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState title="No jobs yet"
          detail="A job is the container for a piece of work, from first contact onward — it starts as a lead and is won or lost later. Create one from a thread when someone asks for work." />
      ) : (
        jobs.map((j, i) => {
          const who = j.contact_name || j.contact_phone || "No contact";
          const when = relTime(j.created_at);
          return (
            <div key={j.id} className="px-3 py-2.5"
              style={{ background: T.card, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
              <div className="flex items-baseline gap-2" style={{ minWidth: 0 }}>
                <span style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, ...clip }}>
                  {j.title || j.job_number || "Untitled job"}
                </span>
                <span className="flex-1" />
                {j.status && <Badge s={j.status} />}
                {when && <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{when}</span>}
              </div>

              <div style={{ fontSize: F.xs, color: T.ink3, ...clip, marginTop: 2 }}>
                {who}{j.address ? ` · ${j.address}` : ""}
                {/* job_number renders only when it exists. Nothing generates one
                    — the scheme is unconfirmed, and a made-up number that looks
                    official is worse than a blank. */}
                {j.job_number ? ` · ${j.job_number}` : ""}
              </div>

              {/* An unreviewed machine job is SHOWN but excluded from the count
                  above until accepted. Visible and uncounted, never hidden. */}
              {!j.counts_toward_value && (
                <div className="flex items-center gap-2 mt-2">
                  <span style={{ ...eyebrow, color: T.hiviz }}>Suggested — not counted</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => void accept(j.id)}
                    disabled={accepting === j.id}
                    className="rounded px-3"
                    style={{
                      height: 32, border: `1px solid ${T.hair}`, background: T.card,
                      fontFamily: disp, fontSize: F.sm, letterSpacing: ".06em",
                      textTransform: "uppercase", cursor: accepting === j.id ? "default" : "pointer",
                    }}>
                    {accepting === j.id ? "Accepting…" : "Accept"}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
