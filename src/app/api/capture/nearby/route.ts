import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { matchPlace, type Place } from "@/lib/capture";
import { SITE_COLUMNS, missing113, siteOut } from "@/lib/capture-server";

/**
 * Where a shot taken here goes (migration 113): the open jobs and the sites
 * near the phone's point, which one is picked (src/lib/capture.ts matchPlace),
 * and, for the picker, the open jobs newest first and the recent sites.
 *
 * GET ?lat=&lng=&acc=      → { pick, near, jobs, sites, sites_ready }
 * GET ?sections=<job id>   → { sections } — the job's areas, for the Section pick.
 *
 * A job's point is its own (migration 090, kept by the Map), else its
 * customer's; a job the Map has never placed has none and is only in the list.
 * Session client; org from the session. Before 113 there are no sites and
 * `sites_ready` is false — jobs still match.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const sp = req.nextUrl.searchParams;

  const sec = sp.get("sections");
  if (sec) {
    if (!UUID.test(sec)) return applyCookies(NextResponse.json({ error: "Bad job id." }, { status: 400 }));
    const { data, error } = await supabase.from("job_sections").select("id, name, sort_order").eq("org_id", orgId).eq("job_id", sec)
      .order("sort_order", { ascending: true, nullsFirst: false }).limit(100);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
    return applyCookies(NextResponse.json({ sections: ((data ?? []) as Array<{ id: string; name: string | null }>).map((s) => ({ id: s.id, name: s.name || "Section" })) }));
  }

  const { data: jobs, error: jErr } = await supabase.from("jobs")
    .select("id, title, address, city, status, lat, lng, customer_id, created_at, customers!jobs_customer_id_fkey(name, lat, lng)")
    .eq("org_id", orgId).is("archived_at", null).not("status", "in", "(lost,complete,closed)")
    .order("created_at", { ascending: false }).limit(400);
  if (jErr) return applyCookies(NextResponse.json({ error: `jobs: ${jErr.message}` }, { status: 500 }));
  type C = { name: string | null; lat: number | null; lng: number | null } | null;
  const jobList = ((jobs ?? []) as unknown as Array<Record<string, unknown> & { customers: C }>).map((j) => {
    const own = num(j.lat) != null && num(j.lng) != null;
    const c = j.customers;
    const lat = own ? (j.lat as number) : num(c?.lat), lng = own ? (j.lng as number) : num(c?.lng);
    return { id: j.id as string, title: (j.title as string) || "Untitled job", customer: c?.name ?? null,
      address: (j.address as string | null) ?? null, city: (j.city as string | null) ?? null, lat, lng };
  });

  const { data: sites, error: sErr } = await supabase.from("sites").select(SITE_COLUMNS).eq("org_id", orgId).is("archived_at", null)
    .order("updated_at", { ascending: false }).limit(300);
  const sitesReady = !missing113(sErr);
  if (sErr && sitesReady) return applyCookies(NextResponse.json({ error: `sites: ${sErr.message}` }, { status: 500 }));
  const siteList = sitesReady ? ((sites ?? []) as Array<Record<string, unknown>>).map((s) => siteOut(s)) : [];

  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng")), acc = Number(sp.get("acc"));
  let match: ReturnType<typeof matchPlace> = { pick: null, near: [] };
  if (sp.get("lat") && sp.get("lng") && Number.isFinite(lat) && Number.isFinite(lng)) {
    const places: Place[] = [
      ...jobList.filter((j) => j.lat != null && j.lng != null).map((j) => ({ kind: "job" as const, id: j.id, label: j.title, lat: j.lat as number, lng: j.lng as number })),
      ...siteList.map((s) => ({ kind: "site" as const, id: s.id as string, label: s.label as string, lat: s.lat as number, lng: s.lng as number, job_id: (s.job_id as string | null) ?? null })),
    ];
    match = matchPlace({ lat, lng }, Number.isFinite(acc) ? acc : null, places);
    // A site that became a job reads as the job: give it the job's title.
    const title = new Map(jobList.map((j) => [j.id, j.title]));
    const named = (p: (typeof match.near)[number]) => (p.kind === "job" && title.has(p.id) ? { ...p, label: title.get(p.id) as string } : p);
    match = { pick: match.pick ? named(match.pick) : null, near: match.near.map(named) };
  }
  return applyCookies(NextResponse.json({ ...match, jobs: jobList.slice(0, 150), sites: siteList.slice(0, 60), sites_ready: sitesReady }));
}
