/**
 * Scheduling a won job (Coy, 2026-10-09: "get that job on the books scheduled, mobilized and job
 * costed"). Pure — tested in tests/job-schedule.test.mjs. No migration: jobs.scheduled_start,
 * scheduled_end (dates), duration_days and schedule_state (none · tentative · committed) are in
 * the first schema.
 *
 * A start day and the days of work give the end day, counted in work days (Mon–Fri) — a 3-day
 * job starting Friday ends Tuesday. Setting a start moves a Won job to Scheduled; clearing it moves
 * a Scheduled one back to Won. Nothing else about the job's stage changes here.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-14" if it is a real calendar day, else null. */
export function validDay(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = DAY.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  if (+m[1] < 2000 || +m[1] > 2100) return null;
  return s.trim();
}

const toDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const weekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** The last day of work: `days` work days (Mon–Fri) from `start`, which counts as the first if it is one. */
export function workEnd(start: string, days: number | null | undefined): string | null {
  if (!validDay(start)) return null;
  const n = days == null || !Number.isFinite(days) || days <= 0 ? 1 : Math.ceil(days);
  const d = toDate(start);
  while (weekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  let left = n - 1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!weekend(d)) left--;
  }
  return toDay(d);
}

/** The stage a job moves to when its start day is set or cleared (null = leave it). */
export function statusForSchedule(status: string | null | undefined, hasStart: boolean): string | null {
  if (hasStart && status === "won") return "scheduled";
  if (!hasStart && status === "scheduled") return "won";
  return null;
}

/** Today's date in Central time, "YYYY-MM-DD". */
export function todayCentral(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** Whole days from `today` to `day` (negative = past). */
export function daysUntil(day: string, today: string): number {
  return Math.round((toDate(day).getTime() - toDate(today).getTime()) / 86400_000);
}

/** "Mon, Oct 14" */
export function dayLabel(day: string): string {
  return toDate(day).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

/** "today" · "tomorrow" · "in 5 days" · "started 2 days ago" · "started yesterday". */
export function whenLabel(day: string, today: string): string {
  const n = daysUntil(day, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1) return `in ${n} days`;
  return n === -1 ? "started yesterday" : `started ${-n} days ago`;
}

export interface ScheduledJob { id: string; title: string | null; status: string | null; scheduled_start: string | null; scheduled_end: string | null }

/**
 * Coming up: jobs not yet underway whose start is from a week ago onward (a start that passed with
 * the job still Scheduled is shown, so it isn't forgotten), soonest first.
 */
export function comingUp<J extends ScheduledJob>(jobs: J[], today: string, ahead = 60): J[] {
  return jobs
    .filter((j) => j.scheduled_start && ["won", "scheduled"].includes(j.status ?? ""))
    .filter((j) => { const n = daysUntil(j.scheduled_start!, today); return n >= -7 && n <= ahead; })
    .sort((a, b) => (a.scheduled_start! < b.scheduled_start! ? -1 : a.scheduled_start! > b.scheduled_start! ? 1 : 0));
}
