/**
 * A section's scope of work (Coy, 2026-10-10: "I need to be able to see it in the budget as bulleted line
 * items and … edit it in the draft proposal … which would update the budget SOW").
 *
 * One line per bullet, kept in job_sections.prep_notes — no migration: Prep left the section card on
 * 2026-10-03 and no section held anything in it (measured again 2026-10-10: 0 of 45). The budget's section
 * card and the draft proposal edit the same column, so they never disagree; a final freezes it with the
 * section, and the customer's copy shows it (it is written for them, unlike the section's Notes).
 */

export const SOW_MAX_LINES = 40;
export const SOW_MAX_LINE = 300;

/** The bullets of a stored scope: one a line, a typed "•", "-", "*" or "1." in front taken off, blanks dropped. */
export function sowLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[•·\-*–]|\d{1,2}[.)])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, SOW_MAX_LINES)
    .map((l) => l.slice(0, SOW_MAX_LINE));
}

/** The stored form of a list of bullets; none is null. */
export function sowText(lines: string[]): string | null {
  const t = sowLines(lines.join("\n")).join("\n");
  return t || null;
}

/**
 * Dusty's answer as bullets (Coy, 2026-10-10: the emblem on a section's Scope of work). His reply is
 * Markdown with a line or two around the list, so only its list items are kept (every line when it has
 * none), bold and italics taken off.
 */
export function sowFromAnswer(answer: string): string | null {
  const raw = answer.split(/\r?\n/).map((l) => l.trim());
  const listed = raw.filter((l) => /^(?:[•·\-*–]|\d{1,2}[.)])\s+/.test(l));
  const use = (listed.length ? listed : raw.filter((l) => l && !/^#/.test(l)))
    .map((l) => l.replace(/\*\*|__|`/g, "").replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$)/g, "$1$2"));
  return sowText(use);
}
