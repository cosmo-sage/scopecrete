import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { myAccess } from "@/lib/access-server";
import { sheetInJob } from "@/lib/plans-server";
import { tagFor } from "@/lib/mentions";
import { pinLink, pinNote, readPin } from "@/lib/plan-pins";

/**
 * Questions pinned on a plan sheet (Coy, 2026-10-10; src/lib/plan-pins.ts). No table of its own:
 * each question is an internal note (contact_notes) on the asked person's own thread, with the
 * job on it and a link to the spot, so it is in that thread, Dusty reads it, and a tagged
 * teammate gets the tag's notification (081) — an onsite estimator too, who opens the link.
 *
 * GET  ?sheet=<id> → { pins, people, limited } — the questions on that sheet; the people who can
 *      be asked (the job's person, their customer's people, the job's vendors, the org's members).
 *      An onsite estimator reads no notes: their pins are their own notifications.
 * POST { sheet_id, x, y, z, measurement_id?, where, words, to: [{ contact_id?, user_id? }] }
 *      → { notes: [{ id, contact_id, name, phone }], link } — one note per person's thread.
 *
 * Session client, org from the session (DECISIONS §7); every id is checked against the job.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Sb = Extract<Awaited<ReturnType<typeof getApiSession>>, { ok: true }>["session"]["supabase"];

interface Person { key: string; name: string; contact_id: string | null; user_id: string | null; phone: string | null; role: string }

async function jobRow(sb: Sb, orgId: string, id: string) {
  const { data } = await sb.from("jobs").select("id, title, contact_id, customer_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data as { id: string; title: string | null; contact_id: string | null; customer_id: string | null } | null;
}

/** Who can be asked about this job. A member who is also one of these contacts is one person. */
async function peopleFor(sb: Sb, orgId: string, userId: string, job: { contact_id: string | null; customer_id: string | null; id: string }): Promise<Person[]> {
  const [own, cust, vend, members, access] = await Promise.all([
    job.contact_id ? sb.from("contacts").select("id, name, phone").eq("org_id", orgId).eq("id", job.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    job.customer_id ? sb.from("contacts").select("id, name, phone").eq("org_id", orgId).eq("customer_id", job.customer_id).is("merged_into_contact_id", null).is("archived_at", null).limit(20) : Promise.resolve({ data: [] }),
    sb.from("job_vendors").select("role, contact:contacts(id, name, phone)").eq("job_id", job.id).limit(20),
    sb.rpc("sc_org_people", { p_org: orgId }),
    sb.rpc("sc_org_access", { p_org: orgId }), // owners only; others get an error and no contacts for members
  ]);
  const out = new Map<string, Person>();
  const addContact = (c: { id: string; name: string | null; phone: string | null } | null | undefined, role: string) => {
    if (!c || out.has(c.id)) return;
    out.set(c.id, { key: `c:${c.id}`, name: c.name?.trim() || c.phone || "No name", contact_id: c.id, user_id: null, phone: c.phone, role });
  };
  addContact(own.data as { id: string; name: string | null; phone: string | null } | null, "Customer");
  for (const c of (cust.data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>) addContact(c, "Customer");
  for (const v of (vend.data ?? []) as unknown as Array<{ role: string | null; contact: { id: string; name: string | null; phone: string | null } | null }>) addContact(v.contact, v.role ? `Vendor · ${v.role}` : "Vendor");
  const contactOf = new Map(((access.error ? [] : access.data ?? []) as Array<{ user_id: string; contact_id: string | null }>).map((a) => [a.user_id, a.contact_id]));
  for (const m of (members.data ?? []) as Array<{ user_id: string; name: string | null; email: string | null; role: string }>) {
    if (m.user_id === userId) continue;
    const cid = contactOf.get(m.user_id) ?? null;
    const name = m.name?.trim() || m.email?.split("@")[0] || "Teammate";
    const role = m.role === "field" ? "Onsite estimator" : "Teammate";
    if (cid && out.has(cid)) { const p = out.get(cid)!; out.set(cid, { ...p, user_id: m.user_id, role: `${p.role} · ${role}` }); continue; }
    let phone: string | null = null;
    if (cid) { const { data: c } = await sb.from("contacts").select("phone").eq("org_id", orgId).eq("id", cid).maybeSingle(); phone = (c as { phone: string | null } | null)?.phone ?? null; }
    out.set(cid ?? `u:${m.user_id}`, { key: `u:${m.user_id}`, name, contact_id: cid, user_id: m.user_id, phone, role });
  }
  return [...out.values()];
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const sheet = req.nextUrl.searchParams.get("sheet") ?? "";
  if (!UUID.test(id) || !UUID.test(sheet)) return applyCookies(NextResponse.json({ error: "Which sheet?" }, { status: 400 }));
  const like = `%/plans?step=takeoff&sheet=${sheet}&pin=%`;
  const access = await myAccess(supabase, orgId);

  if (access.limited) {
    const { data } = await supabase.from("member_notifications").select("id, note_id, contact_id, title, body, by_user, created_at")
      .eq("user_id", userId).eq("org_id", orgId).like("body", like).order("created_at").limit(200);
    const pins = ((data ?? []) as Array<{ id: string; note_id: string | null; contact_id: string | null; title: string | null; body: string | null; created_at: string }>)
      .map((n) => ({ id: n.note_id ?? n.id, at: n.created_at, by: null as string | null, mine: false, contact_id: n.contact_id, contact_name: n.title, body: n.body ?? "", spot: readPin(n.body) }))
      .filter((p) => p.spot && p.spot.job === id.toLowerCase());
    return applyCookies(NextResponse.json({ pins, people: [], limited: true }));
  }

  const job = await jobRow(supabase, orgId, id);
  if (!job) return applyCookies(NextResponse.json({ error: "Job not found." }, { status: 404 }));
  const [{ data: notes, error }, people, { data: members }] = await Promise.all([
    supabase.from("contact_notes").select("id, body, created_at, created_by, contact_id, contact:contacts(name, phone)")
      .eq("org_id", orgId).eq("job_id", id).like("body", like).order("created_at").limit(300),
    peopleFor(supabase, orgId, userId, job),
    supabase.rpc("sc_org_people", { p_org: orgId }),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `contact_notes: ${error.message}` }, { status: 500 }));
  const names = new Map(((members ?? []) as Array<{ user_id: string; name: string | null; email: string | null }>).map((m) => [m.user_id, m.name?.trim() || m.email?.split("@")[0] || "Teammate"]));
  const pins = ((notes ?? []) as unknown as Array<{ id: string; body: string; created_at: string; created_by: string | null; contact_id: string; contact: { name: string | null; phone: string | null } | null }>)
    .map((n) => ({ id: n.id, at: n.created_at, by: n.created_by ? (n.created_by === userId ? "You" : names.get(n.created_by) ?? "Teammate") : null, mine: n.created_by === userId,
      contact_id: n.contact_id, contact_name: n.contact?.name ?? n.contact?.phone ?? null, body: n.body, spot: readPin(n.body) }))
    .filter((p) => p.spot);
  return applyCookies(NextResponse.json({ pins, people, limited: false }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, userId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  if ((await myAccess(supabase, orgId)).limited) return bad("Onsite estimators can't post questions here yet. Text your answer back and it lands on the thread.", 403);
  const words = typeof b.words === "string" ? b.words.trim() : "";
  if (!words || words.length > 2000) return bad("Write the question (up to 2,000 characters).");
  const x = Number(b.x), y = Number(b.y), z = Number(b.z);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bad("Where on the sheet?");
  if (typeof b.sheet_id !== "string" || !UUID.test(b.sheet_id)) return bad("Which sheet?");
  const [job, sheet] = await Promise.all([jobRow(supabase, orgId, id), sheetInJob(supabase, orgId, id, b.sheet_id)]);
  if (!job) return bad("Job not found.", 404);
  if (!sheet) return bad("No such sheet on this job.", 404);
  if (x < -50 || y < -50 || x > sheet.page_w + 50 || y > sheet.page_h + 50) return bad("That spot is off the sheet.");
  let m: string | null = null;
  if (typeof b.measurement_id === "string" && UUID.test(b.measurement_id)) {
    const { data } = await supabase.from("takeoff_measurements").select("id").eq("org_id", orgId).eq("sheet_id", sheet.id).eq("id", b.measurement_id).maybeSingle();
    m = (data as { id: string } | null)?.id ?? null;
  }
  const people = await peopleFor(supabase, orgId, userId, job);
  const asked = (Array.isArray(b.to) ? b.to : []).slice(0, 12) as Array<{ contact_id?: unknown; user_id?: unknown }>;
  const picked = people.filter((p) => asked.some((a) => (typeof a.contact_id === "string" && a.contact_id === p.contact_id) || (typeof a.user_id === "string" && a.user_id === p.user_id)));
  if (!picked.length) return bad("Who are you asking?");

  // One note per thread: a teammate with no contact of their own is tagged on the job's person.
  const byThread = new Map<string, Person[]>();
  for (const p of picked) {
    const cid = p.contact_id ?? job.contact_id;
    if (!cid) return bad(`${p.name} has no thread yet, and the job has no person to put it on.`);
    byThread.set(cid, [...(byThread.get(cid) ?? []), p]);
  }
  const link = pinLink({ job: job.id, sheet: sheet.id, x, y, z, m });
  const where = typeof b.where === "string" && b.where.trim() ? b.where : sheet.number ?? `p.${sheet.page}`;
  const notes: Array<{ id: string; contact_id: string; name: string; phone: string | null; first: string | null }> = [];
  for (const [cid, ps] of byThread) {
    const tags = ps.filter((p) => p.user_id).map((p) => tagFor({ user_id: p.user_id as string, name: p.name, email: null }));
    const { data, error } = await supabase.from("contact_notes")
      .insert({ org_id: orgId, contact_id: cid, job_id: job.id, body: pinNote(where, words, tags, link), created_by: userId })
      .select("id").single();
    if (error || !data) return bad(`contact_notes: ${error?.message ?? "not saved"}`, 500);
    for (const p of ps) notes.push({ id: (data as { id: string }).id, contact_id: cid, name: p.name, phone: p.contact_id ? p.phone : null, first: p.name.split(/\s+/)[0] || null });
  }
  return applyCookies(NextResponse.json({ notes, link }, { status: 201 }));
}
