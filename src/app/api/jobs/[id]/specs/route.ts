import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { currentDigest, makeDigest, specBooks } from "@/lib/specs-digest-server";

/**
 * "Specs - read by Dusty" on a job (Coy, 2026-10-12). GET: the job's digest, if
 * any, and its spec books (with why the background reader skipped one). POST:
 * make it again from the spec books. Session client, org from the session.
 */
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { id } = await params;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));
  const [digest, books] = await Promise.all([currentDigest(supabase, orgId, id), specBooks(supabase, orgId, id)]);
  return applyCookies(NextResponse.json({
    digest,
    books: books.map((b) => ({ id: b.id, name: b.name, byte_size: b.byte_size, read_state: b.read_state, read_error: b.read_error })),
  }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const { id } = await params;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));
  const made = await makeDigest(supabase, orgId, userId, id);
  if (!made.ok) return applyCookies(NextResponse.json({ error: made.error }, { status: 422 }));
  return applyCookies(NextResponse.json(made));
}
