import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Vendors on a job — subs, suppliers, equipment (job_vendors, migration 038).
 *
 * GET                                → { vendors: [{ contact_id, name, phone, role, note }] }
 * POST   { contact_id, role?, note? } → link (role defaults to their vendor subtype)
 * DELETE ?contact_id=…               → unlink
 *
 * Both the job and the contact must be this org's; org comes from the session.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("job_vendors")
    .select("contact_id, role, note, contacts(name, phone)").eq("org_id", orgId).eq("job_id", id);
  if (error) return applyCookies(NextResponse.json({ error: `job_vendors: ${error.message}` }, { status: 500 }));
  type Row = { contact_id: string; role: string | null; note: string | null; contacts: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null };
  return applyCookies(NextResponse.json({
    vendors: ((data ?? []) as unknown as Row[]).map((r) => {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      return { contact_id: r.contact_id, name: c?.name ?? null, phone: c?.phone ?? null, role: r.role, note: r.note };
    }),
  }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  const body = (await req.json().catch(() => ({}))) as { contact_id?: unknown; role?: unknown; note?: unknown };
  if (typeof body.contact_id !== "string") return applyCookies(NextResponse.json({ error: "contact_id is required." }, { status: 400 }));

  const [{ data: job }, { data: c }] = await Promise.all([
    supabase.from("jobs").select("id").eq("org_id", orgId).eq("id", id).is("archived_at", null).maybeSingle(),
    supabase.from("contacts").select("id, contact_subtype").eq("org_id", orgId).eq("id", body.contact_id).maybeSingle(),
  ]);
  if (!job) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));
  if (!c) return applyCookies(NextResponse.json({ error: "Contact not found." }, { status: 404 }));

  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim().slice(0, 60) : (c.contact_subtype as string | null);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const { error } = await supabase.from("job_vendors")
    .upsert({ org_id: orgId, job_id: id, contact_id: c.id, role, note, created_by: userId }, { onConflict: "job_id,contact_id" });
  if (error) return applyCookies(NextResponse.json({ error: `job_vendors: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }, { status: 201 }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const contactId = req.nextUrl.searchParams.get("contact_id");
  if (!contactId) return applyCookies(NextResponse.json({ error: "contact_id is required." }, { status: 400 }));
  const { error } = await supabase.from("job_vendors").delete().eq("org_id", orgId).eq("job_id", id).eq("contact_id", contactId);
  if (error) return applyCookies(NextResponse.json({ error: `job_vendors: ${error.message}` }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
