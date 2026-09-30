import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * PATCH { name } — your own display name (Coy on Vercel, 2026-09-30: "it
 * should show User: Coy Sacco", not the email). Saved on your own auth
 * account's metadata (full_name), which only you can change; teammates read
 * it through sc_org_people().
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 80) return applyCookies(NextResponse.json({ error: "Your name must be 1 to 80 characters." }, { status: 400 }));
  const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return applyCookies(NextResponse.json({ name: (data.user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? name }));
}
