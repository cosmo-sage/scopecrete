/**
 * Lines and providers (migration 035; Lines page, Claude Design package 9).
 * Pure — tested in tests/lines.test.mjs.
 *
 * A line is one of the org's numbers (org_phone_numbers) and the provider that
 * runs it; every provider event lands in quo_events (§2a) before it is filed,
 * so its status here says whether it reached the app.
 */

/** Voice/text providers a line can run on (org_phone_numbers.provider CHECK, migration 035). */
export const PROVIDERS: Array<{ k: string; label: string }> = [
  { k: "quo", label: "Quo (OpenPhone)" },
  { k: "twilio", label: "Twilio" },
  { k: "telnyx", label: "Telnyx" },
  { k: "retell", label: "Retell AI" },
  { k: "vapi", label: "Vapi" },
  { k: "own_stack", label: "Own AI stack" },
  { k: "other", label: "Other" },
];

/**
 * The providers the Lines page lists, with each one's own mark (the only
 * non-theme colours on the page, and only in its small tile) and whether
 * events from it can reach the app today. Only Quo's intake is built.
 */
export const PROVIDER_CARDS: Array<{ k: string; name: string; short: string; mark: string; built: boolean; how: string }> = [
  { k: "quo", name: "Quo", short: "Q", mark: "#2F6FED", built: true, how: "Your Quo numbers. Quo sends every call and text to ScopeCrete's webhook." },
  { k: "twilio", name: "Twilio", short: "T", mark: "#C8322B", built: false, how: "A Twilio number, its webhooks pointed here. Not built yet." },
  { k: "telnyx", name: "Telnyx", short: "Tx", mark: "#1F7A5A", built: false, how: "A Telnyx number, its webhooks pointed here. Not built yet." },
  { k: "own_stack", name: "Your own stack", short: "{}", mark: "", built: false, how: "Your own AI answering posts signed JSON events here. Not built yet." },
];
export const providerCard = (k: string | null | undefined) =>
  PROVIDER_CARDS.find((p) => p.k === k) ?? (k ? { k, name: PROVIDERS.find((p) => p.k === k)?.label ?? k, short: k.slice(0, 2).toUpperCase(), mark: "", built: false, how: "" } : null);

/** A line's colour: its own, else assigned in order. */
export const LINE_COLORS = ["hiviz", "chalk", "violet", "green", "teal"] as const;
export type LineColor = (typeof LINE_COLORS)[number];
export function lineColor(line: { color_token?: string | null }, index: number): LineColor {
  const own = line.color_token as LineColor | null | undefined;
  return own && (LINE_COLORS as readonly string[]).includes(own) ? own : LINE_COLORS[index % LINE_COLORS.length];
}

/** Calls · Texts · Webhooks — how Logs groups an event type. */
export function eventKind(type: string | null | undefined): "call" | "text" | "webhook" {
  const t = type ?? "";
  if (t.startsWith("call.") || t.startsWith("voicemail.") || t.startsWith("recording.")) return "call";
  if (t.startsWith("message.") || t.startsWith("sms.")) return "text";
  return "webhook";
}

/** The call an event belongs to: the call's own id, or the callId on its recording / summary / transcript. */
export function callIdOf(type: string | null | undefined, payload: Record<string, unknown> | null | undefined): string | null {
  const p = payload ?? {};
  const v = typeof p.callId === "string" ? p.callId : eventKind(type) === "call" && typeof p.id === "string" ? p.id : null;
  return v || null;
}

/** An artifact (recording, summary, transcript) rather than the call itself. */
export const isArtifact = (type: string | null | undefined) => /^call\.(recording|summary|transcript)\./.test(type ?? "");

export type EventStatus = "ok" | "failed" | "pending" | "late";
/**
 * Did the event reach the app? failed — projecting it threw, or it has sat
 * unprojected for 2+ minutes; pending — still being filed; late — a call's
 * recording / summary / transcript that arrived more than 10 minutes after the
 * call ended (filed fine, but late); ok otherwise.
 */
export function eventStatus(ev: { event_type: string | null; received_at: string | null; projected_at: string | null; projection_error: string | null },
  callEndedAt: string | null, now = Date.now()): EventStatus {
  if (ev.projection_error) return "failed";
  const got = ev.received_at ? Date.parse(ev.received_at) : now;
  if (!ev.projected_at) return now - got > 120_000 ? "failed" : "pending";
  if (isArtifact(ev.event_type) && callEndedAt && got - Date.parse(callEndedAt) > 600_000) return "late";
  return "ok";
}

/** Milliseconds from arriving to reaching the app; null while it hasn't. */
export function latencyMs(ev: { received_at: string | null; projected_at: string | null }): number | null {
  if (!ev.received_at || !ev.projected_at) return null;
  return Math.max(0, Date.parse(ev.projected_at) - Date.parse(ev.received_at));
}
export const latencyText = (ms: number | null) => (ms === null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);

/** Which of the org's lines an event came through: whichever of its two numbers is one of ours. */
export function lineOfEvent(ev: { from_phone: string | null; to_phone: string | null }, ours: Map<string, string>): string | null {
  return (ev.to_phone && ours.get(ev.to_phone)) || (ev.from_phone && ours.get(ev.from_phone)) || null;
}

/** The other person's number on an event. */
export function otherParty(ev: { from_phone: string | null; to_phone: string | null }, ours: Map<string, string>): string | null {
  if (ev.from_phone && !ours.has(ev.from_phone)) return ev.from_phone;
  if (ev.to_phone && !ours.has(ev.to_phone)) return ev.to_phone;
  return null;
}

/** Logs' filter, read from and written to the address (?line=&provider=&event=). */
export interface LogFilter { line: string | null; provider: string | null; event: "all" | "call" | "text" | "webhook" | "needs" }
export function readLogFilter(sp: URLSearchParams): LogFilter {
  const e = sp.get("event");
  return { line: sp.get("line") || null, provider: sp.get("provider") || null,
    event: e === "call" || e === "text" || e === "webhook" || e === "needs" ? e : "all" };
}
export function logFilterQuery(f: LogFilter): string {
  const p = new URLSearchParams();
  if (f.line) p.set("line", f.line);
  if (f.provider) p.set("provider", f.provider);
  if (f.event !== "all") p.set("event", f.event);
  const s = p.toString();
  return s ? `?${s}` : "";
}
export function matchesLog(r: { line_id: string | null; provider: string | null; kind: string; status: EventStatus }, f: LogFilter): boolean {
  if (f.line && r.line_id !== f.line) return false;
  if (f.provider && r.provider !== f.provider) return false;
  if (f.event === "needs") return r.status !== "ok";
  if (f.event !== "all" && r.kind !== f.event) return false;
  return true;
}
