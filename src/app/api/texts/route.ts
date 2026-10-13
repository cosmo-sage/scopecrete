import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { sendQuoText } from "@/lib/quo";
import { markLinksSent } from "@/lib/proposal-sent-server";
import { cleanBody, pickLine, quoError, segments, toE164, type TextLine } from "@/lib/texting";

/**
 * Send a text through Quo, on Coy's tap — the thread's Send, or Apply on a
 * Dusty plan that carries a text step (Coy, 2026-10-05). Dusty never calls
 * this himself: the browser does, when Coy taps.
 *
 * POST { contact_id, body, to?, line_id? } → { ok, to, from_line, segments, quo_id }
 *   to       one of the person's own numbers (contacts.phone or contact_phones);
 *            left out → the number they last texted or called from, else their
 *            main number. Never one of the org's own lines.
 *   line_id  one of the org's Quo lines; left out → the Quo line they last
 *            reached, else the primary Quo line.
 *
 * Session client, org from the session, every id checked against it (§7). The
 * text reaches the thread through Quo's webhook (quo-intake → quo_events →
 * messages), like one sent from the Quo app; nothing here writes messages (§2a).
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const fail = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));

  const b = (await req.json().catch(() => ({}))) as { contact_id?: unknown; body?: unknown; to?: unknown; line_id?: unknown };
  const contactId = typeof b.contact_id === "string" && UUID.test(b.contact_id) ? b.contact_id : null;
  if (!contactId) return fail("Not a contact id.");
  const text = cleanBody(b.body);
  if (!text.ok) return fail(text.error);
  const lineId = typeof b.line_id === "string" && UUID.test(b.line_id) ? b.line_id : null;
  if (b.line_id && !lineId) return fail("Not a line id.");
  const askedTo = b.to === undefined || b.to === null || b.to === "" ? null : toE164(b.to);
  if (b.to && !askedTo) return fail("That isn't a phone number.");

  const [{ data: who }, { data: extra }, { data: lineRows }, { data: last }] = await Promise.all([
    sb.from("contacts").select("id, name, phone, merged_into_contact_id").eq("org_id", orgId).eq("id", contactId).maybeSingle(),
    sb.from("contact_phones").select("phone_e164").eq("org_id", orgId).eq("contact_id", contactId),
    sb.from("org_phone_numbers").select("id, phone_e164, provider, provider_number_id, is_primary, active").eq("org_id", orgId),
    sb.from("messages").select("from_address, to_address, phone_number_id").eq("org_id", orgId).eq("contact_id", contactId)
      .in("channel", ["sms", "call", "voicemail"]).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!who) return fail("Contact not found.", 404);
  if (who.merged_into_contact_id) return fail("This number was joined to another person — text them from their thread.", 409);

  const lines = ((lineRows ?? []) as Array<Record<string, unknown>>).map((l): TextLine => ({
    id: l.id as string, phone_e164: l.phone_e164 as string, provider: (l.provider as string | null) ?? null,
    provider_number_id: (l.provider_number_id as string | null) ?? null, is_primary: !!l.is_primary, active: l.active !== false,
  }));
  const ours = new Set(lines.map((l) => l.phone_e164));
  const theirs = [who.phone as string | null, ...((extra ?? []) as Array<{ phone_e164: string }>).map((p) => p.phone_e164)]
    .filter((p): p is string => !!p && !ours.has(p));
  const lastFrom = last ? [last.from_address, last.to_address].find((a) => a && !ours.has(a as string)) as string | undefined : undefined;

  const to = askedTo ?? (lastFrom && theirs.includes(lastFrom) ? lastFrom : theirs[0] ?? null);
  if (!to) return fail("They have no phone number to text.");
  if (ours.has(to)) return fail("That's one of your own lines — a text can't go to it from here.");
  if (!theirs.includes(to)) return fail("That number isn't one of theirs — add it to their thread first (+ Number).");

  const line = pickLine(lines, lineId, (last?.phone_number_id as string | null) ?? null);
  if (!line.ok) return fail(line.error);

  const sent = await sendQuoText(orgId, line.line.provider_number_id || line.line.phone_e164, to, text.body);
  if (!sent.ok) return fail(sent.status === 409 ? (sent.message ?? "No Quo connection for this company.") : sent.status === 503 ? "Texting isn't switched on — QUO_API_KEY isn't set in Vercel." : quoError(sent.status, sent.message), 502);

  // A proposal link in it is now sent (the Preview opens the thread with it in the box).
  await markLinksSent(sb, orgId, text.body, "text").catch(() => {});
  return applyCookies(NextResponse.json({ ok: true, to, from_line: line.line.id, segments: segments(text.body), quo_id: sent.id }));
}

/**
 * GET ?quo_id=… → { delivered } — whether Quo has sent back the text we handed
 * it (its message.delivered webhook, projected into messages with Quo's id).
 * Quo taking a text is not the text arriving: a mistyped or landline number is
 * accepted and then never delivered (Coy's bid request to (225) 508-3358,
 * 2026-10-09). Session client, RLS decides.
 */
export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase: sb, orgId, applyCookies } = result.session;
  const id = req.nextUrl.searchParams.get("quo_id") ?? "";
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) return applyCookies(NextResponse.json({ error: "Not a Quo message id." }, { status: 400 }));
  const { data } = await sb.from("messages").select("id").eq("org_id", orgId).eq("provider_message_id", id).limit(1).maybeSingle();
  return applyCookies(NextResponse.json({ delivered: !!data }));
}
