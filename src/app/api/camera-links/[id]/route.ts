import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** PATCH { revoke: true } → a camera link turned off (migration 128). Session client; org from the session. */
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not a link id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const b = (await req.json().catch(() => null)) as { revoke?: unknown } | null;
  if (b?.revoke !== true) return json({ error: "Nothing to change." }, 400);
  const { data, error } = await sb.from("camera_links").update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("id", id).is("revoked_at", null).select("id");
  if (error) return json({ error: error.message }, 500);
  if (!data?.length) return json({ error: "Link not found." }, 404);
  return json({ ok: true });
}
