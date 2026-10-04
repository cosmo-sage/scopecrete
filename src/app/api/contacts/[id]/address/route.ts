import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { formatAddress } from "@/lib/customers-server";

/**
 * A person's own address (migration 072), set by Coy — typed, or a Dusty plan he
 * applied. Kept as written; `address_source='coy'`. A blank street clears it.
 *
 * PATCH { address_line1, city?, state?, zip? } → { ok, address }
 *
 * Session client; org from the session; the contact checked against it (DECISIONS §7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not a contact id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
  const line1 = text(b.address_line1, 160), city = text(b.city, 80), state = text(b.state, 30), zip = text(b.zip, 10);
  const { data: c } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!c) return bad("Contact not found.", 404);
  const address = line1 ? formatAddress(line1, city, state, zip) : null;
  const { error } = await sb.from("contacts").update({
    address, city: line1 ? city : null, state: line1 ? state : null, zip: line1 ? zip : null,
    address_source: address ? "coy" : null, address_heard_at: null, updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("id", id);
  if (error) return bad(error.message, 500);
  return applyCookies(NextResponse.json({ ok: true, address }));
}
