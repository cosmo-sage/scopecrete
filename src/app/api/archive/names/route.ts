import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanIds } from "@/lib/archive";

/**
 * The real names behind the ids in a Dusty plan (migration 066), so the card Coy
 * taps Apply on shows who and what it touches — never only Dusty's own label.
 * GET ?kind=contact|customer|job&ids=a,b,… → { names: { id: name } }. Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const kind = req.nextUrl.searchParams.get("kind");
  const ids = cleanIds((req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids || !["contact", "customer", "job"].includes(kind ?? "")) return applyCookies(NextResponse.json({ names: {} }));
  const names: Record<string, string> = {};
  if (kind === "contact") {
    const { data } = await sb.from("contacts").select("id, name, phone, contact_type").eq("org_id", orgId).in("id", ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>) names[c.id] = c.name?.trim() || c.phone || "unknown";
  } else if (kind === "customer") {
    const { data } = await sb.from("customers").select("id, name").eq("org_id", orgId).in("id", ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) names[c.id] = c.name || "unnamed customer";
  } else {
    const { data } = await sb.from("jobs").select("id, title").eq("org_id", orgId).in("id", ids);
    for (const j of (data ?? []) as Array<{ id: string; title: string | null }>) names[j.id] = j.title || "untitled job";
  }
  return applyCookies(NextResponse.json({ names }));
}
