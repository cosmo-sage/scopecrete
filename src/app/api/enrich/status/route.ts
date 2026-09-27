import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * What the background enricher (supabase/functions/enrich-contacts, run by
 * pg_cron every five minutes) is doing, for the Threads screen.
 *
 * GET → { waiting, last_read_at, named_7d, worker: { status, detail, ticked_at } | null }
 *
 * `waiting` and the counts come from sc_enrich_status(), security invoker, so
 * RLS scopes them to the caller's org. The heartbeat carries no tenant data —
 * only whether the worker is configured and can reach Hermes.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, applyCookies } = result.session;

  const [{ data: rows, error }, { data: beat }] = await Promise.all([
    supabase.rpc("sc_enrich_status"),
    supabase.from("sc_worker_heartbeats").select("status, detail, ticked_at").eq("worker", "enrich-contacts").maybeSingle(),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `sc_enrich_status: ${error.message}` }, { status: 500 }));
  const s = ((rows ?? []) as Array<{ waiting: number; last_read_at: string | null; named_7d: number }>)[0];

  return applyCookies(NextResponse.json({
    waiting: Number(s?.waiting ?? 0),
    last_read_at: s?.last_read_at ?? null,
    named_7d: Number(s?.named_7d ?? 0),
    worker: beat ?? null,
  }));
}
