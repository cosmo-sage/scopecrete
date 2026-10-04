import type { ApiSession } from "@/lib/api-auth";
import { STATUS_NAME } from "@/lib/jobs/stages";
import type { CustomThread } from "@/lib/v34/threads";

type Sb = ApiSession["supabase"];

/**
 * The threads Coy made (migration 073), each with its members and, for a job
 * thread, the job's line. Members that were merged away or archived don't count.
 * Session client: RLS decides.
 */
export async function loadCustomThreads(sb: Sb, orgId: string): Promise<CustomThread[]> {
  const { data: rows } = await sb.from("threads").select("id, name, job_id, customer_id, source, created_at")
    .eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: true });
  const threads = (rows ?? []) as Array<{ id: string; name: string; job_id: string | null; customer_id: string | null; source: CustomThread["source"] }>;
  if (!threads.length) return [];
  const ids = threads.map((t) => t.id);
  const jobIds = [...new Set(threads.map((t) => t.job_id).filter(Boolean))] as string[];
  const [{ data: mem }, { data: jobs }] = await Promise.all([
    sb.from("thread_contacts").select("thread_id, contact_id, contacts!inner(merged_into_contact_id, archived_at)").eq("org_id", orgId).in("thread_id", ids),
    jobIds.length ? sb.from("jobs").select("id, title, status, address").eq("org_id", orgId).in("id", jobIds) : Promise.resolve({ data: [] }),
  ]);
  const byThread = new Map<string, string[]>();
  for (const m of (mem ?? []) as unknown as Array<{ thread_id: string; contact_id: string; contacts: { merged_into_contact_id: string | null; archived_at: string | null } | null }>) {
    if (m.contacts?.merged_into_contact_id) continue;
    byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m.contact_id]);
  }
  const job = new Map(((jobs ?? []) as Array<{ id: string; title: string | null; status: string | null; address: string | null }>).map((j) => [j.id, j]));
  return threads.map((t) => {
    const j = t.job_id ? job.get(t.job_id) : null;
    const contact_ids = byThread.get(t.id) ?? [];
    return {
      id: t.id, name: t.name, job_id: t.job_id, customer_id: t.customer_id, source: t.source,
      job_line: j ? [j.title || "Untitled job", j.status ? STATUS_NAME[j.status] ?? j.status : null, j.address].filter(Boolean).join(" · ") : null,
      contact_ids, count: contact_ids.length,
    };
  });
}
