import type { ApiSession } from "@/lib/api-auth";
import { DEFAULT_KINDS, cleanKinds, cleanTradeList, defaultTrades, renameOnVendor, taxonomyLines, type Kind, type Trade } from "@/lib/vendor-taxonomy";

/**
 * The org's vendor kinds and trades (src/lib/vendor-taxonomy.ts), read and saved under the
 * session — RLS by get_user_org_ids() on both tables. Trades need migration 129; before it the
 * app's own list is shown and saving trades says so.
 */
type Sb = ApiSession["supabase"];

export const TRADES_MISSING = "Editing trades needs migration 129 — say \"apply 129\".";
export const missing129 = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204"
    || /org_vendor_trades|is_1099|w9_requested_at|job_files_category_check/.test(e.message ?? ""));

export interface Taxonomy { kinds: Kind[]; trades: Trade[]; missing: string | null }

export async function readTaxonomy(supabase: Sb, orgId: string): Promise<Taxonomy> {
  const [{ data: ks }, tr] = await Promise.all([
    supabase.from("org_contact_subtypes").select("slug, label, sort_order").eq("org_id", orgId).eq("bucket", "vendor").eq("active", true).order("sort_order"),
    supabase.from("org_vendor_trades").select("id, name, kind, sort_order").eq("org_id", orgId).order("sort_order").order("name"),
  ]);
  const kinds = (ks ?? []).length ? (ks as Array<{ slug: string; label: string }>).map((k) => ({ slug: k.slug, label: k.label })) : DEFAULT_KINDS;
  if (tr.error) return { kinds, trades: defaultTrades(), missing: missing129(tr.error) ? TRADES_MISSING : tr.error.message };
  const rows = (tr.data ?? []) as Array<{ id: string; name: string; kind: string | null }>;
  return { kinds, trades: rows.length ? rows.map((t) => ({ id: t.id, name: t.name, kind: t.kind })) : defaultTrades(), missing: null };
}

/**
 * Save the editor's lists. Kinds: labels and order written, new ones added, ones left out
 * switched off (refused while a vendor is filed under it). Trades: the list replaced; a trade
 * renamed (same id, new name) is renamed on every vendor carrying it, and one removed is taken off them.
 */
export async function saveTaxonomy(supabase: Sb, orgId: string, body: { kinds?: unknown; trades?: unknown }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
  const { data: have } = await supabase.from("org_contact_subtypes").select("id, slug, label, active").eq("org_id", orgId).eq("bucket", "vendor");
  const rows = (have ?? []) as Array<{ id: string; slug: string; label: string; active: boolean }>;
  let slugs = rows.filter((r) => r.active).map((r) => r.slug);
  if (!slugs.length) slugs = DEFAULT_KINDS.map((k) => k.slug);

  if (body.kinds !== undefined) {
    const kinds = cleanKinds(body.kinds);
    if (!kinds.length) return fail("Keep at least one kind.");
    const keep = new Set(kinds.map((k) => k.slug));
    const dropping = (rows.length ? rows.filter((r) => r.active) : DEFAULT_KINDS.map((k) => ({ slug: k.slug }))).filter((r) => !keep.has(r.slug)).map((r) => r.slug);
    if (dropping.length) {
      const { data: used } = await supabase.from("contacts").select("contact_subtype").eq("org_id", orgId).eq("contact_type", "vendor")
        .in("contact_subtype", dropping).is("merged_into_contact_id", null).limit(500);
      const n = new Map<string, number>();
      for (const u of (used ?? []) as Array<{ contact_subtype: string }>) n.set(u.contact_subtype, (n.get(u.contact_subtype) ?? 0) + 1);
      const busy = dropping.filter((s) => n.get(s));
      if (busy.length) {
        const name = (s: string) => rows.find((r) => r.slug === s)?.label ?? DEFAULT_KINDS.find((k) => k.slug === s)?.label ?? s;
        return fail(`${busy.map((s) => `${name(s)} has ${n.get(s)} vendor${n.get(s) === 1 ? "" : "s"}`).join("; ")} — move them to another kind first.`, 409);
      }
    }
    // An org with no rows of its own starts from the defaults, so a slug the editor kept is upserted.
    const upserts = kinds.map((k, i) => ({ org_id: orgId, bucket: "vendor", slug: k.slug, label: k.label, sort_order: (i + 1) * 10, active: true }));
    const { error } = await supabase.from("org_contact_subtypes").upsert(upserts, { onConflict: "org_id,bucket,slug" });
    if (error) return fail(error.message, 500);
    if (dropping.length) {
      const known = rows.filter((r) => dropping.includes(r.slug)).map((r) => r.slug);
      if (known.length) await supabase.from("org_contact_subtypes").update({ active: false }).eq("org_id", orgId).eq("bucket", "vendor").in("slug", known);
    }
    slugs = kinds.map((k) => k.slug);
  }

  if (body.trades !== undefined) {
    const trades = cleanTradeList(body.trades, slugs);
    const { data: cur, error: rErr } = await supabase.from("org_vendor_trades").select("id, name").eq("org_id", orgId);
    if (rErr) return missing129(rErr) ? fail(TRADES_MISSING, 503) : fail(rErr.message, 500);
    const old = (cur ?? []) as Array<{ id: string; name: string }>;
    const byId = new Map(old.map((t) => [t.id, t.name]));
    const renames: Array<[string, string | null]> = [];
    for (const t of trades) if (t.id && byId.has(t.id) && byId.get(t.id)!.toLowerCase() !== t.name.toLowerCase()) renames.push([byId.get(t.id)!, t.name]);
    const keptIds = new Set(trades.filter((t) => t.id).map((t) => t.id));
    const keptNames = new Set(trades.map((t) => t.name.toLowerCase()));
    for (const t of old) if (!keptIds.has(t.id) && !keptNames.has(t.name.toLowerCase())) renames.push([t.name, null]);

    // Replace the list: delete what went, then write each in its order.
    const gone = old.filter((t) => !keptIds.has(t.id)).map((t) => t.id);
    if (gone.length) {
      const { error } = await supabase.from("org_vendor_trades").delete().eq("org_id", orgId).in("id", gone);
      if (error) return fail(error.message, 500);
    }
    for (const [i, t] of trades.entries()) {
      const row = { org_id: orgId, name: t.name, kind: t.kind, sort_order: (i + 1) * 10 };
      const { error } = t.id && byId.has(t.id)
        ? await supabase.from("org_vendor_trades").update(row).eq("org_id", orgId).eq("id", t.id)
        : await supabase.from("org_vendor_trades").insert(row);
      if (error) return fail(error.message, 500);
    }

    // Carry renames and removals onto the vendors.
    for (const [from, to] of renames) {
      const { data: vs } = await supabase.from("contacts").select("id, trades").eq("org_id", orgId).contains("trades", [from]).limit(500);
      for (const v of (vs ?? []) as Array<{ id: string; trades: string[] | null }>)
        await supabase.from("contacts").update({ trades: renameOnVendor(v.trades, from, to) }).eq("org_id", orgId).eq("id", v.id);
    }
  }
  return { ok: true };
}

/**
 * Coy's vendors as Dusty is told them when he is asked about one (Coy, 2026-10-24: "so that dusty can
 * find the correct vendor easily"): the org's kinds and trades, then each vendor under their kind with
 * their trades and whether they get a 1099.
 */
export async function vendorDirectory(supabase: Sb, orgId: string): Promise<string> {
  const tax = await readTaxonomy(supabase, orgId);
  const cols = "name, company_name, contact_subtype, trades, service_area";
  type V = { name: string | null; company_name: string | null; contact_subtype: string | null; trades?: string[] | null; service_area: string | null; is_1099?: boolean | null };
  const q = (c: string) => supabase.from("contacts").select(c).eq("org_id", orgId).eq("contact_type", "vendor")
    .is("merged_into_contact_id", null).is("archived_at", null).limit(300);
  let r = await q(`${cols}, is_1099`);
  if (r.error) r = await q(cols);
  if (r.error) r = await q("name, company_name, contact_subtype, service_area");
  const vs = ((r.data ?? []) as unknown as V[]);
  const label = (s: string | null) => tax.kinds.find((k) => k.slug === s)?.label ?? s ?? "No kind";
  const lines = ["## YOUR VENDORS BY KIND AND TRADE (Settings → Vendors; match a request to a trade, then a kind)",
    "Kinds and their trades:", ...taxonomyLines(tax.kinds, tax.trades).map((l) => `- ${l}`)];
  const byKind = new Map<string, V[]>();
  for (const v of vs) { const k = label(v.contact_subtype); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k)!.push(v); }
  for (const [k, list] of byKind) {
    lines.push(`${k}:`);
    for (const v of list) lines.push(`- ${v.company_name || v.name || "Unnamed"}${(v.trades ?? []).length ? ` — ${(v.trades ?? []).join(", ")}` : ""}${v.service_area ? ` · works ${v.service_area}` : ""}${v.is_1099 ? " · 1099" : ""}`);
  }
  if (!vs.length) lines.push("No vendors on file yet.");
  return lines.join("\n");
}
