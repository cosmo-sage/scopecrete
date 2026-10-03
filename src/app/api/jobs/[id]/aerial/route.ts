import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { FILE_COLUMNS } from "@/lib/files-server";
import { FILES_BUCKET, storagePath } from "@/lib/files";
import { formatAddress } from "@/lib/customers-server";
import { SHEET_COLS } from "@/lib/plans-server";
import { ATTRIBUTION, PROVIDER_LABEL, aerialPdf, aerialScaleText, ftPerPt, validCenter, windowTiles } from "@/lib/aerial";
import { aerialProviders, fetchTile, findAddress } from "@/lib/aerial-server";

/**
 * An aerial of the job site as a Plan Room sheet (src/lib/aerial.ts).
 *
 * GET  ?q=  — the job's address (else its customer's), where it was found, and
 *             which imagery is set up. ?q= looks up another address. Nothing stored.
 * POST { provider: esri|mapbox, lat, lng, z } — fetches the window's tiles,
 *             makes a one-page PDF, files it on the job In plan room, and adds
 *             its sheet with the map's scale as its printed scale — applied by
 *             Coy's tap, like any printed scale. Google is never saved.
 * Session client, org from the session.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function siteAddress(sb: Parameters<typeof jobInOrg>[0], orgId: string, id: string) {
  const { data: j } = await sb.from("jobs").select("address, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  const own = typeof j?.address === "string" && j.address.trim() ? j.address.trim() : null;
  if (own) return { address: own, from: "job" as const };
  if (j?.customer_id) {
    const { data: c } = await sb.from("customers").select("address_formatted, address_line1, city, state, zip").eq("org_id", orgId).eq("id", j.customer_id as string).maybeSingle();
    const a = (c?.address_formatted as string | null) || formatAddress(c?.address_line1 ?? null, c?.city ?? null, c?.state ?? null, c?.zip ?? null);
    if (a) return { address: a, from: "customer" as const };
  }
  return { address: null, from: null };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const site = await siteAddress(supabase, orgId, id);
  const q = req.nextUrl.searchParams.get("q")?.trim() || site.address;
  const found = q ? await findAddress(q) : null;
  return applyCookies(NextResponse.json({ ...site, query: q, found, providers: aerialProviders() }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);

  let b: { provider?: unknown; lat?: unknown; lng?: unknown; z?: unknown; label?: unknown };
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const p = b.provider === "esri" || b.provider === "mapbox" ? b.provider : null;
  if (!p) return bad(b.provider === "google" ? "Google's imagery can't be kept — pick Esri or Mapbox." : "Which imagery?");
  if (!aerialProviders()[p].on) return bad(aerialProviders()[p].why ?? "Not set up.", 503);
  const c = validCenter(b.lat, b.lng, b.z, p);
  if (!c) return bad("Where, and how close?");

  const win = windowTiles(c.lat, c.lng, c.z);
  const got = await Promise.all(win.tiles.map(async (t) => ({ ...t, jpeg: await fetchTile(p, c.z, t.x, t.y) })));
  const tiles = got.filter((t): t is typeof t & { jpeg: Uint8Array } => !!t.jpeg && t.jpeg[0] === 0xff && t.jpeg[1] === 0xd8);
  if (tiles.length < win.tiles.length * 0.75) {
    return bad(`${PROVIDER_LABEL[p]} sent ${tiles.length} of ${win.tiles.length} pieces at this zoom — zoom out one and try again.`, 502);
  }
  const day = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
  const label = typeof b.label === "string" ? b.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const pdf = aerialPdf({
    tiles, ftPerPt: ftPerPt(c.lat, c.z), attribution: ATTRIBUTION[p],
    caption: `${label || "Aerial"} - ${PROVIDER_LABEL[p]}, saved ${day} - imagery date not known`,
  });

  const fileId = crypto.randomUUID();
  const name = `Aerial - ${label || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`} (${PROVIDER_LABEL[p]}).pdf`.slice(0, 160);
  const path = storagePath(orgId, id, fileId, name);
  const { error: upErr } = await supabase.storage.from(FILES_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) return bad(`Couldn't save the aerial: ${upErr.message}`, 500);

  const { data: row, error } = await supabase.from("job_files").insert({
    id: fileId, org_id: orgId, job_id: id, name, kind: "pdf", category: "plan", mime_type: "application/pdf",
    byte_size: pdf.length, storage_path: path, source: "upload", fetch_state: "fetched", in_plan_room: true,
    page_count: 1, created_by: userId,
    // A map, not a document: nothing for Dusty's reader to read.
    read_state: "skipped", read_error: "An aerial map — no text to read",
    note: `${PROVIDER_LABEL[p]} satellite, zoom ${c.z}, centred ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`,
  }).select(FILE_COLUMNS).single();
  if (error || !row) {
    await supabase.storage.from(FILES_BUCKET).remove([path]);
    return bad(`Couldn't record the aerial: ${error?.message ?? "no row"}`, 500);
  }
  const { data: sheet, error: sErr } = await supabase.from("plan_sheets").insert({
    org_id: orgId, job_id: id, file_id: fileId, page: 1, page_w: 1280, page_h: 1024,
    number: "AERIAL", title: `Aerial · ${PROVIDER_LABEL[p]} · ${day}`.slice(0, 120), discipline: "C",
    scale_text: aerialScaleText(p, c.lat, c.z), printed_ft_per_pt: ftPerPt(c.lat, c.z),
    // The name is ours, not a reading — the browser's page reader leaves it alone.
    number_source: "coy",
  }).select(SHEET_COLS).single();
  if (sErr) return bad(`Saved the file, but not its sheet: ${sErr.message}`, 500);
  return applyCookies(NextResponse.json({ file: row, sheet }, { status: 201 }));
}
