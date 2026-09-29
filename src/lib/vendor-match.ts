/**
 * Matching a receipt to the Price book (migration 051) — pure, so
 * tests/vendor-match.test.mjs runs it.
 *
 * Coy uploads Angelle Materials' invoice. Dusty reads the vendor block and
 * the priced lines; these functions say which of Coy's vendors it is from
 * (by the phone printed on it, else the name) and which of his Price book
 * items each line is (by the vendor's item #, else the name). They only
 * SUGGEST: the preview shows every match and Coy can change any of them.
 */

const STOP = new Set(["inc", "llc", "co", "company", "corp", "corporation", "ltd", "the", "and", "of", "l", "c"]);

/** "Angelle Materials, L.L.C." → "angelle materials". */
export function normVendor(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter((w) => w && !STOP.has(w)).join(" ");
}

/** The last ten digits — "(225) 555-0101", "+1 225.555.0101" and "2255550101" alike. */
export function phoneDigits(s: string | null | undefined): string | null {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export interface VendorLike {
  id: string; name: string | null; phone: string | null; phones?: string[];
  email?: string | null; company_name?: string | null;
}

const squash = (s: string) => s.replace(/ /g, "");

/**
 * Which vendor a document is from: the printed phone, then the printed email
 * (or its domain spelling the vendor's name — billing@angellematerials.com is
 * Angelle Materials), then the name, then a first word only one vendor has
 * ("Angelle Concrete Group" vs "Angelle Materials"). Never a guess between two.
 */
export function matchVendor(read: { name?: string | null; phone?: string | null; email?: string | null }, vendors: VendorLike[]):
  { id: string; how: "phone" | "email" | "name" } | null {
  const p = phoneDigits(read.phone);
  if (p) {
    const hit = vendors.find((v) => [v.phone, ...(v.phones ?? [])].some((x) => phoneDigits(x) === p));
    if (hit) return { id: hit.id, how: "phone" };
  }
  const names = (v: VendorLike) => [normVendor(v.name), normVendor(v.company_name)].filter((x) => x);
  const email = String(read.email ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    const hit = vendors.find((v) => (v.email ?? "").trim().toLowerCase() === email);
    if (hit) return { id: hit.id, how: "email" };
    const domain = email.split("@")[1].split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
    const byDomain = domain.length >= 5 ? vendors.filter((v) => names(v).some((n) => squash(n) === domain)) : [];
    if (byDomain.length === 1) return { id: byDomain[0].id, how: "email" };
  }
  const n = normVendor(read.name);
  if (!n) return null;
  const exact = vendors.filter((v) => names(v).includes(n));
  if (exact.length === 1) return { id: exact[0].id, how: "name" };
  if (exact.length > 1) return null;
  // "Angelle" on the invoice vs "Angelle Materials" in the app, or the reverse.
  const part = vendors.filter((v) => names(v).some((m) =>
    m.length >= 5 && n.length >= 5 && (m.startsWith(n + " ") || n.startsWith(m + " "))));
  if (part.length === 1) return { id: part[0].id, how: "name" };
  if (part.length > 1) return null;
  // The same distinctive first word, and only one vendor has it.
  const first = n.split(" ")[0];
  if (first.length < 5 || GENERIC.has(first)) return null;
  const word = vendors.filter((v) => names(v).some((m) => m.split(" ")[0] === first));
  return word.length === 1 ? { id: word[0].id, how: "name" } : null;
}
const GENERIC = new Set(["ready", "concrete", "supply", "supplies", "materials", "building", "builders", "rental", "rentals", "equipment", "steel", "lumber", "southern", "gulf", "american", "national"]);

// ---------------------------------------------------------------- items

const ITEM_STOP = new Set(["the", "and", "of", "a", "per", "ea", "each"]);
/** Words and numbers in an item name, with the usual spellings folded: "3,000 PSI" = "3000 psi". */
export function itemTokens(s: string | null | undefined): string[] {
  return String(s ?? "").toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").replace(/#/g, " no ")
    .replace(/[^a-z0-9.]+/g, " ").split(" ").map((w) => w.replace(/\.$/, "")).filter((w) => w && !ITEM_STOP.has(w));
}

export interface ItemLike {
  id: string; name: string; vendor_sku?: string | null; active?: boolean;
  sources?: Array<{ vendor_contact_id: string; vendor_sku: string | null }>;
}

/**
 * Which Price book item a line is. In order: this vendor's item # on one of
 * the item's vendor prices (or the item's own #); the same name; a close name
 * — every number the same (3000 is not 4000) and most words shared.
 */
export function matchItem(line: { name: string; sku?: string | null }, items: ItemLike[], vendorId: string | null):
  { id: string; how: "sku" | "name" | "close" } | null {
  const live = items.filter((i) => i.active !== false);
  const sku = String(line.sku ?? "").trim().toLowerCase();
  if (sku) {
    const hit = live.find((i) => (i.sources ?? []).some((s) => s.vendor_contact_id === vendorId && (s.vendor_sku ?? "").trim().toLowerCase() === sku))
      ?? live.find((i) => (i.vendor_sku ?? "").trim().toLowerCase() === sku);
    if (hit) return { id: hit.id, how: "sku" };
  }
  const t = itemTokens(line.name);
  if (!t.length) return null;
  const key = t.join(" ");
  const exact = live.find((i) => itemTokens(i.name).join(" ") === key);
  if (exact) return { id: exact.id, how: "name" };
  const nums = t.filter((w) => /\d/.test(w)).sort().join(" ");
  let best: { id: string; score: number } | null = null;
  for (const i of live) {
    const u = itemTokens(i.name);
    if (u.filter((w) => /\d/.test(w)).sort().join(" ") !== nums) continue;
    const a = new Set(t), b = new Set(u);
    const shared = [...a].filter((w) => b.has(w)).length;
    const score = shared / Math.max(a.size, b.size);
    if (score >= 0.6 && (!best || score > best.score)) best = { id: i.id, score };
  }
  return best ? { id: best.id, how: "close" } : null;
}

export interface PriceLine { name: string; sku: string | null; unit: string | null; unit_cost: number; qty: number | null }

/**
 * One row per item: an invoice lists the same product once per ticket
 * (10 CY, 10 CY, 3 CY of the same mix at $155). Lines with the same item #
 * (else name), unit and price become one, quantities added; the same item
 * at two prices stays two rows so Coy sees both.
 */
export function collapseLines(lines: PriceLine[]): Array<PriceLine & { times: number }> {
  const out: Array<PriceLine & { times: number }> = [];
  const at = new Map<string, number>();
  for (const l of lines) {
    const key = [(l.sku ?? "").trim().toLowerCase() || itemTokens(l.name).join(" "), (l.unit ?? "").trim().toLowerCase(), l.unit_cost].join("|");
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push({ ...l, times: 1 }); continue; }
    const o = out[i];
    o.times++;
    o.qty = o.qty !== null && l.qty !== null ? Math.round((o.qty + l.qty) * 1000) / 1000 : null;
  }
  return out;
}

/** The tax rate an invoice works out to (tax ÷ subtotal), when only amounts are printed — shown as worked out. */
export function taxRateFrom(subtotal: number | null | undefined, tax: number | null | undefined): number | null {
  if (!subtotal || !tax || subtotal <= 0 || tax <= 0 || tax >= subtotal) return null;
  return Math.round((tax / subtotal) * 10000) / 100;
}
