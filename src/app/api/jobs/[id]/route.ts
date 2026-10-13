import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { plainSpeakers } from "@/lib/speakers";
import { ALL_STATUSES, BEFORE_WON, LEAD_SOURCES, WON_STATUSES } from "@/lib/jobs/stages";
import { contractFor, wonAtFromDay, type Contract } from "@/lib/jobs/won";
import { statusForSchedule, validDay, workEnd } from "@/lib/jobs/schedule";
import { proposalNumbers } from "@/lib/proposal-number-server";

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

/** A customer or owner on the Summary. */
interface Party {
  id: string; name: string | null; type: string | null; address: string | null; point: { lat: number; lng: number } | null;
  since: string | null; created_at: string | null; people: number; jobs: number; primary_contact_id: string | null;
}
/** A person on the job, and which side they work for. */
interface JobPerson {
  id: string; name: string | null; phone: string | null; email: string | null; role: string | null;
  side: "customer" | "owner" | null; primary: boolean; party_primary: boolean;
}

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

  // Days on this job: its minimum is the day minimum × these (migration 057,
  // Coy: no default days). null clears it; anything else must be positive.
  // Sales tax for this job (migration 057): its parish (else read from the
  // address), or a rate Coy typed. { tax_parish } | { tax_rate_pct } | { tax_reset: true }.
  if ("tax_parish" in body) {
    const p = typeof body.tax_parish === "string" ? body.tax_parish.trim().replace(/\s+parish$/i, "").slice(0, 60) : "";
    patch.tax_parish = p || null; patch.tax_rate_source = null; patch.tax_rate_pct = null;
  }
  if ("tax_rate_pct" in body) {
    const r = body.tax_rate_pct;
    if (r === null) { patch.tax_rate_pct = null; patch.tax_rate_source = null; }
    else if (typeof r === "number" && Number.isFinite(r) && r >= 0 && r < 30) { patch.tax_rate_pct = r; patch.tax_rate_source = "override"; }
    else return applyCookies(NextResponse.json({ error: "A tax rate is a % under 30." }, { status: 400 }));
  }
  if (body.tax_reset === true) { patch.tax_parish = null; patch.tax_rate_pct = null; patch.tax_rate_source = null; }
  if ("duration_days" in body) {
    const d = body.duration_days;
    if (d === null) patch.duration_days = null;
    else if (typeof d === "number" && Number.isFinite(d) && d > 0 && d < 1000) patch.duration_days = d;
    else {
      return applyCookies(NextResponse.json({
        error: "duration_days must be a positive number of days, or null.",
        code: "bad_duration",
      }, { status: 400 }));
    }
  }

  // The crew (migration 093): people on the job and hours a day, for the budget's Cost Analysis.
  if ("crew_size" in body) {
    const c = body.crew_size;
    if (c === null) patch.crew_size = null;
    else if (typeof c === "number" && Number.isInteger(c) && c >= 1 && c <= 99) patch.crew_size = c;
    else return applyCookies(NextResponse.json({ error: "Crew size is a whole number of people, 1 to 99." }, { status: 400 }));
  }
  if ("crew_hours" in body) {
    const h = body.crew_hours;
    if (h === null) patch.crew_hours = null;
    else if (typeof h === "number" && Number.isFinite(h) && h > 0 && h <= 24) patch.crew_hours = Math.round(h * 10) / 10;
    else return applyCookies(NextResponse.json({ error: "Hours a day is a number above 0, up to 24." }, { status: 400 }));
  }

  // The schedule (Coy, 2026-10-09; src/lib/jobs/schedule.ts): { schedule: { start, days?, confirmed? } }.
  // The end is the start plus the days in work days; a start moves Won → Scheduled, clearing it moves
  // Scheduled → Won. Changing the days alone moves the end of a job that has a start.
  if ("schedule" in body || ("duration_days" in patch && !("schedule" in body))) {
    const sc = (body.schedule ?? {}) as { start?: unknown; days?: unknown; confirmed?: unknown };
    const { data: cur } = await supabase.from("jobs").select("status, scheduled_start, duration_days, schedule_state").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (!cur) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    if ("days" in sc) {
      const d = sc.days;
      if (d === null) patch.duration_days = null;
      else if (typeof d === "number" && Number.isFinite(d) && d > 0 && d < 1000) patch.duration_days = d;
      else return applyCookies(NextResponse.json({ error: "Days of work is a number above 0." }, { status: 400 }));
    }
    let start: string | null = (cur.scheduled_start as string | null) ?? null;
    if ("start" in sc) {
      if (sc.start === null || sc.start === "") start = null;
      else {
        start = validDay(sc.start);
        if (!start) return applyCookies(NextResponse.json({ error: "The start is a date." }, { status: 400 }));
      }
      patch.scheduled_start = start;
      const next = statusForSchedule((patch.status as string | undefined) ?? (cur.status as string | null), !!start);
      if (next) patch.status = next;
    }
    const days = "duration_days" in patch ? (patch.duration_days as number | null) : (cur.duration_days as number | null);
    if ("start" in sc || "duration_days" in patch) patch.scheduled_end = start ? workEnd(start, days) : null;
    if ("start" in sc && !start) patch.schedule_state = "none";
    else if (typeof sc.confirmed === "boolean") patch.schedule_state = sc.confirmed ? "committed" : "tentative";
    else if ("start" in sc && start && (cur.schedule_state ?? "none") === "none") patch.schedule_state = "tentative";
  }

  if (typeof patch.status === "string" && !VALID_STATUS.includes(patch.status)) {
    return applyCookies(NextResponse.json({
      error: `Unknown status "${patch.status}". One of: ${VALID_STATUS.join(", ")}.`,
      code: "bad_status",
    }, { status: 400 }));
  }

  if (patch.status) patch.stage_changed_at = new Date().toISOString();

  // The win date (Coy, 2026-10-09: a quoted job needs to become won). Moving a job into a won
  // status stamps won_at once — never over a date already there — and moving it back before the
  // yes clears it. { won_on: "YYYY-MM-DD" } sets the day it was won by hand (null clears it).
  if (typeof patch.status === "string" && (WON_STATUSES.includes(patch.status) || BEFORE_WON.includes(patch.status))) {
    const { data: cur } = await supabase.from("jobs").select("won_at").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (WON_STATUSES.includes(patch.status) && !cur?.won_at) patch.won_at = new Date().toISOString();
    if (BEFORE_WON.includes(patch.status) && cur?.won_at) patch.won_at = null;
  }
  if ("won_on" in body) {
    if (body.won_on === null) patch.won_at = null;
    else {
      const at = typeof body.won_on === "string" ? wonAtFromDay(body.won_on, new Date()) : null;
      if (!at) return applyCookies(NextResponse.json({ error: "The day it was won is a date, today or earlier." }, { status: 400 }));
      patch.won_at = at;
    }
  }
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

  // Who the job is for (Coy, 2026-10-10: "no way of attaching a customer to a job … from inside the
  // job. Or visaversa"): { customer_id } puts it on that customer; its person becomes the customer's
  // primary unless the job's person is already one of theirs. Checked against the org.
  if (typeof body.customer_id === "string" && body.customer_id) {
    const { data: cu } = await supabase.from("customers").select("id, primary_contact_id, archived_at, merged_into_customer_id")
      .eq("org_id", orgId).eq("id", body.customer_id).maybeSingle();
    if (!cu || cu.archived_at || cu.merged_into_customer_id) return applyCookies(NextResponse.json({ error: "That customer isn't in your organization." }, { status: 404 }));
    const { data: cur } = await supabase.from("jobs").select("contact_id").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (!cur) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
    patch.customer_id = cu.id;
    let keep = false;
    if (cur.contact_id) {
      const { data: cc } = await supabase.from("contacts").select("customer_id").eq("org_id", orgId).eq("id", cur.contact_id).maybeSingle();
      keep = cc?.customer_id === cu.id;
    }
    if (!keep) {
      let person = (cu.primary_contact_id as string | null) ?? null;
      if (!person) {
        const { data: first } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", cu.id)
          .is("merged_into_contact_id", null).order("created_at").limit(1).maybeSingle();
        person = (first?.id as string | undefined) ?? null;
      }
      if (person) patch.contact_id = person;
    }
  }

  // Who the work is for, when it isn't the customer (migration 109, Claude Design "Job Summary",
  // 2026-10-13): { owner_customer_id } — a customer of the org, or null for "same as the customer".
  if ("owner_customer_id" in body) {
    const o = body.owner_customer_id;
    if (o === null || o === "") patch.owner_customer_id = null;
    else if (typeof o === "string") {
      const { data: ow } = await supabase.from("customers").select("id, archived_at, merged_into_customer_id").eq("org_id", orgId).eq("id", o).maybeSingle();
      if (!ow || ow.archived_at || ow.merged_into_customer_id) return applyCookies(NextResponse.json({ error: "That owner isn't one of your customers." }, { status: 404 }));
      patch.owner_customer_id = ow.id;
    }
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
    .select("id, job_number, title, status, won_at, origin, confirmed_at, confirmed_by, contact_id, address, city, state, zip, notes, duration_days, scheduled_start, scheduled_end, schedule_state, created_at, job_type, lead_source, referred_by_contact_id")
    .maybeSingle();

  if (error) {
    if (("crew_size" in patch || "crew_hours" in patch) && /crew_(size|hours)/.test(error.message)) {
      return applyCookies(NextResponse.json({ error: "Crew size waits for migration 093.", code: "needs_093" }, { status: 409 }));
    }
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
    .select("id, job_number, title, status, won_at, origin, confirmed_at, confirmed_by, created_from_message_id, contact_id, customer_id, address, city, state, zip, notes, duration_days, scheduled_start, scheduled_end, schedule_state, created_at, job_type, lead_source, referred_by_contact_id, description, archived_at, archived_reason")
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
  let contact: { id: string; name: string | null; phone: string | null; email?: string | null } | null = null;
  if (data.contact_id) {
    const { data: c } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("id", data.contact_id)
      .eq("org_id", orgId)
      .maybeSingle();
    contact = c ?? null;
    // An onsite estimator can't read contacts; they get the name and phone of who it's for (081).
    if (!contact) {
      const { data: fc } = await supabase.rpc("sc_field_job_contact", { p_job: id });
      contact = (Array.isArray(fc) ? fc[0] : null) ?? null;
    }
  }

  // Why this job exists, for one made by filing someone as a customer (Coy,
  // 2026-09-29: "No idea what the job is or why it was classified as a
  // customer"). Everything here is already on the contact or its latest
  // proposal — nothing is inferred for the page.
  let why: {
    filed_at: string | null; filed_by: "coy" | "dusty" | null;
    status_summary: string | null; recent_summary: string | null;
    evidence_quote: string | null; evidence_at: string | null;
    company: string | null; scope_summary: string | null;
  } | null = null;
  if (data.origin === "classification" && data.contact_id) {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("contacts").select("classification_confirmed_at, auto_classified_at, status_summary, recent_summary")
        .eq("org_id", orgId).eq("id", data.contact_id).maybeSingle(),
      supabase.from("contact_proposals").select("evidence_quote, created_at, proposed_company, scope_summary")
        .eq("org_id", orgId).eq("contact_id", data.contact_id).eq("classification", "customer")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    why = {
      filed_at: (c?.classification_confirmed_at ?? c?.auto_classified_at ?? null) as string | null,
      filed_by: c?.classification_confirmed_at ? "coy" : c?.auto_classified_at ? "dusty" : null,
      status_summary: plainSpeakers((c?.status_summary as string | null) ?? null),
      recent_summary: plainSpeakers((c?.recent_summary as string | null) ?? null),
      evidence_quote: plainSpeakers((p?.evidence_quote as string | null) ?? null),
      evidence_at: (p?.created_at as string | null) ?? null,
      company: (p?.proposed_company as string | null) ?? null,
      scope_summary: (p?.scope_summary as string | null) ?? null,
    };
  }

  // The crew (migration 093), read on its own so the job still opens before 093 is applied:
  // null = the columns aren't there yet.
  const { data: cr, error: crErr } = await supabase.from("jobs").select("crew_size, crew_hours").eq("id", id).eq("org_id", orgId).maybeSingle();
  const crew = crErr ? null : {
    size: cr?.crew_size == null ? null : Number(cr.crew_size),
    hours: cr?.crew_hours == null ? null : Number(cr.crew_hours),
  };

  // The proposal it was won on (src/lib/jobs/won.ts): finals are frozen, so reading the newest
  // one at or before won_at IS the locked price. Signed change orders (094) add to it.
  let contract: Contract | null = null;
  if (WON_STATUSES.includes(data.status ?? "")) {
    const [{ data: props }, { data: cos }, { data: signedDocs }, numbers] = await Promise.all([
      supabase.from("job_proposals").select("id, version, finalized_at, snapshot").eq("org_id", orgId).eq("job_id", id).eq("status", "final").is("deleted_at", null),
      supabase.from("change_orders").select("price, signed_at").eq("org_id", orgId).eq("job_id", id),
      // A version the customer signed on its link (097) is the contract outright.
      supabase.from("documents").select("proposal_id, decided_name, decided_at, signed_total").eq("org_id", orgId).eq("job_id", id)
        .eq("status", "accepted").not("proposal_id", "is", null),
      proposalNumbers(supabase, orgId),
    ]);
    contract = contractFor(((props ?? []) as Array<{ id: string; version: number; finalized_at: string | null; snapshot: { number?: unknown; price?: { total?: unknown } } | null }>).map((p) => ({
      id: p.id, version: p.version, finalized_at: p.finalized_at,
      // SE-26-0001-A (src/lib/proposal-number.ts), not the "P-2" an older final froze.
      number: numbers.number(id, p.version),
      total: typeof p.snapshot?.price?.total === "number" ? p.snapshot.price.total : null,
    })), data.won_at ?? null, (cos ?? []) as Array<{ price: number | null; signed_at: string | null }>,
      ((signedDocs ?? []) as Array<{ proposal_id: string; decided_name: string | null; decided_at: string | null; signed_total: number | null }>)
        .map((d) => ({ proposal_id: d.proposal_id, name: d.decided_name, at: d.decided_at, total: d.signed_total == null ? null : Number(d.signed_total) })));
  }

  // The parties (Claude Design "Job Summary", 2026-10-13): who pays (the customer), who the work is
  // for (the owner, migration 109 — read on its own so the job opens before 109 is applied), the
  // people on either side, and where the site is on the map (090's point while its address holds).
  const { data: ow, error: owErr } = await supabase.from("jobs").select("owner_customer_id, lat, lng, geocode_query").eq("id", id).eq("org_id", orgId).maybeSingle();
  const ownerSupported = !owErr || !/owner_customer_id/.test(owErr.message);
  let site: { lat: number; lng: number } | null = null;
  let ownerId: string | null = null;
  if (!owErr && ow) {
    ownerId = (ow.owner_customer_id as string | null) ?? null;
    // Kept only while it was looked up for this address (the Map page writes it, 090).
    const gq = (ow.geocode_query as string | null) ?? "";
    if (typeof ow.lat === "number" && typeof ow.lng === "number" && data.address && gq.toLowerCase().startsWith(data.address.trim().toLowerCase())) site = { lat: ow.lat, lng: ow.lng };
  }
  const partyIds = [data.customer_id, ownerId].filter((x): x is string => !!x);
  const parties = new Map<string, Party>();
  const people: JobPerson[] = [];
  if (partyIds.length) {
    const [{ data: cus }, { data: ppl }, { data: jbs }] = await Promise.all([
      supabase.from("customers").select("id, name, customer_type, address_formatted, address_line1, city, state, zip, lat, lng, since, created_at, primary_contact_id")
        .eq("org_id", orgId).in("id", partyIds),
      supabase.from("contacts").select("id, name, phone, email, role, customer_id, company_name")
        .eq("org_id", orgId).in("customer_id", partyIds).is("merged_into_contact_id", null).is("archived_at", null).limit(60),
      supabase.from("jobs").select("customer_id").eq("org_id", orgId).in("customer_id", partyIds).is("archived_at", null).limit(500),
    ]);
    for (const c of (cus ?? []) as Array<Record<string, unknown>>) {
      const cid = c.id as string;
      const addr = (c.address_formatted as string | null) || [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
      parties.set(cid, {
        id: cid, name: (c.name as string | null) ?? null, type: (c.customer_type as string | null) ?? null, address: addr,
        point: typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null,
        since: (c.since as string | null) ?? null, created_at: (c.created_at as string | null) ?? null,
        people: ((ppl ?? []) as Array<{ customer_id: string }>).filter((p) => p.customer_id === cid).length,
        jobs: ((jbs ?? []) as Array<{ customer_id: string }>).filter((j) => j.customer_id === cid).length,
        primary_contact_id: (c.primary_contact_id as string | null) ?? null,
      });
    }
    for (const p of (ppl ?? []) as Array<Record<string, unknown>>) {
      const side = p.customer_id === data.customer_id ? "customer" : "owner";
      people.push({ id: p.id as string, name: (p.name as string | null) ?? null, phone: (p.phone as string | null) ?? null, email: (p.email as string | null) ?? null,
        role: (p.role as string | null) ?? null, side, primary: p.id === data.contact_id,
        party_primary: parties.get(p.customer_id as string)?.primary_contact_id === p.id });
    }
  }
  // The job's own person, when they aren't on either side (a caller not filed on a customer yet).
  if (contact && !people.some((p) => p.id === contact!.id)) {
    people.unshift({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email ?? null, role: null, side: null, primary: true, party_primary: false });
  }
  people.sort((a, b) => Number(b.primary) - Number(a.primary) || (a.side === b.side ? 0 : a.side === "customer" ? -1 : 1) || (a.name ?? "").localeCompare(b.name ?? ""));
  const customer = data.customer_id ? parties.get(data.customer_id) ?? null : null;
  const owner = ownerId ? parties.get(ownerId) ?? null : null;

  return applyCookies(NextResponse.json({ job: data, contact, customer, owner, owner_supported: ownerSupported, people, site, why, crew, contract }));
}
