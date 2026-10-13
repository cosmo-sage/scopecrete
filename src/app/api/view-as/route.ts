import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { viewAsFor } from "@/lib/access-server";
import { readViewAs, VIEW_AS_COOKIE, VIEW_AS_MAX_AGE } from "@/lib/view-as";

/**
 * View as a teammate (Coy, 2026-10-12; src/lib/view-as.ts).
 *
 * POST { user_id } → the owner's preview of that member: sets the sc_view_as cookie, but only
 *   after checking (as /api/session/me does on every read) that the caller owns this org and
 *   the id is a member of it. Not yourself.
 * DELETE → back to your own view.
 *
 * Session client; the org comes from the session. Nothing about the teammate's account is
 * touched — this changes only what the owner's own browser is shown.
 */
export const dynamic = "force-dynamic";

const opts = (req: NextRequest, maxAge: number) => ({
  path: "/", httpOnly: true, sameSite: "lax" as const, secure: req.nextUrl.protocol === "https:", maxAge,
});
// Host-only: the preview is of this org's address alone, never carried to another org's.

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies, userId } = result.session;
  const b = await req.json().catch(() => ({}));
  const id = readViewAs(typeof b?.user_id === "string" ? b.user_id : null);
  if (!id) return applyCookies(NextResponse.json({ error: "Who?" }, { status: 400 }));
  if (id === userId) return applyCookies(NextResponse.json({ error: "That's your own view." }, { status: 400 }));
  // Check it the same way every read will: put the id in a request-shaped cookie jar.
  const probe = { cookies: { get: (n: string) => (n === VIEW_AS_COOKIE ? { value: id } : undefined) } } as unknown as NextRequest;
  const who = await viewAsFor(probe, result.session);
  if (!who) return applyCookies(NextResponse.json({ error: "Only an owner can view as a member of this organization." }, { status: 403 }));
  const res = NextResponse.json({ viewing_as: { user_id: who.user_id, name: who.name ?? who.email, role: who.role } });
  res.cookies.set(VIEW_AS_COOKIE, id, opts(req, VIEW_AS_MAX_AGE));
  return applyCookies(res);
}

export async function DELETE(req: NextRequest) {
  const result = await getApiSession(req);
  const res = NextResponse.json({ ok: true });
  // Cleared even when the session can't be read — never leave anyone stuck in a preview.
  res.cookies.set(VIEW_AS_COOKIE, "", opts(req, 0));
  return result.ok ? result.session.applyCookies(res) : res;
}
