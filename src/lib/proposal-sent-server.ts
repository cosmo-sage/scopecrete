import type { SupabaseClient } from "@supabase/supabase-js";
import { linkTokensIn } from "@/lib/proposal-links";

/**
 * A text or email that carries a proposal link marks that link sent (Coy, 2026-10-11: the Preview
 * now opens the customer's thread and he sends from there). Called after Quo or AgentMail took it,
 * under the session — members update documents in their org. A signed link is left as it is.
 */
export async function markLinksSent(supabase: SupabaseClient, orgId: string, body: string, via: "text" | "email"): Promise<void> {
  const tokens = linkTokensIn(body);
  if (!tokens.length) return;
  const { data } = await supabase.from("documents").select("id, status, sent_at, sent_via")
    .eq("org_id", orgId).in("token", tokens).is("revoked_at", null);
  await Promise.all(((data ?? []) as Array<{ id: string; status: string; sent_at: string | null; sent_via: string[] | null }>)
    .filter((d) => d.status !== "accepted")
    .map((d) => supabase.from("documents").update({
      sent_at: d.sent_at ?? new Date().toISOString(),
      sent_via: [...new Set([...(d.sent_via ?? []), via])],
      ...(d.status === "draft" ? { status: "sent" } : {}),
    }).eq("org_id", orgId).eq("id", d.id)));
}
