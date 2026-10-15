import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { readSizeRow, type SizeRow } from "@/lib/section-sizes";
import { SIZE_ROW_COLS, sizeRowsBySection, syncSectionSizes } from "@/lib/takeoff-sections-server";
import { SECTION_SELECT } from "../../fields";

/**
 * A section's size rows (migration 111): list, add, change, remove. Each
 * change writes the rows' total onto the section. Session client; org from the
 * session; every write filters org, job and section.
 */

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; sectionId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (m?: string) => !!m && /job_section_sizes|schema cache|does not exist/i.test(m);

async function setup(req: NextRequest, ctx: Ctx) {
  const { id, sectionId } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return { res: result.response } as const;
  const s = result.session;
  const { data: sec } = await s.supabase.from("job_sections").select(SECTION_SELECT).eq("id", sectionId).eq("job_id", id).eq("org_id", s.orgId).maybeSingle();
  if (!sec) return { res: s.applyCookies(NextResponse.json({ error: "No such section." }, { status: 404 })) } as const;
  return { s, id, sectionId, sec: sec as unknown as Record<string, unknown> } as const;
}

async function reply(s: Awaited<ReturnType<typeof setup>> & { s: NonNullable<unknown> }) {
  const x = s as unknown as { s: { supabase: never; orgId: string; applyCookies: (r: NextResponse) => NextResponse }; id: string; sectionId: string };
  const sb = x.s.supabase as Parameters<typeof sizeRowsBySection>[0];
  const rows = (await sizeRowsBySection(sb, x.s.orgId, x.id))[x.sectionId] ?? [];
  const { data: section } = await sb.from("job_sections").select(SECTION_SELECT).eq("id", x.sectionId).eq("org_id", x.s.orgId).maybeSingle();
  return x.s.applyCookies(NextResponse.json({ rows, section }));
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const st = await setup(req, ctx);
  if ("res" in st) return st.res;
  const { error } = await st.s.supabase.from("job_section_sizes").select("id").limit(1);
  if (error && missing(error.message)) return st.s.applyCookies(NextResponse.json({ rows: [], supported: false }));
  return reply(st);
}

/** The section's own size as a first row, when it has one and isn't counted from takeoffs alone. */
function seedRow(sec: Record<string, unknown>): SizeRow | null {
  const n = (k: string) => (sec[k] === null || sec[k] === undefined ? null : Number(sec[k]));
  const depth = n("depth_in");
  if (sec.takeoff_sync && sec.count_qty === null && sec.sqft_override === null && n("length_ft") === null) return null;
  if (n("count_qty") && sec.count_unit === "LF") return { mode: "linear", qty: n("count_qty"), width_in: n("width_ft") ? Math.round(n("width_ft")! * 12 * 100) / 100 : null, depth_in: depth };
  if (n("count_qty")) return { mode: "count", qty: n("count_qty"), unit: (sec.count_unit as string) || "EA" };
  if (n("sqft_override")) return { mode: "area", sqft: n("sqft_override"), depth_in: depth };
  if (n("length_ft") && n("width_ft")) return { mode: "dims", length_ft: n("length_ft"), width_ft: n("width_ft"), depth_in: depth };
  return null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const st = await setup(req, ctx);
  if ("res" in st) return st.res;
  const { s, id, sectionId, sec } = st;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return s.applyCookies(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  const r = readSizeRow(b);
  if (!r.ok) return s.applyCookies(NextResponse.json({ error: r.error }, { status: 400 }));
  const have = (await sizeRowsBySection(s.supabase, s.orgId, id))[sectionId] ?? [];
  const base = { org_id: s.orgId, job_id: id, section_id: sectionId };
  const inserts: Array<Record<string, unknown>> = [];
  if (!have.length && !sec.takeoff_sync) {
    const seed = seedRow(sec);
    if (seed) inserts.push({ ...base, ...seed, label: "Main", sort_order: 0 });
  } else if (!have.length && sec.takeoff_sync) {
    // A section following takeoffs keeps them as one more row; a hand size typed before is its own row.
    const seed = seedRow({ ...sec, takeoff_sync: false });
    const { count } = await s.supabase.from("takeoff_measurements").select("id", { count: "exact", head: true }).eq("org_id", s.orgId).eq("section_id", sectionId);
    if (seed && !count) inserts.push({ ...base, ...seed, label: "Main", sort_order: 0 });
  }
  const next = Math.max(0, ...have.map((h) => Number((h as unknown as { sort_order: number }).sort_order) || 0)) + 1 + inserts.length;
  inserts.push({ ...base, ...r.row, sort_order: next });
  const { error } = await s.supabase.from("job_section_sizes").insert(inserts).select(SIZE_ROW_COLS);
  if (error) return s.applyCookies(NextResponse.json({ error: missing(error.message) ? "Size rows wait for migration 111." : error.message, code: missing(error.message) ? "needs_111" : undefined }, { status: missing(error.message) ? 409 : 500 }));
  await syncSectionSizes(s.supabase, s.orgId, id, sectionId);
  return reply(st);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const st = await setup(req, ctx);
  if ("res" in st) return st.res;
  const { s, id, sectionId } = st;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.row !== "string" || !UUID.test(b.row)) return s.applyCookies(NextResponse.json({ error: "Which row?" }, { status: 400 }));
  const r = readSizeRow(b);
  if (!r.ok) return s.applyCookies(NextResponse.json({ error: r.error }, { status: 400 }));
  const { data, error } = await s.supabase.from("job_section_sizes").update(r.row).eq("id", b.row).eq("org_id", s.orgId).eq("section_id", sectionId).select("id").maybeSingle();
  if (error) return s.applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  if (!data) return s.applyCookies(NextResponse.json({ error: "No such row." }, { status: 404 }));
  await syncSectionSizes(s.supabase, s.orgId, id, sectionId);
  return reply(st);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const st = await setup(req, ctx);
  if ("res" in st) return st.res;
  const { s, id, sectionId } = st;
  const row = req.nextUrl.searchParams.get("row") ?? "";
  if (!UUID.test(row)) return s.applyCookies(NextResponse.json({ error: "Which row?" }, { status: 400 }));
  const { error } = await s.supabase.from("job_section_sizes").delete().eq("id", row).eq("org_id", s.orgId).eq("section_id", sectionId);
  if (error) return s.applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  // The last one left: the section keeps its size and is measured as before (typed on the card).
  await syncSectionSizes(s.supabase, s.orgId, id, sectionId);
  return reply(st);
}
