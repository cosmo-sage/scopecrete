/**
 * Several budgets on a job (migration 088, Coy 2026-10-07: "save and name the
 * budget (give a name suggestion like draft 1 or draft 2)"). Pure helpers.
 */

/** "Draft N", one past the highest Draft number in use (and past the count). */
export function suggestBudgetName(names: Array<string | null | undefined>): string {
  let top = 0;
  for (const n of names) {
    const m = /^\s*draft\s*(\d{1,4})\s*$/i.exec(n ?? "");
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `Draft ${Math.max(top, names.filter((n) => n && n.trim()).length) + 1}`;
}

/** A name as stored: one line, trimmed, 1–60 characters, or null. */
export function cleanBudgetName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return s || null;
}
