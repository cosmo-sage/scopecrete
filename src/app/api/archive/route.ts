import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { cleanIds, type ArchiveKind } from "@/lib/archive";
import { archiveRecords } from "@/lib/archive-server";

/**
 * Archive or delete, restorable (migration 066; Coy, 2026-10-03).
 *
 * GET  ?kind=contact|customer|job → what is archived now (for the Archived lists).
 * POST { kind, ids, action: archive|delete, via? } → { log_id, count, label } —
 *      the log id is the Undo. Session client, org from the session (§7).
 */

export const dynamic = "force-dynamic";
const KINDS: ArchiveKind[] = ["contact", "customer", "job"];

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind === "job") {
    const { data } = await sb.from("jobs").select("id, title, address, status, archived_at, archived_reason, contact_id, customer_id")
      .eq("org_id", orgId).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(200);
    return applyCookies(NextResponse.json({ items: data ?? [] }));
  }
  if (kind === "customer") {
    const { data } = await sb.from("customers").select("id, name, customer_type, address_formatted, archived_at, archived_reason")
      .eq("org_id", orgId).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(200);
    return applyCookies(NextResponse.json({ items: data ?? [] }));
  }
  return applyCookies(NextResponse.json({ error: "kind must be job or customer (archived threads are in /api/threads?view=archived)." }, { status: 400 }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; ids?: unknown; action?: unknown; via?: unknown; note?: unknown };
  if (!KINDS.includes(b.kind as ArchiveKind)) return bad("Archive what — contact, customer or job?");
  const ids = cleanIds(b.ids);
  if (!ids) return bad("Which ones? (1 to 500 ids)");
  const action = b.action === "delete" ? "delete" : "archive";
  try {
    const r = await archiveRecords(sb, orgId, userId, { kind: b.kind as ArchiveKind, ids, action, via: b.via === "dusty" ? "dusty" : "coy", note: typeof b.note === "string" ? b.note : null });
    return applyCookies(NextResponse.json(r));
  } catch (e) { return bad(e instanceof Error ? e.message : String(e), 500); }
}
