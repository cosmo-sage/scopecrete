import type { ApiSession } from "@/lib/api-auth";
import { numberer } from "@/lib/proposal-number";

/**
 * The org's proposal numbering (SE-26-0001-A), read under the session: the
 * org's name and every proposal row's job and creation time. RLS decides;
 * the org filter is explicit. See src/lib/proposal-number.ts.
 */
type Sb = ApiSession["supabase"];

export async function proposalNumbers(sb: Sb, orgId: string) {
  const [{ data: org }, { data: rows }] = await Promise.all([
    sb.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    sb.from("job_proposals").select("job_id, created_at").eq("org_id", orgId).order("created_at").limit(20000),
  ]);
  return numberer((org as { name?: string | null } | null)?.name ?? null, (rows ?? []) as Array<{ job_id: string; created_at: string }>);
}

export type ProposalNumbers = Awaited<ReturnType<typeof proposalNumbers>>;
