import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * One of a customer's people.
 * PATCH { role?, primary?: true } — their role ("Principal · signs off on
 *   work"); primary makes them the customer's first contact.
 * DELETE — take them off this customer: they get a customer of their own
 *   (sc_detach_contact), their own jobs go with them, and it can be undone.
 * Session client; org from the session; every id checked.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mine(req: NextRequest, customerId: string, contactId: string) {
  const result = await getApiSession(req);
  if (!result.ok) return { res: result.response } as const;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const { data } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("id", contactId).eq("customer_id", customerId).maybeSingle();
  if (!data) return { res: applyCookies(NextResponse.json({ error: "Not a contact of this customer." }, { status: 404 })) } as const;
  return { sb, orgId, applyCookies } as const;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ customerId: string; contactId: string }> }) {
  const { customerId, contactId } = await ctx.params;
  if (!UUID.test(customerId) || !UUID.test(contactId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const m = await mine(req, customerId, contactId);
  if ("res" in m) return m.res;
  const { sb, orgId, applyCookies } = m;
  const b = await req.json().catch(() => ({})) as { role?: unknown; primary?: unknown };
  if ("role" in b) {
    const role = typeof b.role === "string" && b.role.trim() ? b.role.trim().slice(0, 120) : null;
    const { error } = await sb.from("contacts").update({ role }).eq("org_id", orgId).eq("id", contactId);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  }
  if (b.primary === true) {
    // contacts_one_primary: clear the others first, then mark this one.
    const off = await sb.from("contacts").update({ is_primary: false }).eq("org_id", orgId).eq("customer_id", customerId).neq("id", contactId);
    if (off.error) return applyCookies(NextResponse.json({ error: off.error.message }, { status: 500 }));
    const on = await sb.from("contacts").update({ is_primary: true }).eq("org_id", orgId).eq("id", contactId);
    if (on.error) return applyCookies(NextResponse.json({ error: on.error.message }, { status: 500 }));
    const { error } = await sb.from("customers").update({ primary_contact_id: contactId, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", customerId);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  }
  return applyCookies(NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ customerId: string; contactId: string }> }) {
  const { customerId, contactId } = await ctx.params;
  if (!UUID.test(customerId) || !UUID.test(contactId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const m = await mine(req, customerId, contactId);
  if ("res" in m) return m.res;
  const { sb, applyCookies } = m;
  const { data, error } = await sb.rpc("sc_detach_contact", { p_contact: contactId });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ move_id: data ?? null }));
}
