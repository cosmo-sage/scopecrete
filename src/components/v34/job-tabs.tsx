"use client";
/**
 * The job's views, one switch (Coy, 2026-10-02: "one job budget page,
 * and I can toggle between that budget and the proposal"): Budget (the job
 * page — sections, budget, files) · Plan room · Proposal. In the order of
 * the work (Coy, 2026-10-03): Plan room, Budget, Proposal. Summary comes first
 * (Coy, 2026-10-05: "a summary page to the left of the plan room") — the job's
 * chips, who it's for, its totals and the proposal's state. The same strip sits
 * on every view, so each is one tap from the others and never a dead end.
 */
import type React from "react";
import Link from "next/link";
import { T, F, disp } from "@/lib/v34/tokens";
import { useAccess } from "@/lib/v34/access-ctx";
import { can } from "@/lib/access";

const TABS = [
  { k: "summary", label: "Summary", href: (id: string) => `/dashboard/scope/${id}/summary` },
  { k: "plans", label: "Plan room", href: (id: string) => `/dashboard/scope/${id}/plans` },
  { k: "job", label: "Budget", href: (id: string) => `/dashboard/scope/${id}` },
  { k: "proposal", label: "Proposal", href: (id: string) => `/dashboard/scope/${id}/proposal` },
] as const;

export type JobView = (typeof TABS)[number]["k"];

export function JobTabs({ jobId, active, back = false }: { jobId: string; active: JobView; back?: boolean }) {
  // An onsite estimator (081) sees only the views they were given; never the summary or the proposal.
  const access = useAccess();
  const tabs = TABS.filter((t) => t.k === "job" || (t.k === "plans" ? can(access, "plan_room") : !access.limited))
    .map((t) => (t.k === "job" && !can(access, "budget") ? { ...t, label: "Job" } : t));
  return (
    <nav aria-label="This job" className="sc-no-print flex items-center gap-1.5 min-w-0">
      {back && <Link href="/dashboard/scope" className="no-underline shrink-0" style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>‹ Jobs</Link>}
      <span className="inline-flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hairStrong}` }}>
        {tabs.map((t, i) => {
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

/**
 * The top row of every job view (Coy, 2026-10-05: "I like the layout of the budget page the
 * best with the job name on the top left and the 'plan room, budget, proposal' buttons on the top
 * right … Any buttons currently in the top right need to be moved down below"): ‹ Jobs and the
 * job's name on the left, the switch alone on the right. Each page's own tools go on a row below.
 * On a phone (Coy, same day: "the job name in the center of the page … plan room, budget, and
 * proposal button should be center of the page below the job name") the name is centred on its
 * own line, ‹ Jobs held at that line's left edge, and the switch centred on the line under it.
 */
export function JobHeaderRow({ jobId, active, title, after, sub }: {
  jobId: string; active: JobView;
  /** The name: plain text, or the Budget page's editable box. */
  title: React.ReactNode;
  /** Small things that belong with the name. */
  after?: React.ReactNode;
  /** A line under the name. */
  sub?: React.ReactNode;
}) {
  return (
    <div className="sc-no-print flex flex-col gap-y-1.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-2">
      <div className="relative lg:flex-[1_1_220px]" style={{ minWidth: 0 }}>
        {/* px-14 keeps the centred name clear of ‹ Jobs on both sides, so it is truly centred. */}
        <div className="flex items-center justify-center gap-2 px-14 lg:justify-start lg:px-0" style={{ minWidth: 0, minHeight: 26 }}>
          <Link href="/dashboard/scope" className="no-underline shrink-0 absolute left-0 inset-y-0 flex items-center lg:static"
            style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink2 }}>‹ Jobs</Link>
          {typeof title === "string"
            ? <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, lineHeight: 1.15, color: T.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            : title}
          {after}
        </div>
        {sub && <div className="text-center lg:text-left" style={{ fontSize: 11, color: T.ink3, overflowWrap: "anywhere", marginTop: 1 }}>{sub}</div>}
      </div>
      <div className="flex justify-center shrink-0 lg:ml-auto"><JobTabs jobId={jobId} active={active} /></div>
    </div>
  );
}
