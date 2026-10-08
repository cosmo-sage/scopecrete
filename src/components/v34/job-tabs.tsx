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
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp } from "@/lib/v34/tokens";
import { useAccess } from "@/lib/v34/access-ctx";
import { can } from "@/lib/access";

const TABS = [
  { k: "summary", label: "Summary", href: (id: string) => `/dashboard/scope/${id}/summary` },
  { k: "plans", label: "Takeoffs", href: (id: string) => `/dashboard/scope/${id}/plans` },
  { k: "job", label: "Budget", href: (id: string) => `/dashboard/scope/${id}` },
  { k: "proposal", label: "Proposal", href: (id: string) => `/dashboard/scope/${id}/proposal` },
] as const;

export type JobView = (typeof TABS)[number]["k"];

export function JobTabs({ jobId, active, back = false, subnav }: { jobId: string; active: JobView; back?: boolean; subnav?: React.ReactNode }) {
  // An onsite estimator (081) sees only the views they were given; never the summary or the proposal.
  const access = useAccess();
  const tabs = TABS.filter((t) => t.k === "job" || (t.k === "plans" ? can(access, "plan_room") : !access.limited))
    .map((t) => (t.k === "job" && !can(access, "budget") ? { ...t, label: "Job" } : t));
  // On a phone a view's own tabs hang from its button (Coy, 2026-10-07: Files and Takeoff "descendant
  // from the plan room button, soon to be called the take-offs button"): the row starts under it.
  const onRef = useRef<HTMLAnchorElement | null>(null);
  const [subLeft, setSubLeft] = useState(0);
  useLayoutEffect(() => { if (subnav && onRef.current) setSubLeft(onRef.current.offsetLeft); }, [subnav, active]);
  const nav = (
    <nav aria-label="This job" className="sc-no-print flex items-center gap-1.5 min-w-0">
      {back && <Link href="/dashboard/scope" className="no-underline shrink-0" style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>‹ Jobs</Link>}
      <span className="inline-flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hairStrong}` }}>
        {tabs.map((t, i) => {
          const on = t.k === active;
          return (
            <Link key={t.k} ref={on ? onRef : undefined} href={t.href(jobId)} aria-current={on ? "page" : undefined} className="no-underline flex items-center"
              style={{ height: 28, padding: "0 10px", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, borderLeft: i ? `1px solid ${T.hair}` : "none",
                fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {t.label}
            </Link>
          );
        })}
      </span>
    </nav>
  );
  if (!subnav) return nav;
  return (
    <div className="relative flex flex-col items-start">
      {nav}
      <div className="lg:hidden flex items-stretch" style={{ marginLeft: subLeft + 8, marginTop: 0 }}>
        <span aria-hidden style={{ width: 10, height: 15, borderLeft: `1px solid ${T.hairStrong}`, borderBottom: `1px solid ${T.hairStrong}`, borderBottomLeftRadius: 3, marginRight: 4 }} />
        <div style={{ paddingTop: 4 }}>{subnav}</div>
      </div>
    </div>
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
export function JobHeaderRow({ jobId, active, title, after, sub, customerId, subnav }: {
  jobId: string; active: JobView;
  /** The job's customer: ‹ goes back to their page, on its Jobs tab (Coy, 2026-10-07). */
  customerId?: string | null;
  /** On a phone, the view's own tabs hang under its switch button (the Takeoffs page's Files · Takeoff). */
  subnav?: React.ReactNode;
  /** The name: plain text, or the Budget page's editable box. */
  title: React.ReactNode;
  /** Small things that belong with the name. */
  after?: React.ReactNode;
  /** A line under the name. */
  sub?: React.ReactNode;
}) {
  // Back goes to the customer's page, on its Jobs tab (Coy, 2026-10-07: "it should go to the
  // customer page, that lists the jobs, not back to the jobs page"). An onsite estimator can't
  // open customers (081), and a job with no customer has none: those go back to the Jobs board.
  const access = useAccess();
  const toCustomer = !!customerId && !access.limited;
  const back = toCustomer ? `/dashboard/customers/${customerId}?tab=jobs` : "/dashboard/scope";
  return (
    <div className="sc-no-print flex flex-col gap-y-1.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-2">
      <div className="relative lg:flex-[1_1_220px]" style={{ minWidth: 0 }}>
        {/* On a phone ‹ Jobs is just ‹ so a long name has the width (Coy, 2026-10-06). */}
        <div className="flex items-center justify-center gap-2 px-6 lg:justify-start lg:px-0" style={{ minWidth: 0, minHeight: 26 }}>
          <Link href={back} aria-label={toCustomer ? "Back to the customer" : "Jobs"} className="no-underline shrink-0 absolute left-0 inset-y-0 flex items-center lg:static"
            style={{ fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink2 }}>
            <span className="lg:hidden" style={{ fontSize: 20, lineHeight: 1 }}>‹</span><span className="hidden lg:inline">{toCustomer ? "‹ Customer" : "‹ Jobs"}</span>
          </Link>
          {typeof title === "string"
            ? <span className="sc-job-name" style={{ fontFamily: disp, fontWeight: 700, lineHeight: 1.15, color: T.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            : title}
          {after}
        </div>
        {sub && <div className="text-center lg:text-left" style={{ fontSize: 11, color: T.ink3, overflowWrap: "anywhere", marginTop: 1 }}>{sub}</div>}
      </div>
      <div className="flex justify-center shrink-0 lg:ml-auto"><JobTabs jobId={jobId} active={active} subnav={subnav} /></div>
    </div>
  );
}
