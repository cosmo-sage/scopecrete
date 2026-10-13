import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, centralToUtc } from "@/lib/appointments";
import { APPT_COLS } from "@/lib/appointments-server";

/**
 * One appointment. PATCH { status?, canceled_reason?, kind?, title?, day?, start?, end?, address?, note? } — a new
 * time as a Central day and times; confirmed stamps confirmed_at. Never deleted: canceled keeps it, with its reason.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await req.json().catch(() => ({}));
  const bad = (error: string) => applyCookies(NextResponse.json({ error }, { status: 400 }));
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!(APPOINTMENT_STATUSES as readonly string[]).includes(b.status)) return bad("Not a status.");
    patch.status = b.status;
    patch.confirmed_at = b.status === "confirmed" ? new Date().toISOString() : b.status === "scheduled" ? null : undefined;
    if (patch.confirmed_at === undefined) delete patch.confirmed_at;
    patch.canceled_reason = b.status === "canceled" && typeof b.canceled_reason === "string" && b.canceled_reason.trim() ? b.canceled_reason.trim().slice(0, 300) : null;
  }
  if (b.kind !== undefined) {
    if (!(APPOINTMENT_KINDS as readonly string[]).includes(b.kind)) return bad("Not a kind of appointment.");
    patch.kind = b.kind;
  }
  if (typeof b.title === "string") {
    const t = b.title.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!t) return bad("It needs a name.");
    patch.title = t;
  }
  if (b.address !== undefined) patch.address = typeof b.address === "string" && b.address.trim() ? b.address.trim().slice(0, 200) : null;
  if (b.note !== undefined) patch.note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 1000) : null;
  if (typeof b.day === "string" && typeof b.start === "string") {
    const starts = centralToUtc(b.day, b.start);
    if (!starts) return bad("That day or time isn't one.");
    const ends = typeof b.end === "string" && b.end.trim() ? centralToUtc(b.day, b.end) : null;
    if (typeof b.end === "string" && b.end.trim() && !ends) return bad("That end time isn't one.");
    if (ends && ends <= starts) return bad("It has to end after it starts.");
    Object.assign(patch, { starts_at: starts, ends_at: ends });
    // A new time isn't what they confirmed.
    if (b.status === undefined) Object.assign(patch, { status: "scheduled", confirmed_at: null });
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data, error } = await supabase.from("appointments").update(patch).eq("org_id", orgId).eq("id", id).select(APPT_COLS).maybeSingle();
  if (error) return bad(error.message);
  if (!data) return applyCookies(NextResponse.json({ error: "No such appointment." }, { status: 404 }));
  return applyCookies(NextResponse.json({ appointment: data }));
}
