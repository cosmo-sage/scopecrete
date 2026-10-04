import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { CATEGORIES, FILES_BUCKET } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * One file: rename it, say what it is, move it to an area, put it on the
 * proposal, note it, file an unfiled receipt on its vendor, file it on a job / customer / person
 * ({ file_to: { kind, id } }) — or delete it (the row is kept, marked deleted; the
 * stored bytes are removed).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: f } = await supabase.from("files").select("id, job_id, contact_id").eq("org_id", orgId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!f) return bad("No such file.", 404);

  const patch: Record<string, unknown> = {};
  if ("name" in b) {
    const n = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
    if (!n) return bad("A file needs a name.");
    patch.name = n;
  }
  if ("category" in b) {
    if (b.category !== null && !(CATEGORIES as readonly string[]).includes(String(b.category))) return bad("Unknown category.");
    patch.category = b.category;
  }
  if ("note" in b) patch.note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
  if ("show_on_proposal" in b) patch.show_on_proposal = b.show_on_proposal === true;
  // The Plan Room (059): which of a job's files are plans.
  if ("in_plan_room" in b) {
    if (!f.job_id) return bad("Only a file on a job can go in its plan room.");
    patch.in_plan_room = b.in_plan_room === true;
  }
  if ("section_id" in b) {
    if (b.section_id === null) patch.section_id = null;
    else {
      if (typeof b.section_id !== "string" || !UUID.test(b.section_id)) return bad("Bad area.");
      const { data: s } = await supabase.from("job_sections").select("id, job_id").eq("org_id", orgId).eq("id", b.section_id).maybeSingle();
      if (!s || (f.job_id && s.job_id !== f.job_id)) return bad("That area isn't on this file's job.");
      patch.section_id = s.id;
    }
  }
  // A photo of one takeoff shape's area (migration 069) — the database checks it is on this job.
  if ("takeoff_measurement_id" in b) {
    if (b.takeoff_measurement_id === null) patch.takeoff_measurement_id = null;
    else {
      if (!f.job_id || typeof b.takeoff_measurement_id !== "string" || !UUID.test(b.takeoff_measurement_id)) return bad("Bad takeoff.");
      patch.takeoff_measurement_id = b.takeoff_measurement_id;
    }
  }
  if ("contact_id" in b) {
    // Filing a receipt on its vendor (051) — only a file that isn't on anyone yet.
    if (f.contact_id || f.job_id) return bad("This file is already filed.");
    if (typeof b.contact_id !== "string" || !UUID.test(b.contact_id)) return bad("Bad vendor.");
    const { data: c } = await supabase.from("contacts").select("id").eq("org_id", orgId).eq("id", b.contact_id).maybeSingle();
    if (!c) return bad("No such vendor.", 404);
    patch.contact_id = c.id;
  }
  if ("file_to" in b) {
    // File it on a customer, a person or a job (Coy, 2026-10-04: "upload photos from a job and ask dusty to
    // attach to a new customer or job"). A move: it leaves where it was; an area or takeoff of the old job goes.
    const t = b.file_to as { kind?: unknown; id?: unknown } | null;
    const tid = typeof t?.id === "string" && UUID.test(t.id) ? t.id : null;
    if (!tid) return bad("Say where to file it.");
    if (t?.kind === "job") {
      const { data: j } = await supabase.from("jobs").select("id, contact_id, customer_id").eq("org_id", orgId).eq("id", tid).maybeSingle();
      if (!j) return bad("No such job.", 404);
      Object.assign(patch, { job_id: j.id, contact_id: j.contact_id ?? null, customer_id: j.customer_id ?? null });
    } else if (t?.kind === "customer") {
      const { data: c } = await supabase.from("customers").select("id, primary_contact_id").eq("org_id", orgId).eq("id", tid).maybeSingle();
      if (!c) return bad("No such customer.", 404);
      Object.assign(patch, { job_id: null, contact_id: c.primary_contact_id ?? null, customer_id: c.id });
    } else if (t?.kind === "contact") {
      const { data: c } = await supabase.from("contacts").select("id, customer_id").eq("org_id", orgId).eq("id", tid).maybeSingle();
      if (!c) return bad("No such person.", 404);
      Object.assign(patch, { job_id: null, contact_id: c.id, customer_id: c.customer_id ?? null });
    } else return bad("File it on a job, a customer or a person.");
    if (patch.job_id !== f.job_id) Object.assign(patch, { section_id: null, takeoff_measurement_id: null });
    if (!patch.job_id) patch.in_plan_room = false; // the Plan Room is a job's
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data: row, error } = await supabase.from("files").update(patch).eq("id", id).eq("org_id", orgId).select(FILE_COLUMNS).single();
  if (error || !row) return bad(error?.message ?? "not saved", 500);
  const [signed] = await signFiles(supabase, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ file: signed }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: f } = await supabase.from("files").select("id, storage_path").eq("org_id", orgId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!f) return applyCookies(NextResponse.json({ error: "No such file." }, { status: 404 }));
  if (f.storage_path) await supabase.storage.from(FILES_BUCKET).remove([f.storage_path as string]);
  const { error } = await supabase.from("files").update({ deleted_at: new Date().toISOString(), read_state: null }).eq("id", id).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
