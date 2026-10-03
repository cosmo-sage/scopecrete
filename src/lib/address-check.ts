/**
 * Addresses checked against a map's geocoder (Coy, 2026-10-03: "With the
 * transcript it's easier to misspell addresses, so if the AI system is trying
 * to type an address that is spoken it needs to use the same auto complete
 * features that I would want to use when entering an address").
 *
 * Pure: reads Mapbox's Geocoding v6 answer into address parts, and decides
 * whether a match is sure enough to write without asking. The fetching is in
 * `address-server.ts`. Tested in tests/address-check.test.mjs.
 */

export interface AddressMatch {
  line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  formatted: string;
  lat: number;
  lng: number;
  /** Mapbox's own word for how well the query matched: exact, high, medium, low — null from autocomplete. */
  confidence: string | null;
  number_matched: boolean;
  street_matched: boolean;
}

type Ctx = { name?: unknown; address_number?: unknown; street_name?: unknown; region_code?: unknown };
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Mapbox Geocoding v6 features → address parts (addresses only; a street or a town alone is not one). */
export function mapboxV6Matches(body: unknown): AddressMatch[] {
  const fs = (body as { features?: unknown })?.features;
  if (!Array.isArray(fs)) return [];
  const out: AddressMatch[] = [];
  for (const f of fs) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    const c = (f as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
    if (!p || p.feature_type !== "address" || !Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") continue;
    const ctx = (p.context ?? {}) as Record<string, Ctx | undefined>;
    const line1 = s(ctx.address?.name) ?? s(p.name);
    if (!line1) continue;
    const city = s(ctx.place?.name) ?? s(ctx.locality?.name);
    const state = s(ctx.region?.region_code) ?? s(ctx.region?.name);
    const zip = s(ctx.postcode?.name);
    const mc = (p.match_code ?? {}) as Record<string, unknown>;
    out.push({
      line1, city, state, zip,
      formatted: [line1, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      lat: c[1], lng: c[0],
      confidence: s(mc.confidence),
      number_matched: mc.address_number === "matched",
      street_matched: mc.street === "matched",
    });
  }
  return out;
}

/** The house number a heard address starts with ("14835 General Prentiss Ave…" → "14835"). */
export function houseNumber(text: string): string | null {
  return /^\s*(\d{2,6})\b/.exec(text)?.[1] ?? null;
}

/**
 * Sure enough to write without asking: Mapbox says exact or high, it matched the
 * house number AND the street, and its house number is the one that was said.
 * Anything less is shown to Coy as a suggestion with one tap.
 */
export function sureMatch(heard: string, m: AddressMatch | null): boolean {
  if (!m) return false;
  const n = houseNumber(heard);
  return !!n && houseNumber(m.line1) === n
    && (m.confidence === "exact" || m.confidence === "high")
    && m.number_matched && m.street_matched;
}

/** The part of a heard address worth sending to the geocoder: up to the first ';' or '(' — notes stay out. */
export function addressQuery(hint: string): string {
  return hint.split(/[;(]/)[0].replace(/\s+/g, " ").trim().replace(/[ ,.]+$/, "").slice(0, 200);
}
