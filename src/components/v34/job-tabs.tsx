"use client";
/**
 * The job's three views, one switch (Coy, 2026-10-02: "one job budget page,
 * and I can toggle between that budget and the proposal"): Budget (the job
 * page — sections, budget, files) · Plan room · Proposal. The same strip sits
 * on all three, so each is one tap from the others and never a dead end.
 */
import Link from "next/link";
import { T, disp } from "@/lib/v34/tokens";

const TABS = [
  { k: "job", label: "Budget", href: (id: string) => `/dashboard/scope/${id}` },
  { k: "plans", label: "Plan room", href: (id: string) => `/dashboard/scope/${id}/plans` },
  { k: "proposal", label: "Proposal", href: (id: string) => `/dashboard/scope/${id}/proposal` },
] as const;

export function JobTabs({ jobId, active, back = false }: { jobId: string; active: "job" | "plans" | "proposal"; back?: boolean }) {
  return (
    <nav aria-label="This job" className="sc-no-print flex items-center gap-1.5 min-w-0">
      {back && <Link href="/dashboard/scope" className="no-underline shrink-0" style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>‹ Jobs</Link>}
      <span className="inline-flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hairStrong}` }}>
        {TABS.map((t, i) => {
          const on = t.k === active;
          return (
            <Link key={t.k} href={t.href(jobId)} aria-current={on ? "page" : undefined} className="no-underline flex items-center"
              style={{ height: 28, padding: "0 10px", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, borderLeft: i ? `1px solid ${T.hair}` : "none",
                fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {t.label}
            </Link>
          );
        })}
      </span>
    </nav>
  );
}
