/**
 * Who and what Coy is asking about, whatever page is open (Coy, 2026-10-04:
 * "Dusty has trouble seeing other contexts outside of what page is open … He
 * needs to be aware of all phone calls, texts, emails, etc."). Pure — tested in
 * tests/dusty-mentions.test.mjs.
 *
 * A person, customer or job is "mentioned" when the question (or one of Coy's
 * last few messages in the chat) names it: the whole name, or a surname /
 * distinctive first name of four letters or more that isn't an everyday word.
 * A first name shared by several people matches all of them — Dusty is told
 * which is which by their facts, never by a guess.
 */

/** Words that never single anyone out: the trade's own vocabulary and plain English. */
const COMMON = new Set(`
the and for with from that this what when where which who whom about into over under after before again there their they them
then than have has had was were will would could should does did done just only also very much more most some any each every
your yours ours mine call called calls calling text texted texts texting email emailed emails message messages phone number
today yesterday tomorrow week month year morning night monday tuesday wednesday thursday friday saturday sunday
job jobs new old customer customers vendor vendors contact contacts person people lead leads bid bids quote quotes quoted proposal
price prices budget scope area areas section sections file files photo photos plan plans sheet sheets invoice receipt
concrete driveway drive repair replace replacement patio sidewalk walk slab pad curb gutter footing footings beam beams pour
demo demolition apron approach parking lot road ramp stairs steps wall walls foundation residential commercial government
inc llc company group construction contractors contracting services materials supply ready mix paving baton rouge parish
`.split(/\s+/).filter(Boolean));

export const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z'’]+/g) ?? []).map((w) => w.replace(/['’]s$/, "").replace(/['’]/g, ""));

/** The distinctive words of a name: four letters or more, not everyday words, not Jr / Sr / II. */
export function nameKeys(name: string | null | undefined): string[] {
  return [...new Set(words(name ?? "").filter((w) => w.length >= 4 && !COMMON.has(w) && !/^(junior|senior)$/.test(w)))];
}

export interface Named { id: string; name: string | null }

/**
 * The records named in `text`: every name whose words all appear, else whose
 * distinctive word appears. Best matches first (more words matched), at most `max`.
 */
export function mentioned<T extends Named>(text: string, rows: T[], max = 5): T[] {
  const said = new Set(words(text));
  const scored: Array<[number, T]> = [];
  for (const r of rows) {
    const all = words(r.name ?? "").filter((w) => w.length >= 2);
    if (!all.length) continue;
    const keys = nameKeys(r.name);
    const whole = all.length > 1 && all.every((w) => said.has(w));
    const hits = keys.filter((k) => said.has(k)).length;
    if (whole) scored.push([100 + all.length, r]);
    else if (hits) scored.push([hits, r]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, max).map(([, r]) => r);
}

/** The question's searchable words, OR'd for websearch_to_tsquery: everyday words dropped, at most 8. */
export function searchTerms(text: string): string | null {
  const ws = [...new Set(words(text).filter((w) => w.length >= 4 && !COMMON.has(w)))].slice(0, 8);
  const digits = (text.match(/\d{4,}/g) ?? []).slice(0, 2);
  const all = [...ws, ...digits];
  return all.length ? all.join(" or ") : null;
}
