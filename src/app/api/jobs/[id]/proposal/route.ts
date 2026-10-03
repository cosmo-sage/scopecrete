import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg, workingEstimate } from "@/lib/budget-server";
import { PROPOSAL_COLS, TYPE_COLS, proposalBundle, typeDefaults, typeRow } from "@/lib/proposal-server";

/**
 * The job's proposal (migration 060; design/proposal). GET opens the draft —
 * made on first open from the job type's defaults — with everything the page
 * prices it from. PATCH changes what the draft shows; margin goes to the
 * job's budget (estimates.margin_pct), so the budget and the proposal never
 * disagree. A final proposal never changes (the database refuses).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS = ["cover", "header", "scope", "pricing", "pay", "warranty", "terms", "sign"];
const txt = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

function flags(v: unknown, keyOk: (k: string) => boolean): Record<string, boolean> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 400)) if (keyOk(k) && x === true) out[k] = true;
  return out;
}
const idKey = (k: string) => UUID.test(k) || k === "job";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const b = await proposalBundle(supabase, orgId, id);
  if (!b) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  if (!b.proposal) return applyCookies(NextResponse.json({ error: "Couldn't open the proposal." }, { status: 500 }));
  return applyCookies(NextResponse.json(b));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  if (!(await jobInOrg(supabase, orgId, id))) return bad("No such job.", 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Body must be JSON."); }
  const { data: draft } = await supabase.from("job_proposals").select("id").eq("org_id", orgId).eq("job_id", id).eq("status", "draft").maybeSingle();
  if (!draft) return bad("There is no draft — start a new version.", 409);

  const patch: Record<string, unknown> = {};
  if ("display" in b) {
    const d = b.display as Record<string, unknown> | null;
    if (!d || typeof d !== "object") return bad("Bad display.");
    patch.display = {
      off: flags(d.off, (k) => SECTIONS.includes(k)) ?? {},
      groupsOff: flags(d.groupsOff, idKey) ?? {},
      linesOff: flags(d.linesOff, idKey) ?? {},
      pricesOff: flags(d.pricesOff, idKey) ?? {},
      addons: Array.isArray(d.addons) ? (d.addons as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 400) : [],
      show_item_prices: d.show_item_prices === true, show_qty: d.show_qty === true, show_tax_line: d.show_tax_line === true,
      picsOff: flags(d.picsOff, idKey) ?? {}, hide_area_pics: d.hide_area_pics === true,
    };
  }
  // One line in or out of the add-ons, from the budget page (it doesn't hold the whole display).
  if ("addon" in b && !("display" in b)) {
    const a = b.addon as Record<string, unknown> | null;
    if (!a || typeof a.line_id !== "string" || !UUID.test(a.line_id)) return bad("Bad add-on.");
    const { data: cur } = await supabase.from("job_proposals").select("display").eq("id", draft.id).maybeSingle();
    const disp = (cur?.display ?? {}) as Record<string, unknown>;
    const list = Array.isArray(disp.addons) ? (disp.addons as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const next = list.filter((x) => x !== a.line_id);
    if (a.on === true) next.push(a.line_id);
    patch.display = { ...disp, addons: next.slice(0, 400) };
  }
  if ("draws" in b) {
    if (!Array.isArray(b.draws) || b.draws.length > 20) return bad("Up to 20 draws.");
    const out = [];
    for (const r of b.draws as Array<Record<string, unknown>>) {
      const pct = r.pct === null || r.pct === undefined || r.pct === "" ? null : Number(r.pct);
      const amt = r.amt === null || r.amt === undefined || r.amt === "" ? null : Number(r.amt);
      if (pct !== null && !(pct >= 0 && pct <= 100)) return bad("A draw's % is 0 to 100.");
      if (amt !== null && !(amt >= 0 && amt < 1e8)) return bad("A draw's $ must be positive.");
      out.push({ pct: amt !== null ? null : pct, amt, when: txt(r.when, 200) ?? "" });
    }
    patch.draws = out;
  }
  if ("warranty" in b) {
    const w = b.warranty as Record<string, unknown>;
    if (!w || typeof w !== "object") return bad("Bad warranty.");
    const tid = typeof w.template_id === "string" && UUID.test(w.template_id) ? w.template_id : null;
    if (tid) { const { data } = await supabase.from("doc_templates").select("id").eq("org_id", orgId).eq("id", tid).eq("kind", "warranty").maybeSingle(); if (!data) return bad("No such warranty template."); }
    patch.warranty = { template_id: tid, ...(typeof w.title === "string" ? { title: w.title.slice(0, 160) } : {}), ...(typeof w.body === "string" ? { body: w.body.slice(0, 20000) } : {}) };
  }
  if ("terms" in b) {
    const t = b.terms as Record<string, unknown>;
    if (!t || typeof t !== "object") return bad("Bad terms.");
    const tid = typeof t.template_id === "string" && UUID.test(t.template_id) ? t.template_id : null;
    if (tid) { const { data } = await supabase.from("doc_templates").select("id").eq("org_id", orgId).eq("id", tid).eq("kind", "terms").maybeSingle(); if (!data) return bad("No such contract template."); }
    const clauses = Array.isArray(t.clauses) ? (t.clauses as Array<Record<string, unknown>>).slice(0, 60).map((c) => ({ h: txt(c.h, 120) ?? "", b: txt(c.b, 4000) ?? "" })) : undefined;
    patch.terms = { template_id: tid, ...(clauses ? { clauses } : {}) };
  }
  if ("scope_intro" in b) patch.scope_intro = typeof b.scope_intro === "string" && b.scope_intro.trim() ? b.scope_intro.slice(0, 4000) : null;
  if ("split" in b) {
    if (!["none", "20_80", "30_70"].includes(String(b.split))) return bad("Bad split.");
    patch.split = b.split;
  }
  if ("cover_file_id" in b) {
    if (b.cover_file_id === null) patch.cover_file_id = null;
    else {
      if (typeof b.cover_file_id !== "string" || !UUID.test(b.cover_file_id)) return bad("Bad photo.");
      const { data } = await supabase.from("files").select("id").eq("org_id", orgId).eq("job_id", id).eq("id", b.cover_file_id).eq("kind", "image").is("deleted_at", null).maybeSingle();
      if (!data) return bad("That photo isn't on this job.");
      patch.cover_file_id = data.id;
    }
  }
  if ("option_id" in b) {
    if (b.option_id === null) patch.option_id = null;
    else {
      const est = await workingEstimate(supabase, orgId, id, false);
      const { data } = est && typeof b.option_id === "string" && UUID.test(b.option_id)
        ? await supabase.from("estimate_options").select("id").eq("org_id", orgId).eq("estimate_id", est.id as string).eq("id", b.option_id).maybeSingle() : { data: null };
      if (!data) return bad("No such option on this budget.");
      patch.option_id = data.id;
    }
  }
  if ("project_type" in b) {
    const { data: t } = typeof b.project_type === "string"
      ? await supabase.from("org_project_types").select(TYPE_COLS).eq("org_id", orgId).eq("key", b.project_type).maybeSingle() : { data: null };
    if (!t) return bad("No such project type.");
    // Switching type loads that type's defaults into the draft (the page asks first).
    Object.assign(patch, typeDefaults(typeRow(t as Record<string, unknown>)));
  }
  if ("margin_pct" in b) {
    const m = Number(b.margin_pct);
    if (!(m >= 0 && m < 100)) return bad("Margin is 0 to 99%.");
    const est = await workingEstimate(supabase, orgId, id, true);
    if (!est) return bad("Couldn't open the budget.", 500);
    const { error } = await supabase.from("estimates").update({ margin_pct: m }).eq("id", est.id as string).eq("org_id", orgId);
    if (error) return bad(error.message, 500);
  }
  if (!Object.keys(patch).length && !("margin_pct" in b)) return bad("Nothing to change.");
  if (Object.keys(patch).length) {
    const { data, error } = await supabase.from("job_proposals").update(patch).eq("id", draft.id).eq("org_id", orgId).select(PROPOSAL_COLS).single();
    if (error || !data) return bad(error?.message ?? "not saved", 500);
    return applyCookies(NextResponse.json({ proposal: data }));
  }
  return applyCookies(NextResponse.json({ ok: true }));
}
