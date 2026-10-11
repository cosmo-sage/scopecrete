import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { EMAIL_COLS, emailView, fileEmail, type FilingRow } from "@/lib/emails-server";

/**
 * One mirrored email (migration 061).
 *
 * GET → { email (with its text), attachments (each with its file, signed),
 *         options: { customers, jobs } for filing, person_emails — the
 *         addresses on the person it's filed on }.
 * PATCH { customer_id?, contact_id?, job_id?, accept_suggestion? } — Coy's
 *   filing (match 'coy'). Filed on a customer with no person (or a person
 *   from another customer), it goes on the customer's primary person, so it
 *   shows in their Email channel (the email design, 2026-10-05). Filing on a job moves the email's files onto that job
 *   and turns In plan room on for its PDFs; all three null puts it back to
 *   unfiled (Undo). Filing a quarantined email releases its held files (the
 *   function fetches them within five minutes). Nothing here creates a contact.
 *
 * Session client; org from the session; every id checked against the org.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "No such email." }, { status: 404 }));
  const { data: row } = await supabase.from("emails").select(`${EMAIL_COLS}, text_body`).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!row) return applyCookies(NextResponse.json({ error: "No such email." }, { status: 404 }));
  const [[email], { data: atts }, { data: files }, { data: custs }, { data: jobs }] = await Promise.all([
    emailView(supabase, orgId, [row as Record<string, unknown>]),
    supabase.from("email_attachments").select("id, name, mime_type, byte_size, inline, file_id, fetch_state, fetch_error, attempts").eq("org_id", orgId).eq("email_id", id).order("created_at"),
    supabase.from("files").select(FILE_COLUMNS).eq("org_id", orgId).eq("email_id", id).is("deleted_at", null),
    supabase.from("customers").select("id, name").eq("org_id", orgId).is("merged_into_customer_id", null).not("name", "is", null).order("name").limit(500),
    supabase.from("jobs").select("id, title, customer_id, status").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(300),
  ]);
  // The filed person's addresses, so the sheet can offer to add the sender's.
  const filedOn = (row as Record<string, unknown>).contact_id as string | null;
  let personEmails: string[] = [];
  if (filedOn) {
    const [{ data: ce }, { data: pc }] = await Promise.all([
      supabase.from("contact_emails").select("email").eq("org_id", orgId).eq("contact_id", filedOn),
      supabase.from("contacts").select("email").eq("org_id", orgId).eq("id", filedOn).maybeSingle(),
    ]);
    personEmails = [...new Set([...((ce ?? []) as Array<{ email: string }>).map((x) => String(x.email).toLowerCase()), ...(pc?.email ? [String(pc.email).toLowerCase()] : [])])];
  }
  const signed = await signFiles(supabase, (files ?? []) as Array<Record<string, unknown>>) as Array<Record<string, unknown>>;
  return applyCookies(NextResponse.json({
    email: { ...email, text_body: (row as Record<string, unknown>).text_body },
    person_emails: personEmails,
    attachments: ((atts ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...a, file: signed.find((f) => f.id === a.file_id) ?? null })),
    options: { customers: custs ?? [], jobs: jobs ?? [] },
  }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("No such email.", 404);
  const { data: e } = await supabase.from("emails").select("id, customer_id, contact_id, job_id, suggested_customer_id, status").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!e) return bad("No such email.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const filed = await fileEmail(supabase, orgId, userId, e as FilingRow, b);
  if (!filed.ok) return bad(filed.error, filed.status);
  const { data: row } = await supabase.from("emails").select(EMAIL_COLS).eq("org_id", orgId).eq("id", id).single();
  const [view] = await emailView(supabase, orgId, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ email: view, released: e.status === "quarantined" && filed.filed }));
}
