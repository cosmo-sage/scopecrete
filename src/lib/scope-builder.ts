/**
 * The Scope Builder (Coy, 2026-10-09: "Inside a job, I've got the Scope Builder
 * tool, which encompasses all those pages and subpages where it flows from files
 * to budgets to takeoffs. To proposal … a dedicated page for the scope builder
 * tool to go right to it … start a new scope from scratch … or jump right to an
 * existing scope. It's separate from the jobs page because it's just a different
 * way to look at the activity and the flow").
 *
 * The Jobs board is the sales stage (New lead … Complete). The Scope Builder is
 * how far each job's scope has got: Files → Takeoffs → Budget → Proposal → Sent.
 * Residential and commercial / government are two markets (Coy: "two different
 * worlds"): residential is measured in the field by section, commercial off plan
 * sets. Pure — tested in tests/scope-builder.test.mjs.
 */

export type ScopeStep = "files" | "takeoffs" | "budget" | "proposal" | "sent";
export const SCOPE_STEPS: Array<{ k: ScopeStep; label: string; view: "plans" | "budget" | "proposal" | "summary" }> = [
  { k: "files", label: "Files", view: "plans" },
  { k: "takeoffs", label: "Takeoffs", view: "plans" },
  { k: "budget", label: "Budget", view: "budget" },
  { k: "proposal", label: "Proposal", view: "proposal" },
  { k: "sent", label: "Sent", view: "summary" },
];

export type Market = "residential" | "commercial";
export const marketOf = (jobType: string | null | undefined): Market =>
  jobType === "commercial" || jobType === "public" ? "commercial" : "residential";

export interface ScopeFacts {
  /** Plan PDFs, photos or any file on the job. */
  files: number;
  /** Shapes measured in Takeoffs. */
  measured: number;
  /** Sections with a size (field-measured, or following a takeoff). */
  sized_sections: number;
  sections: number;
  budget_lines: number;
  /** A final proposal version exists. */
  final_proposal: boolean;
  /** A proposal link has been sent. */
  sent: boolean;
  views: number;
}

export interface ScopeProgress {
  /** The step to work on next ("sent" when the proposal is out). */
  next: ScopeStep;
  done: Record<ScopeStep, boolean>;
  /** One plain line on where it stands. */
  line: string;
}

/**
 * Where a scope stands. A residential job measured in the field by section
 * counts as measured without Takeoffs; a plan-set job needs its takeoff.
 * Files are optional for a residential job once it is measured.
 */
export function scopeProgress(f: ScopeFacts, market: Market): ScopeProgress {
  const measured = f.measured > 0 || (market === "residential" && f.sized_sections > 0);
  const done: Record<ScopeStep, boolean> = {
    files: f.files > 0 || (market === "residential" && measured),
    takeoffs: measured,
    budget: f.budget_lines > 0,
    proposal: f.final_proposal || f.sent,
    sent: f.sent,
  };
  const next = SCOPE_STEPS.find((s) => !done[s.k])?.k ?? "sent";
  const line =
    f.sent ? (f.views > 0 ? `Proposal sent · opened ${f.views === 1 ? "once" : `${f.views} times`}` : "Proposal sent · not opened yet")
    : next === "files" ? (market === "commercial" ? "Add the plan set" : "Add photos or measure the sections")
    : next === "takeoffs" ? (market === "commercial" ? `${f.files} file${f.files === 1 ? "" : "s"} · measure the takeoff` : "Measure the sections")
    : next === "budget" ? `${f.measured || f.sized_sections} measured · build the budget`
    : next === "proposal" ? `${f.budget_lines} budget item${f.budget_lines === 1 ? "" : "s"} · write the proposal`
    : "Proposal ready · send it";
  return { next, done, line };
}

/** The job view a step opens on. */
export function stepHref(jobId: string, step: ScopeStep): string {
  const s = SCOPE_STEPS.find((x) => x.k === step) ?? SCOPE_STEPS[0];
  if (step === "files") return `/dashboard/scope/${jobId}/plans?step=files`;
  if (step === "takeoffs") return `/dashboard/scope/${jobId}/plans?step=takeoff`;
  return s.view === "budget" ? `/dashboard/scope/${jobId}` : `/dashboard/scope/${jobId}/${s.view}`;
}
