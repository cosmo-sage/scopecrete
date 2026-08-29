"use client";

/**
 * Scope — the spine of the product (DECISIONS.md §1).
 *
 * `jobs` currently has 0 rows, so this screen is genuinely empty. It renders
 * its structure and says so. Under rule 8 that is the whole point: the layout
 * holds and the flow is walkable, and not one number is invented to fill it.
 *
 * The v34 ScopeScreen and its costing engine are a large port that depends on
 * job and section rows existing. Wiring it against zero rows would only prove
 * that mock data renders.
 */

import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";

interface Job { id: string; job_number: string | null; title: string | null; status: string | null }

export default function ScopeScreen() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/cashflow")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        return b;
      })
      .then((d) => { if (!cancelled) setJobs(Array.isArray(d.jobs) ? d.jobs : []); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div style={eyebrow}>Scope</div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05 }}>
          Jobs and sections
        </div>
      </div>

      {error ? (
        <EmptyState tone="warn" title="Couldn't load jobs" detail={error} />
      ) : jobs === null ? (
        <div className="p-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs yet"
          detail="A job is created when a scope is built and won. Nothing has reached that stage, so there is nothing to price here yet." />
      ) : (
        <div>
          {jobs.map((j, i) => (
            <div key={j.id} className="px-3 py-2"
              style={{ background: T.card, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
              <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600 }}>
                {j.title || j.job_number || "Untitled job"}
              </div>
              {j.status && <div style={{ fontSize: F.xs, color: T.ink3 }}>{j.status}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
