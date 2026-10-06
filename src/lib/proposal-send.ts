/**
 * Sending a proposal from Threads, from the Preview and from Dusty (Coy,
 * 2026-10-05: "a clean way to actually send proposals via text and email
 * manually and for dusty to send them. And I want him to watch how i do it and
 * learn and improve"). Pure — tested in tests/proposal-send.test.mjs.
 *
 * How the learning works: every proposal Coy sends — by hand or on Dusty's
 * plan — is kept (user_preferences `proposal_sends`, his own, newest first) as
 * the words he sent with the name, the job and the link turned into
 * placeholders, and, when Dusty drafted it, Dusty's draft beside it. The next
 * send starts from Coy's last words for that channel, and Dusty is shown the
 * recent ones (and where Coy changed his draft) so he writes the way Coy does.
 * Nothing is sent by any of this; every send is Coy's tap.
 */

/** A proposal link in a message: /p/<32-character token>. */
export const LINK_RE = /\/p\/([A-Za-z0-9_-]{32})(?![A-Za-z0-9_-])/;

export function findProposalToken(text: string | null | undefined): string | null {
  const m = LINK_RE.exec(text ?? "");
  return m ? m[1] : null;
}

/** The ways Dusty (and people) write "the link goes here". */
const SLOT = /\{\s*link\s*\}|\[\s*(?:proposal\s+)?link\s*\]|<\s*link\s*>/gi;

/** The words with the link in its slot — or, with no slot, on its own line at the end. */
export function fillLink(body: string, url: string): string {
  const b = body.replace(/\r\n/g, "\n").trim();
  if (SLOT.test(b)) { SLOT.lastIndex = 0; return b.replace(SLOT, url); }
  if (b.includes(url)) return b;
  return b ? `${b}\n${url}` : url;
}

export const firstName = (name: string | null | undefined) => {
  const f = (name ?? "").trim().split(/\s+/)[0] || "";
  return /^[\d(+]/.test(f) ? "" : f;
};

export interface Fill { first: string; title: string | null; url: string; /** Other names the words may carry (the customer's, the person's) — each becomes {first} too. */ names?: Array<string | null | undefined> }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Coy's sent words as a reusable pattern: the link, the first name and the job turned into {link}, {first}, {title}. */
export function toTemplate(sent: string, f: Fill): string {
  let t = sent.replace(/\r\n/g, "\n").trim();
  if (f.url) t = t.split(f.url).join("{link}");
  t = t.replace(/https?:\/\/\S*\/p\/[A-Za-z0-9_-]{32}/g, "{link}");
  if (f.title && f.title.trim().length > 2) t = t.replace(new RegExp(esc(f.title.trim()), "gi"), "{title}");
  const names = new Set<string>();
  for (const n of [f.first, ...(f.names ?? [])]) {
    const full = (n ?? "").trim();
    if (full.length > 1 && !/^[\d(+]/.test(full)) { names.add(full); names.add(firstName(full)); }
  }
  // Longest first, so "Johnette Wilson" goes before "Johnette".
  for (const n of [...names].filter((x) => x.length > 1).sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`\\b${esc(n)}\\b`, "g"), "{first}");
  return greetingSlot(t);
}

const NOT_NAMES = new Set(["All", "Team", "Everyone", "There", "Folks", "Again", "Sir", "Ma'am"]);

/**
 * Whoever the words open by greeting is the name slot, whatever it was: "Hi
 * Gulfline," → "Hi {first},", "Hey Ms Johnette." → "Hey Ms {first}." — so a
 * pattern never carries one customer's name to the next (Coy, 2026-10-06: the
 * Preview greeted by the customer's name and the send kept the person's, so
 * "Hi Gulfline" was saved as his words and offered to Johnette Wilson).
 */
export function greetingSlot(text: string): string {
  return text.replace(
    /^(\s*(?:[Hh]i|[Hh]ey|[Hh]ello|[Dd]ear|[Gg]ood (?:morning|afternoon|evening))[ \t]+(?:(?:Mr|Mrs|Ms|Miss|Mister)\.?[ \t]+)?)([A-Z][A-Za-z'’-]*(?:[ \t]+[A-Z][A-Za-z'’-]*)?)(?=[ \t]*(?:[,.!:;—–-]|\n|$))/,
    (m, lead: string, name: string) => (NOT_NAMES.has(name.split(/\s+/)[0]) ? m : `${lead}{first}`),
  );
}

/** A pattern filled in for this customer. With no name, "Hi {first}," reads "Hi,". */
export function fromTemplate(tpl: string, f: Fill): string {
  let t = tpl;
  t = t.replace(/\{first\}/g, f.first).replace(/[ \t]+([,.!?])/g, "$1");
  t = t.replace(/\{title\}/g, f.title?.trim() || "your project");
  return fillLink(t, f.url);
}

export type Via = "text" | "email";

export interface SendExample {
  via: Via;
  /** Coy's words as a pattern (toTemplate). */
  template: string;
  subject?: string | null;
  /** Dusty's draft, when the send came from his plan — as a pattern too. */
  dusty?: string | null;
  /** Coy changed Dusty's draft before sending. */
  edited?: boolean;
  job?: string | null;
  at: string;
}

export const MAX_EXAMPLES = 12;

/** Newest first, the same words once, at most MAX_EXAMPLES. */
export function addExample(list: unknown, ex: SendExample): SendExample[] {
  const cur = Array.isArray(list) ? (list as SendExample[]).filter((x) => x && typeof x.template === "string" && (x.via === "text" || x.via === "email")) : [];
  if (!ex.template.trim()) return cur.slice(0, MAX_EXAMPLES);
  return [ex, ...cur.filter((x) => !(x.via === ex.via && x.template === ex.template))].slice(0, MAX_EXAMPLES);
}

/** The words a send starts from: Coy's last ones for this channel, else the plain default. */
export function startingWords(examples: SendExample[] | null | undefined, via: Via, f: Fill & { org: string | null }): { body: string; subject: string; learned: boolean } {
  const last = (examples ?? []).find((x) => x.via === via) ?? (via === "email" ? (examples ?? []).find((x) => x.via === "text") : undefined);
  const subject = (examples ?? []).find((x) => x.via === "email" && x.subject)?.subject;
  const subj = subject ? fromTemplate(subject, { ...f, url: "" }).replace(/\n?$/, "").trim() : `${f.title ? `${f.title} — ` : ""}proposal${f.org ? ` from ${f.org}` : ""}`;
  if (last) return { body: fromTemplate(greetingSlot(last.template), f), subject: subj, learned: true };
  const hi = f.first ? `Hi ${f.first}, ` : "Hi, ";
  const what = f.title ? `the proposal for ${f.title}` : "your proposal";
  return { body: `${hi}here is ${what}: ${f.url}\nTake a look and let me know if you have any questions.`, subject: subj, learned: false };
}

/** What Dusty is shown about how Coy sends proposals. */
export function exampleLines(examples: SendExample[], sentTexts: Array<{ body: string; at: string; to: string | null }>): string[] {
  const out: string[] = [];
  for (const x of examples.slice(0, 6)) {
    out.push(`- ${x.at.slice(0, 10)} by ${x.via}: "${greetingSlot(x.template).replace(/\n/g, " / ")}"${x.subject ? ` — subject "${x.subject}"` : ""}`);
    if (x.dusty && x.edited) out.push(`  You drafted: "${greetingSlot(x.dusty).replace(/\n/g, " / ")}" — Coy changed it to the line above before sending.`);
  }
  const known = new Set(examples.map((x) => greetingSlot(x.template)));
  for (const t of sentTexts.slice(0, 5)) {
    // As a pattern — their name and the link as slots — so no customer's name rides into the next one.
    const tpl = toTemplate(t.body, { first: "", title: null, url: "", names: [t.to] });
    if (known.has(tpl)) continue;
    out.push(`- ${t.at.slice(0, 10)} texted: "${tpl.replace(/\n/g, " / ").slice(0, 400)}"`);
  }
  return out;
}
