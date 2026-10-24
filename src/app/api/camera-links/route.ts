import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getApiSession } from "@/lib/api-auth";
import { newToken } from "@/lib/proposal-links";
import { publicOrigin } from "@/lib/hosts";

/**
 * Camera links (migration 128): a page at scopecrete.ai/cam/<token> that opens
 * a camera on the customer's phone, its photos and videos going to the job's
 * and their Files.
 * GET  ?job=<id> | ?contact=<id> → { supported, links } — the live ones, newest first.
 * POST { job_id?, contact_id?, section_id? } → the live link for that job, person and
 *      section, made if there is none (lasts 30 days).
 * Session client; org from the session; every id checked against it (the
 * table's guard checks again). PATCH /api/camera-links/[id] turns one off.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, token, job_id, section_id, contact_id, created_at, expires_at, view_count, last_viewed_at, shot_count, last_shot_at";
const missing128 = (m: string | undefined) => /camera_links/.test(m ?? "") && /does not exist|schema cache|not find/i.test(m ?? "");
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

function shape(r: Record<string, unknown>, origin: string, names: Map<string, string>) {
  return { ...r, token: undefined, url: `${origin}/cam/${r.token}`, contact_name: r.contact_id ? names.get(r.contact_id as string) ?? null : null };
}

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const job = id(req.nextUrl.searchParams.get("job")), contact = id(req.nextUrl.searchParams.get("contact"));
  if (!job && !contact) return json({ error: "Name a job or a person." }, 400);
  let q = sb.from("camera_links").select(COLS).eq("org_id", orgId).is("revoked_at", null).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(20);
  q = job ? q.eq("job_id", job) : q.eq("contact_id", contact as string);
  const { data, error } = await q;
  if (error) return missing128(error.message) ? json({ supported: false, links: [] }) : json({ error: error.message }, 500);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: cs } = await sb.from("contacts").select("id, name").eq("org_id", orgId).in("id", ids);
    for (const c of cs ?? []) if (c.name) names.set(c.id as string, c.name as string);
  }
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  return json({ supported: true, links: rows.map((r) => shape(r, origin, names)) });
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, userId, applyCookies } = result.session;
  const json = (b: unknown, s = 200) => applyCookies(NextResponse.json(b, { status: s }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const job = id(b?.job_id), contact = id(b?.contact_id), section = id(b?.section_id);
  if (!job && !contact) return json({ error: "Name a job or a person." }, 400);
  if (job) {
    const { data } = await sb.from("jobs").select("id").eq("org_id", orgId).eq("id", job).maybeSingle();
    if (!data) return json({ error: "Job not found." }, 404);
  }
  if (section) {
    const { data } = await sb.from("job_sections").select("id, job_id").eq("org_id", orgId).eq("id", section).maybeSingle();
    if (!data || data.job_id !== job) return json({ error: "That section isn't on this job." }, 400);
  }
  if (contact) {
    const { data } = await sb.from("contacts").select("id").eq("org_id", orgId).eq("id", contact).maybeSingle();
    if (!data) return json({ error: "Person not found." }, 404);
  }
  // The same job, person and section reuse their live link.
  let q = sb.from("camera_links").select(COLS).eq("org_id", orgId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).limit(1);
  q = job ? q.eq("job_id", job) : q.is("job_id", null);
  q = contact ? q.eq("contact_id", contact) : q.is("contact_id", null);
  q = section ? q.eq("section_id", section) : q.is("section_id", null);
  const { data: live, error: lErr } = await q.maybeSingle();
  if (lErr) return missing128(lErr.message) ? json({ error: "Camera links wait for migration 128." }, 409) : json({ error: lErr.message }, 500);
  let row = live as Record<string, unknown> | null;
  if (!row) {
    const { data, error } = await sb.from("camera_links").insert({
      org_id: orgId, job_id: job, contact_id: contact, section_id: section, token: newToken(randomBytes(24)), created_by: userId,
    }).select(COLS).single();
    if (error) return json({ error: error.message }, 500);
    row = data as Record<string, unknown>;
  }
  const origin = publicOrigin(req.headers.get("host"), req.nextUrl.origin);
  return json({ link: shape(row, origin, new Map()) }, live ? 200 : 201);
}
