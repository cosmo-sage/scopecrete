import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { CATEGORIES, FILES_BUCKET } from "@/lib/files";
import { FILE_COLUMNS, signFiles } from "@/lib/files-server";

/**
 * One file: rename it, say what it is, move it to an area, put it on the
 * proposal, note it, file an unfiled receipt on its vendor — or delete it (the row is kept, marked deleted; the
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
  const { data: f } = await supabase.from("job_files").select("id, job_id, contact_id").eq("org_id", orgId).eq("id", id).is("deleted_at", null).maybeSingle();
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
  if ("section_id" in b) {
    if (b.section_id === null) patch.section_id = null;
    else {
      if (typeof b.section_id !== "string" || !UUID.test(b.section_id)) return bad("Bad area.");
      const { data: s } = await supabase.from("job_sections").select("id, job_id").eq("org_id", orgId).eq("id", b.section_id).maybeSingle();
      if (!s || (f.job_id && s.job_id !== f.job_id)) return bad("That area isn't on this file's job.");
      patch.section_id = s.id;
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
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { data: row, error } = await supabase.from("job_files").update(patch).eq("id", id).eq("org_id", orgId).select(FILE_COLUMNS).single();
  if (error || !row) return bad(error?.message ?? "not saved", 500);
  const [signed] = await signFiles(supabase, [row as Record<string, unknown>]);
  return applyCookies(NextResponse.json({ file: signed }));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data: f } = await supabase.from("job_files").select("id, storage_path").eq("org_id", orgId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!f) return applyCookies(NextResponse.json({ error: "No such file." }, { status: 404 }));
  if (f.storage_path) await supabase.storage.from(FILES_BUCKET).remove([f.storage_path as string]);
  const { error } = await supabase.from("job_files").update({ deleted_at: new Date().toISOString(), read_state: null }).eq("id", id).eq("org_id", orgId);
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ ok: true }));
}
