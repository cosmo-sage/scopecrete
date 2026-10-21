import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { isLayoutKey, withOrgLayout } from "@/lib/v34/layout";

/**
 * Coy's own settings that follow him across devices (migration 053): menu
 * order, dashboard tiles, Price book columns. Private to the person (RLS:
 * org member AND user_id = auth.uid()).
 *
 * GET              → { prefs }
 * PATCH { key, value } → sets one named setting; the others are kept.
 *
 * The layout keys (Work Spaces, shelves) a person hasn't set come from the org's layout
 * (migration 114, `org_layouts`); an owner's layout changes are written there too, so a new
 * teammate starts with the owner's layout. Before 114 the org read and write just fail quietly.
 */

export const dynamic = "force-dynamic";
const KEYS = new Set(["menus", "home", "pricebook_cols", "theme", "customers_view", "dusty_font", "thread_font", "activity_line", "activity_line_phone", "header_logo", "thread_colors", "rail_icons", "menu_colors", "map_provider", "new_nav", "spaces_folded", "shelves", "spaces_pins", "spaces_rail", "spaces_collections", "spaces_col_members"]);

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const [{ data }, org] = await Promise.all([
    supabase.from("user_preferences").select("prefs").eq("org_id", orgId).eq("user_id", userId).maybeSingle(),
    supabase.from("org_layouts").select("layout").eq("org_id", orgId).maybeSingle(),
  ]);
  const mine = (data?.prefs as Record<string, unknown>) ?? {};
  return applyCookies(NextResponse.json({ prefs: withOrgLayout(mine, org.error ? null : (org.data?.layout as Record<string, unknown> | undefined) ?? null) }));
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
  if (isLayoutKey(b.key)) {
    // An owner's layout is the org's (RLS refuses anyone else's; before 114 the table is missing).
    const { data: owner } = await supabase.from("org_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    if (owner?.role === "owner") {
      const { data: lay } = await supabase.from("org_layouts").select("layout").eq("org_id", orgId).maybeSingle();
      const layout = { ...((lay?.layout as Record<string, unknown>) ?? {}), [b.key]: b.value ?? null };
      await supabase.from("org_layouts").upsert({ org_id: orgId, layout, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    }
  }
  return applyCookies(NextResponse.json({ prefs }));
}
