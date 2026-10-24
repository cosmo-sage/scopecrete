/**
 * The contact thread under Spaces (Claude Design "Contact Thread", 2026-10-23,
 * /mnt/project-files/navigation/contact-thread-design/): one page per contact,
 * every channel in one timeline, a Phone or Email filter, search scoped to the
 * filter, and reading settings kept on the device. Pure rules, tested in
 * tests/contact-thread.test.mjs.
 */

/** No filter, calls & texts (every number, voicemail, texted photos), or email in and out. */
export type CtFilter = "all" | "phone" | "email";

export const READ_SIZES = [
  { key: "s", label: "S", z: 1 },
  { key: "m", label: "M", z: 1.15 },
  { key: "l", label: "L", z: 1.3 },
  { key: "xl", label: "XL", z: 1.5 },
] as const;

export const READ_FONTS = [
  { key: "plex", label: "Plex", css: "'IBM Plex Sans', system-ui, sans-serif" },
  { key: "clear", label: "Clear", css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { key: "round", label: "Round", css: "'Lexend', system-ui, sans-serif" },
  { key: "serif", label: "Serif", css: "'Source Serif 4', Georgia, serif" },
] as const;

const mix = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;

/** Faint backgrounds behind the timeline, built from the theme so they follow it. */
export const READ_BGS = [
  { key: "plain", label: "Plain", css: "none" },
  { key: "dots", label: "Survey dots", css: `radial-gradient(${mix("--sc-ink3", 38)} 1px, transparent 1.3px) 0 0 / 18px 18px` },
  { key: "grid", label: "Blueprint", css: `linear-gradient(${mix("--sc-chalk", 9)} 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, ${mix("--sc-chalk", 9)} 1px, transparent 1px) 0 0 / 24px 24px` },
  { key: "contour", label: "Contour", css: `repeating-radial-gradient(circle at 100% 0, transparent 0 26px, ${mix("--sc-ink3", 14)} 26px 27px)` },
  { key: "broom", label: "Broom finish", css: `repeating-linear-gradient(100deg, ${mix("--sc-ink", 5)} 0 1px, transparent 1px 5px)` },
  { key: "dawn", label: "First pour", css: `radial-gradient(circle at 100% 0, ${mix("--sc-hiviz", 16)}, transparent 45%), radial-gradient(circle at 0 100%, ${mix("--sc-chalk", 13)}, transparent 50%)` },
] as const;

export interface Reading { size: string; font: string; bg: string }
export const READ_DEFAULT: Reading = { size: "m", font: "plex", bg: "plain" };

/** Whatever was stored on the device, made safe: an unknown value is the default. */
export function cleanReading(v: unknown): Reading {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const pick = <T extends { key: string }>(list: readonly T[], x: unknown, d: string) =>
    typeof x === "string" && list.some((i) => i.key === x) ? x : d;
  return {
    size: pick(READ_SIZES, o.size, READ_DEFAULT.size),
    font: pick(READ_FONTS, o.font, READ_DEFAULT.font),
    bg: pick(READ_BGS, o.bg, READ_DEFAULT.bg),
  };
}

export const readSize = (r: Reading) => READ_SIZES.find((s) => s.key === r.size) ?? READ_SIZES[1];
export const readFont = (r: Reading) => READ_FONTS.find((s) => s.key === r.font) ?? READ_FONTS[0];
export const readBg = (r: Reading) => READ_BGS.find((s) => s.key === r.bg) ?? READ_BGS[0];

/** A tap on the filter that is already on turns it off; one filter at a time. */
export const toggleFilter = (on: CtFilter, tapped: Exclude<CtFilter, "all">): CtFilter => (on === tapped ? "all" : tapped);

export function searchPlaceholder(f: CtFilter): string {
  return f === "phone" ? "Search calls & texts…" : f === "email" ? "Search email…" : "Search texts, emails, calls, notes…";
}

export const filterTitle = (f: CtFilter) => (f === "phone" ? "Calls & texts" : f === "email" ? "Email" : "Everything");

/** Every word typed is somewhere in the text, any case; nothing typed matches everything. */
export function matches(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
}

interface MsgLike { body_text?: string | null; summary?: string | null; voicemail?: { text: string | null } | null }
interface EmailLike { subject?: string | null; from?: string | null; body?: string | null }

export const messageWords = (m: MsgLike) => [m.body_text, m.summary, m.voicemail?.text].filter(Boolean).join(" ");
export const emailWords = (e: EmailLike) => [e.subject, e.from, e.body].filter(Boolean).join(" ");

/** What the timeline shows under a filter and a search: phone messages, emails, notes. */
export function scoped<M extends MsgLike, E extends EmailLike, N extends { body: string }>(
  f: CtFilter, q: string, items: { messages: M[]; emails: E[]; notes: N[] },
): { messages: M[]; emails: E[]; notes: N[]; count: number } {
  const messages = f === "email" ? [] : items.messages.filter((m) => matches(messageWords(m), q));
  const emails = f === "phone" ? [] : items.emails.filter((e) => matches(emailWords(e), q));
  const notes = f !== "all" ? [] : items.notes.filter((n) => matches(n.body, q));
  return { messages, emails, notes, count: messages.length + emails.length + notes.length };
}

/** "Customer: Acme GC" — the role word from what they're linked to, the company theirs. */
export function roleWord(bucket: string | null | undefined, customerId: string | null | undefined): "Customer" | "Vendor" | null {
  if (bucket === "vendor") return "Vendor";
  if (customerId) return "Customer";
  return null;
}

/** The first line of an email that has something in it, for its collapsed row — never an empty preview. */
export function firstLine(body: string | null | undefined): string {
  for (const l of (body ?? "").split(/\r?\n/)) {
    const t = l.trim();
    if (t && !/^>/.test(t)) return t.length > 140 ? `${t.slice(0, 139)}…` : t;
  }
  return "";
}
