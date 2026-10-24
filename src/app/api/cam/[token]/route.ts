import { NextRequest, NextResponse } from "next/server";
import { getReaderClient } from "@/lib/api-auth";
import { CAMERA_TOKEN } from "@/lib/camera-link";

/**
 * A customer's camera link (migration 128) — scopecrete.ai/cam/<token>, no
 * login. No service role: the request's own client (anon when signed out)
 * calls the SECURITY DEFINER doors.
 * GET  → what the page shows (sc_camera_link; the opening counted unless the
 *        reader is in the org).
 * POST { client_id, path, thumb?, taken_at?, note? } → one shot, already
 *        uploaded by the phone as anon into the link's own folder, recorded as
 *        a file on the job and person (sc_camera_shot checks it all again; a
 *        retry with the same client_id returns the same file).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const notYet = (m: string) => /sc_camera/.test(m) && /does not exist|not find/i.test(m);

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!CAMERA_TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_camera_link", { p_token: token });
  if (error) return notYet(error.message ?? "") ? json({ error: "This camera isn't switched on yet." }, 503) : json({ error: "Couldn't open the camera." }, 500);
  if (!data) return json({ error: "This link isn't right." }, 404);
  return json(data);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!CAMERA_TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.client_id !== "string" || !UUID.test(b.client_id) || typeof b.path !== "string") return json({ error: "Send the shot." }, 400);
  const t = typeof b.taken_at === "string" && !Number.isNaN(Date.parse(b.taken_at)) ? new Date(b.taken_at).toISOString() : null;
  const { data, error } = await supabase.rpc("sc_camera_shot", {
    p_token: token, p_client_id: b.client_id, p_path: b.path.slice(0, 400),
    p_thumb: typeof b.thumb === "string" ? b.thumb.slice(0, 420) : null, p_taken_at: t,
    p_note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 1000) : null,
  });
  if (error) {
    const m = (error.message ?? "").replace(/^.*?ERROR:\s*/, "");
    if (notYet(m)) return json({ error: "This camera isn't switched on yet.", waiting: true }, 503);
    // The door's own refusals are written for the customer; "hasn't arrived" is worth a retry.
    const known = /link|shot|file|photos|arrived/i.test(m) && m.length < 160;
    return json({ error: known ? m : "Couldn't save the shot. It will try again.", final: /turned off|isn't from|only photos/.test(m) }, /arrived/.test(m) ? 409 : 400);
  }
  return json(data ?? { ok: true });
}
