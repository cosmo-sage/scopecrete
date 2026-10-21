import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { loadCustomThreads } from "@/lib/threads-server";
import { isOpenJob, openJobCustomers, type SpaceEmail, type SpaceLast, type SpacePerson } from "@/lib/v34/spaces";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Spaces rail and a job Space's drawer (Claude Design "Dusty Home", step 1 — no
 * migration; src/lib/v34/spaces.ts). Session client, org from the session, RLS decides.
 *
 *   GET            → { jobs: open jobs, newest first; customers: those with an open job; collections: the threads Coy made }
 *   GET ?job=<id>       → { job, people (each number and address), emails (conversations filed on the job, with their address) }
 *   GET ?customer=<id>  → { people (the customer's), emails (filed on the customer) }  — its Channels shelf
 *   GET ?vendor=<id>    → { people (the vendor's contact), emails (filed on them) }
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
  if (!jobId && (req.nextUrl.searchParams.has("customer") || req.nextUrl.searchParams.has("vendor"))) return recordDetail(req, supabase, orgId, ok, bad);
  if (!jobId) {
    const [{ data: jobs, error }, collections] = await Promise.all([
      supabase.from("jobs").select("id, title, status, customer_id, created_at, customers!jobs_customer_id_fkey(name)")
        .eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(200),
      loadCustomThreads(supabase, orgId).catch(() => []),
    ]);
    if (error) return bad(`jobs: ${error.message}`, 500);
    const rows = ((jobs ?? []) as unknown as Array<{ id: string; title: string | null; status: string | null; customer_id: string | null; customers: { name: string | null } | null }>)
      .filter((j) => isOpenJob(j.status))
      .map((j) => ({ id: j.id, title: j.title?.trim() || "Untitled job", status: j.status, customer: j.customers?.name ?? null, customer_id: j.customer_id }));
    return ok({ jobs: rows, customers: openJobCustomers(rows), collections: collections.map((c) => ({ id: c.id, name: c.name, count: c.count, source: c.source })) });
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
  const [people, emails] = await Promise.all([loadPeople(supabase, orgId, ids), loadEmails(supabase, orgId, "job_id", jobId)]);
  return ok({ job: { id: job.id, title: job.title?.trim() || "Untitled job", status: job.status }, people, emails });
}

/** A customer's or vendor's people and email, for its Space's Channels shelf. */
async function recordDetail(req: NextRequest, supabase: SupabaseClient, orgId: string, ok: (b: unknown) => NextResponse, bad: (m: string, s?: number) => NextResponse) {
  const customerId = req.nextUrl.searchParams.get("customer");
  const vendorId = req.nextUrl.searchParams.get("vendor");
  const id = customerId ?? vendorId ?? "";
  if (!UUID.test(id)) return bad("Not an id.");
  if (customerId) {
    const { data: cs, error } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("customer_id", id)
      .is("merged_into_contact_id", null).is("archived_at", null).limit(40);
    if (error) return bad(`contacts: ${error.message}`, 500);
    const ids = ((cs ?? []) as Array<{ id: string }>).map((c) => c.id);
    const [people, emails] = await Promise.all([loadPeople(supabase, orgId, ids), loadEmails(supabase, orgId, "customer_id", id)]);
    return ok({ people, emails });
  }
  const [people, emails] = await Promise.all([loadPeople(supabase, orgId, [id]), loadEmails(supabase, orgId, "contact_id", id)]);
  return ok({ people, emails });
}

async function loadPeople(supabase: SupabaseClient, orgId: string, ids: string[]): Promise<SpacePerson[]> {
  const people: SpacePerson[] = [];
  if (!ids.length) return people;
  const [{ data: cs }, { data: phones }, { data: mails }] = await Promise.all([
    supabase.from("contacts").select("id, name, phone, email").eq("org_id", orgId).in("id", ids).is("merged_into_contact_id", null),
    supabase.from("contact_phones").select("contact_id, phone_e164, label, is_primary").eq("org_id", orgId).in("contact_id", ids),
    supabase.from("contact_emails").select("contact_id, email, is_primary").eq("org_id", orgId).in("contact_id", ids),
  ]);
  // The newest call or text on each number, for the drawer's preview (Threads v3, 2026-10-19).
  const { data: msgs } = await supabase.from("messages").select("contact_id, channel, direction, occurred_at, body_text, summary, duration_seconds, from_address, to_address")
    .eq("org_id", orgId).in("contact_id", ids).order("occurred_at", { ascending: false }).limit(400);
  const lastOn = new Map<string, SpaceLast>();
  type M = { contact_id: string; channel: string | null; direction: string | null; occurred_at: string; body_text: string | null; summary: string | null;
    duration_seconds: number | null; from_address: string | null; to_address: string | null };
  for (const m of (msgs ?? []) as M[]) {
    const out = m.direction === "outbound" || m.direction === "out";
    const other = out ? m.to_address : m.from_address;
    if (!other) continue;
    const k = `${m.contact_id}:${other}`;
    if (lastOn.has(k)) continue;
    const call = m.channel === "call" || m.channel === "voicemail";
    const words = (m.body_text ?? "").replace(/\s+/g, " ").trim();
    const text = call ? (m.channel === "voicemail" ? "Voicemail" : `Call${m.duration_seconds ? ` · ${Math.max(1, Math.round(m.duration_seconds / 60))} min` : ""}`)
      : words || (m.summary ?? "").trim() || "Photo or file";
    lastOn.set(k, { text: text.slice(0, 90), at: m.occurred_at, out });
  }
  const byId = new Map(((cs ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null }>).map((c) => [c.id, c]));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    const list = ((phones ?? []) as Array<{ contact_id: string; phone_e164: string; label: string | null; is_primary: boolean | null }>)
      .filter((p) => p.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))
      .map((p) => ({ phone: p.phone_e164, label: p.label, last: lastOn.get(`${id}:${p.phone_e164}`) ?? null }));
    // The number on the contact row is always a thread, listed or not (Threads v2).
    if (c.phone && !list.some((p) => p.phone === c.phone)) list.unshift({ phone: c.phone, label: null, last: lastOn.get(`${id}:${c.phone}`) ?? null });
    const addrs = ((mails ?? []) as Array<{ contact_id: string; email: string; is_primary: boolean | null }>)
      .filter((m) => m.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary)).map((m) => m.email);
    const email = c.email ?? addrs[0] ?? null;
    people.push({ id, name: c.name, phones: list, email, emails: [...new Set([...(c.email ? [c.email] : []), ...addrs])] });
  }
  return people;
}

/** Email conversations filed on it, newest first (migration 100's `conversation`), each with the outside address. */
async function loadEmails(supabase: SupabaseClient, orgId: string, col: "job_id" | "customer_id" | "contact_id", id: string): Promise<SpaceEmail[]> {
  const { data: em } = await supabase.from("emails").select("conversation, subject, sent_at, created_at, direction, from_address, original_from_address, to_addresses")
    .eq("org_id", orgId).eq(col, id).order("created_at", { ascending: false }).limit(80);
  const seen = new Set<string>();
  const emails: SpaceEmail[] = [];
  type E = { conversation: string | null; subject: string | null; sent_at: string | null; created_at: string; direction: string | null;
    from_address: string | null; original_from_address: string | null; to_addresses: string[] | null };
  for (const e of (em ?? []) as E[]) {
    if (!e.conversation || seen.has(e.conversation)) continue;
    seen.add(e.conversation);
    const address = e.direction === "out" ? (e.to_addresses?.[0] ?? null) : (e.original_from_address ?? e.from_address);
    emails.push({ key: e.conversation, subject: e.subject?.trim() || "(no subject)", at: e.sent_at ?? e.created_at, address });
  }
  return emails;
}
