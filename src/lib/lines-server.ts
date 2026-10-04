import type { ApiSession } from "@/lib/api-auth";
import { callIdOf, eventKind, eventStatus, isArtifact, latencyMs, lineColor, lineOfEvent, otherParty, type EventStatus } from "@/lib/lines";

/**
 * The one reader of the org's lines and their provider events, for the Lines
 * page and Logs (Claude Design package 9). Session client: quo_events and
 * org_phone_numbers are org-scoped by RLS, and the org filter is explicit.
 */

type Sb = ApiSession["supabase"];

export interface LineRow {
  id: string; phone_e164: string; label: string | null; is_primary: boolean; active: boolean;
  provider: string | null; provider_number_id: string | null; default_lead_source: string | null;
  color: string; color_token: string | null;
}
export interface EventRow {
  id: string; at: string; line_id: string | null; provider: string | null; event_type: string; kind: "call" | "text" | "webhook";
  status: EventStatus; latency_ms: number | null; error: string | null;
  contact_id: string | null; who: string | null; number: string | null; summary: string;
}

/** Where a provider's webhook goes. Quo's is the deployed quo-intake function. */
export function webhookUrl(provider: string | null): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return provider === "quo" && base ? `${base}/functions/v1/quo-intake` : null;
}

export async function loadLines(sb: Sb, orgId: string): Promise<LineRow[]> {
  // select("*") so the page still loads before migration 077 adds color_token.
  const { data } = await sb.from("org_phone_numbers").select("*").eq("org_id", orgId)
    .order("is_primary", { ascending: false }).order("created_at");
  return ((data ?? []) as Array<Record<string, unknown>>).map((l, i) => ({
    id: l.id as string, phone_e164: l.phone_e164 as string, label: (l.label as string | null) ?? null,
    is_primary: !!l.is_primary, active: l.active !== false, provider: (l.provider as string | null) ?? null,
    provider_number_id: (l.provider_number_id as string | null) ?? null, default_lead_source: (l.default_lead_source as string | null) ?? null,
    color_token: (l.color_token as string | null | undefined) ?? null, color: lineColor({ color_token: l.color_token as string | null }, i),
  }));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function summarise(type: string, p: Record<string, unknown>, direction: string | null): string {
  if (type === "call.summary.completed") {
    const s = Array.isArray(p.summary) ? (p.summary as unknown[]).filter((x) => typeof x === "string").join(" ") : "";
    return s ? `Summary — ${clip(s, 160)}` : "Call summary";
  }
  if (type === "call.transcript.completed") return `Transcript ready${typeof p.duration === "number" ? ` · ${Math.round(p.duration as number)} s` : ""}`;
  if (type === "call.recording.completed") return "Recording ready";
  if (eventKind(type) === "call") {
    const a = typeof p.answeredAt === "string" ? Date.parse(p.answeredAt) : NaN, c = typeof p.completedAt === "string" ? Date.parse(p.completedAt) : NaN;
    const secs = Number.isFinite(a) && Number.isFinite(c) ? Math.max(0, Math.round((c - a) / 1000)) : null;
    const dir = direction === "outbound" ? "Outgoing call" : "Incoming call";
    if (p.voicemail) return `${dir} · voicemail`;
    if (!Number.isFinite(a)) return `${dir} · missed`;
    return `${dir}${secs !== null ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : ""}`;
  }
  if (eventKind(type) === "text") {
    const body = typeof p.body === "string" ? p.body.replace(/\s+/g, " ").trim() : "";
    const media = Array.isArray(p.media) && p.media.length ? `${p.media.length} photo${p.media.length === 1 ? "" : "s"}` : "";
    return clip([body ? `“${body}”` : "", media].filter(Boolean).join(" · ") || "Text", 180);
  }
  return type;
}

/** The last `days` days of provider events, newest first, with each one's line, status and who. */
export async function loadEvents(sb: Sb, orgId: string, lines: LineRow[], days = 7, limit = 600): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb.from("quo_events")
    .select("id, event_type, direction, from_phone, to_phone, provider, received_at, created_at, projected_at, projection_error, contact_id, raw_payload")
    .eq("org_id", orgId).gte("received_at", since).order("received_at", { ascending: false }).limit(limit);
  type Q = { id: string; event_type: string | null; direction: string | null; from_phone: string | null; to_phone: string | null; provider: string | null;
    received_at: string | null; created_at: string | null; projected_at: string | null; projection_error: string | null; contact_id: string | null; raw_payload: Record<string, unknown> | null };
  const rows = (data ?? []) as Q[];
  const ours = new Map(lines.map((l) => [l.phone_e164, l.id]));
  const lineProvider = new Map(lines.map((l) => [l.id, l.provider]));
  // A call's end, for "late" artifacts.
  const ended = new Map<string, string>();
  for (const r of rows) if (r.event_type === "call.completed") {
    const id = callIdOf(r.event_type, r.raw_payload), at = typeof r.raw_payload?.completedAt === "string" ? r.raw_payload.completedAt as string : r.received_at;
    if (id && at) ended.set(id, at);
  }
  const cids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[])];
  const { data: people } = cids.length ? await sb.from("contacts").select("id, name, merged_into_contact_id").eq("org_id", orgId).in("id", cids) : { data: [] };
  const name = new Map(((people ?? []) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const type = r.event_type ?? "unknown";
    const line_id = lineOfEvent(r, ours);
    const call = callIdOf(type, r.raw_payload);
    return {
      id: r.id, at: r.received_at ?? r.created_at ?? new Date().toISOString(), line_id,
      provider: (line_id ? lineProvider.get(line_id) : null) ?? r.provider ?? null,
      event_type: type, kind: eventKind(type),
      status: eventStatus(r, isArtifact(type) && call ? ended.get(call) ?? null : null),
      latency_ms: latencyMs(r), error: r.projection_error,
      contact_id: r.contact_id, who: r.contact_id ? name.get(r.contact_id)?.trim() || null : null,
      number: otherParty(r, ours), summary: summarise(type, r.raw_payload ?? {}, r.direction),
    };
  });
}
