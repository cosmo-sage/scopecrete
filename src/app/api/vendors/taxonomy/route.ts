import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { readTaxonomy, saveTaxonomy } from "@/lib/vendor-taxonomy-server";
import { withVendorTrades } from "@/lib/vendor-taxonomy";

/**
 * Vendor kinds and their trades (Settings → Vendors; src/lib/vendor-taxonomy.ts).
 * GET → { kinds: [{slug, label, n}], trades: [{id?, name, kind, n}], missing }
 *   — trades include any typed on a vendor that the list doesn't have (no kind).
 * PUT { kinds?: [{slug?, label}], trades?: [{id?, name, kind}] } — the lists in order.
 *   Trades need migration 129.
 * Session client, org from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const [t, { data: vs }] = await Promise.all([
    readTaxonomy(supabase, orgId),
    supabase.from("contacts").select("contact_subtype, trades").eq("org_id", orgId).eq("contact_type", "vendor")
      .is("merged_into_contact_id", null).is("archived_at", null).limit(2000),
  ]);
  const vendors = (vs ?? []) as Array<{ contact_subtype: string | null; trades?: string[] | null }>;
  const kinds = t.kinds.map((k) => ({ ...k, n: vendors.filter((v) => v.contact_subtype === k.slug).length }));
  return applyCookies(NextResponse.json({ kinds, trades: withVendorTrades(t.trades, vendors), missing: t.missing }));
}

export async function PUT(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  let b: { kinds?: unknown; trades?: unknown };
  try { b = await req.json(); } catch { return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 })); }
  const r = await saveTaxonomy(supabase, orgId, b);
  if (!r.ok) return applyCookies(NextResponse.json({ error: r.error }, { status: r.status }));
  return applyCookies(NextResponse.json({ ok: true }));
}
