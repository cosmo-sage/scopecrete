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

const STATE_WORDS: Record<string, string> = { louisiana: "LA", mississippi: "MS", texas: "TX", arkansas: "AR", alabama: "AL", florida: "FL", georgia: "GA", tennessee: "TN", oklahoma: "OK" };
/** An address that names a state other than Louisiana. */
export const outOfState = (address: string) => { const st = stateOf(address); return !!st && st !== "LA"; };
/** The state an address names, as two letters ("Wiggins, Mississippi" → MS), else null. */
export function stateOf(address: string): string | null {
  const a = norm(address);
  for (const [w, ab] of Object.entries(STATE_WORDS)) if (new RegExp(`\\b${w}\\b`).test(a)) return ab;
  const m = /,\s*([a-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*(?:,\s*(?:usa|united states))?$/.exec(a);
  return m ? m[1].toUpperCase() : null;
}

export interface TaxLookup {
  /** Combined rate for the address, in % (10.5 for 0.105). */
  rate_pct: number;
  /** Each jurisdiction's part, in %. */
  parts: Array<{ name: string; level: string; rate_pct: number }>;
  /** The provider's data date, and how exactly it placed the address (rooftop, zip …). */
  as_of: string | null; resolution: string | null;
  /** The address it was asked about — a different address now means look again. */
  address: string; at: string; source: "TaxLocus";
}

export interface JobTax { rate: number | null; parish: string | null; source: "override" | "parish" | "lookup" | null; missing: string | null; lookup?: TaxLookup | null }

const pct = (r: unknown) => (typeof r === "number" && Number.isFinite(r) ? Math.round(r * 100 * 1000) / 1000 : null);

/**
 * TaxLocus's rate lookup reply (POST /v1/rate/lookup) → the rate in %, its
 * parts and its date (Coy, 2026-10-04: TaxLocus key). Null when it carries no
 * combined rate — never a guess.
 */
export function readTaxLocus(json: unknown, address: string, at = new Date().toISOString()): TaxLookup | null {
  const j = (json ?? {}) as { combined_rate?: unknown; breakdown?: unknown; as_of?: unknown; resolution?: unknown };
  const rate = pct(j.combined_rate);
  if (rate === null || rate < 0 || rate >= 30) return null;
  const parts = (Array.isArray(j.breakdown) ? j.breakdown : []).map((b) => {
    const x = b as { name?: unknown; level?: unknown; rate?: unknown };
    return { name: typeof x.name === "string" ? x.name : "", level: typeof x.level === "string" ? x.level : "", rate_pct: pct(x.rate) ?? 0 };
  }).filter((x) => x.name);
  return { rate_pct: rate, parts, as_of: typeof j.as_of === "string" ? j.as_of : null, resolution: typeof j.resolution === "string" ? j.resolution : null, address, at, source: "TaxLocus" };
}

/**
 * An address in the pieces the lookup wants: the job's own fields when it has
 * them, else read from "14835 Example Ave, Baton Rouge, LA 70816". Null when
 * there's no street with a number — nothing is looked up for a guess.
 */
export function addressParts(a: { line1?: string | null; city?: string | null; state?: string | null; zip?: string | null } | string | null | undefined):
  { line1: string; city: string | null; state: string; postal_code: string | null; text: string } | null {
  if (!a) return null;
  let line1: string | null, city: string | null = null, state: string | null = null, zip: string | null = null;
  if (typeof a === "string") {
    const parts = a.split(",").map((x) => x.trim()).filter(Boolean);
    line1 = parts[0] ?? null;
    const tail = parts.slice(1).join(" ");
    const m = /\b([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?\s*(?:usa|united states)?$/i.exec(tail);
    if (m) { state = m[1].toUpperCase(); zip = m[2] ?? null; }
    else state = stateOf(a);
    city = parts.length > 2 ? parts[1] : parts[1]?.replace(/\s+[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?$/, "").trim() || null;
    if (city && /^[A-Za-z]{2}(\s+\d{5})?$/.test(city)) city = null;
  } else {
    line1 = a.line1?.trim() || null; city = a.city?.trim() || null; state = a.state?.trim().toUpperCase() || null; zip = a.zip?.trim() || null;
    if (line1 && line1.includes(",") && !city) return addressParts(line1);
  }
  if (!line1 || !/^\d{1,6}[A-Za-z]?\s+\S/.test(line1)) return null;
  const st = state ?? "LA"; // Coy works in Louisiana; a typed state wins.
  if (!city && !zip) return null;
  return { line1, city, state: st, postal_code: zip, text: [line1, city, [st, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") };
}

/**
 * The job's rate. Coy's typed rate wins; then a parish he picked; then the
 * looked-up rate for the job's current address (TaxLocus); then the parish
 * read from the address and the org's own rate for it.
 */
export function jobTax(job: { tax_rate_pct?: number | null; tax_rate_source?: string | null; tax_parish?: string | null; address?: string | null; tax_lookup?: TaxLookup | null },
  fallbackAddress: string | null, rates: Array<{ parish: string; rate_pct: number }>, currentAddress?: string | null): JobTax {
  if (job.tax_rate_source === "override" && typeof job.tax_rate_pct === "number") {
    return { rate: job.tax_rate_pct, parish: job.tax_parish ?? null, source: "override", missing: null };
  }
  // A job with an address of its own is taxed where it is, never at its customer's office (Coy, 2026-10-24: a
  // Wiggins, MS job read 5% East Baton Rouge from Gulfline's Baton Rouge address).
  const own = !!job.address?.trim();
  const parishFromAddr = own ? parishFromAddress(job.address) : parishFromAddress(fallbackAddress);
  const lk = job.tax_lookup;
  // currentAddress null: nothing to look up now, so an old lookup (of another address) isn't used.
  if (!job.tax_parish && lk && typeof lk.rate_pct === "number" && (currentAddress === undefined || lk.address === currentAddress)) {
    return { rate: lk.rate_pct, parish: parishFromAddr, source: "lookup", missing: null, lookup: lk };
  }
  const parish = job.tax_parish || parishFromAddr;
  if (!parish) return { rate: null, parish: null, source: null, missing: own && outOfState(job.address!)
    ? "no rate for this address — give the job a street address to look it up, or type the rate"
    : "parish unknown — set it on the job" };
  const r = rates.find((x) => x.parish.toLowerCase() === parish.toLowerCase());
  if (!r) return { rate: null, parish, source: null, missing: `no rate for ${parish} — add it in Settings → Cost book` };
  return { rate: Number(r.rate_pct), parish, source: "parish", missing: null };
}
