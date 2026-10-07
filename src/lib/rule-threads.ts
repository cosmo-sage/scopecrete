/**
 * Threads made from rules (migration 089; Coy, 2026-10-07: "I want ultimate
 * flexibility for the threads channels I create … a thread for all the emails
 * coming into intake-concrete@agentmail.to … a thread for todays calls from quo
 * phone number … all my VOIP numbers … bid requests sent out to vendors").
 *
 * A rule thread holds no people: it is a saved filter over calls, texts and
 * emails, worked out each time it is opened. Pure helpers, shared by the API
 * (/api/threads/rule) and the sheet that makes one. Tested in
 * tests/rule-threads.test.mjs.
 */

export type RuleChannel = "call" | "text" | "email";
export type RuleWindow = "today" | "7d" | "30d" | "all";
export type RuleWho = "customer" | "vendor" | "personal" | "unsorted";
export type RuleDirection = "in" | "out" | "any";

export interface ThreadRule {
  channels: RuleChannel[];
  /** org_phone_numbers ids; empty = every line. */
  lines: string[];
  /** Mirrored inbox addresses; empty = every inbox. */
  inboxes: string[];
  window: RuleWindow;
  /** Buckets; empty = anyone but spam. */
  who: RuleWho[];
  direction: RuleDirection;
  /** Words that must all appear (subject, text or call summary); "" = any. */
  words: string;
}

export const RULE_CHANNELS: RuleChannel[] = ["call", "text", "email"];
export const RULE_WINDOWS: Array<{ k: RuleWindow; label: string }> = [
  { k: "today", label: "Today" }, { k: "7d", label: "Last 7 days" }, { k: "30d", label: "Last 30 days" }, { k: "all", label: "Any time" },
];
export const RULE_WHO: RuleWho[] = ["customer", "vendor", "personal", "unsorted"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

/** Only what a rule may hold; anything else is dropped. A rule with no channel is no rule. */
export function sanitizeRule(raw: unknown): ThreadRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const channels = RULE_CHANNELS.filter((c) => list(r.channels).includes(c));
  if (!channels.length) return null;
  const lines = [...new Set(list(r.lines).filter((x) => UUID.test(x)))].slice(0, 20);
  const inboxes = [...new Set(list(r.inboxes).map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 10);
  const window: RuleWindow = (["today", "7d", "30d", "all"] as const).find((w) => w === r.window) ?? "all";
  const who = RULE_WHO.filter((w) => list(r.who).includes(w));
  const direction: RuleDirection = r.direction === "in" || r.direction === "out" ? r.direction : "any";
  const words = cleanWords(typeof r.words === "string" ? r.words : "");
  return { channels, lines, inboxes, window, who, direction, words };
}

/** Letters, digits, spaces, apostrophes and dashes only — safe inside a PostgREST ilike filter. */
export function cleanWords(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Midnight today on the business's clock (Central), as an instant. */
export function centralMidnight(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now).reduce<Record<string, string>>((m, p) => { m[p.type] = p.value; return m; }, {});
  const sinceMidnight = ((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

/** Where the window starts, or null for any time. */
export function windowStart(w: RuleWindow, now: Date): string | null {
  if (w === "today") return centralMidnight(now).toISOString();
  if (w === "7d") return new Date(now.getTime() - 7 * 864e5).toISOString();
  if (w === "30d") return new Date(now.getTime() - 30 * 864e5).toISOString();
  return null;
}

/** Every word of the rule appears in the text (case ignored). */
export function hasWords(words: string, ...texts: Array<string | null | undefined>): boolean {
  const ws = words.toLowerCase().split(" ").filter(Boolean);
  if (!ws.length) return true;
  const hay = texts.filter(Boolean).join(" \n ").toLowerCase();
  return ws.every((w) => hay.includes(w));
}

/** A person's bucket as Threads files them: only a bucket Coy or Dusty filed counts. */
export function bucketOf(c: { contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null } | null | undefined): RuleWho | "spam" | null {
  if (!c) return null;
  const filed = c.classification_confirmed_at || c.auto_classified_at;
  const t = filed ? c.contact_type : null;
  if (t === "customer" || t === "vendor" || t === "personal" || t === "spam") return t;
  return "unsorted";
}

/** Spam is always left out; otherwise an empty "who" lets everyone in. */
export function whoMatches(rule: ThreadRule, bucket: RuleWho | "spam" | null): boolean {
  if (bucket === "spam") return false;
  if (!rule.who.length) return true;
  return !!bucket && (rule.who as string[]).includes(bucket);
}

const CH_WORD: Record<RuleChannel, [string, string]> = { call: ["Call", "Calls"], text: ["Text", "Texts"], email: ["Email", "Emails"] };
const WHO_WORD: Record<RuleWho, string> = { customer: "customers", vendor: "vendors", personal: "personal", unsorted: "unsorted" };

/** "Calls · Main · today", "Texts out to vendors · “bid”", "Emails to intake-concrete@agentmail.to". */
export function describeRule(rule: ThreadRule, lineName: (id: string) => string | null = () => null): string {
  const ch = rule.channels.length === 3 ? "Calls, texts and emails" : rule.channels.map((c, i) => (i === 0 ? CH_WORD[c][1] : CH_WORD[c][1].toLowerCase())).join(" and ");
  const dir = rule.direction === "in" ? " in" : rule.direction === "out" ? " out" : "";
  const who = rule.who.length ? ` ${rule.direction === "out" ? "to" : "from"} ${rule.who.map((w) => WHO_WORD[w]).join(" or ")}` : "";
  const bits = [`${ch}${dir}${who}`];
  if (rule.lines.length && rule.channels.some((c) => c !== "email")) bits.push(rule.lines.map((l) => lineName(l) ?? "a line").join(", "));
  if (rule.inboxes.length && rule.channels.includes("email")) bits.push(rule.inboxes.join(", "));
  if (rule.window !== "all") bits.push(RULE_WINDOWS.find((w) => w.k === rule.window)?.label.toLowerCase() ?? "");
  if (rule.words) bits.push(`“${rule.words}”`);
  return bits.filter(Boolean).join(" · ");
}
