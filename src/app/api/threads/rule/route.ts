import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { who } from "@/lib/alerts";
import { bucketOf, hasWords, sanitizeRule, whoMatches, windowStart, type ThreadRule } from "@/lib/rule-threads";

/**
 * A thread made from a rule (migration 089) — what its filter catches, newest
 * first: calls and texts from `messages` (by line, direction, who and words)
 * and mirrored emails from `emails` (by inbox, who and words). Nothing is
 * stored; the rule is worked out each time.
 *
 * GET ?thread=<id> → { rule, items: RuleItem[], lines, inboxes, capped }
 * GET ?options=1   → { lines, inboxes } — for the sheet that makes one.
 *
 * Session client, org from the session, RLS decides. At most 200 of each kind
 * are read before the who / words filters, so a very wide rule says it is capped.
 */
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ = 200;

export interface RuleItem {
  id: string;
  kind: "call" | "text" | "email";
  at: string;
  direction: "in" | "out";
  name: string;
  body: string;
  line: string | null;
  bucket: string | null;
  contact_id: string | null;
  href: string | null;
}

interface ContactRow { id: string; name: string | null; phone: string | null; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null }

const oneLine = (s: string | null | undefined, n = 160) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export async function GET(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const json = (b: unknown, status = 200) => applyCookies(NextResponse.json(b, { status }));

  const [lineRows, inboxRows] = await Promise.all([
    supabase.from("org_phone_numbers").select("id, label, phone_e164, provider").eq("org_id", orgId).order("is_primary", { ascending: false }),
    supabase.from("org_inbound_addresses").select("address").eq("org_id", orgId),
  ]);
  const lines = ((lineRows.data ?? []) as Array<{ id: string; label: string | null; phone_e164: string | null; provider: string | null }>)
    .map((l) => ({ id: l.id, label: l.label?.trim() || who(null, l.phone_e164), phone: l.phone_e164, provider: l.provider }));
  const inboxes = ((inboxRows.data ?? []) as Array<{ address: string }>).map((r) => r.address.toLowerCase());
  if (req.nextUrl.searchParams.get("options")) return json({ lines, inboxes });

  const id = req.nextUrl.searchParams.get("thread") ?? "";
  if (!UUID.test(id)) return json({ error: "Not a thread id." }, 400);
  const { data: t, error: tErr } = await supabase.from("threads").select("id, source, rule").eq("org_id", orgId).eq("id", id).is("archived_at", null).maybeSingle();
  if (tErr) return json({ error: /rule/.test(tErr.message) ? "Threads made from rules switch on with migration 089." : tErr.message }, /rule/.test(tErr.message) ? 409 : 500);
  const rule: ThreadRule | null = t && (t as { source: string }).source === "rule" ? sanitizeRule((t as { rule: unknown }).rule) : null;
  if (!rule) return json({ error: "Thread not found." }, 404);

  const since = windowStart(rule.window, new Date());
  const lineName = new Map(lines.map((l) => [l.id, l.label]));
  const wantCalls = rule.channels.includes("call"), wantTexts = rule.channels.includes("text");
  const wantMail = rule.channels.includes("email");
  const words = rule.words.split(" ").filter(Boolean);

  let mq = supabase.from("messages").select("id, contact_id, channel, direction, body_text, summary, duration_seconds, occurred_at, phone_number_id")
    .eq("org_id", orgId).not("contact_id", "is", null).order("occurred_at", { ascending: false }).limit(READ);
  mq = mq.in("channel", [wantCalls ? "call" : null, wantTexts ? "sms" : null].filter((x): x is string => !!x));
  if (rule.direction !== "any") mq = mq.eq("direction", rule.direction === "in" ? "inbound" : "outbound");
  if (rule.lines.length) mq = mq.in("phone_number_id", rule.lines);
  if (since) mq = mq.gte("occurred_at", since);
  // The first word narrows on the server (cleanWords left only letters, digits, spaces, ' and -); the rest in hasWords.
  if (words[0]) mq = mq.or(`body_text.ilike.%${words[0]}%,summary.ilike.%${words[0]}%`);

  // `direction` and `conversation` arrive with migration 100; before it every email came in.
  const mailCols = "id, created_at, sent_at, inbox, original_from_name, original_from_address, from_name, from_address, subject, text_body, contact_id, status";
  let eq = supabase.from("emails").select(`${mailCols}, direction, conversation, to_addresses`)
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(READ);
  if (rule.direction !== "any") eq = eq.eq("direction", rule.direction);
  if (rule.inboxes.length) eq = eq.in("inbox", rule.inboxes);
  if (since) eq = eq.gte("created_at", since);
  if (words[0]) eq = eq.or(`subject.ilike.%${words[0]}%,text_body.ilike.%${words[0]}%`);

  const [msgs, mailsNew] = await Promise.all([
    wantCalls || wantTexts ? mq : Promise.resolve({ data: [], error: null }),
    wantMail ? eq : Promise.resolve({ data: [], error: null }),
  ]);
  if (msgs.error) return json({ error: msgs.error.message }, 500);
  // Before migration 100: read without its columns; nothing was ever sent.
  let mails = mailsNew as { data: unknown[] | null; error: { message: string } | null };
  if (mails.error && /direction|conversation|to_addresses/.test(mails.error.message)) {
    if (rule.direction === "out") mails = { data: [], error: null };
    else {
      let old = supabase.from("emails").select(mailCols).eq("org_id", orgId).order("created_at", { ascending: false }).limit(READ);
      if (rule.inboxes.length) old = old.in("inbox", rule.inboxes);
      if (since) old = old.gte("created_at", since);
      if (words[0]) old = old.or(`subject.ilike.%${words[0]}%,text_body.ilike.%${words[0]}%`);
      mails = await old;
    }
  }
  const msgRows = (msgs.data ?? []) as Array<{ id: string; contact_id: string; channel: string; direction: string; body_text: string | null; summary: string | null; duration_seconds: number | null; occurred_at: string; phone_number_id: string | null }>;
  const mailRows = (mails.error ? [] : mails.data ?? []) as Array<{ id: string; created_at: string; sent_at: string | null; inbox: string | null; original_from_name: string | null; original_from_address: string | null; from_name: string | null; from_address: string | null; subject: string | null; text_body: string | null; contact_id: string | null; status: string | null; direction?: string | null; conversation?: string | null; to_addresses?: string[] | null }>;

  const ids = [...new Set([...msgRows.map((m) => m.contact_id), ...mailRows.map((e) => e.contact_id)].filter((x): x is string => !!x))];
  const { data: people } = ids.length
    ? await supabase.from("contacts").select("id, name, phone, contact_type, classification_confirmed_at, auto_classified_at").eq("org_id", orgId).in("id", ids)
    : { data: [] };
  const byId = new Map(((people ?? []) as ContactRow[]).map((c) => [c.id, c]));

  const items: RuleItem[] = [];
  for (const m of msgRows) {
    const c = byId.get(m.contact_id);
    const bucket = bucketOf(c);
    if (!whoMatches(rule, bucket)) continue;
    if (!hasWords(rule.words, m.body_text, m.summary)) continue;
    const call = m.channel === "call";
    const mins = m.duration_seconds ? Math.max(1, Math.round(m.duration_seconds / 60)) : null;
    items.push({
      id: `m:${m.id}`, kind: call ? "call" : "text", at: m.occurred_at, direction: m.direction === "outbound" ? "out" : "in",
      name: who(c?.name, c?.phone), bucket, contact_id: m.contact_id, href: `/dashboard/messages/${m.contact_id}`,
      line: m.phone_number_id ? lineName.get(m.phone_number_id) ?? null : null,
      body: call ? oneLine(m.summary?.split("\n").find((l) => l.trim())) || (mins ? `${mins} min call` : "Call, nothing said") : oneLine(m.body_text) || "Photo or file",
    });
  }
  for (const e of mailRows) {
    const c = e.contact_id ? byId.get(e.contact_id) : undefined;
    const bucket = c ? bucketOf(c) : null;
    if (!whoMatches(rule, bucket)) continue;
    if (!hasWords(rule.words, e.subject, e.text_body)) continue;
    const out = e.direction === "out";
    const from = out ? (e.to_addresses ?? [])[0] : e.original_from_name || e.original_from_address || e.from_name || e.from_address;
    items.push({
      id: `e:${e.id}`, kind: "email", at: e.sent_at ?? e.created_at, direction: out ? "out" : "in",
      name: c?.name?.trim() || from || "Email", bucket, contact_id: e.contact_id,
      href: e.conversation ? `/dashboard/messages/email/${encodeURIComponent(e.conversation)}?t=${encodeURIComponent(id)}` : `/dashboard/files?email=${e.id}`,
      line: e.inbox, body: [e.subject?.trim() || "(no subject)", e.status === "quarantined" ? "held — not from a forwarder" : null].filter(Boolean).join(" · "),
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return json({ rule, items, lines, inboxes, capped: msgRows.length === READ || mailRows.length === READ });
}
