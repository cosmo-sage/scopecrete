/**
 * Which plan sheets a section's scope came from (Coy, 2026-10-02: "I need to
 * verify the scopes on the sheets the scopes were taken from"). The bid reader
 * writes the sheets on the section's `source_ref` ("A2.1, A2.2 · 03 30 00 ·
 * "…""); a sheet is linked only when a sheet by that exact number was read off
 * the plans — never a guess. Pure, tested in tests/section-sheets.test.mjs.
 */

export interface SheetRef { id: string; number: string | null }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sheet numbers named in a section's bid reference that match a sheet on the job, in the order named. */
export function sheetsFor<T extends SheetRef>(ref: string | null | undefined, sheets: T[]): T[] {
  if (!ref) return [];
  const hits: Array<{ at: number; s: T }> = [];
  const seen = new Set<string>();
  for (const s of sheets) {
    const n = s.number?.trim();
    if (!n || n.length < 2 || seen.has(s.id)) continue;
    // A2.1 must not match A2.10 or XA2.1; separators are commas, spaces, dots at a sentence end.
    const m = new RegExp(`(^|[^A-Za-z0-9.])${esc(n)}(?![0-9A-Za-z]|\\.[0-9])`, "i").exec(ref);
    if (m) { hits.push({ at: m.index, s }); seen.add(s.id); }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.s);
}
