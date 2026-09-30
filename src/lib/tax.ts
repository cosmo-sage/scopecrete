/**
 * Which parish a job is in, from its address (Coy, 2026-09-30: "Sales tax
 * should be calculated from the job location"). Pure, tested in
 * tests/tax.test.mjs. The RATE is the org's own (tax_parishes, entered by
 * Coy); this only finds the parish. A parish named in the address wins; else
 * the city; else null — never a guess.
 */

/** Louisiana cities and towns around Coy's work, by parish. A city not listed is "parish unknown". */
const CITY_PARISH: Record<string, string> = {
  "baton rouge": "East Baton Rouge", "zachary": "East Baton Rouge", "central": "East Baton Rouge", "baker": "East Baton Rouge",
  "greenwell springs": "East Baton Rouge", "pride": "East Baton Rouge",
  "denham springs": "Livingston", "walker": "Livingston", "watson": "Livingston", "albany": "Livingston", "livingston": "Livingston",
  "holden": "Livingston", "french settlement": "Livingston", "springfield": "Livingston",
  "gonzales": "Ascension", "prairieville": "Ascension", "sorrento": "Ascension", "donaldsonville": "Ascension", "geismar": "Ascension",
  "port allen": "West Baton Rouge", "addis": "West Baton Rouge", "brusly": "West Baton Rouge",
  "plaquemine": "Iberville", "st. gabriel": "Iberville", "saint gabriel": "Iberville", "white castle": "Iberville",
  "hammond": "Tangipahoa", "ponchatoula": "Tangipahoa", "amite": "Tangipahoa", "independence": "Tangipahoa",
  "st. francisville": "West Feliciana", "saint francisville": "West Feliciana",
  "clinton": "East Feliciana", "jackson": "East Feliciana",
  "new roads": "Pointe Coupee",
  "lafayette": "Lafayette", "youngsville": "Lafayette", "broussard": "Lafayette", "carencro": "Lafayette", "scott": "Lafayette",
  "new orleans": "Orleans", "metairie": "Jefferson", "kenner": "Jefferson", "harvey": "Jefferson", "gretna": "Jefferson", "marrero": "Jefferson",
  "slidell": "St. Tammany", "covington": "St. Tammany", "mandeville": "St. Tammany",
  "shreveport": "Caddo", "bossier city": "Bossier", "lake charles": "Calcasieu", "houma": "Terrebonne", "thibodaux": "Lafourche",
  "monroe": "Ouachita", "west monroe": "Ouachita", "alexandria": "Rapides", "laplace": "St. John the Baptist",
};

const norm = (s: string) => s.toLowerCase().replace(/\bsaint\b/g, "st.").replace(/\s+/g, " ").trim();

export function parishFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const a = norm(address);
  const named = a.match(/([a-z. ]+?)\s+parish\b/);
  if (named) {
    const p = named[1].trim().split(",").pop()!.trim();
    if (p) return p.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/^St\. /, "St. ");
  }
  // Only a Louisiana address (or one with no state) is matched by city.
  if (/\b(tx|texas|ms|mississippi|ar|arkansas)\b/.test(a) && !/\b(la|louisiana)\b/.test(a)) return null;
  const parts = a.split(",").map((x) => x.trim());
  // "123 Main St, Baton Rouge, LA 70808" → try each comma part, then any substring.
  for (const part of parts) {
    const city = part.replace(/\b(la|louisiana)\b.*$/, "").trim();
    if (CITY_PARISH[city]) return CITY_PARISH[city];
  }
  const hits = Object.keys(CITY_PARISH).filter((c) => new RegExp(`(^|[ ,])${c.replace(/\./g, "\\.")}($|[ ,])`).test(a));
  // The longest name wins ("west monroe" over "monroe"); two different parishes is a question.
  hits.sort((x, y) => y.length - x.length);
  const parishes = new Set(hits.filter((h) => !hits.some((o) => o !== h && o.includes(h))).map((h) => CITY_PARISH[h]));
  return parishes.size === 1 ? [...parishes][0] : null;
}

export interface JobTax { rate: number | null; parish: string | null; source: "override" | "parish" | null; missing: string | null }

/** The job's rate: Coy's override, else its parish's rate from the org's table. */
export function jobTax(job: { tax_rate_pct?: number | null; tax_rate_source?: string | null; tax_parish?: string | null; address?: string | null },
  fallbackAddress: string | null, rates: Array<{ parish: string; rate_pct: number }>): JobTax {
  if (job.tax_rate_source === "override" && typeof job.tax_rate_pct === "number") {
    return { rate: job.tax_rate_pct, parish: job.tax_parish ?? null, source: "override", missing: null };
  }
  const parish = job.tax_parish || parishFromAddress(job.address) || parishFromAddress(fallbackAddress);
  if (!parish) return { rate: null, parish: null, source: null, missing: "parish unknown — set it on the job" };
  const r = rates.find((x) => x.parish.toLowerCase() === parish.toLowerCase());
  if (!r) return { rate: null, parish, source: null, missing: `no rate for ${parish} — add it in Price book → Defaults` };
  return { rate: Number(r.rate_pct), parish, source: "parish", missing: null };
}
