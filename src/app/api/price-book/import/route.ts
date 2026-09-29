import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanCard, defaultTaxable, type CostType } from "@/lib/cost-cards";

/**
 * Price book imports (migration 049).
 *
 * GET  → the last 10 imports, newest first, with whether each can still be undone.
 * POST { kind: csv|xlsx|vendor_quote, file_name, source, source_file_id?,
 *        vendor_contact_id?, unchanged, skipped,
 *        rows: [{ action: "new", card fields…, group? }
 *             | { action: "change", card_id, unit_cost }] }
 *
 * The browser parsed the file and Coy confirmed the preview; this writes only
 * what he ticked. New cards carry the import's id (so it can be undone); a
 * changed card gets only its new price — Coy's markup, rule and group stay —
 * stamped with the import, which the history trigger records. A group named
 * in the file that doesn't exist is made. No contact is ever made: a vendor
 * is one of the org's contacts or none.
 *
 * Session client, org from the session (DECISIONS §7); every card, group,
 * vendor and file id the browser names is checked against this org.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 2000;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("cost_imports")
    .select("id, kind, file_name, source, vendor_contact_id, created_count, updated_count, unchanged_count, skipped_count, created_at, undone_at")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(10);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ imports: data ?? [] }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }

  const kind = String(b.kind ?? "");
  if (!["csv", "xlsx", "vendor_quote"].includes(kind)) return bad("Unknown import kind.");
  const rows = Array.isArray(b.rows) ? (b.rows as Array<Record<string, unknown>>) : [];
  if (!rows.length) return bad("Nothing ticked to import.");
  if (rows.length > MAX_ROWS) return bad(`At most ${MAX_ROWS} rows in one import.`);
  const quote = kind === "vendor_quote";
  const priceSource = quote ? "quote" : "import";
  const today = new Date().toISOString().slice(0, 10);
  const fileId = typeof b.source_file_id === "string" && UUID.test(b.source_file_id) ? b.source_file_id : null;
  const importVendor = typeof b.vendor_contact_id === "string" && UUID.test(b.vendor_contact_id) ? b.vendor_contact_id : null;

  // ---- check every id the browser named belongs to this org
  const vendorIds = new Set<string>(importVendor ? [importVendor] : []);
  const cardIds = new Set<string>();
  for (const r of rows) {
    if (typeof r.vendor_contact_id === "string" && r.vendor_contact_id) vendorIds.add(r.vendor_contact_id);
    if (r.action === "change") {
      if (typeof r.card_id !== "string" || !UUID.test(r.card_id)) return bad("A price change names no card.");
      cardIds.add(r.card_id);
    }
  }
  if ([...vendorIds].some((v) => !UUID.test(v))) return bad("Bad vendor.");
  const [vend, cards, groups, file] = await Promise.all([
    vendorIds.size ? supabase.from("contacts").select("id").eq("org_id", orgId).in("id", [...vendorIds]) : Promise.resolve({ data: [] }),
    cardIds.size ? supabase.from("cost_items").select("id").eq("org_id", orgId).in("id", [...cardIds]) : Promise.resolve({ data: [] }),
    supabase.from("cost_groups").select("id, name").eq("org_id", orgId),
    fileId ? supabase.from("job_files").select("id").eq("org_id", orgId).eq("id", fileId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if ((vend.data ?? []).length !== vendorIds.size) return bad("A vendor isn't one of yours.", 404);
  if ((cards.data ?? []).length !== cardIds.size) return bad("A card isn't one of yours.", 404);
  if (fileId && !file.data) return bad("No such file.", 404);

  // ---- clean every new card before writing anything
  const groupId = new Map<string, string>(((groups.data ?? []) as Array<{ id: string; name: string }>).map((g) => [g.name.trim().toLowerCase(), g.id]));
  const toMake = new Map<string, string>(); // group name → its first card's cost type
  const fresh: Array<{ card: Record<string, unknown>; group: string | null }> = [];
  const changes: Array<{ id: string; unit_cost: number }> = [];
  for (const r of rows) {
    if (r.action === "change") {
      const n = Number(r.unit_cost);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return bad("A new price must be a number.");
      changes.push({ id: r.card_id as string, unit_cost: n });
      continue;
    }
    if (r.action !== "new") return bad("Each row is new or a price change.");
    const c = cleanCard({ ...r, cost_group_id: null, price_as_of: r.unit_cost === null || r.unit_cost === undefined || r.unit_cost === "" ? null : today, price_source: priceSource });
    if (!c.ok) return bad(`${typeof r.name === "string" ? r.name : "A row"}: ${c.error}`);
    if (c.card.taxable === undefined) c.card.taxable = defaultTaxable(c.card.cost_type as CostType);
    if (!c.card.vendor_contact_id && importVendor) c.card.vendor_contact_id = importVendor;
    const g = typeof r.group === "string" && r.group.trim() ? r.group.trim().slice(0, 60) : null;
    if (g && !groupId.has(g.toLowerCase()) && ![...toMake.keys()].some((k) => k.toLowerCase() === g.toLowerCase())) toMake.set(g, c.card.cost_type as string);
    fresh.push({ card: c.card as Record<string, unknown>, group: g });
  }

  // ---- the import row, then groups, then cards
  const { data: imp, error: impErr } = await supabase.from("cost_imports").insert({
    org_id: orgId, kind, file_name: typeof b.file_name === "string" ? b.file_name.slice(0, 200) : null,
    source: typeof b.source === "string" ? b.source.slice(0, 60) : null, vendor_contact_id: importVendor, source_file_id: fileId,
    created_count: fresh.length, updated_count: changes.length,
    unchanged_count: Math.max(0, Number(b.unchanged) || 0), skipped_count: Math.max(0, Number(b.skipped) || 0),
  }).select("id").single();
  if (impErr || !imp) return bad(`Couldn't start the import: ${impErr?.message ?? "no row"}`, 500);

  if (toMake.size) {
    const { data: made, error } = await supabase.from("cost_groups")
      .insert([...toMake].map(([name, cost_type], i) => ({ org_id: orgId, name, cost_type, sort_order: 100 + i }))).select("id, name");
    if (error) return bad(`Couldn't make the groups: ${error.message}`, 500);
    for (const g of (made ?? []) as Array<{ id: string; name: string }>) groupId.set(g.name.trim().toLowerCase(), g.id);
  }

  if (fresh.length) {
    const { error } = await supabase.from("cost_items").insert(fresh.map((f, i) => ({
      ...f.card, org_id: orgId, cost_group_id: f.group ? groupId.get(f.group.toLowerCase()) ?? null : null,
      import_id: imp.id, price_import_id: f.card.unit_cost === null ? null : imp.id, price_file_id: fileId, sort_order: i,
    })));
    if (error) return bad(`Couldn't add the cards: ${error.message}`, 500);
  }
  const now = new Date().toISOString();
  for (const c of changes) {
    const { error } = await supabase.from("cost_items").update({
      unit_cost: c.unit_cost, price_as_of: today, price_source: priceSource, price_import_id: imp.id, price_file_id: fileId, updated_at: now,
    }).eq("org_id", orgId).eq("id", c.id);
    if (error) return bad(`Couldn't update a price: ${error.message}`, 500);
  }
  return applyCookies(NextResponse.json({ import: { id: imp.id, created: fresh.length, updated: changes.length, groups: toMake.size } }, { status: 201 }));
}
