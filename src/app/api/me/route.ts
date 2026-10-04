import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * PATCH { name?, phone? } — your own display name (Coy on Vercel, 2026-09-30:
 * "it should show User: Coy Sacco", not the email) and your phone (Coy,
 * 2026-10-04: a proposal's Prepared by carries "my phone number"). Saved on
 * your own auth account's metadata (full_name, phone), which only you can
 * change; teammates read the name through sc_org_people(). A blank phone
 * clears it.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;
  const body = await req.json().catch(() => ({}));
  const bad = (error: string) => applyCookies(NextResponse.json({ error }, { status: 400 }));
  const data: Record<string, string | null> = {};
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 1 || name.length > 80) return bad("Your name must be 1 to 80 characters.");
    data.full_name = name;
  }
  if (body?.phone !== undefined) {
    const raw = typeof body.phone === "string" ? body.phone.trim() : "";
    const digits = raw.replace(/\D/g, "");
    const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (raw && ten.length !== 10) return bad("A phone number has 10 digits.");
    data.phone = raw ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : null;
  }
  if (!Object.keys(data).length) return bad("Nothing to save.");
  const { data: saved, error } = await supabase.auth.updateUser({ data });
  if (error) return bad(error.message);
  const meta = (saved.user?.user_metadata ?? {}) as { full_name?: string; phone?: string | null };
  return applyCookies(NextResponse.json({ name: meta.full_name ?? null, phone: meta.phone ?? null }));
}
