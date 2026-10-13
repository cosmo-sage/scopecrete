import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScopeFacts } from "@/lib/scope-builder";

/**
 * How far each job's scope has got, counted from the database (the Scope
 * Builder page and a job's Summary — src/lib/scope-builder.ts decides the step).
 * Session client: RLS decides what is counted. Counts only.
 */
export async function scopeFacts(supabase: SupabaseClient, orgId: string, ids: string[]): Promise<Map<string, ScopeFacts>> {
  const out = new Map<string, ScopeFacts>();
  if (!ids.length) return out;
  const [files, shapes, secs, ests, props, docs] = await Promise.all([
    supabase.from("files").select("job_id").eq("org_id", orgId).is("deleted_at", null).in("job_id", ids).limit(10000),
    supabase.from("takeoff_measurements").select("takeoff_parameters!inner(job_id)").eq("org_id", orgId).in("takeoff_parameters.job_id", ids).limit(10000),
    supabase.from("job_sections").select("job_id, length_ft, width_ft, sqft_override, count_qty").eq("org_id", orgId).in("job_id", ids).limit(5000),
    supabase.from("estimates").select("id, job_id, estimate_line_items(count)").eq("org_id", orgId).eq("status", "draft").in("job_id", ids),
    supabase.from("job_proposals").select("job_id, status").eq("org_id", orgId).eq("status", "final").is("deleted_at", null).in("job_id", ids),
    supabase.from("documents").select("job_id, sent_at, view_count, revoked_at").eq("org_id", orgId).not("proposal_id", "is", null).in("job_id", ids),
  ]);
  const bump = (m: Map<string, number>, k: string | null | undefined, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n); };
  const fileN = new Map<string, number>(), shapeN = new Map<string, number>(), secN = new Map<string, number>(), sizedN = new Map<string, number>(),
    lineN = new Map<string, number>(), viewN = new Map<string, number>();
  const finals = new Set<string>(), sent = new Set<string>();
  for (const f of (files.data ?? []) as Array<{ job_id: string }>) bump(fileN, f.job_id);
  for (const s of (shapes.data ?? []) as unknown as Array<{ takeoff_parameters: { job_id: string } | null }>) bump(shapeN, s.takeoff_parameters?.job_id);
  for (const s of (secs.data ?? []) as Array<Record<string, unknown>>) {
    bump(secN, s.job_id as string);
    if ((Number(s.length_ft) > 0 && Number(s.width_ft) > 0) || Number(s.sqft_override) > 0 || Number(s.count_qty) > 0) bump(sizedN, s.job_id as string);
  }
  for (const e of (ests.data ?? []) as unknown as Array<{ job_id: string; estimate_line_items: Array<{ count: number }> | null }>) bump(lineN, e.job_id, e.estimate_line_items?.[0]?.count ?? 0);
  for (const p of (props.data ?? []) as Array<{ job_id: string }>) finals.add(p.job_id);
  for (const d of (docs.data ?? []) as Array<{ job_id: string; sent_at: string | null; view_count: number | null; revoked_at: string | null }>) {
    if (d.sent_at) { sent.add(d.job_id); bump(viewN, d.job_id, d.view_count ?? 0); }
  }
  for (const id of ids) {
    out.set(id, {
      files: fileN.get(id) ?? 0, measured: shapeN.get(id) ?? 0, sized_sections: sizedN.get(id) ?? 0, sections: secN.get(id) ?? 0,
      budget_lines: lineN.get(id) ?? 0, final_proposal: finals.has(id), sent: sent.has(id), views: viewN.get(id) ?? 0,
    });
  }
  return out;
}
