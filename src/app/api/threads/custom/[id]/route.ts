import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { sanitizeRule } from "@/lib/rule-threads";

/**
 * One thread Coy made (migration 073).
 * PATCH { name }   — rename. PATCH { rule } — change a rule thread's filter (089).
 * DELETE           — retire it (archived_at); its contacts are untouched.
 * Session client; org from the session.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function change(req: NextRequest, id: string, patch: (b: Record<string, unknown>) => Record<string, unknown> | string) {
  if (!UUID.test(id)) return NextResponse.json({ error: "Not a thread id." }, { status: 400 });
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  let b: Record<string, unknown> = {};
  if (req.method === "PATCH") { try { b = await req.json(); } catch { return applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 })); } }
  const p = patch(b);
  if (typeof p === "string") return applyCookies(NextResponse.json({ error: p }, { status: 400 }));
  const { data, error } = await supabase.from("threads").update(p).eq("org_id", orgId).eq("id", id).is("archived_at", null).select("id");
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data?.length) return applyCookies(NextResponse.json({ error: "Thread not found." }, { status: 404 }));
  return applyCookies(NextResponse.json({ ok: true }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return change(req, id, (b) => {
    if (b.rule !== undefined) {
      const rule = sanitizeRule(b.rule);
      if (!rule) return "Pick at least one of calls, texts or emails.";
      const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      return name ? { rule, name } : { rule };
    }
    const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    return name ? { name } : "A thread needs a name.";
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return change(req, id, () => ({ archived_at: new Date().toISOString() }));
}
