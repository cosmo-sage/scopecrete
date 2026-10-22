import { NextRequest, NextResponse } from "next/server";
import { getReaderClient } from "@/lib/api-auth";
import { validDue } from "@/lib/portal";

/**
 * A customer's portal (migration 123) — scopecrete.ai/c/<token>, no login. No
 * service role: the request's own client (anon when signed out) calls the two
 * SECURITY DEFINER doors.
 * GET  → the proposals sent to them and the bid requests they sent
 *        (sc_portal; the opening is counted unless the reader is in the org).
 * POST { title, address?, due?, note?, name?, phone?, email?, files: [{path, name, category}] }
 *        → a new bid request: a job on Coy's board with their files
 *        (sc_portal_request checks it all again). The files were already
 *        uploaded by the browser as anon into the link's own folder.
 */

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const { data, error } = await supabase.rpc("sc_portal", { p_token: token });
  if (error) {
    if (/sc_portal/.test(error.message ?? "") && /does not exist|not find/i.test(error.message ?? "")) return json({ error: "This page isn't switched on yet." }, 503);
    return json({ error: "Couldn't open the page." }, 500);
  }
  if (!data) return json({ error: "This link isn't right." }, 404);
  return json(data);
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { supabase, applyCookies } = getReaderClient(req);
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s, headers }));
  if (!TOKEN.test(token)) return json({ error: "This link isn't right." }, 404);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "Send the request." }, 400);
  const title = str(b.title, 120);
  if (!title) return json({ error: "Give the job a name." }, 400);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const due = b.due ? validDue(String(b.due), today) : null;
  if (b.due && !due) return json({ error: "Pick a due day from today on." }, 400);
  const files = Array.isArray(b.files) ? (b.files as Array<Record<string, unknown>>).slice(0, 40)
    .filter((f) => typeof f.path === "string")
    .map((f) => ({ path: String(f.path).slice(0, 400), name: String(f.name ?? "").slice(0, 200), category: String(f.category ?? "other").slice(0, 20) })) : [];
  const { data, error } = await supabase.rpc("sc_portal_request", {
    p_token: token, p_title: title, p_address: str(b.address, 200), p_due: due, p_note: str(b.note, 4000),
    p_name: str(b.name, 120), p_phone: str(b.phone, 40), p_email: str(b.email, 200), p_files: files,
  });
  if (error) {
    const m = error.message ?? "";
    // The door's own refusals are written for the customer; anything else isn't shown.
    const known = /link|request|name|title|day|due|file|too many|your own|company/i.test(m) && m.length < 200;
    return json({ error: known ? m.replace(/^.*?ERROR:\s*/, "") : "Couldn't send the request. Try again in a minute." }, 400);
  }
  return json(data ?? { ok: true });
}
