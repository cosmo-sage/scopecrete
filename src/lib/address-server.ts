import type { SupabaseClient } from "@supabase/supabase-js";
import { addressQuery, mapboxV6Matches, sureMatch, type AddressMatch } from "@/lib/address-check";

/**
 * Geocoding for customer addresses, server side (MAPBOX_TOKEN never reaches the
 * browser). Mapbox Geocoding v6 — the same service the aerial picker suggests
 * from — because its answer says how well each part matched.
 */

const token = () => (process.env.MAPBOX_TOKEN ?? "").trim();
export const addressCheckOn = () => !!token();

async function v6(q: string, autocomplete: boolean, near?: { lat: number; lng: number } | null, limit = 1): Promise<AddressMatch[]> {
  const t = token();
  const query = q.trim().slice(0, 200);
  if (!t || query.length < 3) return [];
  const prox = near ? `&proximity=${near.lng},${near.lat}` : "";
  try {
    const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=us&types=address&limit=${limit}&autocomplete=${autocomplete}${prox}&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return r.ok ? mapboxV6Matches(await r.json()) : [];
  } catch { return []; }
}

/** Suggestions as Coy types a street (the customer's Edit form): parts and a point for each. */
export const suggestAddressParts = (q: string, near?: { lat: number; lng: number } | null) => v6(q, true, near, 6);

/** The best match for a whole address, with how well it matched. */
export async function matchAddress(q: string): Promise<AddressMatch | null> {
  return (await v6(q, false))[0] ?? null;
}

export interface HeardAddress { hint: string; contact_id: string; said_in: "text" | "call"; match: AddressMatch | null; sure: boolean }

/**
 * A customer with no address whose person SAID one on a call (migration 071's
 * `sc_customer_heard_address`): checked against Mapbox. A sure match is written
 * as the customer's address (`address_source='geocode'` — Mapbox's spelling, not
 * the transcript's); anything less comes back for the page to offer.
 * Addresses they TEXTED are written by the database itself (071).
 */
export async function settleHeardAddress(sb: SupabaseClient, orgId: string, customerId: string): Promise<HeardAddress | null> {
  const { data } = await sb.rpc("sc_customer_heard_address", { p_customer: customerId });
  const row = (Array.isArray(data) ? data[0] : data) as { hint?: string; contact_id?: string; said_in?: string } | null;
  if (!row?.hint || row.said_in !== "call" || !row.contact_id) return null;
  const q = addressQuery(row.hint);
  const match = q ? await matchAddress(q) : null;
  const sure = sureMatch(q, match);
  if (sure && match) {
    const { data: done } = await sb.from("customers").update({
      address_line1: match.line1, city: match.city, state: match.state, zip: match.zip,
      address_formatted: match.formatted, lat: match.lat, lng: match.lng, geocoded_at: new Date().toISOString(),
      address_source: "geocode", updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("id", customerId).is("address_line1", null).is("address_formatted", null).is("address_source", null).select("id");
    if (!done?.length) return null;
  }
  return { hint: row.hint, contact_id: row.contact_id, said_in: "call", match, sure };
}
