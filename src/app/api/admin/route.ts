import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { APP_ORIGIN, hostKind } from "@/lib/hosts";
import { missing092, readParts, readRange, readReason, sinceFor, cleanSlug, PLANS } from "@/lib/admin";
import { STATUSES } from "@/lib/roadmap";

/**
 * The ScopeCrete admin (migration 092). Cross-tenant, so every read and write
 * goes through a named sc_admin_* function that checks platform_admins itself
 * (DECISIONS §7: named functions, never raw SQL, never the service role). This
 * route asks sc_is_platform_admin (084) first only to answer 403 cleanly.
 *
 * GET ?parts=companies,pipelines,…&org=<uuid>&range=today|d7|d30
 *     → { companies?, people?, pipelines?, failures?, dusty?, usage?, platform?, log?, build }
 *     → { missing: true } before 092 is applied.
 * POST { action: "replay", event, reason }              → { ok, error }
 * POST { action: "feedback", item, status, reason }     → { ok }
 * POST { action: "create_org", name, slug, email, plan, reason } → { org_id, invite_url, expires_at }
 * POST { action: "owner_link", org, email, reason }     → { invite_url, expires_at } (112)
 *
 * Every write asks for a reason and is written to admin_audit by the function.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function gate(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return { res: result.response } as const;
  const s = result.session;
  const { data, error } = await s.supabase.rpc("sc_is_platform_admin");
  if (error || data !== true) {
    return { res: s.applyCookies(NextResponse.json({ error: "Only a ScopeCrete admin can open this." }, { status: 403 })) } as const;
  }
  return { s } as const;
}

/** What is live, from Vercel's own build variables. */
function build() {
  const e = process.env;
  return {
    env: e.VERCEL_ENV ?? "local",
    branch: e.VERCEL_GIT_COMMIT_REF ?? null,
    sha: e.VERCEL_GIT_COMMIT_SHA ? e.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    message: e.VERCEL_GIT_COMMIT_MESSAGE ? e.VERCEL_GIT_COMMIT_MESSAGE.split("\n")[0].slice(0, 160) : null,
    url: e.VERCEL_URL ?? null,
  };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;
  const { supabase, applyCookies } = g.s;
  const sp = req.nextUrl.searchParams;
  const parts = readParts(sp.get("parts"));
  const orgRaw = sp.get("org");
  const org = orgRaw && UUID.test(orgRaw) ? orgRaw : null;
  const since = sinceFor(readRange(sp.get("range")), new Date());

  const calls: Record<string, () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>> = {
    companies: () => supabase.rpc("sc_admin_companies", { p_since: since }),
    people: () => supabase.rpc("sc_admin_people", { p_org: org }),
    pipelines: () => supabase.rpc("sc_admin_pipelines", { p_org: org, p_since: since }),
    failures: () => supabase.rpc("sc_admin_failures", { p_org: org, p_limit: 50 }),
    dusty: () => supabase.rpc("sc_admin_dusty", { p_org: org, p_since: since }),
    usage: () => supabase.rpc("sc_admin_usage", { p_org: org, p_since: since }),
    platform: () => supabase.rpc("sc_admin_platform"),
    log: () => supabase.rpc("sc_admin_log", { p_org: org, p_limit: 200 }),
    invites: () => supabase.rpc("sc_admin_invite_funnel", { p_org: org }),
  };
  // People is one company's; without one there is nothing to ask for.
  const want = parts.filter((p) => (p !== "people" && p !== "invites") || org);
  const results = await Promise.all(want.map((p) => calls[p]()));
  const out: Record<string, unknown> = { build: build(), since };
  for (let i = 0; i < want.length; i++) {
    const { data, error } = results[i];
    if (error) {
      // Invite tracking waits for migration 122; the rest of the screen still answers.
      if (want[i] === "invites" && /sc_admin_invite_funnel/.test(error.message ?? "")) { out.invites = null; out.invites_missing = true; continue; }
      if (missing092(error)) return applyCookies(NextResponse.json({ missing: true, build: build() }));
      return applyCookies(NextResponse.json({ error: `${want[i]}: ${error.message}` }, { status: 500 }));
    }
    out[want[i]] = data;
  }
  return applyCookies(NextResponse.json(out));
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;
  const { supabase, applyCookies } = g.s;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Nothing sent.");
  const reason = readReason(b.reason);
  if (!reason) return bad("Give a reason — it goes in the admin log.");
  const fail = (e: { code?: string; message?: string }) =>
    missing092(e) ? bad("The admin isn't switched on yet (migration 092).", 503) : bad(e.message ?? "Failed.", e.code === "42501" ? 403 : 400);

  if (b.action === "replay") {
    if (typeof b.event !== "string" || !UUID.test(b.event)) return bad("Which event?");
    const { data, error } = await supabase.rpc("sc_admin_replay", { p_event: b.event, p_reason: reason });
    if (error) return fail(error);
    return applyCookies(NextResponse.json(data));
  }

  if (b.action === "feedback") {
    if (typeof b.item !== "string" || !UUID.test(b.item)) return bad("Which item?");
    const status = STATUSES.find((s) => s.k === b.status && s.k !== "new")?.k;
    if (!status) return bad("Which status?");
    const { error } = await supabase.rpc("sc_admin_feedback", { p_item: b.item, p_status: status, p_reason: reason });
    if (error) return fail(error);
    return applyCookies(NextResponse.json({ ok: true }));
  }

  if (b.action === "create_org") {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const slug = typeof b.slug === "string" ? cleanSlug(b.slug) : "";
    const email = typeof b.email === "string" ? b.email.trim() : "";
    const plan = PLANS.find((p) => p.k === b.plan)?.k ?? "solo";
    const { data, error } = await supabase.rpc("sc_admin_create_org", {
      p_name: name, p_slug: slug, p_owner_email: email, p_plan: plan, p_reason: reason,
    });
    if (error) return fail(error);
    const row = (Array.isArray(data) ? data[0] : data) as { org_id: string; token: string; expires_at: string } | null;
    if (!row?.token) return bad("The company was not made.", 500);
    // The owner signs in on app.scopecrete.ai — their own address needs its DNS record first.
    const k = hostKind(req.headers.get("host")).kind;
    const origin = k === "other" ? req.nextUrl.origin : APP_ORIGIN;
    return applyCookies(NextResponse.json({ org_id: row.org_id, invite_url: `${origin}/invite/${row.token}`, expires_at: row.expires_at }, { status: 201 }));
  }

  // A fresh owner invite for a company that already exists (112) — the old open one is withdrawn.
  if (b.action === "owner_link") {
    if (typeof b.org !== "string" || !UUID.test(b.org)) return bad("Which company?");
    const email = typeof b.email === "string" ? b.email.trim() : "";
    const { data, error } = await supabase.rpc("sc_admin_owner_link", { p_org: b.org, p_email: email, p_reason: reason });
    if (error) {
      if (/sc_admin_owner_link/.test(error.message ?? "")) return bad("New owner link is waiting for migration 112.", 503);
      return fail(error);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { token: string; expires_at: string } | null;
    if (!row?.token) return bad("No link was made.", 500);
    const k = hostKind(req.headers.get("host")).kind;
    const origin = k === "other" ? req.nextUrl.origin : APP_ORIGIN;
    return applyCookies(NextResponse.json({ invite_url: `${origin}/invite/${row.token}`, expires_at: row.expires_at }, { status: 201 }));
  }

  return bad("Unknown action.");
}
