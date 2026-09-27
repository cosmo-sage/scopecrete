import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { LEAD_SOURCES } from "@/lib/jobs/stages";
import { PROVIDERS } from "@/lib/lines";

/** Edit a line's label, provider, provider id and default lead source. */

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
  if (!Object.keys(patch).length) return fail("Nothing to change.");

  const { data, error } = await supabase.from("org_phone_numbers").update(patch)
    .eq("org_id", orgId).eq("id", id)
    .select("id, phone_e164, label, provider, provider_number_id, default_lead_source").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("No such line in your organisation.", 404);
  return applyCookies(NextResponse.json({ line: data }));
}
