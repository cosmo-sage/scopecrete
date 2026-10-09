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
import { JobSwitcher, SwitchChevron } from "@/components/v34/job-switcher";

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
  // The branch drops from the centre of that button and splits to each tab under it (Coy,
  // 2026-10-09: "put the line down from the center … and then split in each direction").
  const onRef = useRef<HTMLAnchorElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<{ left: number; stem: number; tabs: number[] } | null>(null);
  useLayoutEffect(() => {
    const b = onRef.current, box = subRef.current;
    if (!subnav || !b || !box) return;
    const center = b.offsetLeft + b.offsetWidth / 2;
    const tabs = Array.from(box.querySelectorAll<HTMLElement>("[role=tab]")).map((el) => el.offsetLeft + el.offsetWidth / 2);
    const width = box.scrollWidth;
    const left = Math.max(0, Math.round(center - width / 2));
    const next = { left, stem: Math.round(center - left), tabs: tabs.map(Math.round) };
    setGeo((g) => (g && g.left === next.left && g.stem === next.stem && g.tabs.join() === next.tabs.join() ? g : next));
  }, [subnav, active]);
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
      <div ref={subRef} className="lg:hidden relative" style={{ marginLeft: geo?.left ?? 0, paddingTop: 12, visibility: geo ? "visible" : "hidden" }}>
        {geo && geo.tabs.length > 0 && (() => {
          const line = T.hairStrong;
          const lo = Math.min(geo.stem, ...geo.tabs), hi = Math.max(geo.stem, ...geo.tabs);
          return (
            <span aria-hidden="true">
              <span style={{ position: "absolute", left: geo.stem, top: 0, height: 6, borderLeft: `1px solid ${line}` }} />
              <span style={{ position: "absolute", left: lo, width: hi - lo, top: 6, borderTop: `1px solid ${line}` }} />
              {geo.tabs.map((x, i) => <span key={i} style={{ position: "absolute", left: x, top: 6, height: 6, borderLeft: `1px solid ${line}` }} />)}
            </span>
          );
        })()}
        {subnav}
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
  // The job's name opens the job switcher on the right (Coy, 2026-10-08); a pick opens this same view.
  const [switching, setSwitching] = useState(false);
  const viewHref = (TABS.find((t) => t.k === active) ?? TABS[0]).href;
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
            ? (
              <button onClick={() => setSwitching(true)} aria-haspopup="dialog" aria-expanded={switching} title="Switch to another job"
                className="sc-job-switch flex items-center gap-1.5" style={{ minWidth: 0, cursor: "pointer", background: "transparent", border: "none", padding: "1px 4px", margin: "0 -4px", borderRadius: 4 }}>
                <span className="sc-job-name" style={{ fontFamily: disp, fontWeight: 700, lineHeight: 1.15, color: T.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                <SwitchChevron />
              </button>
            )
            : <>
              {title}
              {/* The Budget's name is typed in place, so the switcher is the ▾ beside it. */}
              <button onClick={() => setSwitching(true)} aria-haspopup="dialog" aria-expanded={switching} aria-label="Switch to another job" title="Switch to another job"
                className="sc-job-switch shrink-0 flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 4, cursor: "pointer", background: "transparent", border: "none" }}>
                <SwitchChevron />
              </button>
            </>}
          {after}
        </div>
        {sub && <div className="text-center lg:text-left" style={{ fontSize: 11, color: T.ink3, overflowWrap: "anywhere", marginTop: 1 }}>{sub}</div>}
      </div>
      <div className="flex justify-center shrink-0 lg:ml-auto"><JobTabs jobId={jobId} active={active} subnav={subnav} /></div>
      <JobSwitcher open={switching} onClose={() => setSwitching(false)} jobId={jobId} href={viewHref} />
    </div>
  );
}
