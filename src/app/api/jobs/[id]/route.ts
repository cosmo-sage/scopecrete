import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { ALL_STATUSES, LEAD_SOURCES } from "@/lib/jobs/stages";

/**
 * One job — read, edit, and ACCEPT.
 *
 * Accepting is the whole reason this route is separate from a generic field
 * edit. A machine-created job (`origin='machine'`) is a proposal: it is visible
 * to Coy but excluded from every number he prices against until he accepts it.
 * DECISIONS.md §2b states the rule this implements —
 *
 *   "A machine opinion changes what Coy is ASKED. It never changes what he is
 *    SHOWN. Suppression requires a human confirmation."
 *
 * `confirmed_at` is set HERE and nowhere else, one job at a time. There is no
 * bulk accept: accepting fifty jobs with one tap is not a human confirmation,
 * it is a human dismissing a prompt.
 */

export const dynamic = "force-dynamic";

const EDITABLE = ["title", "address", "city", "state", "zip", "job_number", "notes", "status",
  "job_type", "lead_source", "referred_by_contact_id"] as const;
const JOB_TYPES = ["residential", "commercial", "public"];
const FORBIDDEN = ["origin", "confirmed_at", "confirmed_by", "org_id", "id", "created_from_message_id",
  "archived_at", "archived_reason", "flag_reason"] as const;

/** Mirrors jobs_status_check (migration 034), via the board's stage map. */
const VALID_STATUS = ALL_STATUSES;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  // `accept: true` is the only way in. The timestamps themselves are never
  // accepted from a client — a caller that can post confirmed_at can confirm a
  // machine job without a person ever seeing it.
  const accept = body.accept === true;
  const attempted = FORBIDDEN.filter((f) => f in body);
  if (attempted.length > 0) {
    return applyCookies(NextResponse.json({
      error: `These fields are set by the server, not the client: ${attempted.join(", ")}. To accept a machine-created job, send {"accept": true}.`,
      code: "forbidden_field",
    }, { status: 400 }));
  }

  const patch: Record<string, unknown> = {};
  for (const f of EDITABLE) {
    const v = body[f];
    if (typeof v === "string") patch[f] = v.trim() === "" ? null : v.trim();
  }

  // Crew days on this job: what the bid floor spreads the monthly nut by
  // (DECISIONS §4). Entered by a person as an estimate until measured days
  // exist. null clears it; anything else must be a positive number.
  if ("duration_days" in body) {
    const d = body.duration_days;
    if (d === null) patch.duration_days = null;
    else if (typeof d === "number" && Number.isFinite(d) && d > 0 && d < 1000) patch.duration_days = d;
    else {
      return applyCookies(NextResponse.json({
        error: "duration_days must be a positive number of crew days, or null.",
        code: "bad_duration",
      }, { status: 400 }));
    }
  }

  if (typeof patch.status === "string" && !VALID_STATUS.includes(patch.status)) {
    return applyCookies(NextResponse.json({
      error: `Unknown status "${patch.status}". One of: ${VALID_STATUS.join(", ")}.`,
      code: "bad_status",
    }, { status: 400 }));
  }

  if (patch.status) patch.stage_changed_at = new Date().toISOString();
  if (typeof patch.job_type === "string" && !JOB_TYPES.includes(patch.job_type)) {
    return applyCookies(NextResponse.json({ error: `job_type must be one of ${JOB_TYPES.join(", ")}.` }, { status: 400 }));
  }
  if (typeof patch.lead_source === "string" && !LEAD_SOURCES.some((l) => l.k === patch.lead_source)) {
    return applyCookies(NextResponse.json({ error: "Unknown lead_source." }, { status: 400 }));
  }
  if (typeof patch.referred_by_contact_id === "string") {
    const { data: ref } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", patch.referred_by_contact_id).maybeSingle();
    if (!ref) return applyCookies(NextResponse.json({ error: "That referrer is not a contact in your organisation." }, { status: 403 }));
  }

  if (accept) {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = userId;
  }
  // A flagged job (its customer was re-filed, migration 038): Coy archives it
  // or keeps it. Archiving hides it everywhere and is reversible; nothing is
  // deleted. `{"archive": false}` brings an archived job back.
  if (body.archive === true) {
    patch.archived_at = new Date().toISOString();
    patch.archived_reason = "archived by Coy";
    patch.flag_reason = null;
  } else if (body.archive === false) {
    patch.archived_at = null;
    patch.archived_reason = null;
  }
  if (body.keep === true) patch.flag_reason = null;

  if (Object.keys(patch).length === 0) {
    return applyCookies(NextResponse.json({
      error: "Nothing to change. Send a field to edit, {\"accept\": true}, {\"archive\": true} or {\"keep\": true}.",
    }, { status: 400 }));
  }

  // .eq('org_id') as well as RLS: belt and braces, and it turns a cross-org id
  // into a clean "not found" rather than a zero-row update that looks like
  // success.
  const { data, error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id, job_number, title, status, origin, confirmed_at, confirmed_by, contact_id, address, city, state, zip, notes, duration_days, created_at, job_type, lead_source, referred_by_contact_id")
    .maybeSingle();

  if (error) {
    return applyCookies(NextResponse.json({ error: `jobs update: ${error.message}` }, { status: 500 }));
  }
  if (!data) {
    return applyCookies(NextResponse.json({
      error: "No such job in your organisation.",
      code: "not_found",
    }, { status: 404 }));
  }

  return applyCookies(NextResponse.json({ job: data }));
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, title, status, origin, confirmed_at, confirmed_by, created_from_message_id, contact_id, address, city, state, zip, notes, duration_days, created_at, job_type, lead_source, referred_by_contact_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    return applyCookies(NextResponse.json({ error: `jobs: ${error.message}` }, { status: 500 }));
  }
  if (!data) {
    return applyCookies(NextResponse.json({ error: "No such job in your organisation.", code: "not_found" }, { status: 404 }));
  }

  // Who the job is for, read separately: `contacts` and `jobs` carry their own
  // RLS policies and an embed would fail closed on either.
  let contact: { id: string; name: string | null; phone: string | null } | null = null;
  if (data.contact_id) {
    const { data: c } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("id", data.contact_id)
      .eq("org_id", orgId)
      .maybeSingle();
    contact = c ?? null;
  }

  return applyCookies(NextResponse.json({ job: data, contact }));
}
