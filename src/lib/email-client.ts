/**
 * Email in Threads — the pure part (Claude Design "Email Client v2", Coy
 * 2026-10-10: "send and manage emails inside of threads"; migration 100).
 *
 * Messages are rows of `emails` (in: mirrored from the AgentMail inbox; out:
 * sent from ScopeCrete). A conversation is every row sharing `conversation`.
 * This module groups them, decides which folder a conversation is in, and
 * shapes replies, forwards and templates. Tested in tests/email-client.test.mjs.
 */

export type MailTab = "inbox" | "reply" | "sent" | "drafts" | "unfiled";
export const MAIL_TABS: Array<{ k: MailTab; label: string }> = [
  { k: "inbox", label: "Inbox" }, { k: "reply", label: "Needs reply" }, { k: "sent", label: "Sent" }, { k: "drafts", label: "Drafts" }, { k: "unfiled", label: "Unfiled" },
];

export interface MailRow {
  id: string;
  conversation: string | null;
  direction: "in" | "out" | null;
  subject: string | null;
  text_body?: string | null;
  created_at: string;
  sent_at: string | null;
  from_address: string | null;
  from_name: string | null;
  original_from_address: string | null;
  original_from_name: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  customer_id: string | null;
  contact_id: string | null;
  job_id: string | null;
  status: string | null;
  files?: number;
  file_ids?: string[] | null;
}

export interface ConvState {
  conversation: string;
  triage: "reply" | "fyi" | null;
  archived_at: string | null;
  last_read_at: string | null;
}

export interface Who { name: string | null; address: string | null }

export interface Conversation {
  key: string;
  subject: string;
  count: number;
  last_at: string;
  files: number;
  writer: Who;
  /** Everyone on it but our own inbox — for Reply all, and the "+ N cc" line. */
  people: string[];
  last_direction: "in" | "out";
  needs_reply: boolean;
  unread: boolean;
  archived: boolean;
  filed: boolean;
  quarantined: boolean;
  has_in: boolean;
  has_out: boolean;
  customer_id: string | null;
  contact_id: string | null;
  job_id: string | null;
  snippet: string;
  latest_id: string;
}

const at = (r: MailRow) => r.sent_at ?? r.created_at;
const lower = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : null);

/** Who wrote it: the original sender of a forward, else whoever sent it. */
export function writerOf(r: MailRow): Who {
  if (r.direction === "out") return { name: r.from_name, address: lower(r.from_address) };
  return { name: r.original_from_name || r.from_name, address: lower(r.original_from_address || r.from_address) };
}

/** Re: / Fwd: / Fw: prefixes off the front, however many. */
export function cleanSubject(s: string | null | undefined): string {
  let t = (s ?? "").trim();
  for (;;) { const n = t.replace(/^(re|fwd?|aw|wg)\s*:\s*/i, ""); if (n === t) break; t = n; }
  return t;
}
export const replySubject = (s: string | null | undefined) => `Re: ${cleanSubject(s) || "(no subject)"}`;
export const forwardSubject = (s: string | null | undefined) => `Fwd: ${cleanSubject(s) || "(no subject)"}`;

/**
 * The first words someone actually wrote: quoted lines (">"), "On … wrote:"
 * and the forwarded header are skipped; whitespace folded; up to `max`.
 */
export function snippetOf(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith(">")) continue;
    if (/^on .{3,200} wrote:$/i.test(l) || /^-{2,}\s*(forwarded|original) message/i.test(l)) break;
    out.push(l);
    if (out.join(" ").length > max) break;
  }
  const s = out.join(" ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * Rows → conversations, newest first. `ours` = our inbox and the org's
 * forwarders, never counted as "people on it".
 */
export function groupConversations(rows: MailRow[], states: ConvState[] = [], ours: string[] = []): Conversation[] {
  const mine = new Set(ours.map((x) => x.toLowerCase()));
  const st = new Map(states.map((s) => [s.conversation, s]));
  const by = new Map<string, MailRow[]>();
  for (const r of rows) {
    const k = r.conversation || r.id;
    const list = by.get(k);
    if (list) list.push(r); else by.set(k, [r]);
  }
  const out: Conversation[] = [];
  for (const [key, list] of by) {
    list.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
    const latest = list[list.length - 1];
    const ins = list.filter((r) => r.direction !== "out");
    const lastIn = ins[ins.length - 1] ?? null;
    const s = st.get(key);
    const lastInAt = lastIn ? at(lastIn) : null;
    const archived = !!s?.archived_at && (!lastInAt || s.archived_at >= lastInAt);
    const filed = list.some((r) => r.status === "filed");
    const quarantined = !filed && list.some((r) => r.status === "quarantined");
    const lastDir = latest.direction === "out" ? "out" : "in";
    const people = new Set<string>();
    for (const r of list) {
      for (const a of [writerOf(r).address, ...(r.to_addresses ?? []), ...(r.cc_addresses ?? [])]) {
        const x = lower(a);
        if (x && !mine.has(x)) people.add(x);
      }
    }
    const filedRow = [...list].reverse().find((r) => r.status === "filed");
    const subjectRow = [...list].reverse().find((r) => cleanSubject(r.subject)) ?? latest;
    out.push({
      key, count: list.length, last_at: at(latest), latest_id: latest.id,
      subject: subjectRow.subject?.trim() || "(no subject)",
      files: list.reduce((n, r) => n + (r.files ?? 0) + (r.file_ids?.length ?? 0), 0),
      writer: lastIn ? writerOf(lastIn) : { name: null, address: (latest.to_addresses ?? [])[0] ?? null },
      people: [...people],
      last_direction: lastDir,
      needs_reply: lastDir === "in" && !archived && !quarantined && s?.triage !== "fyi",
      unread: !!lastInAt && lastDir === "in" && (!s?.last_read_at || s.last_read_at < lastInAt),
      archived, filed, quarantined,
      has_in: ins.length > 0, has_out: ins.length < list.length,
      customer_id: filedRow?.customer_id ?? null, contact_id: filedRow?.contact_id ?? null, job_id: filedRow?.job_id ?? null,
      snippet: `${lastDir === "out" ? "You: " : ""}${snippetOf(latest.text_body)}`,
    });
  }
  return out.sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}

export function inTab(c: Conversation, tab: MailTab): boolean {
  switch (tab) {
    case "inbox": return c.has_in && !c.archived;
    case "reply": return c.needs_reply;
    case "sent": return c.has_out;
    case "unfiled": return !c.filed && !c.archived;
    case "drafts": return false;
  }
}

/** Words that must all be in the subject, the writer, the snippet or the names given. */
export function matchesMail(c: Conversation, q: string, names: string[] = []): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [c.subject, c.writer.name, c.writer.address, c.snippet, ...c.people, ...names].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function tabCounts(convs: Conversation[], drafts = 0): Record<MailTab, number> {
  return {
    inbox: convs.filter((c) => inTab(c, "inbox")).length,
    reply: convs.filter((c) => inTab(c, "reply")).length,
    sent: convs.filter((c) => inTab(c, "sent")).length,
    unfiled: convs.filter((c) => inTab(c, "unfiled")).length,
    drafts,
  };
}

export type ComposeMode = "new" | "reply" | "reply_all" | "forward";

/**
 * Who a reply goes to. Reply: the writer of the last message that came in
 * (the original sender of a forward, never our own forwarder). Reply all: also
 * everyone else on that message, less our own addresses. Forward: nobody yet.
 */
export function replyTargets(messages: MailRow[], mode: ComposeMode, ours: string[] = []): { to: string[]; cc: string[] } {
  if (mode === "new" || mode === "forward") return { to: [], cc: [] };
  const mine = new Set(ours.map((x) => x.toLowerCase()));
  const ins = messages.filter((r) => r.direction !== "out");
  const last = ins[ins.length - 1] ?? messages[messages.length - 1];
  if (!last) return { to: [], cc: [] };
  const w = last.direction === "out" ? (last.to_addresses ?? [])[0] ?? null : writerOf(last).address;
  const to = w && !mine.has(w) ? [w] : [];
  if (mode === "reply") return { to, cc: [] };
  const cc = [...new Set([...(last.to_addresses ?? []), ...(last.cc_addresses ?? [])].map((x) => x.toLowerCase()))]
    .filter((x) => !mine.has(x) && !to.includes(x));
  return { to, cc };
}

/** A forward carries what was said underneath. */
export function forwardBody(m: MailRow): string {
  const w = writerOf(m);
  const when = new Date(at(m)).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  return [
    "", "", "---------- Forwarded message ----------",
    `From: ${w.name ? `${w.name} <${w.address ?? ""}>` : w.address ?? ""}`,
    `Date: ${when}`,
    `Subject: ${m.subject ?? ""}`,
    (m.to_addresses ?? []).length ? `To: ${(m.to_addresses ?? []).join(", ")}` : null,
    "", (m.text_body ?? "").trim(),
  ].filter((l) => l !== null).join("\n");
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;
/** "a@b.co, Name <c@d.co>; e@f.co" → the addresses, lower case, no repeats. Anything else is returned as `bad`. */
export function parseAddresses(input: string): { ok: string[]; bad: string[] } {
  const ok: string[] = [], bad: string[] = [];
  for (const part of input.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const a = (/<([^>]+)>/.exec(p)?.[1] ?? p).trim().toLowerCase();
    if (EMAIL_RE.test(a)) { if (!ok.includes(a)) ok.push(a); } else bad.push(p);
  }
  return { ok, bad };
}
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

/** The first word of a name, for "Hi {first}". */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export interface MailTemplate { k: string; label: string; sub: string; subject: string; body: string }
/** Coy's three or four weekly emails (the design's Templates ▾). {first} {job} {date} are filled in. */
export const TEMPLATES: MailTemplate[] = [
  { k: "bid-follow-up", label: "Bid follow-up", sub: "Checking in on a price you sent", subject: "Following up — {job}",
    body: "Hi {first},\n\nFollowing up on our price for {job}. Happy to walk through any of it or adjust the scope if that helps.\n\nLet me know where things stand." },
  { k: "request-bid-set", label: "Request bid set", sub: "Ask for the plans and specs", subject: "Bid set for {job}",
    body: "Hi {first},\n\nCould you send the full bid set for {job} — plans, specs and any addenda? We'd like to get you a concrete number.\n\nThanks." },
  { k: "schedule-pour", label: "Schedule a pour", sub: "Propose a pour date", subject: "Pour date — {job}",
    body: "Hi {first},\n\nWe're looking at {date} to pour {job}, weather permitting. Does that work on your end? We'll confirm the day before.\n\nThanks." },
  { k: "invoice-sent", label: "Invoice sent", sub: "Let them know an invoice is out", subject: "Invoice — {job}",
    body: "Hi {first},\n\nOur invoice for {job} is attached. Let me know if you need anything else to process it.\n\nThanks for the work." },
];
export function fillTemplate(t: string, v: { first?: string | null; job?: string | null; date?: string | null }): string {
  return t.replace(/\{first\}/g, v.first?.trim() || "there").replace(/\{job\}/g, v.job?.trim() || "the job").replace(/\{date\}/g, v.date?.trim() || "[date]");
}

/**
 * Email templates are editable (Coy, 2026-10-24: "Where do I find my email Templates to edit? And how
 * do I create a template from an email I've drafted while in the editor?"). Kept on the account as
 * `user_preferences.prefs.email_templates` and shared from the org's layout like the shelves, so a
 * teammate starts with the owner's; never saved means the four above.
 */
export const MAX_EMAIL_TEMPLATES = 25;
const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
export function cleanEmailTemplates(v: unknown): MailTemplate[] | null {
  if (!Array.isArray(v)) return null;
  const out: MailTemplate[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const label = cut(o.label, 60).trim();
    const body = cut(o.body, 2000);
    if (!label || !body.trim()) continue;
    let k = cut(o.k, 40).trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "t";
    while (seen.has(k)) k = `${k}-2`.slice(-40);
    seen.add(k);
    out.push({ k, label, sub: cut(o.sub, 100).trim(), subject: cut(o.subject, 200), body });
    if (out.length >= MAX_EMAIL_TEMPLATES) break;
  }
  return out;
}
/** The account's templates, or the four starters when none were ever saved. */
export const emailTemplatesOf = (v: unknown): MailTemplate[] => cleanEmailTemplates(v) ?? TEMPLATES;

/**
 * A template from an email being written: the recipient's first name becomes {first} and the job's
 * title {job}, wherever they appear as whole words, so it fills in for the next person and job.
 */
export function templateFromDraft(v: { label: string; subject: string; body: string; first?: string | null; job?: string | null }): MailTemplate {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const swap = (t: string) => {
    let r = t;
    const job = v.job?.trim();
    if (job && job.length > 2) r = r.replace(new RegExp(esc(job), "gi"), "{job}");
    const first = v.first?.trim();
    if (first && first.length > 1) r = r.replace(new RegExp(`\\b${esc(first)}\\b`, "g"), "{first}");
    return r;
  };
  const label = v.label.trim().slice(0, 60) || "My template";
  return { k: `own-${Date.now().toString(36)}`, label, sub: "", subject: swap(v.subject).slice(0, 200), body: swap(v.body.trim()).slice(0, 2000) };
}

/** The sign-off under every message: name · org · phone, whichever are known. */
export function signatureOf(v: { name?: string | null; org?: string | null; phone?: string | null }): string {
  const parts = [v.name, v.org, v.phone].map((x) => x?.trim()).filter(Boolean);
  return parts.length ? `— \n${parts.join(" · ")}` : "";
}

/**
 * A new vendor from an email (Coy, 2026-10-12: "I forwarded an email from a supplier … the only
 * options that it gives me is to create a customer"). The form starts from what the email shows:
 * the writer of the newest message that came in, unless that is one of our own addresses (Coy
 * forwarding or writing it himself) — then the subject is the name ("New vendor: Ace Hardware" →
 * "Ace Hardware") and the first outside email address in the text is theirs. A phone only as
 * written, ten digits. Coy checks it before anything is made.
 */
export function vendorFromEmail(rows: MailRow[], ours: string[]): { name: string; email: string; phone: string } {
  const mine = new Set(ours.map((a) => a.toLowerCase()));
  const last = [...rows].reverse().find((r) => r.direction !== "out") ?? rows[rows.length - 1];
  if (!last) return { name: "", email: "", phone: "" };
  const w = writerOf(last);
  const text = rows.map((r) => r.text_body ?? "").join("\n");
  const outside = (a: string | null | undefined) => !!a && !mine.has(a.toLowerCase()) && !/@agentmail\.to$/i.test(a);
  let name = "", email = "";
  if (outside(w.address)) {
    email = w.address ?? "";
    // A forward's own name only — never the forwarder's (writerOf falls back to it).
    const own = last.original_from_address ? last.original_from_name : last.from_name;
    name = (own ?? "").replace(/["']/g, "").trim();
  } else {
    email = (text.match(/[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/gi) ?? []).map((a) => a.toLowerCase()).find(outside) ?? "";
  }
  if (!name) name = cleanSubject(last.subject).replace(/^\s*(new\s+)?(vendor|supplier)\s*[:\-–]?\s*/i, "").trim();
  if (!name && email) name = email.split("@")[1].split(".")[0].replace(/^./, (c) => c.toUpperCase());
  const ph = text.match(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/);
  return { name: name.slice(0, 120), email, phone: ph ? `(${ph[1]}) ${ph[2]}-${ph[3]}` : "" };
}
