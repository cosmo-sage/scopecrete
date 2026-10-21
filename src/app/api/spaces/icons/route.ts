import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { modelJson } from "@/lib/draft/model-server";
import { ICON_SYSTEM, iconFromModel, iconPrompt, readKey, type IconKind } from "@/lib/space-icons";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Work Space icons drawn by Dusty (migration 117; src/lib/space-icons.ts). Session client, org from
 * the session, RLS decides (DECISIONS §7).
 *
 *   GET                         → { supported, icons: [{ key, source, svg, about }] }
 *   POST  { key }               → Dusty draws (or draws again) that Space's icon → { icon }
 *   PATCH { key, source:"shape" } → back to the silhouette, never redrawn on its own
 *   PATCH { key, source:"dusty" } → forget the choice, so the rail asks Dusty again
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const missing117 = (e: { code?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204");

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const { data, error } = await supabase.from("space_icons").select("space_key, source, svg, about").eq("org_id", orgId).limit(1000);
  if (missing117(error)) return applyCookies(NextResponse.json({ supported: false, icons: [] }));
  if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  return applyCookies(NextResponse.json({ supported: true, icons: ((data ?? []) as Array<{ space_key: string; source: string; svg: string | null; about: string | null }>).map((r) => ({ key: r.space_key, source: r.source, svg: r.svg, about: r.about })) }));
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const reply = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const k = readKey(body?.key);
  if (!k) return reply({ error: "Not a Work Space." }, 400);

  const facts = await factsFor(supabase, orgId, k.kind, k.id);
  if (!facts) return reply({ error: "That Work Space wasn't found." }, 404);
  const r = await modelJson(ICON_SYSTEM, iconPrompt(k.kind, facts), 3000, 50_000, [],
    { anthropic: process.env.ICON_MODEL || "claude-sonnet-5-5" });
  if (!r.ok) return reply({ error: `Dusty couldn't draw it: ${r.error}.` }, 502);
  const icon = iconFromModel(r.json);
  if (!icon) return reply({ error: "Dusty's drawing didn't come through as an icon. Try again." }, 502);

  const key = `${k.kind}:${k.id}`;
  const { error } = await supabase.from("space_icons").upsert(
    { org_id: orgId, space_key: key, source: "dusty", svg: icon.svg, about: icon.about, updated_at: new Date().toISOString() },
    { onConflict: "org_id,space_key" });
  if (missing117(error)) return reply({ error: "Icons wait for migration 117.", supported: false }, 409);
  if (error) return reply({ error: error.message }, 500);
  return reply({ icon: { key, source: "dusty", svg: icon.svg, about: icon.about } });
}

export async function PATCH(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const reply = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));
  const body = (await req.json().catch(() => null)) as { key?: unknown; source?: unknown } | null;
  const k = readKey(body?.key);
  if (!k || (body?.source !== "shape" && body?.source !== "dusty")) return reply({ error: "Send a Work Space and shape or dusty." }, 400);
  const key = `${k.kind}:${k.id}`;
  const { error } = body.source === "shape"
    ? await supabase.from("space_icons").upsert({ org_id: orgId, space_key: key, source: "shape", svg: null, about: null, updated_at: new Date().toISOString() }, { onConflict: "org_id,space_key" })
    : await supabase.from("space_icons").delete().eq("org_id", orgId).eq("space_key", key);
  if (missing117(error)) return reply({ error: "Icons wait for migration 117.", supported: false }, 409);
  if (error) return reply({ error: error.message }, 500);
  return reply({ ok: true });
}

/** A few plain words about the Space for the drawing — no ids, numbers or street addresses. */
async function factsFor(supabase: SupabaseClient, orgId: string, kind: IconKind, id: string): Promise<{ name: string; detail: string[] } | null> {
  if (kind === "job") {
    const { data: j } = await supabase.from("jobs").select("title, job_type, description, customers!jobs_customer_id_fkey(name)")
      .eq("org_id", orgId).eq("id", id).maybeSingle();
    if (!j) return null;
    const job = j as unknown as { title: string | null; job_type: string | null; description: string | null; customers: { name: string | null } | null };
    const { data: secs } = await supabase.from("job_sections").select("name").eq("job_id", id).limit(8);
    const names = ((secs ?? []) as Array<{ name: string | null }>).map((s) => s.name?.trim()).filter(Boolean);
    return { name: job.title?.trim() || "A job", detail: [
      job.job_type ? `Kind of job: ${job.job_type}` : "",
      job.customers?.name ? `For: ${job.customers.name}` : "",
      job.description ? `What it is: ${job.description}` : "",
      names.length ? `Its parts: ${names.join(", ")}` : "",
    ] };
  }
  if (kind === "customer") {
    const { data: c } = await supabase.from("customers").select("name, customer_type, subtype").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (!c) return null;
    const { data: jobs } = await supabase.from("jobs").select("title").eq("org_id", orgId).eq("customer_id", id).is("archived_at", null).limit(6);
    const titles = ((jobs ?? []) as Array<{ title: string | null }>).map((x) => x.title?.trim()).filter(Boolean);
    return { name: c.name?.trim() || "A customer", detail: [
      c.customer_type ? `Kind of customer: ${c.customer_type}${c.subtype ? ` (${c.subtype})` : ""}` : "",
      titles.length ? `Their jobs: ${titles.join(", ")}` : "",
    ] };
  }
  if (kind === "vendor") {
    const { data: v } = await supabase.from("contacts").select("name, company_name, contact_subtype").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (!v) return null;
    const { data: t } = await supabase.from("contacts").select("trades").eq("org_id", orgId).eq("id", id).maybeSingle();
    const trades = Array.isArray((t as { trades?: unknown } | null)?.trades) ? ((t as { trades: string[] }).trades) : [];
    const { data: items } = await supabase.from("cost_item_sources").select("cost_items!cost_item_sources_cost_item_id_fkey(name)").eq("org_id", orgId).eq("vendor_contact_id", id).limit(8);
    const sells = ((items ?? []) as unknown as Array<{ cost_items: { name: string | null } | null }>).map((x) => x.cost_items?.name?.trim()).filter(Boolean);
    return { name: (v.company_name || v.name || "").trim() || "A vendor", detail: [
      v.contact_subtype ? `Kind of vendor: ${String(v.contact_subtype).replace(/_/g, " ")}` : "",
      trades.length ? `Trades: ${trades.join(", ").replace(/_/g, " ")}` : "",
      sells.length ? `What they sell or do: ${sells.join(", ")}` : "",
    ] };
  }
  const { data: th } = await supabase.from("threads").select("name, source").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!th) return null;
  return { name: th.name?.trim() || "A folder", detail: [th.source === "customer" ? "It holds a customer's people." : ""] };
}
