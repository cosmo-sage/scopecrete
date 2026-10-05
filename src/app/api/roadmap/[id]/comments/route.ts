import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { missing084 } from "@/lib/roadmap";

/**
 * Comments on a roadmap item (migration 084). Each shows its writer's name
 * and their org's, read when it was written.
 * GET → { comments }   POST { body } → 201 { id }   DELETE ?comment= → yours (or any, for Coy).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function open(req: NextRequest, params: Promise<{ id: string }>) {
  const { id } = await params;
  const result = await getApiSession(req);
  return { id, result };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id, result } = await open(req, params);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  if (!UUID.test(id)) return applyCookies(NextResponse.json({ error: "Not an item" }, { status: 404 }));
  const { data, error } = await supabase.rpc("sc_roadmap_comments", { p_item: id });
  if (error) return applyCookies(NextResponse.json(missing084(error) ? { comments: [], missing: true } : { error: error.message }, { status: missing084(error) ? 200 : 500 }));
  return applyCookies(NextResponse.json({ comments: data ?? [] }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id, result } = await open(req, params);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!UUID.test(id)) return bad("Not an item", 404);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const body = typeof b?.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (!body) return bad("Write something first.");
  const { data, error } = await supabase.rpc("sc_roadmap_comment", { p_item: id, p_org: orgId, p_body: body });
  if (error) return bad(error.message, /not found/.test(error.message) ? 404 : 400);
  return applyCookies(NextResponse.json({ id: data }, { status: 201 }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id, result } = await open(req, params);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const comment = req.nextUrl.searchParams.get("comment") ?? "";
  if (!UUID.test(id) || !UUID.test(comment)) return applyCookies(NextResponse.json({ error: "Not a comment" }, { status: 404 }));
  const { error } = await supabase.rpc("sc_roadmap_uncomment", { p_comment: comment });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
