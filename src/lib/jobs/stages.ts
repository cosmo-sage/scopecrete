/**
 * The Jobs board's stages (DECISIONS §6), mapped onto jobs.status.
 *
 * Pure — no imports — so tests/job-stages.test.mjs runs it under node --test.
 *
 * A stage can hold several statuses (W.I.P. is won → scheduled → in_progress),
 * so a card keeps its finer status and shows it as a small tag. Moving a card
 * INTO a stage sets that stage's `enter` status; moving within a stage is a
 * status change, not a stage change.
 */

export interface Stage {
  k: string;
  label: string;
  statuses: string[];
  /** The status a job gets when moved into this stage. */
  enter: string;
}

export const STAGES: Stage[] = [
  { k: "new", label: "New lead", statuses: ["invited", "lead"], enter: "lead" },
  { k: "consult", label: "Consultation", statuses: ["consultation"], enter: "consultation" },
  { k: "estimating", label: "Estimating", statuses: ["scoping"], enter: "scoping" },
  { k: "follow", label: "Follow up", statuses: ["quoted"], enter: "quoted" },
  { k: "wip", label: "W.I.P.", statuses: ["won", "scheduled", "in_progress"], enter: "won" },
  { k: "complete", label: "Complete", statuses: ["complete", "closed"], enter: "complete" },
  { k: "lost", label: "Lost", statuses: ["lost"], enter: "lost" },
];

export const ALL_STATUSES = STAGES.flatMap((s) => s.statuses);

/** The stage a status sits in. An unknown or null status is a new lead. */
export function stageOf(status: string | null | undefined): Stage {
  return STAGES.find((s) => s.statuses.includes(status ?? "")) ?? STAGES[0];
}

/** Finer status shown on a card when its stage holds more than one. */
export const STATUS_TAG: Record<string, string> = {
  invited: "Bid invite", won: "Won", scheduled: "Scheduled", in_progress: "Pouring", closed: "Closed",
};

/** Every status by name, for the Move sheet's in-stage choices. */
export const STATUS_NAME: Record<string, string> = {
  invited: "Bid invite", lead: "Lead", consultation: "Consultation", scoping: "Estimating", quoted: "Quoted",
  won: "Won", scheduled: "Scheduled", in_progress: "Pouring", complete: "Complete", closed: "Closed", lost: "Lost",
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  residential: "Residential", commercial: "Commercial", public: "Government",
};

export const LEAD_SOURCES: Array<{ k: string; label: string }> = [
  { k: "website", label: "Website" },
  { k: "referral", label: "Referral" },
  { k: "gc_invite", label: "GC bid invite" },
  { k: "lead_gen", label: "Lead service" },
  { k: "repeat", label: "Repeat customer" },
  { k: "direct", label: "Called / walked in" },
  { k: "other", label: "Other" },
];
