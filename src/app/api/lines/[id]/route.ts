import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { LEAD_SOURCES } from "@/lib/jobs/stages";
import { LINE_COLORS, PROVIDERS } from "@/lib/lines";

/**
 * Edit a line: label, provider, provider id, default lead source, its colour
 * (migration 077) and { is_primary: true } — the one primary, the others off.
 *
 * DELETE removes a line (Coy, 2026-10-09). Never the primary. A line nothing
 * was ever filed under is deleted outright; one with calls or texts on it is
 * switched off (active = false) instead, so every past message keeps the line
 * it came in on and Threads and Logs still read. Nothing else is touched.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Body must be JSON."); }

  const patch: Record<string, string | null> = {};
  for (const f of ["label", "provider", "provider_number_id", "default_lead_source"]) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v !== null && typeof v !== "string") return fail(`${f} must be text or null.`);
    patch[f] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if (patch.provider && !PROVIDERS.some((p) => p.k === patch.provider)) return fail(`provider must be one of ${PROVIDERS.map((p) => p.k).join(", ")}.`);
  if (patch.default_lead_source && !LEAD_SOURCES.some((l) => l.k === patch.default_lead_source)) return fail("Unknown lead source.");
  if ("color_token" in body) {
    const c = body.color_token;
    if (c !== null && !(typeof c === "string" && (LINE_COLORS as readonly string[]).includes(c))) return fail(`color must be one of ${LINE_COLORS.join(", ")}.`);
    patch.color_token = (c as string | null) ?? null;
  }
  if (body.is_primary === true) {
    const { data: me } = await supabase.from("org_phone_numbers").select("id").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (!me) return fail("No such line in your organisation.", 404);
    const { error: e1 } = await supabase.from("org_phone_numbers").update({ is_primary: false }).eq("org_id", orgId).neq("id", id);
    if (e1) return fail(e1.message, 500);
    (patch as Record<string, unknown>).is_primary = true;
  }
  if (!Object.keys(patch).length) return fail("Nothing to change.");

  const { data, error } = await supabase.from("org_phone_numbers").update(patch)
    .eq("org_id", orgId).eq("id", id)
    .select("*").maybeSingle();
  if (error) return fail(/color_token/.test(error.message) ? "Line colours need migration 077 applied." : error.message, 500);
  if (!data) return fail("No such line in your organisation.", 404);
  return applyCookies(NextResponse.json({ line: data }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));

  const { data: line } = await supabase.from("org_phone_numbers").select("id, is_primary").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!line) return fail("No such line in your organisation.", 404);
  if (line.is_primary) return fail("This is your primary line. Make another line primary first, then delete this one.", 409);

  // Anything filed under this line? (These references block a delete.)
  const refs = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("phone_number_id", id),
    supabase.from("voip_calls").select("id", { count: "exact", head: true }).eq("phone_number_id", id),
    supabase.from("sms_threads").select("id", { count: "exact", head: true }).eq("phone_number_id", id),
    supabase.from("quo_events").select("id", { count: "exact", head: true }).eq("phone_number_id", id),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("source_phone_number_id", id),
  ]);
  const used = refs.some((r) => (r.count ?? 0) > 0 || r.error);

  if (!used) {
    const { error } = await supabase.from("org_phone_numbers").delete().eq("org_id", orgId).eq("id", id);
    if (!error) return applyCookies(NextResponse.json({ deleted: true, kept_history: false }));
    // A reference we couldn't see: fall through and switch it off instead.
  }
  const { error } = await supabase.from("org_phone_numbers").update({ active: false }).eq("org_id", orgId).eq("id", id);
  if (error) return fail(error.message, 500);
  return applyCookies(NextResponse.json({ deleted: true, kept_history: true }));
}
