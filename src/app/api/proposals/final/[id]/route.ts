import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { orgRow, orgView } from "@/lib/org-server";
import { signFiles } from "@/lib/files-server";

/**
 * One final proposal, for the Files page's preview panel (Coy, 2026-10-10:
 * "when I click on it i would like it to open in the preview panel like the
 * other files"). The frozen snapshot as it was sent, its type's name, the
 * org's logos and the cover photo signed. Read only; a final never changes.
 * Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const nope = () => applyCookies(NextResponse.json({ error: "No such proposal." }, { status: 404 }));
  if (!UUID.test(id)) return nope();
  const { data: p } = await supabase.from("job_proposals").select("id, job_id, version, project_type, finalized_at, snapshot")
    .eq("org_id", orgId).eq("id", id).eq("status", "final").maybeSingle();
  if (!p || !p.snapshot) return nope();
  const snap = p.snapshot as Record<string, unknown>;
  const coverId = typeof snap.cover_file_id === "string" && UUID.test(snap.cover_file_id) ? snap.cover_file_id : null;
  const [{ data: type }, org, { data: cover }] = await Promise.all([
    p.project_type ? supabase.from("org_project_types").select("label").eq("org_id", orgId).eq("key", p.project_type as string).maybeSingle() : Promise.resolve({ data: null }),
    orgRow(supabase, orgId),
    coverId ? supabase.from("files").select("id, storage_path, fetch_state").eq("org_id", orgId).eq("id", coverId).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const signed = cover ? await signFiles(supabase, [cover as Record<string, unknown>]) : [];
  return applyCookies(NextResponse.json({
    proposal: { id: p.id, job_id: p.job_id, version: p.version, project_type: p.project_type, finalized_at: p.finalized_at, snapshot: snap },
    type_label: (type as { label?: string } | null)?.label ?? "",
    org: org ? orgView(org) : null,
    cover_url: (signed[0]?.url as string | null | undefined) ?? null,
  }));
}
