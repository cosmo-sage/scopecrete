/**
 * Weeks of the month for a bid request's availability (Coy, 2026-10-24: "narrowed down to the
 * month and week of the month. A calendar with the weeks in the month listed and the next 3
 * months showing"; migration 130).
 *
 * A week is a key "YYYY-MM-wN": week N of that month by its days — 1–7, 8–14, 15–21, 22–28 and
 * 29 to the month's end (no week 5 in a 28-day February). Simple to say on a phone ("the second
 * week of November") and the same on both sides, whatever weekday the month starts on.
 */

export const WEEK_KEY = /^(\d{4})-(0[1-9]|1[0-2])-w([1-5])$/;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

export interface Week { key: string; n: number; from: number; to: number; past: boolean }
export interface CalMonth { key: string; label: string; weeks: Week[] }

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1–12
const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date in Central time as "YYYY-MM-DD". */
export function centralToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The weeks of one month (m 1–12); a week is past once its last day is before today. */
export function monthWeeks(y: number, m: number, today = "0000-00-00"): Week[] {
  const last = daysIn(y, m);
  const out: Week[] = [];
  for (let n = 1; n <= 5; n++) {
    const from = (n - 1) * 7 + 1;
    if (from > last) break;
    const to = n === 5 ? last : Math.min(from + 6, last);
    out.push({ key: `${y}-${pad(m)}-w${n}`, n, from, to, past: `${y}-${pad(m)}-${pad(to)}` < today });
  }
  return out;
}

/** This month and the next `ahead` months (three by default — "the next 3 months showing"). */
export function calendarMonths(today: string, ahead = 3): CalMonth[] {
  const [y0, m0] = today.split("-").map(Number);
  const out: CalMonth[] = [];
  for (let i = 0; i <= ahead; i++) {
    const t = (m0 - 1) + i, y = y0 + Math.floor(t / 12), m = (t % 12) + 1;
    out.push({ key: `${y}-${pad(m)}`, label: `${MONTHS[m - 1]} ${y}`, weeks: monthWeeks(y, m, today) });
  }
  return out;
}

/** Valid, unique keys in order, 20 at most. */
export function cleanWeeks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const x of v) if (typeof x === "string" && WEEK_KEY.test(x)) seen.add(x);
  return [...seen].sort().slice(0, 20);
}

export function toggleWeek(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : cleanWeeks([...keys, key]);
}

/** "Nov 8–14" for one key. */
export function weekLabel(key: string): string {
  const m = WEEK_KEY.exec(key);
  if (!m) return key;
  const y = Number(m[1]), mo = Number(m[2]), n = Number(m[3]);
  const w = monthWeeks(y, mo).find((x) => x.n === n);
  return w ? `${SHORT[mo - 1]} ${w.from}–${w.to}` : key;
}

/** Keys in words, month by month: "Nov wk 2–3 · Dec wk 1". Empty → "". */
export function weeksSummary(keys: string[]): string {
  const by = new Map<string, number[]>();
  for (const k of cleanWeeks(keys)) {
    const m = WEEK_KEY.exec(k)!;
    const mk = `${m[1]}-${m[2]}`;
    by.set(mk, [...(by.get(mk) ?? []), Number(m[3])]);
  }
  const thisYear = Number(centralToday().slice(0, 4));
  return [...by.entries()].map(([mk, ns]) => {
    const [y, mo] = mk.split("-").map(Number);
    const runs: string[] = [];
    for (let i = 0; i < ns.length; i++) {
      let j = i;
      while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
      runs.push(i === j ? `${ns[i]}` : `${ns[i]}–${ns[j]}`);
      i = j;
    }
    return `${SHORT[mo - 1]}${y !== thisYear ? ` ${y}` : ""} wk ${runs.join(", ")}`;
  }).join(" · ");
}

/** The weeks both sides picked. */
export function sharedWeeks(want: string[], have: string[]): string[] {
  const w = new Set(cleanWeeks(want));
  return cleanWeeks(have).filter((k) => w.has(k));
}

/** A table or function from migration 130 that isn't there yet. */
export const missing130 = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (/bid_messages|sc_bid_chat|sc_bid_message|sc_bid_availability|availability/.test(e.message ?? "") || e.code === "42P01" || e.code === "PGRST202");
export const CHAT_MISSING = "The chat and availability switch on with migration 130 — waiting on Coy's word.";
