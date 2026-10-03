import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { SOURCE_COLUMNS, e164, numSource } from "@/lib/sources-server";

/**
 * One vendor's page (migration 051).
 *
 * GET   → { vendor, prices, files, jobs, messages }
 *   prices: every item this vendor prices — their price, date, where it came
 *   from, and whether they are that item's default (the price budgets use),
 *   with the cheapest other vendor for comparison.
 * PATCH { name?, phone?, email?, address?, service_area?, subtype? }
 *
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const COLS = "id, name, company_name, contact_subtype, contact_type, phone, email, address, service_area, classification_confirmed_at, auto_classified_at, status_summary";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: v } = await supabase.from("contacts").select(COLS).eq("org_id", orgId).eq("id", id).is("merged_into_contact_id", null).maybeSingle();
  if (!v) return applyCookies(NextResponse.json({ error: "No such vendor." }, { status: 404 }));

  const [{ data: src }, { data: files }, { data: jobs }, { count: messages }] = await Promise.all([
    supabase.from("cost_item_sources")
      .select(`${SOURCE_COLUMNS}, item:cost_items!cost_item_sources_cost_item_id_fkey(id, name, unit, cost_type, cost_group_id, default_source_id, active)`)
      .eq("org_id", orgId).eq("vendor_contact_id", id).eq("active", true).limit(2000),
    supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).eq("contact_id", id).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("job_vendors").select("role, job:jobs!inner(id, title, status, address, archived_at)").eq("org_id", orgId).eq("contact_id", id).limit(100),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("contact_id", id),
  ]);
  type Item = { id: string; name: string; unit: string | null; cost_type: string; cost_group_id: string | null; default_source_id: string | null; active: boolean };
  const rows = ((src ?? []) as Array<Record<string, unknown>>).map(numSource) as Array<ReturnType<typeof numSource> & { item: Item | null }>;
  const itemIds = rows.map((r) => r.item?.id).filter((x): x is string => !!x);
  // The cheapest other vendor on each item, for comparison.
  const best = new Map<string, { unit_cost: number; vendor: string | null }>();
  if (itemIds.length) {
    const { data: others } = await supabase.from("cost_item_sources")
      .select("cost_item_id, unit_cost, vendor:contacts!cost_item_sources_vendor_contact_id_fkey(name)")
      .eq("org_id", orgId).in("cost_item_id", itemIds.slice(0, 1000)).neq("vendor_contact_id", id).eq("active", true).not("unit_cost", "is", null);
    for (const o of (others ?? []) as unknown as Array<{ cost_item_id: string; unit_cost: number; vendor: { name: string | null } | null }>) {
      const n = Number(o.unit_cost);
      const cur = best.get(o.cost_item_id);
      if (!cur || n < cur.unit_cost) best.set(o.cost_item_id, { unit_cost: n, vendor: o.vendor?.name ?? null });
    }
  }
  const prices = rows.filter((r) => r.item && r.item.active).map((r) => ({
    ...r, is_default: r.item!.default_source_id === r.id, cheapest_other: best.get(r.item!.id) ?? null,
  })).sort((a, b) => a.item!.name.localeCompare(b.item!.name));
  return applyCookies(NextResponse.json({
    vendor: { ...v, subtype: v.contact_subtype, auto: !v.classification_confirmed_at && !!v.auto_classified_at },
    prices,
    files: await signFiles(supabase, (files ?? []) as Array<Record<string, unknown>>),
    jobs: ((jobs ?? []) as unknown as Array<{ role: string | null; job: Record<string, unknown> }>).filter((j) => !j.job.archived_at).map((j) => ({ ...j.job, role: j.role })),
    messages: messages ?? 0,
  }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: v } = await supabase.from("contacts").select("id, contact_type").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!v) return bad("No such vendor.", 404);
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.replace(/\s+/g, " ").trim().slice(0, max) : null);
  const patch: Record<string, unknown> = {};
  if ("name" in b) {
    const n = text(b.name, 120);
    if (!n) return bad("A vendor needs a name.");
    Object.assign(patch, { name: n, name_source: "human", name_confirmed_at: new Date().toISOString(), name_confirmed_by: userId });
  }
  if ("phone" in b) {
    const raw = text(b.phone, 40);
    const p = raw ? e164(raw) : null;
    if (raw && !p) return bad("That phone number doesn't look like a US number.");
    if (p) {
      const { data: hit } = await supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("phone", p).neq("id", id).maybeSingle();
      if (hit) return bad(`That number is already ${hit.name ?? "another contact"} — use Same person as… on their page.`, 409);
    }
    patch.phone = p;
  }
  if ("email" in b) {
    const e = text(b.email, 120)?.toLowerCase() ?? null;
    if (e && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) return bad("That email doesn't look right.");
    if (e) {
      const { data: hit } = await supabase.from("contacts").select("id, name").eq("org_id", orgId).eq("email", e).neq("id", id).maybeSingle();
      if (hit) return bad(`That email is already ${hit.name ?? "another contact"}.`, 409);
    }
    patch.email = e;
  }
  if ("address" in b) patch.address = text(b.address, 200);
  if ("service_area" in b) patch.service_area = text(b.service_area, 120);
  if ("company_name" in b) patch.company_name = text(b.company_name, 120);
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("contacts").update(patch).eq("org_id", orgId).eq("id", id);
    if (error) return bad(error.message, 500);
  }
  if ("subtype" in b && v.contact_type === "vendor") {
    const { error } = await supabase.rpc("sc_classify_contact", { p_contact: id, p_bucket: "vendor", p_subtype: text(b.subtype, 40) });
    if (error) return bad(error.message, 500);
  } else if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data } = await supabase.from("contacts").select(COLS).eq("org_id", orgId).eq("id", id).single();
  return applyCookies(NextResponse.json({ vendor: data }));
}
