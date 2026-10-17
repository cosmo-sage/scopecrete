import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadCustomThreads } from "@/lib/threads-server";
import { isOpenJob, type SpacePerson } from "@/lib/v34/spaces";

/**
 * The Spaces rail and a job Space's drawer (Claude Design "Dusty Home", step 1 — no
 * migration; src/lib/v34/spaces.ts). Session client, org from the session, RLS decides.
 *
 *   GET            → { jobs: open jobs, newest first; collections: the threads Coy made }
 *   GET ?job=<id>  → { job, people (each number from contact_phones), emails (conversations filed on the job) }
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const ok = (b: unknown) => applyCookies(NextResponse.json(b));
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));

  const jobId = req.nextUrl.searchParams.get("job");
  if (!jobId) {
    const [{ data: jobs, error }, collections] = await Promise.all([
      supabase.from("jobs").select("id, title, status, customer_id, created_at, customers!jobs_customer_id_fkey(name)")
        .eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(200),
      loadCustomThreads(supabase, orgId).catch(() => []),
    ]);
    if (error) return bad(`jobs: ${error.message}`, 500);
    const rows = ((jobs ?? []) as unknown as Array<{ id: string; title: string | null; status: string | null; customers: { name: string | null } | null }>)
      .filter((j) => isOpenJob(j.status))
      .map((j) => ({ id: j.id, title: j.title?.trim() || "Untitled job", status: j.status, customer: j.customers?.name ?? null }));
    return ok({ jobs: rows, collections: collections.map((c) => ({ id: c.id, name: c.name, count: c.count, source: c.source })) });
  }

  if (!UUID.test(jobId)) return bad("Not a job id.");
  const { data: job, error: jobErr } = await supabase.from("jobs").select("id, title, status, contact_id, customer_id")
    .eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (jobErr) return bad(`jobs: ${jobErr.message}`, 500);
  if (!job) return bad("Job not found.", 404);

  // Who is on it: its person, its customer's people, and its crew and suppliers.
  const [{ data: custPeople }, { data: crew }] = await Promise.all([
    job.customer_id
      ? supabase.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", job.customer_id).is("merged_into_contact_id", null).is("archived_at", null).limit(30)
      : Promise.resolve({ data: [] }),
    supabase.from("job_vendors").select("contact_id").eq("org_id", orgId).eq("job_id", jobId).limit(30),
  ]);
  const ids = [...new Set([job.contact_id, ...((custPeople ?? []) as Array<{ id: string }>).map((c) => c.id),
    ...((crew ?? []) as Array<{ contact_id: string }>).map((c) => c.contact_id)].filter((x): x is string => !!x))];

  const people: SpacePerson[] = [];
  if (ids.length) {
    const [{ data: cs }, { data: phones }, { data: mails }] = await Promise.all([
      supabase.from("contacts").select("id, name, phone, email").eq("org_id", orgId).in("id", ids).is("merged_into_contact_id", null),
      supabase.from("contact_phones").select("contact_id, phone_e164, label, is_primary").eq("org_id", orgId).in("contact_id", ids),
      supabase.from("contact_emails").select("contact_id, email, is_primary").eq("org_id", orgId).in("contact_id", ids),
    ]);
    const byId = new Map(((cs ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null }>).map((c) => [c.id, c]));
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) continue;
      const list = ((phones ?? []) as Array<{ contact_id: string; phone_e164: string; label: string | null; is_primary: boolean | null }>)
        .filter((p) => p.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))
        .map((p) => ({ phone: p.phone_e164, label: p.label }));
      // The number on the contact row is always a thread, listed or not (Threads v2).
      if (c.phone && !list.some((p) => p.phone === c.phone)) list.unshift({ phone: c.phone, label: null });
      const email = c.email ?? ((mails ?? []) as Array<{ contact_id: string; email: string; is_primary: boolean | null }>)
        .filter((m) => m.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))[0]?.email ?? null;
      people.push({ id, name: c.name, phones: list, email });
    }
  }

  // Email conversations filed on the job, newest first (migration 100's `conversation`).
  const { data: em } = await supabase.from("emails").select("conversation, subject, sent_at, created_at")
    .eq("org_id", orgId).eq("job_id", jobId).order("created_at", { ascending: false }).limit(60);
  const seen = new Set<string>();
  const emails: Array<{ key: string; subject: string; at: string | null }> = [];
  for (const e of (em ?? []) as Array<{ conversation: string | null; subject: string | null; sent_at: string | null; created_at: string }>) {
    if (!e.conversation || seen.has(e.conversation)) continue;
    seen.add(e.conversation);
    emails.push({ key: e.conversation, subject: e.subject?.trim() || "(no subject)", at: e.sent_at ?? e.created_at });
  }

  return ok({ job: { id: job.id, title: job.title?.trim() || "Untitled job", status: job.status }, people, emails });
}
