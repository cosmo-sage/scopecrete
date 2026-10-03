import type { ApiSession } from "@/lib/api-auth";
import { archiveLabel, type ArchiveAction, type ArchiveKind } from "@/lib/archive";

type Sb = ApiSession["supabase"];

/**
 * Archive and delete, restorable (migration 066). Everything runs under the
 * session (RLS), every id filtered by the session's org. Each tap writes one
 * archive_log row carrying the stamp given to every row it touched, so Undo
 * puts back only what still carries that stamp.
 *
 *   contact  — a thread archived, or a vendor deleted.
 *   customer — the customer, its people and its live jobs.
 *   job      — the job (jobs.archived_at, which every list already leaves out).
 */
export async function archiveRecords(sb: Sb, orgId: string, userId: string,
  o: { kind: ArchiveKind; ids: string[]; action: ArchiveAction; via?: "coy" | "dusty" }) {
  const stamp = new Date().toISOString();
  const reason = o.action === "delete" ? `deleted${o.via === "dusty" ? " (Dusty's plan, Coy's tap)" : ""}` : "archived";
  const touched: { contacts: string[]; customers: string[]; jobs: string[] } = { contacts: [], customers: [], jobs: [] };
  const mark = { archived_at: stamp, archived_by: userId };

  if (o.kind === "contact") {
    const { data, error } = await sb.from("contacts").update({ ...mark, archived_reason: reason })
      .eq("org_id", orgId).in("id", o.ids).is("archived_at", null).is("merged_into_contact_id", null).select("id");
    if (error) throw new Error(error.message);
    touched.contacts = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  } else if (o.kind === "customer") {
    const { data, error } = await sb.from("customers").update({ ...mark, archived_reason: reason })
      .eq("org_id", orgId).in("id", o.ids).is("archived_at", null).select("id");
    if (error) throw new Error(error.message);
    touched.customers = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (touched.customers.length) {
      const { data: people } = await sb.from("contacts").update({ ...mark, archived_reason: "deleted with their customer" })
        .eq("org_id", orgId).in("customer_id", touched.customers).is("archived_at", null).select("id");
      touched.contacts = ((people ?? []) as Array<{ id: string }>).map((r) => r.id);
      const { data: jobs } = await sb.from("jobs").update({ ...mark, archived_reason: "deleted with their customer" })
        .eq("org_id", orgId).in("customer_id", touched.customers).is("archived_at", null).select("id");
      touched.jobs = ((jobs ?? []) as Array<{ id: string }>).map((r) => r.id);
    }
  } else {
    const { data, error } = await sb.from("jobs").update({ ...mark, archived_reason: reason })
      .eq("org_id", orgId).in("id", o.ids).is("archived_at", null).select("id");
    if (error) throw new Error(error.message);
    touched.jobs = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  const n = o.kind === "contact" ? touched.contacts.length : o.kind === "customer" ? touched.customers.length : touched.jobs.length;
  const label = archiveLabel(o.kind, o.action, n);
  if (!n) return { log_id: null, count: 0, label };
  const { data: log, error } = await sb.from("archive_log").insert({
    org_id: orgId, user_id: userId, kind: o.kind, action: o.action, via: o.via ?? "coy", label,
    undo: { stamp, ...touched },
  }).select("id").single();
  if (error) throw new Error(`archive_log: ${error.message}`);
  return { log_id: log.id as string, count: n, label };
}

/** Undo one tap: rows still carrying its stamp come back; anything changed since is left. */
export async function undoArchive(sb: Sb, orgId: string, logId: string) {
  const { data: log } = await sb.from("archive_log").select("id, undo, undone_at").eq("org_id", orgId).eq("id", logId).maybeSingle();
  if (!log) return { ok: false as const, error: "Nothing to undo." };
  if (log.undone_at) return { ok: true as const, restored: 0 };
  const u = (log.undo ?? {}) as { stamp?: string; contacts?: string[]; customers?: string[]; jobs?: string[] };
  if (!u.stamp) return { ok: false as const, error: "That can't be undone." };
  const clear = { archived_at: null, archived_by: null, archived_reason: null };
  let restored = 0;
  for (const [table, ids] of [["customers", u.customers], ["contacts", u.contacts], ["jobs", u.jobs]] as const) {
    if (!ids?.length) continue;
    const { data } = await sb.from(table).update(clear).eq("org_id", orgId).in("id", ids).eq("archived_at", u.stamp).select("id");
    restored += (data ?? []).length;
  }
  await sb.from("archive_log").update({ undone_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", logId);
  return { ok: true as const, restored };
}

/**
 * Restore by hand from an Archived list (any time later). A customer brings back
 * the people and jobs deleted with it; a thread or job comes back alone.
 */
export async function restoreRecords(sb: Sb, orgId: string, userId: string, kind: ArchiveKind, ids: string[]) {
  const clear = { archived_at: null, archived_by: null, archived_reason: null };
  let n = 0;
  if (kind === "contact" || kind === "job") {
    const table = kind === "contact" ? "contacts" : "jobs";
    const { data, error } = await sb.from(table).update(clear).eq("org_id", orgId).in("id", ids).not("archived_at", "is", null).select("id");
    if (error) throw new Error(error.message);
    n = (data ?? []).length;
  } else {
    const { data, error } = await sb.from("customers").update(clear).eq("org_id", orgId).in("id", ids).not("archived_at", "is", null).select("id");
    if (error) throw new Error(error.message);
    n = (data ?? []).length;
    await sb.from("contacts").update(clear).eq("org_id", orgId).in("customer_id", ids).eq("archived_reason", "deleted with their customer");
    await sb.from("jobs").update(clear).eq("org_id", orgId).in("customer_id", ids).eq("archived_reason", "deleted with their customer");
  }
  if (n) {
    await sb.from("archive_log").insert({ org_id: orgId, user_id: userId, kind, action: "restore", label: `Restored ${n}`, undo: { ids } });
  }
  return n;
}
