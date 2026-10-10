import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { isOwner } from "@/lib/org-server";
import { matchAddress } from "@/lib/address-server";
import { cleanRadius, readOffice } from "@/lib/map";

/**
 * The org's office and service radius (migration 098; Coy, 2026-10-10: "set my
 * office location in the settings of my organization … centered on the office
 * with a radius of … 80 miles").
 *
 * GET    → { ready, office: Office | null, can_edit } — ready false before 098.
 * PATCH  { address, lat?, lng?, radius_mi } → { office } — owners only (RLS:
 *        get_user_owner_org_ids). With no point (typed, not picked from the
 *        list) the address is placed by Mapbox; no match → 400.
 * DELETE → { office: null } — owners only.
 *
 * Session client; the org comes from the session (DECISIONS §7).
 */

export const dynamic = "force-dynamic";

const COLS = "address, lat, lng, radius_mi";
const missing = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const [{ data, error }, owner] = await Promise.all([
    supabase.from("org_office").select(COLS).eq("org_id", orgId).maybeSingle(),
    isOwner(supabase, orgId, userId),
  ]);
  if (missing(error)) return applyCookies(NextResponse.json({ ready: false, office: null, can_edit: owner }));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ready: true, office: readOffice(data), can_edit: owner }));
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, status = 400) => applyCookies(NextResponse.json({ error: m }, { status }));
  if (!(await isOwner(supabase, orgId, userId))) return bad("Only an owner can set the office.", 403);
  const body = await req.json().catch(() => ({}));
  const address = typeof body?.address === "string" ? body.address.trim().slice(0, 300) : "";
  if (address.length < 3) return bad("Type the office's address.");
  const radius = cleanRadius(body?.radius_mi);
  if (!radius.ok) return bad(radius.error);
  let lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  let lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
  let label = address;
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    const m = await matchAddress(address);
    if (!m) return bad("The map couldn't find that address — pick it from the list as you type.");
    lat = m.lat; lng = m.lng; label = m.formatted || address;
  }
  const { data, error } = await supabase.from("org_office")
    .upsert({ org_id: orgId, address: label, lat, lng, radius_mi: radius.mi, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "org_id" })
    .select(COLS).single();
  if (missing(error)) return bad("The office waits for migration 098.", 409);
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ office: readOffice(data) }));
}

export async function DELETE(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  if (!(await isOwner(supabase, orgId, userId))) return applyCookies(NextResponse.json({ error: "Only an owner can remove the office." }, { status: 403 }));
  const { error } = await supabase.from("org_office").delete().eq("org_id", orgId);
  if (error && !missing(error)) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ office: null }));
}
