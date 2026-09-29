import type { ApiSession } from "@/lib/api-auth";

/**
 * Vendor prices (migrations 051–052): one item, many vendors. Server side,
 * session client only — RLS on cost_items / cost_item_sources scopes every
 * read and write to the caller's org, and every function here also filters
 * by org explicitly.
 *
 * The item's own price fields follow its DEFAULT vendor's price (a database
 * trigger copies them), so the budget, the grid and history keep reading the
 * item. A price for a vendor is therefore always written to that vendor's
 * source row, never to the item, once the item has a default vendor.
 */

type Sb = ApiSession["supabase"];

export const SOURCE_COLUMNS = "id, cost_item_id, vendor_contact_id, unit_cost, vendor_sku, unit, price_as_of, price_source, price_file_id, price_import_id, import_id, tax_pct_seen, note, active, updated_at";

export interface SourceRow {
  id: string; cost_item_id: string; vendor_contact_id: string; unit_cost: number | null; vendor_sku: string | null;
  unit: string | null; price_as_of: string | null; price_source: string | null; price_file_id: string | null;
  price_import_id: string | null; import_id: string | null; tax_pct_seen: number | null; note: string | null; active: boolean;
}

const ITEM_PRICE = "id, unit_cost, vendor_contact_id, vendor_sku, price_as_of, price_source, price_file_id, price_import_id, default_source_id";

export interface PriceFields {
  unit_cost: number | null; vendor_sku?: string | null; unit?: string | null; price_as_of?: string | null;
  price_source?: string | null; price_file_id?: string | null; price_import_id?: string | null;
  import_id?: string | null; tax_pct_seen?: number | null; note?: string | null;
}

/** What a vendor-price write changed, so an import can be undone exactly. */
export interface SourceUndo {
  item_id: string; source_id: string; created: boolean;
  prev_source: Partial<SourceRow> | null;
  prev_item: Record<string, unknown>;
  default_changed: boolean;
}

export const numSource = <T extends Record<string, unknown>>(r: T): T & { id: string; unit_cost: number | null; tax_pct_seen: number | null } => ({
  ...r, unit_cost: r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost),
  tax_pct_seen: r.tax_pct_seen === null || r.tax_pct_seen === undefined ? null : Number(r.tax_pct_seen),
} as T & { id: string; unit_cost: number | null; tax_pct_seen: number | null });

/**
 * Set one vendor's price on one item: make their source row or update it,
 * and make them the default when asked — or when the item has no default yet
 * (its first vendor). Returns what was there before, for undo.
 */
export async function setVendorPrice(sb: Sb, orgId: string, itemId: string, vendorId: string, f: PriceFields, makeDefault: boolean | "if_none"):
  Promise<{ ok: true; source: SourceRow; undo: SourceUndo } | { ok: false; error: string }> {
  const { data: item } = await sb.from("cost_items").select(ITEM_PRICE).eq("org_id", orgId).eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "No such item." };
  const { data: cur } = await sb.from("cost_item_sources").select(SOURCE_COLUMNS).eq("org_id", orgId)
    .eq("cost_item_id", itemId).eq("vendor_contact_id", vendorId).maybeSingle();
  const fields: Record<string, unknown> = { unit_cost: f.unit_cost, active: true, updated_at: new Date().toISOString() };
  for (const k of ["vendor_sku", "unit", "price_as_of", "price_source", "price_file_id", "price_import_id", "tax_pct_seen", "note"] as const) {
    if (f[k] !== undefined) fields[k] = f[k];
  }
  let source: SourceRow;
  if (cur) {
    // An item # or unit not on this document keeps the one on record.
    if (f.vendor_sku === null) delete fields.vendor_sku;
    if (f.unit === null) delete fields.unit;
    const { data, error } = await sb.from("cost_item_sources").update(fields).eq("org_id", orgId).eq("id", cur.id).select(SOURCE_COLUMNS).single();
    if (error || !data) return { ok: false, error: error?.message ?? "not saved" };
    source = data as SourceRow;
  } else {
    const { data, error } = await sb.from("cost_item_sources").insert({
      ...fields, org_id: orgId, cost_item_id: itemId, vendor_contact_id: vendorId, import_id: f.import_id ?? null,
    }).select(SOURCE_COLUMNS).single();
    if (error || !data) return { ok: false, error: error?.message ?? "not saved" };
    source = data as SourceRow;
  }
  const wantDefault = makeDefault === true || (makeDefault === "if_none" && !item.default_source_id);
  let defaultChanged = false;
  if (wantDefault && item.default_source_id !== source.id) {
    const { error } = await sb.from("cost_items").update({ default_source_id: source.id, updated_at: new Date().toISOString() })
      .eq("org_id", orgId).eq("id", itemId);
    if (error) return { ok: false, error: error.message };
    defaultChanged = true;
  }
  return {
    ok: true, source,
    undo: { item_id: itemId, source_id: source.id, created: !cur, prev_source: cur ? (cur as Partial<SourceRow>) : null, prev_item: item as Record<string, unknown>, default_changed: defaultChanged },
  };
}

/**
 * Put back what setVendorPrice did — only while the source still carries the
 * price it wrote (`stampedImport`); one Coy changed since is left alone.
 * Returns "restored" | "removed" | "kept".
 */
export async function undoVendorPrice(sb: Sb, orgId: string, u: SourceUndo, stampedImport: string): Promise<"restored" | "removed" | "kept"> {
  const { data: s } = await sb.from("cost_item_sources").select(SOURCE_COLUMNS).eq("org_id", orgId).eq("id", u.source_id).maybeSingle();
  if (!s || s.price_import_id !== stampedImport) return "kept";
  const now = new Date().toISOString();
  const prevItem = u.prev_item as { default_source_id: string | null } & Record<string, unknown>;
  // The default first: back to the vendor before, or to the item's own price.
  if (u.default_changed) {
    if (prevItem.default_source_id) {
      await sb.from("cost_items").update({ default_source_id: prevItem.default_source_id, updated_at: now }).eq("org_id", orgId).eq("id", u.item_id);
    } else {
      const { id: _id, default_source_id: _d, ...own } = prevItem;
      void _id; void _d;
      await sb.from("cost_items").update({ ...own, default_source_id: null, updated_at: now }).eq("org_id", orgId).eq("id", u.item_id);
    }
  }
  if (u.created) {
    await sb.from("cost_item_sources").delete().eq("org_id", orgId).eq("id", u.source_id);
    return "removed";
  }
  const p = u.prev_source ?? {};
  await sb.from("cost_item_sources").update({
    unit_cost: p.unit_cost ?? null, vendor_sku: p.vendor_sku ?? null, unit: p.unit ?? null, price_as_of: p.price_as_of ?? null,
    price_source: p.price_source ?? null, price_file_id: p.price_file_id ?? null, price_import_id: p.price_import_id ?? null,
    tax_pct_seen: p.tax_pct_seen ?? null, updated_at: now,
  }).eq("org_id", orgId).eq("id", u.source_id);
  return "restored";
}

/** Every vendor's price for these items, with the vendor's name and area — cheapest first. */
export async function sourcesFor(sb: Sb, orgId: string, itemIds: string[]) {
  if (!itemIds.length) return [];
  const { data } = await sb.from("cost_item_sources")
    .select(`${SOURCE_COLUMNS}, vendor:contacts!cost_item_sources_vendor_contact_id_fkey(id, name, company_name, service_area, phone)`)
    .eq("org_id", orgId).in("cost_item_id", itemIds.slice(0, 1000)).eq("active", true);
  return ((data ?? []) as Array<Record<string, unknown>>).map(numSource)
    .sort((a, b) => (a.unit_cost ?? Infinity) - (b.unit_cost ?? Infinity));
}

/** "+1 225-665-6103" style phone for a new contact: E.164 for US numbers, as intake keys them. */
export function e164(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
