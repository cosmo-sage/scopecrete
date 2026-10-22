import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { before120, readAccess, WAITING_120 } from "@/lib/access";

/**
 * PATCH { role, contact_id, pages, all_jobs, job_ids } → change someone's
 * access (sc_set_member_access, 081: owners only; an onsite estimator must be
 * a vendor contact; never your own role, never the last owner; audited).
 *
 * PATCH { name } → name them in this org (sc_set_member_name, 102: an owner
 * names anyone, anyone names themselves; blank clears it).
 *
 * DELETE → take someone out of the org (sc_remove_member: owners only, never
 * yourself, never the last owner; audited). Their account stays; they just
 * stop seeing this org.
 */
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: who } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({}));
  if (b && "name" in b && !("role" in b)) {
    const { data, error } = await supabase.rpc("sc_set_member_name", { p_org: orgId, p_user: who, p_name: typeof b.name === "string" ? b.name : "" });
    if (error) {
      const missing = /could not find the function|does not exist/i.test(error.message);
      return applyCookies(NextResponse.json({ error: missing ? "Naming people isn't switched on yet — migration 102 is waiting to be applied."
        : /not allowed/.test(error.message) ? "Only an owner can name people." : error.message }, { status: missing ? 503 : 400 }));
    }
    return applyCookies(NextResponse.json({ name: data ?? null }));
  }
  const a = readAccess(b);
  if (!a.role) return applyCookies(NextResponse.json({ error: "Which role?" }, { status: 400 }));
  const setAccess = (pages: string[]) => supabase.rpc("sc_set_member_access", {
    p_org: orgId, p_user: who, p_role: a.role, p_contact: a.contact_id, p_pages: pages, p_all_jobs: a.all_jobs, p_jobs: a.job_ids });
  let { error } = await setAccess(a.pages);
  if (error && /Unknown page/.test(error.message)) {
    const old = before120(a.pages);
    if (old.blocked.length) return applyCookies(NextResponse.json({ error: WAITING_120 }, { status: 503 }));
    ({ error } = await setAccess(old.pages));
  }
  if (error) {
    const missing = /could not find the function|does not exist/i.test(error.message);
    return applyCookies(NextResponse.json({ error: missing ? "Access settings aren't switched on yet — migration 081 is waiting to be applied."
      : /not allowed/.test(error.message) ? "Only an owner can change access." : error.message }, { status: missing ? 503 : 400 }));
  }
  return applyCookies(NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: who } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { error } = await supabase.rpc("sc_remove_member", { p_org: orgId, p_user: who });
  if (error) {
    // sc_remove_member (migration 101) waits on Coy's word (DECISIONS §2g) — say so plainly until it is applied.
    const missing = /could not find the function|does not exist/i.test(error.message);
    return applyCookies(NextResponse.json({ error: missing ? "Removing people isn't switched on yet — migration 101 is waiting to be applied."
      : /not allowed/.test(error.message) ? "Only an owner can remove people." : error.message }, { status: missing ? 503 : 400 }));
  }
  return applyCookies(NextResponse.json({ ok: true }));
}
