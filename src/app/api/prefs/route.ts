import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Coy's own settings that follow him across devices (migration 053): menu
 * order, dashboard tiles, Price book columns. Private to the person (RLS:
 * org member AND user_id = auth.uid()).
 *
 * GET              → { prefs }
 * PATCH { key, value } → sets one named setting; the others are kept.
 */

export const dynamic = "force-dynamic";
const KEYS = new Set(["menus", "home", "pricebook_cols", "theme", "customers_view"]);

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const { data } = await supabase.from("user_preferences").select("prefs").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  return applyCookies(NextResponse.json({ prefs: (data?.prefs as Record<string, unknown>) ?? {} }));
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: { key?: unknown; value?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if (typeof b.key !== "string" || !KEYS.has(b.key)) return bad("Unknown setting.");
  if (JSON.stringify(b.value ?? null).length > 20_000) return bad("That setting is too big.");
  const { data: cur } = await supabase.from("user_preferences").select("prefs").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const prefs = { ...((cur?.prefs as Record<string, unknown>) ?? {}), [b.key]: b.value ?? null };
  const { error } = await supabase.from("user_preferences")
    .upsert({ org_id: orgId, user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: "org_id,user_id" });
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ prefs }));
}
