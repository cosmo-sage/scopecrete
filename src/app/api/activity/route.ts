import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { formatPhone } from "@/lib/v34/tokens";

/**
 * What Dusty has been doing in the background — the line under the header.
 *
 * GET → { pinned, waiting, last_read_at, items }
 *
 * EVERY ITEM IS A ROW THAT EXISTS. v34's StreamBar was fed ten hardcoded
 * sentences with dollar figures in them, and was left out of the port for
 * exactly that reason. This feeds it from contact_enrich_runs (one row per read
 * by the background enricher) and sc_worker_heartbeats. When nothing is
 * happening the line says when something last did; it never makes up
 * something happening now.
 *
 * `pinned` is set when the reader is not working — not configured, can't reach
 * Hermes, erroring, or silent for 15 minutes. The line then shows that and
 * nothing else, so a broken reader cannot hide behind cheerful lines.
 *
 * Also Dusty's track record per bucket (sc_bucket_agreement, migration 036):
 * how often his guess matched where Coy filed someone, and how far he is from
 * filing that bucket himself.
 *
 * Session client; contact_enrich_runs, contacts, claims, proposals and the
 * agreement view (security_invoker) are all org-scoped by RLS. The heartbeat carries no tenant data.
 */

export const dynamic = "force-dynamic";

type Tone = "live" | "good" | "ask" | "warn" | "quiet";
export interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  contact_id: string | null;
  summary: string;
  detail: string | null;
  tone: Tone;
}

const CLASS: Record<string, string> = {
  customer: "a customer", vendor: "a vendor", sub: "a sub", personal: "personal", spam: "spam", not_work: "not work",
};

type Run = {
  id: string; started_at: string; finished_at: string | null; outcome: string; note: string | null; contact_id: string;
  contacts: { name: string | null; phone: string | null } | null;
  contact_name_claims: { claimed_name: string | null; evidence_quote: string | null } | null;
  contact_proposals: { proposed_name: string | null; classification: string | null; evidence_quote: string | null } | null;
};

/** A suggestion's classification as the bucket it files into (enrich-contacts rules.ts bucketOf). */
const BUCKET_OF: Record<string, string> = {
  customer: "customer", vendor: "vendor", sub: "vendor", personal: "personal", spam: "spam", not_work: "spam",
};
/** Must match AUTO_STREAK in supabase/functions/enrich-contacts/rules.ts. */
const AUTO_STREAK = 20;
const PLURAL: Record<string, string> = { customer: "customers", vendor: "vendors", personal: "personal contacts" };

const clipq = (s: string | null | undefined, n = 90) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data: runRows, error }, { data: statusRows }, { data: beat }, { data: agreeRows }] = await Promise.all([
    supabase.from("contact_enrich_runs")
      .select("id, started_at, finished_at, outcome, note, contact_id, contacts(name, phone), contact_name_claims(claimed_name, evidence_quote), contact_proposals(proposed_name, classification, evidence_quote)")
      .eq("org_id", orgId).gte("started_at", since)
      .order("started_at", { ascending: false }).limit(40),
    supabase.rpc("sc_enrich_status"),
    supabase.from("sc_worker_heartbeats").select("status, detail, ticked_at").eq("worker", "enrich-contacts").maybeSingle(),
    supabase.from("sc_bucket_agreement").select("bucket, guesses, agreed, streak").eq("org_id", orgId),
  ]);
  if (error) return applyCookies(NextResponse.json({ error: `contact_enrich_runs: ${error.message}` }, { status: 500 }));

  const status = ((statusRows ?? []) as Array<{ waiting: number; last_read_at: string | null }>)[0];
  const waiting = Number(status?.waiting ?? 0);

  // The reader's own state. Anything but a recent 'ok' pins the line.
  let pinned: { summary: string; detail: string | null } | null = null;
  if (!beat) pinned = { summary: "Reader hasn't run yet", detail: "It runs every minute from Supabase (pg_cron)." };
  else if (beat.status === "not_configured") pinned = { summary: "Reader not connected — needs its Hermes key", detail: "Add HERMES_API_KEY in Supabase → Edge Functions → Secrets. Dusty starts reading within a minute of the key going in." };
  else if (beat.status === "hermes_unreachable") pinned = { summary: "Can't reach Hermes on the VPS", detail: beat.detail };
  else if (beat.status === "error") pinned = { summary: "Reader stopped on an error", detail: beat.detail };
  else if (Date.now() - new Date(beat.ticked_at).getTime() > 15 * 60_000) {
    pinned = { summary: `Reader silent since ${new Date(beat.ticked_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, detail: "It runs every minute. Check cron.job_run_details in Supabase." };
  }

  const items: ActivityItem[] = [];
  let quietCount = 0;
  let quietAt: string | null = null;
  for (const r of (runRows ?? []) as unknown as Run[]) {
    const who = r.contacts?.name?.trim() || formatPhone(r.contacts?.phone);
    const at = r.finished_at ?? r.started_at;
    const base = { id: r.id, at, kind: r.outcome, contact_id: r.contact_id };
    switch (r.outcome) {
      case "running":
        items.push({ ...base, summary: `Reading ${who}…`, detail: null, tone: "live" });
        break;
      case "named": {
        const q = r.contact_name_claims?.evidence_quote;
        items.push({ ...base, summary: `Named ${r.contact_name_claims?.claimed_name ?? who}${q ? ` — “${clipq(q, 60)}”` : ""}`,
          detail: q ? `They said: “${clipq(q, 400)}”. Keep or Undo it in the thread row.` : null, tone: "good" });
        break;
      }
      case "proposed": {
        const p = r.contact_proposals;
        const cls = p?.classification ? CLASS[p.classification] : null;
        const bits = [p?.proposed_name ? `might be ${p.proposed_name}` : null, cls ? `looks like ${cls}` : null].filter(Boolean);
        items.push({ ...base,
          summary: bits.length ? `${who} ${bits.join(", ")} — your call` : `Read ${who} — no name or read on them yet`,
          detail: p?.evidence_quote ? `Going on: “${clipq(p.evidence_quote, 400)}”` : null,
          tone: bits.length ? "ask" : "quiet" });
        break;
      }
      case "filed": {
        // The bucket Dusty filed into is his suggestion's; the contact's own
        // column may since have been undone.
        const b = BUCKET_OF[r.contact_proposals?.classification ?? ""] ?? "spam";
        items.push({ ...base, summary: `Filed ${who} as ${b}${r.note ? ` — “${clipq(r.note, 50)}”` : ""}`,
          detail: r.note ? `Going on: “${clipq(r.note, 400)}”. Wrong? Open the row and tap Not ${b}.` : null, tone: "quiet" });
        break;
      }
      case "model_error": case "failed": case "abandoned":
        items.push({ ...base, summary: `Couldn't read ${who}${r.note ? ` — ${clipq(r.note, 50)}` : ""}`, detail: r.note, tone: "warn" });
        break;
      default:
        // no_words / unchanged / skipped: real, but one line each would be noise.
        quietCount++;
        if (!quietAt) quietAt = at;
    }
  }
  if (quietCount) {
    items.push({ id: "quiet", at: quietAt!, kind: "quiet", contact_id: null,
      summary: `Checked ${quietCount} with nothing new to say`, detail: "Threads with no words from them on record, or nothing new since the last read.", tone: "quiet" });
    items.sort((a, b) => b.at.localeCompare(a.at));
  }
  if (waiting > 0) {
    items.push({ id: "waiting", at: new Date().toISOString(), kind: "waiting", contact_id: null,
      summary: `${waiting} thread${waiting === 1 ? "" : "s"} waiting to be read`, detail: "Read four at a time, every minute, until none are left.", tone: "quiet" });
  }
  // Spam is filed on evidence from the start; the other buckets are earned.
  // Standing lines: never cut by the 20-item cap, never timestamped.
  const standing: ActivityItem[] = [];
  for (const a of (agreeRows ?? []) as Array<{ bucket: string; guesses: number; agreed: number; streak: number }>) {
    const plural = PLURAL[a.bucket];
    if (!plural || !a.guesses) continue;
    const earned = a.streak >= AUTO_STREAK;
    standing.push({ id: `agree-${a.bucket}`, at: new Date().toISOString(), kind: "agreement", contact_id: null,
      summary: earned
        ? `Dusty files ${plural} himself now — his last ${AUTO_STREAK} matched you`
        : `Dusty matched you on ${a.agreed} of ${a.guesses} ${plural} — ${a.streak}/${AUTO_STREAK} in a row toward filing them himself`,
      detail: earned
        ? `Each one shows "auto" with Undo. An Undo, or filing one somewhere else, puts him back to 0. An auto vendor still makes leads until you keep it.`
        : `Every time you file someone Dusty had guessed, it counts. ${AUTO_STREAK} in a row and he files ${plural} himself, with Undo. A miss starts the count again.`,
      tone: earned ? "good" : "quiet" });
  }

  return applyCookies(NextResponse.json({
    pinned, waiting, last_read_at: status?.last_read_at ?? null, items: [...items.slice(0, 20 - standing.length), ...standing],
  }));
}
