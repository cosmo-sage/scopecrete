import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { settleCallNotes } from "@/lib/call-notes-server";

/**
 * Everything about one person for their Customer or Vendor page (Coy,
 * 2026-09-28): who they are, which bucket and how sure, Dusty's status lines,
 * their jobs (as customer) or the jobs they are on (as vendor, job_vendors),
 * the next-steps checklist, and the scope seeds from Dusty's latest read.
 *
 * GET → { contact, jobs, vendor_jobs, tasks, scope } | { redirect_to }
 *
 * Session client: every table here is org-scoped by RLS, and every query also
 * filters org_id from the session (never from the caller).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  if (!UUID.test(contactId)) return NextResponse.json({ error: "Not a contact id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (what: string, msg: string) =>
    applyCookies(NextResponse.json({ error: `${what}: ${msg}` }, { status: 500 }));

  const { data: c, error: cErr } = await supabase.from("contacts")
    .select("id, customer_id, name, name_confirmed_at, name_source, phone, email, address, address_source, company_name, contact_type, contact_subtype, classification_confirmed_at, auto_classified_at, status_summary, recent_summary, job_type_hint, status_summary_at, merged_into_contact_id")
    .eq("org_id", orgId).eq("id", contactId).maybeSingle();
  if (cErr) return fail("contacts", cErr.message);
  if (!c) return applyCookies(NextResponse.json({ error: "Contact not found." }, { status: 404 }));
  if (c.merged_into_contact_id) return applyCookies(NextResponse.json({ redirect_to: c.merged_into_contact_id }));
  // Notes Coy took during a call land on it once Quo has sent the call (src/lib/call-notes.ts).
  await settleCallNotes(supabase, orgId, [contactId]);

  // Maybe the same person under another number (Coy, 2026-09-28: two Ambers).
  // Same name or same email on another live contact. A suggestion only — a
  // merge is always Coy's tap (DECISIONS §2c).
  const nm = c.name?.trim() ?? "";
  const em = c.email?.trim() ?? "";
  const dupQuery = nm || em
    ? supabase.from("contacts").select("id, name, phone, email").eq("org_id", orgId).is("merged_into_contact_id", null)
        .neq("id", contactId).or([nm ? `name.ilike.${nm.replace(/[,%()*]/g, "")}` : null, em ? `email.ilike.${em.replace(/[,%()*]/g, "")}` : null].filter(Boolean).join(","))
        .limit(5)
    : Promise.resolve({ data: [], error: null });

  const [phones, jobs, links, tasks, prop, subtypes, dups, notes] = await Promise.all([
    supabase.from("contact_phones").select("phone_e164").eq("org_id", orgId).eq("contact_id", contactId),
    supabase.from("jobs").select("id, title, status, job_type, flag_reason, origin, confirmed_at, address, created_at")
      .eq("org_id", orgId).eq("contact_id", contactId).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("job_vendors").select("job_id, role, note").eq("org_id", orgId).eq("contact_id", contactId),
    supabase.from("contact_tasks").select("id, title, due_on, source, status, evidence_quote, job_id, created_at, done_at")
      .eq("org_id", orgId).eq("contact_id", contactId).neq("status", "dismissed")
      .order("created_at", { ascending: true }),
    supabase.from("contact_proposals").select("classification, project_type, scope_summary, site_hint, sqft_stated, length_ft, width_ft, start_timing, has_media")
      .eq("org_id", orgId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(1),
    supabase.from("org_contact_subtypes").select("bucket, slug, label").eq("org_id", orgId),
    dupQuery,
    // Coy's notes (migration 041) — newest first; the timeline merges them in.
    supabase.from("contact_notes").select("id, body, created_at, created_by").eq("org_id", orgId).eq("contact_id", contactId)
      .order("created_at", { ascending: false }).limit(200),
  ]);
  for (const [what, r] of [["contact_phones", phones], ["jobs", jobs], ["job_vendors", links], ["contact_tasks", tasks], ["contact_proposals", prop], ["contact_notes", notes]] as const) {
    if (r.error) return fail(what, r.error.message);
  }

  const jobRows = (jobs.data ?? []) as Array<{ id: string; title: string | null; status: string | null; job_type: string | null; flag_reason: string | null; origin: string; confirmed_at: string | null; address: string | null; created_at: string }>;
  const linkRows = (links.data ?? []) as Array<{ job_id: string; role: string | null; note: string | null }>;

  // Vendors on this customer's jobs, and the jobs this vendor is on.
  const [crew, onJobs] = await Promise.all([
    jobRows.length
      ? supabase.from("job_vendors").select("job_id, contact_id, role, contacts(name, phone)").eq("org_id", orgId).in("job_id", jobRows.map((j) => j.id))
      : Promise.resolve({ data: [], error: null }),
    linkRows.length
      ? supabase.from("jobs").select("id, title, status, job_type, contacts(name, phone)").eq("org_id", orgId)
          .in("id", linkRows.map((l) => l.job_id)).is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (crew.error) return fail("job_vendors", crew.error.message);
  if (onJobs.error) return fail("jobs", onJobs.error.message);

  const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
  const crewByJob = new Map<string, Array<{ contact_id: string; name: string | null; phone: string | null; role: string | null }>>();
  for (const r of (crew.data ?? []) as unknown as Array<{ job_id: string; contact_id: string; role: string | null; contacts: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null }>) {
    const who = one(r.contacts);
    const list = crewByJob.get(r.job_id) ?? [];
    list.push({ contact_id: r.contact_id, name: who?.name ?? null, phone: who?.phone ?? null, role: r.role });
    crewByJob.set(r.job_id, list);
  }
  const roleByJob = new Map(linkRows.map((l) => [l.job_id, l.role]));
  const label = new Map(((subtypes.data ?? []) as Array<{ bucket: string; slug: string; label: string }>).map((x) => [`${x.bucket}:${x.slug}`, x.label]));

  const shown = !!(c.classification_confirmed_at || c.auto_classified_at);
  const bucket = shown && ["customer", "vendor", "personal", "spam"].includes(c.contact_type ?? "") ? c.contact_type : null;

  return applyCookies(NextResponse.json({
    contact: {
      id: c.id,
      customer_id: c.customer_id ?? null,
      name: c.name?.trim() || null,
      name_confirmed: !!c.name_confirmed_at || c.name_source === "human",
      phones: [...new Set([c.phone, ...((phones.data ?? []) as Array<{ phone_e164: string }>).map((p) => p.phone_e164)].filter(Boolean))],
      email: c.email?.trim() || null,
      address: c.address?.trim() || null,
      address_source: (c.address_source as string | null) ?? null,
      company: c.company_name?.trim() || null,
      bucket,
      bucket_state: !bucket ? null : c.classification_confirmed_at ? "confirmed" : "auto",
      subtype: bucket ? c.contact_subtype : null,
      subtype_label: bucket && c.contact_subtype ? label.get(`${bucket}:${c.contact_subtype}`) ?? c.contact_subtype : null,
      // Dusty's words (migration 037) — a display cache, shown as his.
      status_summary: c.status_summary, recent_summary: c.recent_summary,
      job_type_hint: c.job_type_hint, status_summary_at: c.status_summary_at,
      // Dusty's latest guess, for the bucket picker's dashed outline.
      guess: (((prop.data ?? []) as Array<{ classification: string | null }>)[0]?.classification) ?? null,
    },
    subtypes: subtypes.data ?? [],
    notes: notes.data ?? [],
    jobs: jobRows.map((j) => ({
      ...j,
      counts: j.origin === "manual" || j.confirmed_at !== null,
      vendors: crewByJob.get(j.id) ?? [],
    })),
    vendor_jobs: ((onJobs.data ?? []) as unknown as Array<{ id: string; title: string | null; status: string | null; job_type: string | null; contacts: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null }>)
      .map((j) => {
        const who = one(j.contacts);
        return { id: j.id, title: j.title, status: j.status, job_type: j.job_type, role: roleByJob.get(j.id) ?? null, customer: who?.name ?? who?.phone ?? null };
      }),
    tasks: tasks.data ?? [],
    scope: ((prop.data ?? []) as unknown[])[0] ?? null,
    possible_duplicates: ((dups.data ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null }>)
      .map((d) => ({ id: d.id, name: d.name?.trim() || null, phone: d.phone, same: d.email && em && d.email.trim().toLowerCase() === em.toLowerCase() ? "email" : "name" })),
  }));
}
