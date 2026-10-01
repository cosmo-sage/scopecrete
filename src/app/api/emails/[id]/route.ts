import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";
import { EMAIL_COLS, emailView } from "@/lib/emails-server";

/**
 * One mirrored email (migration 061).
 *
 * GET → { email (with its text), attachments (each with its file, signed),
 *         options: { customers, jobs } for filing }.
 * PATCH { customer_id?, contact_id?, job_id?, accept_suggestion? } — Coy's
 *   filing (match 'coy'). Filing on a job moves the email's files onto that job
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
    supabase.from("job_files").select(FILE_COLUMNS).eq("org_id", orgId).eq("email_id", id).is("deleted_at", null),
    supabase.from("customers").select("id, name").eq("org_id", orgId).is("merged_into_customer_id", null).not("name", "is", null).order("name").limit(500),
    supabase.from("jobs").select("id, title, customer_id, status").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(300),
  ]);
  const signed = await signFiles(supabase, (files ?? []) as Array<Record<string, unknown>>) as Array<Record<string, unknown>>;
  return applyCookies(NextResponse.json({
    email: { ...email, text_body: (row as Record<string, unknown>).text_body },
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

  const idOrNull = (v: unknown, what: string): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v !== "string" || !UUID.test(v)) throw new Error(`Bad ${what}.`);
    return v;
  };
  let customer: string | null | undefined, contact: string | null | undefined, job: string | null | undefined;
  try {
    customer = b.accept_suggestion === true ? (e.suggested_customer_id as string | null) : idOrNull(b.customer_id, "customer");
    contact = idOrNull(b.contact_id, "contact");
    job = idOrNull(b.job_id, "job");
  } catch (err) { return bad((err as Error).message); }
  if (b.accept_suggestion === true && !customer) return bad("There is no suggestion to take.");

  // Every id in the org; a job brings its customer when none is named.
  if (customer) { const { data } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("id", customer).maybeSingle(); if (!data) return bad("No such customer."); }
  if (contact) { const { data } = await supabase.from("contacts").select("id, customer_id").eq("org_id", orgId).eq("id", contact).maybeSingle(); if (!data) return bad("No such contact."); if (customer === undefined) customer = (data.customer_id as string | null) ?? null; }
  if (job) {
    const { data } = await supabase.from("jobs").select("id, customer_id, contact_id").eq("org_id", orgId).eq("id", job).maybeSingle();
    if (!data) return bad("No such job.");
    if (customer === undefined && !e.customer_id) customer = (data.customer_id as string | null) ?? null;
  }

  const next = {
    customer_id: customer === undefined ? e.customer_id : customer,
    contact_id: contact === undefined ? e.contact_id : contact,
    job_id: job === undefined ? e.job_id : job,
  };
  const filed = !!(next.customer_id || next.job_id || next.contact_id);
  const { error } = await supabase.from("emails").update({
    ...next, match: filed ? "coy" : "none", status: filed ? "filed" : "unfiled",
    filed_at: filed ? new Date().toISOString() : null, filed_by: filed ? userId : null,
  }).eq("id", id).eq("org_id", orgId);
  if (error) return bad(error.message, 500);

  // The email's files follow it: onto the job (PDFs into the Plan Room), the contact and the customer.
  const { data: files } = await supabase.from("job_files").select("id, kind").eq("org_id", orgId).eq("email_id", id).is("deleted_at", null);
  for (const f of (files ?? []) as Array<{ id: string; kind: string }>) {
    await supabase.from("job_files").update({
      job_id: next.job_id, contact_id: next.contact_id, customer_id: next.customer_id,
      ...(next.job_id && f.kind === "pdf" ? { in_plan_room: true } : {}),
    }).eq("id", f.id).eq("org_id", orgId);
  }
  const { data: row } = await supabase.from("emails").select(EMAIL_COLS).eq("org_id", orgId).eq("id", id).single();
  const [view] = await emailView(supabase, orgId, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ email: view, released: e.status === "quarantined" && filed }));
}
