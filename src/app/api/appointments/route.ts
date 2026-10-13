import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanAppointment, defaultTitle } from "@/lib/appointments";
import { APPT_COLS, appointmentsMissing, listAppointments } from "@/lib/appointments-server";

/**
 * Appointments (migration 110; Coy, 2026-10-13: "a way for Dusty to keep track of my schedule for each job and
 * customer contact lead").
 *
 * GET  ?job= | ?contact= | ?customer= | ?upcoming=1 → { supported, appointments } (each with its job's title and
 *      its person's name and phone). upcoming = from today (Central midnight is close enough: a day back).
 * POST { job_id?, contact_id?, customer_id?, kind, title?, day, start, end?, address?, note?, source? } → { appointment }
 *      — a Central day and times; the title is made from the kind and the job (or person) when none is given, and
 *      the address is the job's when none is given.
 *
 * Session client, org from the session; RLS and a guard keep the job and the person on the org.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const p = req.nextUrl.searchParams;
  const pick = (k: string) => { const v = p.get(k); return v && UUID.test(v) ? v : null; };
  try {
    const out = await listAppointments(supabase, orgId, {
      job: pick("job"), contact: pick("contact"), customer: pick("customer"),
      since: p.get("upcoming") ? new Date(Date.now() - 86400_000).toISOString() : null,
    });
    return applyCookies(NextResponse.json(out));
  } catch (e) {
    return applyCookies(NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }));
  }
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  const c = cleanAppointment(body);
  if (!c.ok) return applyCookies(NextResponse.json({ error: c.error }, { status: 400 }));
  const row = c.row;

  // The job's person, title and address fill what wasn't given.
  let about: string | null = null;
  if (row.job_id) {
    const { data: job } = await supabase.from("jobs").select("id, title, address, contact_id, customer_id").eq("org_id", orgId).eq("id", row.job_id).maybeSingle();
    if (!job) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    about = (job.title as string | null) ?? null;
    row.contact_id ??= (job.contact_id as string | null) ?? null;
    row.customer_id ??= (job.customer_id as string | null) ?? null;
    row.address ??= (job.address as string | null) ?? null;
  }
  if (!about && row.contact_id) {
    const { data: person } = await supabase.from("contacts").select("id, name, address, customer_id").eq("org_id", orgId).eq("id", row.contact_id).maybeSingle();
    if (!person) return applyCookies(NextResponse.json({ error: "No such person." }, { status: 404 }));
    about = (person.name as string | null) ?? null;
    row.customer_id ??= (person.customer_id as string | null) ?? null;
    row.address ??= (person.address as string | null) ?? null;
  }
  const source = body?.source === "dusty" ? "dusty" : "coy";
  const { data, error } = await supabase.from("appointments")
    .insert({ ...row, org_id: orgId, title: row.title ?? defaultTitle(row.kind, about), source, created_by: userId })
    .select(APPT_COLS).single();
  if (error) {
    if (appointmentsMissing(error)) return applyCookies(NextResponse.json({ error: "Appointments wait for migration 110." }, { status: 409 }));
    return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  }
  return applyCookies(NextResponse.json({ appointment: data }));
}
