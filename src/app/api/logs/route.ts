import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";

/**
 * More → Logs: what happened behind the scenes for this org, in plain words
 * (Coy, 2026-09-28: "drift errors need to go on a logs page … that shows all
 * activity done in the app for this org").
 *
 * GET → { checks, reads, merges }
 *   checks — sc_spine_drift rows: messages that never reached the app (the
 *            alarm) and notes on messages that did (projection_defects);
 *   reads  — Dusty's last 60 reads (contact_enrich_runs);
 *   merges — "Same person" merges and their undos (contact_merges).
 *
 * There is no audit table of every tap yet; this shows what the database
 * already records. Session client; org from the session, filtered explicitly
 * because sc_spine_drift is not security_invoker (DECISIONS §9).
 */

export const dynamic = "force-dynamic";

type Who = { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
const one = (w: Who) => (Array.isArray(w) ? w[0] ?? null : w);

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const [drift, defects, reads, merges, lines] = await Promise.all([
    supabase.from("sc_spine_drift").select("issue, raw_event_id, detail, created_at").eq("org_id", orgId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("projection_defects").select("raw_event_id, defect, detail, created_at").eq("org_id", orgId).is("resolved_at", null),
    supabase.from("contact_enrich_runs").select("id, started_at, finished_at, outcome, note, contact_id, contacts(name, phone)")
      .eq("org_id", orgId).order("started_at", { ascending: false }).limit(60),
    supabase.from("contact_merges").select("id, merged_at, undone_at, winner_id, winner:contacts!contact_merges_winner_id_fkey(name, phone), loser:contacts!contact_merges_loser_id_fkey(name, phone)")
      .eq("org_id", orgId).order("merged_at", { ascending: false }).limit(20),
    supabase.from("org_phone_numbers").select("label, phone_e164").eq("org_id", orgId),
  ]);
  if (drift.error) return applyCookies(NextResponse.json({ error: `sc_spine_drift: ${drift.error.message}` }, { status: 500 }));

  const lineName = new Map(((lines.data ?? []) as Array<{ label: string | null; phone_e164: string }>).map((l) => [l.phone_e164, l.label ?? l.phone_e164]));
  const defectBy = new Map(((defects.data ?? []) as Array<{ raw_event_id: string; defect: string; detail: Record<string, string> | null }>)
    .map((d) => [d.raw_event_id, d]));

  const checks = ((drift.data ?? []) as Array<{ issue: string; raw_event_id: string; detail: string; created_at: string }>).map((r) => {
    if (r.issue === "unprojected_raw_event") {
      return { at: r.created_at, severity: "alarm", title: "A Quo event never became a message",
        detail: `A ${r.detail} arrived from Quo and is saved, but it never reached Threads. This is the outage the check exists for — tell Claude Code which one.` };
    }
    const d = defectBy.get(r.raw_event_id);
    if (r.detail === "direction_disagrees_with_provider" && d?.detail) {
      const from = d.detail.from;
      const ours = from ? lineName.get(from) : null;
      return { at: r.created_at, severity: "note", title: "A text's direction was corrected",
        detail: `Quo called a text ${d.detail.provider_said ?? "?"}, but it came from ${ours ? `your ${ours} line` : from ?? "one of your lines"}, so it was filed as ${d.detail.ownership_says ?? "yours"}. The message is in the app; nothing is missing.` };
    }
    return { at: r.created_at, severity: "note", title: `Note on a message: ${r.detail.replace(/_/g, " ")}`,
      detail: "The message reached the app; this is a detail recorded while filing it." };
  });

  return applyCookies(NextResponse.json({
    checks,
    reads: ((reads.data ?? []) as unknown as Array<{ id: string; started_at: string; finished_at: string | null; outcome: string; note: string | null; contact_id: string; contacts: Who }>)
      .map((r) => { const c = one(r.contacts); return { id: r.id, at: r.finished_at ?? r.started_at, outcome: r.outcome, note: r.note, contact_id: r.contact_id, who: c?.name ?? c?.phone ?? null }; }),
    merges: ((merges.data ?? []) as unknown as Array<{ id: string; merged_at: string; undone_at: string | null; winner_id: string; winner: Who; loser: Who }>)
      .map((m) => { const w = one(m.winner), l = one(m.loser); return { id: m.id, at: m.merged_at, undone_at: m.undone_at, winner_id: m.winner_id,
        winner: w?.name ?? w?.phone ?? null, loser: l?.name ?? l?.phone ?? null }; }),
  }));
}
