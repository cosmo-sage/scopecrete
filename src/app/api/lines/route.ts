import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { LEAD_SOURCES } from "@/lib/jobs/stages";
import { PROVIDERS, PROVIDER_CARDS } from "@/lib/lines";
import { loadEvents, loadLines, webhookUrl } from "@/lib/lines-server";

/**
 * Lines (Claude Design package 9, `Lines.dc.html` A; migration 035): every
 * number of yours, what runs it, and whether it's talking to the app.
 *
 * GET  → { lines: [... + today {calls, texts}, last_event, failed_7d, events_7d, webhook],
 *          providers: [{ k, name, mark, built, lines, connected, note }] }
 * POST { phone, label, provider, default_lead_source } → { line } — Coy adds a line.
 *
 * A contact is keyed by the other person's number, so one person calling two
 * of these lines is still one thread; each message records its line.
 * Session client; org_phone_numbers and quo_events are org-scoped by RLS.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;

  const lines = await loadLines(supabase, orgId);
  const events = await loadEvents(supabase, orgId, lines, 7);
  // "Today" is Coy's day, in Central time: Central midnight, as an instant.
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const midnight = new Date(new Date(local).setHours(0, 0, 0, 0) + (now.getTime() - local.getTime())).toISOString();
  const { data: today } = await supabase.from("messages").select("phone_number_id, channel")
    .eq("org_id", orgId).gte("occurred_at", midnight).not("phone_number_id", "is", null).limit(2000);
  const t = new Map<string, { calls: number; texts: number }>();
  for (const m of (today ?? []) as Array<{ phone_number_id: string; channel: string | null }>) {
    const c = t.get(m.phone_number_id) ?? { calls: 0, texts: 0 };
    if (m.channel === "call" || m.channel === "voicemail") c.calls++; else c.texts++;
    t.set(m.phone_number_id, c);
  }

  const out = lines.map((l) => {
    const mine = events.filter((e) => e.line_id === l.id);
    return {
      ...l,
      today: t.get(l.id) ?? { calls: 0, texts: 0 },
      last_event: mine[0] ? { at: mine[0].at, type: mine[0].event_type } : null,
      events_7d: mine.length,
      failed_7d: mine.filter((e) => e.status === "failed").length,
      failure: mine.find((e) => e.status === "failed")?.error ?? (mine.some((e) => e.status === "failed") ? "An event arrived and never reached the app." : null),
      webhook: webhookUrl(l.provider),
    };
  });
  const providers = PROVIDER_CARDS.map((p) => {
    const n = out.filter((l) => (l.provider ?? "") === p.k).length;
    const recent = events.some((e) => e.provider === p.k);
    const note = !p.built ? (n ? `${n} line${n === 1 ? "" : "s"} marked ${p.name} — its events can't reach the app until it's built` : "Not set up — this provider's intake isn't built yet")
      : n === 0 ? "No lines yet"
      : `${recent ? "Connected" : "No events this week"} · ${n} line${n === 1 ? "" : "s"} · API key ${process.env.QUO_API_KEY ? "set" : "not set (recordings are fetched from the link Quo sends)"}`;
    return { k: p.k, name: p.name, short: p.short, mark: p.mark, built: p.built, how: p.how, lines: n, connected: p.built && recent, note };
  });
  const unset = out.filter((l) => !l.provider).length;
  return applyCookies(NextResponse.json({ lines: out, providers, unset_provider: unset }));
}

/** "+1 (225) 555-0100" / "2255550100" → "+12255550100"; null when it isn't a number. */
function e164(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (v.trim().startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const phone = e164(b.phone);
  if (!phone) return fail("Type the number with its area code, e.g. (225) 555-0100.");
  const provider = typeof b.provider === "string" && b.provider ? b.provider : null;
  if (provider && !PROVIDERS.some((p) => p.k === provider)) return fail("Unknown provider.");
  const source = typeof b.default_lead_source === "string" && b.default_lead_source ? b.default_lead_source : null;
  if (source && !LEAD_SOURCES.some((l) => l.k === source)) return fail("Unknown lead source.");
  const label = typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 40) : null;
  const { data: dup } = await supabase.from("org_phone_numbers").select("id, label").eq("org_id", orgId).eq("phone_e164", phone).maybeSingle();
  if (dup) return fail(`That number is already a line${dup.label ? ` (${dup.label})` : ""}.`, 409);
  const { data, error } = await supabase.from("org_phone_numbers")
    .insert({ org_id: orgId, phone_e164: phone, label, provider, default_lead_source: source, is_primary: false, active: true })
    .select("id, phone_e164, label, provider, default_lead_source").single();
  if (error) return fail(error.message, 500);
  return applyCookies(NextResponse.json({ line: { ...data, webhook: webhookUrl(provider) } }, { status: 201 }));
}
