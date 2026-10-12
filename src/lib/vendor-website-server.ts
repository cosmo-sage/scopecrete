import type { ApiSession } from "@/lib/api-auth";
import { missingWebsite } from "@/lib/vendor-website";

type Sb = ApiSession["supabase"];

/** Websites for these contacts — an empty map before migration 105. */
export async function readWebsites(sb: Sb, orgId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await sb.from("contacts").select("id, website").eq("org_id", orgId).in("id", ids.slice(0, 1000)).not("website", "is", null);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ id: string; website: string | null }>) if (r.website) out.set(r.id, r.website);
  return out;
}

/**
 * Write a contact's website. Before migration 105 there is no column: the
 * address is kept as an internal note on them instead, so nothing is lost.
 */
export async function writeWebsite(sb: Sb, orgId: string, userId: string, id: string, url: string | null): Promise<{ ok: boolean; noted?: boolean; error?: string }> {
  const { error } = await sb.from("contacts").update({ website: url }).eq("org_id", orgId).eq("id", id);
  if (!error) return { ok: true };
  if (!missingWebsite(error)) return { ok: false, error: error.message };
  if (!url) return { ok: true };
  await sb.from("contact_notes").insert({ org_id: orgId, contact_id: id, body: `Website: ${url}`, created_by: userId });
  return { ok: true, noted: true };
}
