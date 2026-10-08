/**
 * The ScopeCrete admin (migration 091; Coy, 2026-10-08: the Claude Design
 * "Super Admin" package — "a new Dashboard for me to manage the scopecrete
 * Saas With"). Pure: what a company's status and health are, which setup
 * steps it has done, what raises an alarm. Tested in tests/admin.test.mjs.
 *
 * Everything here reads the counts the sc_admin_* functions return — never a
 * customer's name, text or file (DECISIONS §7: counts, not content).
 */

import { centralMidnight } from "./rule-threads.ts";

export type AdminRange = "today" | "d7" | "d30";
export const RANGES: Array<{ k: AdminRange; label: string; long: string }> = [
  { k: "today", label: "Today", long: "Today" },
  { k: "d7", label: "7 d", long: "Last 7 days" },
  { k: "d30", label: "30 d", long: "Last 30 days" },
];
export const readRange = (v: unknown): AdminRange => (v === "d7" || v === "d30" ? v : "today");

/** Where the range starts: Central midnight for today, else 7 or 30 days back. */
export function sinceFor(range: AdminRange, now: Date): string {
  if (range === "d7") return new Date(now.getTime() - 7 * 864e5).toISOString();
  if (range === "d30") return new Date(now.getTime() - 30 * 864e5).toISOString();
  return centralMidnight(now).toISOString();
}

export interface AdminSetup {
  quo: string | null; email: string | null; lines: string | null; logo: string | null; logo_set: boolean;
  tax: string | null; pricebook: string | null; assemblies: string | null; people: string | null; proposal: string | null;
}

export interface AdminCompany {
  id: string; name: string; slug: string | null; plan: string | null; created_at: string;
  members: number; invited: number; owner: string | null; last_active: string | null;
  inbound: number; outbound: number; emails: number; dusty_questions: number;
  jobs_open: number; jobs_made: number; bids_filed: number;
  proposals_sent: number; proposals_opened: number; proposals_30d: number;
  drift: number; intake_errors_24h: number; bids_stuck: number; file_bytes: number;
  spark: number[]; setup: AdminSetup; first_inbound: string | null; first_job: string | null;
}

/** The nine steps a new company takes before ScopeCrete earns its keep. */
export const SETUP_STEPS: Array<{ k: keyof AdminSetup; label: string; nudge: string }> = [
  { k: "quo", label: "Quo connected (webhook getting events)", nudge: "point their Quo webhook at ScopeCrete" },
  { k: "email", label: "Intake email", nudge: "set up their intake email" },
  { k: "lines", label: "Phone lines", nudge: "add their phone lines" },
  { k: "logo", label: "Logo", nudge: "uploaded a logo" },
  { k: "tax", label: "Tax parishes", nudge: "entered a parish tax rate" },
  { k: "pricebook", label: "Price book imported", nudge: "imported a price book" },
  { k: "assemblies", label: "Assemblies", nudge: "built an assembly" },
  { k: "people", label: "People invited", nudge: "invited anyone" },
  { k: "proposal", label: "First proposal sent", nudge: "sent a proposal" },
];

/** When a step was done: its date, true when done with no date known (a logo set before 056's audit), or null. */
export function stepDone(s: AdminSetup | null | undefined, k: keyof AdminSetup): string | true | null {
  if (!s) return null;
  if (k === "logo") return s.logo ?? (s.logo_set ? true : null);
  const v = s[k];
  return typeof v === "string" && v ? v : null;
}
export const setupCount = (s: AdminSetup | null | undefined) => SETUP_STEPS.filter((x) => stepDone(s, x.k) !== null).length;

export type AdminStatus = "active" | "setup" | "quiet" | "risk";
export type Health = "g" | "a" | "r";
export const STATUS_LABEL: Record<AdminStatus, [string, string]> = {
  active: ["Active", "g"], setup: ["Setting up", "b"], quiet: ["Quiet", "a"], risk: ["At risk", "r"],
};

const days = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 864e5 : Infinity);

/**
 * Setting up while under 30 days old with steps left; otherwise at risk with
 * nobody signed in or asking Dusty for 7 days, quiet for 3, else active.
 */
export function companyStatus(c: Pick<AdminCompany, "created_at" | "last_active" | "setup">, now: Date): AdminStatus {
  if (days(c.created_at, now) < 30 && setupCount(c.setup) < SETUP_STEPS.length) return "setup";
  const quiet = days(c.last_active, now);
  if (quiet > 7) return "risk";
  if (quiet > 3) return "quiet";
  return "active";
}

/** Red when something it sent us didn't get through; amber when it is slipping or still setting up. */
export function companyHealth(c: Pick<AdminCompany, "drift" | "bids_stuck" | "intake_errors_24h" | "created_at" | "last_active" | "setup">, now: Date): Health {
  if (c.drift > 0 || c.bids_stuck > 0 || c.intake_errors_24h > 0) return "r";
  return companyStatus(c, now) === "active" ? "g" : "a";
}

/** Why a company is flagged, in one line, or null. */
export function riskLine(c: AdminCompany, now: Date): string | null {
  const st = companyStatus(c, now);
  if (st === "risk") {
    const d = days(c.last_active, now);
    return d === Infinity ? "Nobody has signed in yet" : `No sign-in or Dusty question in ${Math.floor(d)} d`;
  }
  if (st === "setup") {
    const n = setupCount(c.setup);
    if (days(c.created_at, now) > 7 && n < 6) return `Setup stalled at ${n} of ${SETUP_STEPS.length}`;
  }
  return null;
}

export interface AdminWorker { worker: string; status: string; detail: string | null; at: string | null }

/** How long a worker may go without a heartbeat. Dreams run every two hours; the rest every minute or five. */
export function workerLimitMin(worker: string): number {
  return worker === "dusty-dream" ? 180 : 15;
}
export const WORKER_LABEL: Record<string, string> = {
  "enrich-contacts": "Contact reader", "read-files": "File reader", "bid-intake": "Bid reader",
  "email-intake": "Email intake", "dusty-dream": "Dreams",
};
export function workerState(w: AdminWorker, now: Date): "ok" | "silent" | "not_configured" | "error" {
  if (w.status === "not_configured") return "not_configured";
  if (w.status !== "ok") return "error";
  if (days(w.at, now) * 1440 > workerLimitMin(w.worker)) return "silent";
  return "ok";
}

export interface Alarm { sev: "r" | "a"; title: string; msg: string; org_id: string | null; link: AdminScreen; at: string | null }

export interface PlatformUse { db_bytes: number; storage: Array<{ bucket: string; bytes: number; objects: number }> }

/** Supabase's free plan, which the project is on (DECISIONS §8, 2026-10-06). */
export const PLAN_LIMITS = { db_bytes: 500 * 1024 ** 2, storage_bytes: 1024 ** 3 } as const;

export function alarms(cos: AdminCompany[], workers: AdminWorker[], platform: PlatformUse | null, now: Date): Alarm[] {
  const out: Alarm[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  for (const c of cos) {
    if (c.drift > 0) out.push({ sev: "r", title: "Calls or texts not reaching the app", org_id: c.id, link: "pipelines", at: null,
      msg: `${n(c.drift, "event landed and never became a message", "events landed and never became messages")}.` });
    if (c.intake_errors_24h > 0) out.push({ sev: "r", title: "Intake errors", org_id: c.id, link: "pipelines", at: null,
      msg: `${n(c.intake_errors_24h, "call or text", "calls or texts")} failed to file in the last 24 h.` });
    if (c.bids_stuck > 0) out.push({ sev: "r", title: "Bid stuck", org_id: c.id, link: "pipelines", at: null,
      msg: `${n(c.bids_stuck, "bid package hasn't", "bid packages haven't")} moved in 15 minutes.` });
    if (companyStatus(c, now) === "risk" && c.members > 0) out.push({ sev: "a", title: "Company slipping away", org_id: c.id, link: "companies", at: c.last_active,
      msg: riskLine(c, now) ?? "No recent activity." });
  }
  for (const w of workers) {
    const st = workerState(w, now);
    const label = WORKER_LABEL[w.worker] ?? w.worker;
    if (st === "error") out.push({ sev: "r", title: `${label} is failing`, org_id: null, link: "pipelines", at: w.at, msg: w.detail || w.status });
    else if (st === "silent") out.push({ sev: "r", title: `${label} has gone quiet`, org_id: null, link: "pipelines", at: w.at,
      msg: `No heartbeat in over ${workerLimitMin(w.worker) >= 60 ? `${workerLimitMin(w.worker) / 60} h` : `${workerLimitMin(w.worker)} min`}.` });
    else if (st === "not_configured") out.push({ sev: "a", title: `${label} isn't set up`, org_id: null, link: "pipelines", at: w.at, msg: w.detail || "Missing a key or secret." });
  }
  if (platform) {
    const store = platform.storage.reduce((a, b) => a + Number(b.bytes || 0), 0);
    if (platform.db_bytes > PLAN_LIMITS.db_bytes * 0.8) out.push({ sev: "a", title: "Database near the plan limit", org_id: null, link: "costs", at: null,
      msg: `${bytes(platform.db_bytes)} of ${bytes(PLAN_LIMITS.db_bytes)}.` });
    if (store > PLAN_LIMITS.storage_bytes * 0.8) out.push({ sev: "a", title: "Storage near the plan limit", org_id: null, link: "costs", at: null,
      msg: `${bytes(store)} of ${bytes(PLAN_LIMITS.storage_bytes)}.` });
  }
  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "r" ? -1 : 1));
}

export type AdminScreen = "pulse" | "companies" | "company" | "pipelines" | "dusty" | "usage" | "feedback" | "releases" | "costs" | "log";
export const SCREENS: Array<{ k: Exclude<AdminScreen, "company">; label: string; q: string }> = [
  { k: "pulse", label: "Pulse", q: "Is anything broken, and how is the business doing?" },
  { k: "companies", label: "Companies", q: "Who's healthy, who's stuck, who's slipping away?" },
  { k: "pipelines", label: "Pipelines", q: "Is every call, text, email and bid arriving and being read?" },
  { k: "dusty", label: "Dusty", q: "Is Dusty used, and is he right?" },
  { k: "usage", label: "Usage", q: "What gets made, by whom, and where do people drop off?" },
  { k: "feedback", label: "Feedback", q: "What are people asking for, and what's in progress?" },
  { k: "releases", label: "Releases", q: "What's live, and which migrations are applied?" },
  { k: "costs", label: "Costs", q: "What the platform uses against its plan limits." },
  { k: "log", label: "Admin log", q: "Every action an admin took." },
];
export const readScreen = (v: unknown): AdminScreen =>
  (v === "company" || SCREENS.some((s) => s.k === v) ? v : "pulse") as AdminScreen;

/** Which sc_admin_* reads a screen needs, so a tab asks for no more. */
export const PARTS: Record<AdminScreen, string[]> = {
  pulse: ["companies", "pipelines", "platform"],
  companies: ["companies"],
  company: ["companies", "people", "pipelines", "failures", "dusty", "usage", "log"],
  pipelines: ["companies", "pipelines", "failures"],
  dusty: ["companies", "dusty"],
  usage: ["companies", "usage"],
  feedback: ["companies"],
  releases: ["platform"],
  costs: ["companies", "platform"],
  log: ["companies", "log"],
};
export const PART_NAMES = ["companies", "people", "pipelines", "failures", "dusty", "usage", "platform", "log"] as const;
export function readParts(v: string | null): string[] {
  const want = (v ?? "").split(",").map((s) => s.trim());
  return PART_NAMES.filter((p) => want.includes(p));
}

/** A slug as typed, cleaned the way the database will check it. */
export const cleanSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
export const PLANS = [
  { k: "solo", label: "Solo" }, { k: "growth", label: "Growth" }, { k: "pro", label: "Pro" }, { k: "enterprise", label: "Enterprise" },
] as const;
export const planLabel = (p: string | null | undefined) => PLANS.find((x) => x.k === p)?.label ?? (p ?? "—");

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "5 d ago", "Mar 3". */
export function ago(iso: string | null | undefined, now: Date): string {
  if (!iso) return "never";
  const m = (now.getTime() - Date.parse(iso)) / 60000;
  if (!Number.isFinite(m)) return "never";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`;
  if (m < 48 * 60) return "yesterday";
  if (m < 30 * 24 * 60) return `${Math.floor(m / 1440)} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

/** "Mar 3" in Central time. */
export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : "—";

/** Whole days between two instants, or null. */
export function dayGap(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 864e5));
}

/** "−42%" drop from one funnel step to the next; null for the first or an empty step. */
export function dropPct(prev: number, cur: number): number | null {
  if (!prev) return null;
  return Math.round((1 - cur / prev) * 100);
}

/** The error the API returns before migration 091 is applied. */
export function missing091(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "PGRST202" || e.code === "42883" ||
    (/sc_admin_/.test(e.message ?? "") && /not find|does not exist/i.test(e.message ?? ""));
}

/** A reason is required for every write; trimmed, 3–1000 characters. */
export function readReason(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 1000) : "";
  return s.length >= 3 ? s : null;
}
