/**
 * @-tags in internal notes (Coy, 2026-10-04: "I need to be able to create
 * internal notes. The internal notes tab can also allow me to tag other
 * internal members in the Org"). Pure — tested in tests/mentions.test.mjs.
 *
 * A tag is kept in the note's own words as `@[Name](u:<user id>)`, so no
 * column is needed: the note reads "@Name" on screen, and a member finds the
 * notes they were tagged in by their id. Only org members can be picked.
 */

const TAG = /@\[([^\]\n]{1,60})\]\(u:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export interface Member { user_id: string; name: string | null; email: string | null }

export const memberName = (m: Member) => (m.name?.trim() || m.email?.split("@")[0] || "Teammate").replace(/[[\]()\n]/g, " ").trim().slice(0, 60);

/** The tag written into a note for one member. */
export const tagFor = (m: Member) => `@[${memberName(m)}](u:${m.user_id})`;

/** Every member id tagged in a note, once each. */
export function mentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(TAG)].map((x) => x[2].toLowerCase()))];
}

/** A note split into plain words and tags, for showing it. */
export function noteParts(body: string): Array<{ text: string; user?: string }> {
  const out: Array<{ text: string; user?: string }> = [];
  let at = 0;
  for (const m of body.matchAll(TAG)) {
    if (m.index! > at) out.push({ text: body.slice(at, m.index) });
    out.push({ text: `@${m[1]}`, user: m[2].toLowerCase() });
    at = m.index! + m[0].length;
  }
  if (at < body.length) out.push({ text: body.slice(at) });
  return out;
}

/** The note as plain words ("@Name"), for Dusty and one-line summaries. */
export const plainNote = (body: string) => noteParts(body).map((p) => p.text).join("");

/**
 * The @-word being typed at the caret, if any: "call @ja|" → { start: 5, query: "ja" }.
 * An @ inside a word (an email) is not a tag.
 */
export function typingTag(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@[\]()]{0,30})$/.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/** Members matching what's typed after @ — by any word of the name, or the email. */
export function matchMembers(members: Member[], query: string): Member[] {
  const q = query.toLowerCase();
  return members.filter((m) => !q || memberName(m).toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || (m.email ?? "").toLowerCase().startsWith(q)).slice(0, 6);
}

/** Put a member's tag where the @-word is, with a space after; returns the text and the new caret. */
export function insertTag(text: string, at: { start: number; query: string }, m: Member): { text: string; caret: number } {
  const tag = `${tagFor(m)} `;
  const end = at.start + 1 + at.query.length;
  return { text: text.slice(0, at.start) + tag + text.slice(end), caret: at.start + tag.length };
}
