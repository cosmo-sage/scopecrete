import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * Full-text search (migration 054): every message, call summary and
 * transcript, person (customers and vendors), note, job and file.
 *
 * GET ?q= → { groups: [{ kind, label, items: [{ id, title, snippet, at, href }] }] }
 *
 * sc_search() is SECURITY INVOKER over the session client, so RLS decides
 * what comes back — the same rows the app shows. Snippets mark the match
 * with « ».
 */

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { person: "People", message: "Messages", call: "Calls", note: "Notes", job: "Jobs", file: "Files" };
const ORDER = ["person", "job", "message", "call", "note", "file"];

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return applyCookies(NextResponse.json({ groups: [] }));
  const { data, error } = await supabase.rpc("sc_search", { p_q: q, p_per_kind: 8 });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  type Row = { kind: string; id: string; contact_id: string | null; job_id: string | null; title: string | null; snippet: string | null; at: string | null; rank: number };
  const href = (r: Row) =>
    r.kind === "job" ? `/dashboard/scope/${r.id}/summary`
    : r.kind === "file" ? `/dashboard/files?file=${r.id}`
    : r.contact_id ? `/dashboard/messages/${r.contact_id}` : r.job_id ? `/dashboard/scope/${r.job_id}/summary` : "/dashboard/messages";
  const rows = (data ?? []) as Row[];
  const groups = ORDER.map((k) => ({
    kind: k, label: LABEL[k],
    items: rows.filter((r) => r.kind === k).map((r) => ({ id: r.id, title: r.title ?? "", snippet: (r.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 240), at: r.at, href: href(r) })),
  })).filter((g) => g.items.length);
  return applyCookies(NextResponse.json({ groups }));
}
