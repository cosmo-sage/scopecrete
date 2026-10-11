import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/** One email draft (migration 100): GET it, DELETE it. Session client; org from the session. */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "No such draft." }, { status: 404 }));
  const { data } = await supabase.from("email_drafts")
    .select("id, conversation, reply_to_email_id, mode, to_addresses, cc_addresses, subject, body, file_ids, by, contact_id, customer_id, job_id, updated_at")
    .eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data) return applyCookies(NextResponse.json({ error: "No such draft." }, { status: 404 }));
  return applyCookies(NextResponse.json({ draft: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "No such draft." }, { status: 404 }));
  const { error } = await supabase.from("email_drafts").delete().eq("org_id", orgId).eq("id", id);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
