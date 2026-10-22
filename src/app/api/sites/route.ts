import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { reverseAddress } from "@/lib/aerial-server";
import { SITE_COLUMNS, WAITING_113, missing113, siteOut } from "@/lib/capture-server";

/**
 * Sites (migration 113; Coy, 2026-10-15: "I can map cam and zoom into the
 * address, and it automatically creates a project from that with that
 * address … I can add a name or not"). A site is an address, its pin, an
 * optional name and the photos taken there — never a job, never counted.
 *
 * GET              → { sites } (not archived, newest first) with each one's shot count and newest thumbnail path
 * POST { lat, lng, address?, name? } → { site }. No address given: the street at the
 *                   pin, by Mapbox reverse geocoding; none found leaves it blank.
 *
 * Session client; org from the session (DECISIONS §7). Before 113: 503.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("sites").select(SITE_COLUMNS).eq("org_id", orgId).is("archived_at", null)
    .order("updated_at", { ascending: false }).limit(200);
  if (missing113(error)) return applyCookies(NextResponse.json({ sites: [], waiting: true, error: WAITING_113 }));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = rows.map((s) => s.id as string);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: shots } = await supabase.from("files").select("site_id").eq("org_id", orgId).in("site_id", ids).is("deleted_at", null).limit(5000);
    for (const r of (shots ?? []) as Array<{ site_id: string }>) counts.set(r.site_id, (counts.get(r.site_id) ?? 0) + 1);
  }
  const jobIds = [...new Set(rows.map((s) => s.job_id as string | null).filter(Boolean))] as string[];
  const titles = new Map<string, string>();
  if (jobIds.length) {
    const { data: js } = await supabase.from("jobs").select("id, title").eq("org_id", orgId).in("id", jobIds);
    for (const j of js ?? []) titles.set(j.id as string, (j.title as string) || "Untitled job");
  }
  return applyCookies(NextResponse.json({ sites: rows.map((s) => siteOut(s, {
    shots: counts.get(s.id as string) ?? 0, job_title: s.job_id ? titles.get(s.job_id as string) ?? null : null,
  })) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return bad("Drop the pin on the map first.");
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : null;
  let address = typeof b.address === "string" && b.address.trim() ? b.address.trim().slice(0, 200) : null;
  if (!address) address = (await reverseAddress(lat, lng))?.slice(0, 200) ?? null;
  const { data, error } = await supabase.from("sites").insert({ org_id: orgId, lat, lng, name, address, created_by: userId })
    .select(SITE_COLUMNS).single();
  if (missing113(error)) return bad(WAITING_113, 503);
  if (error || !data) return bad(`Couldn't make the site: ${error?.message ?? "no row"}`, 500);
  return applyCookies(NextResponse.json({ site: siteOut(data as Record<string, unknown>, { shots: 0 }) }, { status: 201 }));
}
