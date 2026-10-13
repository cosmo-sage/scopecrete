import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { icsFor, type Appointment } from "@/lib/appointments";
import { APPT_COLS } from "@/lib/appointments-server";

/**
 * One appointment as an .ics file — a phone's or a computer's calendar opens it and offers to add it. Signed in
 * only (session client); the event links back to its job (or person) in the app.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data } = await supabase.from("appointments").select(APPT_COLS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data) return applyCookies(NextResponse.json({ error: "No such appointment." }, { status: 404 }));
  const a = data as unknown as Appointment;
  const origin = req.nextUrl.origin;
  const link = a.job_id ? `${origin}/dashboard/scope/${a.job_id}/summary` : a.contact_id ? `${origin}/dashboard/messages/${a.contact_id}` : undefined;
  const name = a.title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "appointment";
  return applyCookies(new NextResponse(icsFor(a, { link }), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${name}.ics"`, "cache-control": "no-store" },
  }));
}
