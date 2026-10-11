import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { jobInOrg } from "@/lib/budget-server";
import { lookupRates, searchRates, searchSectionRates, researchSection, researchItem } from "@/lib/draft/build-server";
import { sectionUnit } from "@/lib/budget-v3";
import { marketView, missing094 } from "@/lib/budget-v3-server";

/**
 * The Market rate tab (Budget v3). Session client, org from the session.
 *   GET   the budget's lines by recipe step, the last going-rate lookup, past jobs.
 *   POST  {sections: [ids]} — going rates for those sections (at most four a tap), by
 *         each one's name and unit near the job's city (the plan's words only).
 *   POST  look the going rates up again (Coy's tap): every step and up to four sections, the job's city
 *         only — never the customer. Kept in market_lookups (094); before 094,
 *         on the draft's latest build as the draft's own lookup does.
 * Nothing here changes a price: "Use" goes through the budget line's own PATCH.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  return applyCookies(NextResponse.json(await marketView(supabase, orgId, id)));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await getApiSession(req);
  if (!r.ok) return r.response;
  const { supabase, orgId, userId, applyCookies } = r.session;
  if (!(await jobInOrg(supabase, orgId, id))) return applyCookies(NextResponse.json({ error: "No such job." }, { status: 404 }));
  const { error: probe } = await supabase.from("market_lookups").select("id").limit(1);
  const body = (await req.json().catch(() => ({}))) as { sections?: unknown; item?: unknown };
  if (Array.isArray(body.sections)) {
    const want = new Set(body.sections.filter((x): x is string => typeof x === "string"));
    const view = await marketView(supabase, orgId, id);
    const asks = view.sections.filter((x) => want.has(x.id)).slice(0, 4)
      .map((x, i) => ({ id: x.id, key: `s${i + 1}`, name: x.name, unit: sectionUnit(x).unit ?? "sf" as const, sow: x.sow, notes: x.notes }));
    if (!asks.length) return applyCookies(NextResponse.json({ error: "No such sections on this job." }, { status: 400 }));
    // One section is researched from its scope of work, itemized (Coy, 2026-10-11); several, as before.
    const one = asks.length === 1 ? view.sections.find((x) => x.id === asks[0].id) : null;
    const u = one ? sectionUnit(one) : null;
    const size = u?.qty ? `${Math.round(u.qty)} ${u.unit === "each" ? "EA" : (u.unit ?? "").toUpperCase()}` : null;
    // A cost's AI icon digs deeper on that one cost (Coy, 2026-10-11).
    const item = one && typeof body.item === "string" ? body.item : null;
    const found = one && u && item
      ? await researchItem(supabase, orgId, id, { ...asks[0], size }, { items: one.items, rates: view.section_rates.filter((x) => x.step === one.id) }, item)
      : one && u
      ? await researchSection(supabase, orgId, id, { ...asks[0], size })
      : await searchSectionRates(supabase, orgId, id, asks);
    if (!missing094(probe)) {
      const { error } = await supabase.from("market_lookups").insert({ org_id: orgId, job_id: id, lookup: found, created_by: userId });
      if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
    } else {
      // Before 094: kept on the job's latest draft build, beside the draft's own lookup.
      const { data: runs } = await supabase.from("budget_runs").select("id, made").eq("org_id", orgId).eq("job_id", id).order("created_at", { ascending: false }).limit(1);
      const run = ((runs ?? []) as Array<{ id: string; made: Record<string, unknown> | null }>)[0];
      if (!run) {
        // Nowhere to keep it yet: shown this once.
        const ids = new Set(found.section_ids);
        return applyCookies(NextResponse.json({
          ...view, section_rates: [...view.section_rates.filter((r) => !ids.has(r.step)), ...found.rates],
          sections: view.sections.map((x) => (ids.has(x.id) ? { ...x, rates_at: found.asked_at } : x)),
          note: found.error ?? "Shown this once — apply migration 094 (or build the draft budget) to keep it.",
        }));
      }
      const had = (run.made?.section_rates ?? null) as typeof found | null;
      const ids = new Set(found.section_ids);
      const merged = had && Array.isArray(had.section_ids)
        ? { ...found, section_ids: [...new Set([...had.section_ids, ...found.section_ids])], rates: [...had.rates.filter((r) => !ids.has(r.step)), ...found.rates] }
        : found;
      await supabase.from("budget_runs").update({ made: { ...(run.made ?? {}), section_rates: merged } }).eq("org_id", orgId).eq("id", run.id);
    }
    const after = await marketView(supabase, orgId, id);
    return applyCookies(NextResponse.json(found.error ? { ...after, note: found.error } : after));
  }
  if (missing094(probe)) {
    const l = await lookupRates(supabase, orgId, id);
    if (!l.ok) return applyCookies(NextResponse.json({ error: l.status === 409 ? "Build the draft budget first, or apply migration 094 to look rates up from here." : l.error }, { status: l.status }));
  } else {
    // The same tap looks up the sections too (Coy, 2026-10-09: "Front of Driveway" read No rate
    // after Look up), side by side so it fits the request's time: up to four, unlooked first.
    const view = await marketView(supabase, orgId, id);
    const asks = [...view.sections].sort((a, b) => Number(!!a.rates_at) - Number(!!b.rates_at)).slice(0, 4)
      .map((x, i) => ({ id: x.id, key: `s${i + 1}`, name: x.name, unit: sectionUnit(x).unit ?? "sf" as const, sow: x.sow, notes: x.notes }));
    const [found, secs] = await Promise.all([
      searchRates(supabase, orgId, id, []),
      asks.length ? searchSectionRates(supabase, orgId, id, asks) : Promise.resolve(null),
    ]);
    const rows = [found, ...(secs && !secs.error ? [secs] : [])].map((lookup) => ({ org_id: orgId, job_id: id, lookup, created_by: userId }));
    const { error } = await supabase.from("market_lookups").insert(rows);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 400 }));
    const after = await marketView(supabase, orgId, id);
    const note = found.error ?? secs?.error ?? null;
    return applyCookies(NextResponse.json(note ? { ...after, note } : after));
  }
  return applyCookies(NextResponse.json(await marketView(supabase, orgId, id)));
}
