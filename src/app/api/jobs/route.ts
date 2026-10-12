import { NextRequest, NextResponse, after } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { viewAsFor } from "@/lib/access-server";
import { jobsFor, VIEW_AS_COOKIE } from "@/lib/view-as";
import { ALL_STATUSES, LEAD_SOURCES } from "@/lib/jobs/stages";
import { autoDraftOn, buildDraft, queueDraft } from "@/lib/draft/build-server";

/**
 * Jobs for the signed-in user's org — read and create.
 *
 * `jobs` is the spine (DECISIONS.md §2): "There is no money without a job."
 * Until this route existed it was an empty table with NO WRITER anywhere in the
 * app, the API or the edge functions, which is what kept Scope permanently
 * empty and blocked the 19 tables that hang off it.
 *
 * RLS: `jobs_member_*` all gate on `get_user_org_ids()` (migration 024), so a
 * session client reads and writes exactly this caller's org.
 *
 * Only `org_id` is required by the schema — every other NOT NULL column carries
 * a default (`job_type='residential'`, `status='lead'`, `origin='manual'`,
 * `schedule_state='none'`). Verified against information_schema before writing
 * this insert rather than assumed from the work order.
 */

export const dynamic = "force-dynamic";

export interface JobRow {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  origin: string | null;
  confirmed_at: string | null;
  created_from_message_id: string | null;
  contact_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string | null;
  job_type: string | null;
  lead_source: string | null;
  referred_by_contact_id: string | null;
  stage_changed_at: string | null;
  updated_at: string | null;
}

/**
 * Fields a client is allowed to set. Everything else is either derived from the
 * session or owned by the accept flow.
 *
 * `origin`, `confirmed_at`, `confirmed_by` and `org_id` are DELIBERATELY absent.
 * A client that can set its own `origin` can launder a machine guess into a
 * confirmed job, which is the one thing the origin/confirmed_at pair exists to
 * prevent — see DECISIONS.md §2b: a machine opinion changes what Coy is asked,
 * never what he is shown.
 */
const CREATABLE = ["contact_id", "title", "address", "city", "state", "zip", "job_number",
  "job_type", "lead_source", "referred_by_contact_id", "status", "description"] as const;
const JOB_TYPES = ["residential", "commercial", "public"];
const FORBIDDEN = ["origin", "confirmed_at", "confirmed_by", "org_id", "created_from_message_id"] as const;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const status = new URL(req.url).searchParams.get("status");

  let q = supabase
    .from("jobs")
    .select("id, job_number, title, status, origin, confirmed_at, created_from_message_id, contact_id, address, city, state, zip, created_at, job_type, lead_source, referred_by_contact_id, stage_changed_at, updated_at, flag_reason, description, scheduled_start")
    .eq("org_id", orgId)
    // Archived jobs (a customer re-filed by mistake, migration 038) are off the board.
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return applyCookies(NextResponse.json({ error: `jobs: ${error.message}` }, { status: 500 }));
  }

  // Viewing as an estimator given some jobs: only theirs (RLS does this for them; the owner sees all).
  const viewAs = req.cookies.get(VIEW_AS_COOKIE) ? await viewAsFor(req, result.session) : null;
  const jobs = jobsFor((data ?? []) as JobRow[], viewAs?.access ?? null);

  // Contacts are joined in a second query rather than via a SQL join, because
  // `contacts` and `jobs` carry separate RLS policies and a PostgREST embed
  // silently returns null for rows the caller cannot see — which would look
  // like a job with no contact rather than a permissions result.
  const contactIds = [...new Set(jobs.flatMap((j) => [j.contact_id, j.referred_by_contact_id]).filter(Boolean))] as string[];
  const nameById = new Map<string, { name: string | null; phone: string | null }>();

  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("org_id", orgId)
      .in("id", contactIds);
    for (const c of (contacts ?? []) as Array<{ id: string; name: string | null; phone: string | null }>) {
      nameById.set(c.id, { name: c.name, phone: c.phone });
    }
  }

  // Sections per job: a card says "3 sections" or "not scoped yet".
  const sectionCount = new Map<string, number>();
  if (jobs.length > 0) {
    const { data: secs } = await supabase.from("job_sections").select("job_id").eq("org_id", orgId)
      .in("job_id", jobs.map((j) => j.id));
    for (const r of (secs ?? []) as Array<{ job_id: string }>) sectionCount.set(r.job_id, (sectionCount.get(r.job_id) ?? 0) + 1);
  }

  return applyCookies(NextResponse.json({
    jobs: jobs.map((j) => {
      const c = j.contact_id ? nameById.get(j.contact_id) : undefined;
      const ref = j.referred_by_contact_id ? nameById.get(j.referred_by_contact_id) : undefined;
      return {
        ...j,
        // Never invents a name. 176 of 197 contacts have none (2026-09-27), and
        // the phone number is the real identity in that case.
        contact_name: c?.name ?? null,
        contact_phone: c?.phone ?? null,
        referred_by_name: ref ? (ref.name?.trim() || ref.phone) : null,
        section_count: sectionCount.get(j.id) ?? 0,
        // THE PIPELINE PREDICATE, computed in one place.
        //
        //     origin === 'manual' || confirmed_at !== null
        //
        // An UNREVIEWED MACHINE JOB is visible in the list but must never move
        // a number Coy prices against — same principle as the off-the-top 11%:
        // a machine opinion changes what he is asked, never what he is shown.
        // Returning it as a field rather than filtering server-side is
        // deliberate: the job still has to appear on screen, so the caller
        // needs both the row AND the rule, and every consumer then applies the
        // same one. `idx_jobs_unconfirmed` supports the inverse query.
        counts_toward_value: j.origin === "manual" || j.confirmed_at !== null,
      };
    }),
  }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }

  // Reject rather than silently ignore. Ignoring would let a caller believe it
  // had created a confirmed machine job and get a manual one back, which is a
  // worse outcome than a clear refusal.
  const attempted = FORBIDDEN.filter((f) => f in body);
  if (attempted.length > 0) {
    return applyCookies(NextResponse.json({
      error: `These fields are set by the server, not the client: ${attempted.join(", ")}.`,
      code: "forbidden_field",
    }, { status: 400 }));
  }

  const insert: Record<string, unknown> = { org_id: orgId };
  for (const f of CREATABLE) {
    const v = body[f];
    if (typeof v === "string" && v.trim()) insert[f] = v.trim();
  }
  if (typeof insert.description === "string") insert.description = (insert.description as string).slice(0, 500);

  if (insert.job_type !== undefined && !JOB_TYPES.includes(insert.job_type as string)) {
    return applyCookies(NextResponse.json({ error: `job_type must be one of ${JOB_TYPES.join(", ")}.` }, { status: 400 }));
  }
  if (insert.lead_source !== undefined && !LEAD_SOURCES.some((l) => l.k === insert.lead_source)) {
    return applyCookies(NextResponse.json({ error: `lead_source must be one of ${LEAD_SOURCES.map((l) => l.k).join(", ")}.` }, { status: 400 }));
  }
  if (insert.status !== undefined && !ALL_STATUSES.includes(insert.status as string)) {
    return applyCookies(NextResponse.json({ error: `status must be one of ${ALL_STATUSES.join(", ")}.` }, { status: 400 }));
  }

  // A job created by a person is confirmed by definition — he is the one
  // typing it. confirmed_at is what the pipeline counts on, so setting it here
  // is the difference between a manual job appearing in the total and not.
  insert.origin = "manual";
  insert.status = insert.status ?? "lead";
  insert.stage_changed_at = new Date().toISOString();
  insert.confirmed_at = new Date().toISOString();
  insert.confirmed_by = userId;

  // Validate the contact belongs to this org BEFORE inserting. RLS on `jobs`
  // would not catch this — the job's own org_id is correct — so without this
  // check a caller could attach their job to another org's contact and get a
  // successful insert. A clear 403 also beats the opaque RLS error a bad
  // org_id would otherwise produce.
  for (const field of ["contact_id", "referred_by_contact_id"] as const) {
    if (typeof insert[field] !== "string") continue;
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, customer_id")
      .eq("id", insert[field] as string)
      .eq("org_id", orgId)
      .maybeSingle();

    if (contactErr) {
      return applyCookies(NextResponse.json({ error: `contacts: ${contactErr.message}` }, { status: 500 }));
    }
    if (!contact) {
      return applyCookies(NextResponse.json({
        error: "That contact does not exist in your organisation.",
        code: "contact_not_in_org",
      }, { status: 403 }));
    }
  }

  // A job belongs to the customer (migration 055): the contact's customer.
  if (typeof insert.contact_id === "string" && !insert.customer_id) {
    const { data: cc } = await supabase.from("contacts").select("customer_id").eq("org_id", orgId).eq("id", insert.contact_id).maybeSingle();
    if (cc?.customer_id) insert.customer_id = cc.customer_id;
  }

  // job_number is left NULL unless the caller supplies one.
  //
  // The reference shape is 24-318-1, but the scheme has NOT been confirmed —
  // what the segments mean, and how the counter resets, is unknown. A generated
  // number that looks official and means nothing is worse than an empty field,
  // so nothing is invented here. See the work order 13 report.

  const { data, error } = await supabase
    .from("jobs")
    .insert(insert)
    .select("id, job_number, title, status, origin, confirmed_at, contact_id, address, city, state, zip, created_at, job_type, lead_source, referred_by_contact_id")
    .single();

  if (error) {
    return applyCookies(NextResponse.json({ error: `jobs insert: ${error.message}` }, { status: 500 }));
  }

  // A draft budget from their calls and texts (migration 087), behind
  // BUDGET_DRAFT_AUTO=on. The queued row is written before the answer, so a
  // build that dies after it is still on the job page with Retry; the job
  // itself never waits on it or fails with it.
  if (autoDraftOn() && data.contact_id) {
    const runId = await queueDraft(supabase, orgId, userId, data.id as string).catch(() => null);
    if (runId) after(() => buildDraft(supabase, orgId, userId, data.id as string, "job_created").then(() => undefined, () => undefined));
  }

  return applyCookies(NextResponse.json({ job: data }, { status: 201 }));
}
