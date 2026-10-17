/**
 * The Spaces navigation (Claude Design "Dusty Home", 2026-10-16; Coy, 2026-10-17:
 * "map the new design to the live feedback site"). Pure — tests/spaces.test.mjs runs
 * it under node --test.
 *
 * Step 1, no migration: a Space is worked out from what is already stored.
 *   - Home: Dusty, the app's pages, every thread by bucket.
 *   - A job Space: every open job (not complete, closed, lost or archived), with the
 *     Scope Builder tree as its pages and its people's numbers, emails and notes as
 *     its Phone · Email · Internal threads (one thread per number — Coy, 2026-10-16).
 *   - A collection: a thread Coy made (migration 073), opened in Threads.
 * Customer and vendor Spaces, pinning, arranging pages and deliverables come later.
 */

import { WON_STATUSES, stageOf } from "../jobs/stages.ts";

/** Statuses whose job is not on the rail. */
const CLOSED = new Set(["complete", "closed", "lost"]);
export function isOpenJob(status: string | null | undefined): boolean {
  return !CLOSED.has(status ?? "");
}

/** The stage's colour on a rail tile, as a theme variable (the Jobs board's palette). */
const STAGE_VAR: Record<string, string> = {
  new: "--sc-hiviz", consult: "--sc-violet", estimating: "--sc-chalk", follow: "--sc-hiviz-text",
  won: "--sc-green", wip: "--sc-teal", complete: "--sc-ink3", lost: "--sc-red",
};
export function stageColor(status: string | null | undefined): string {
  return `var(${STAGE_VAR[stageOf(status).k] ?? "--sc-ink3"})`;
}
export function stageLabel(status: string | null | undefined): string {
  return stageOf(status).label;
}

/** Two letters for a tile: the first letters of the first two words that start with a letter. */
export function monogram(name: string | null | undefined): string {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (!words.length) return "#";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export type SpaceRef = { kind: "home" } | { kind: "job"; id: string };

/** Which Space a page belongs to: a job's own pages are its Space, everything else Home. */
export function spaceOf(path: string | null | undefined): SpaceRef {
  const m = /^\/dashboard\/scope\/([0-9a-f-]{36})(?:\/|$)/i.exec(path ?? "");
  return m ? { kind: "job", id: m[1] } : { kind: "home" };
}

export interface TreeRow { k: string; label: string; href: string; sub?: boolean }

/**
 * A job's pages — the Scope Builder tree. Budget's own tabs are rows under it;
 * Actual costs is Scope tracker, its own page, shown once the job is won (the
 * design's assumption; Coy can say otherwise).
 */
export function jobTree(id: string, status: string | null | undefined): TreeRow[] {
  const base = `/dashboard/scope/${id}`;
  const rows: TreeRow[] = [
    { k: "summary", label: "Summary", href: `${base}/summary` },
    { k: "plans", label: "Takeoffs", href: `${base}/plans` },
    { k: "budget", label: "Budget", href: base },
    { k: "market", label: "Market rate", href: `${base}?tab=market`, sub: true },
    { k: "proposed", label: "Proposed budget", href: base, sub: true },
  ];
  if (WON_STATUSES.includes(status ?? "")) rows.push({ k: "tracker", label: "Scope tracker", href: `${base}?tab=actuals` });
  rows.push({ k: "proposal", label: "Proposal", href: `${base}/proposal` }, { k: "files", label: "Files", href: `${base}/files` });
  return rows;
}

/** The tree row a job page is on (Budget's rows by its ?tab=). */
export function activeTreeRow(path: string, search: string): string {
  const m = /^\/dashboard\/scope\/[0-9a-f-]{36}(\/[a-z]+)?/i.exec(path);
  if (!m) return "";
  const tail = m[1] ?? "";
  if (tail === "/summary") return "summary";
  if (tail === "/plans") return "plans";
  if (tail === "/proposal") return "proposal";
  if (tail === "/files") return "files";
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "market") return "market";
  if (tab === "actuals") return "tracker";
  return "proposed";
}

export interface SpacePhone { phone: string; label: string | null }
export interface SpacePerson { id: string; name: string | null; phones: SpacePhone[]; email: string | null }

/** "(225) 555-0118" from +12255550118; anything else as it is. */
export function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw;
}

export interface ThreadRow { key: string; title: string; sub: string; href: string; avatar: string }

/** A job Space's Phone threads: one row per number of each person on it. */
export function phoneThreads(people: SpacePerson[]): ThreadRow[] {
  const out: ThreadRow[] = [];
  for (const p of people) {
    p.phones.forEach((ph, i) => {
      const label = ph.label?.trim() || (i === 0 ? "Cell" : `Phone ${i + 1}`);
      const who = p.name?.trim() || fmtPhone(ph.phone);
      out.push({ key: `${p.id}:${ph.phone}`, title: p.name?.trim() ? `${who} · ${label}` : who, sub: fmtPhone(ph.phone),
        href: `/dashboard/messages/${p.id}?channel=${encodeURIComponent(`phone:${ph.phone}`)}`, avatar: monogram(p.name ?? "") });
    });
  }
  return out;
}

/** Internal: one note stream per person on the job (their Internal notes). */
export function internalThreads(people: SpacePerson[]): ThreadRow[] {
  return people.map((p) => ({ key: `${p.id}:notes`, title: p.name?.trim() || (p.phones[0] ? fmtPhone(p.phones[0].phone) : "No name"),
    sub: "Internal notes", href: `/dashboard/messages/${p.id}?channel=notes`, avatar: monogram(p.name ?? "") }));
}
