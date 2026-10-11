import type { ApiSession } from "@/lib/api-auth";
import { groupConversations, type Conversation, type ConvState, type MailRow } from "@/lib/email-client";

/**
 * Email in Threads, server side (migration 100). Reads the org's mail and
 * conversation state under the session (RLS decides), and sends through
 * AgentMail with AGENTMAIL_API_KEY — server only, never sent to a browser.
 */

type Sb = ApiSession["supabase"];
export const MAIL_COLS = "id, conversation, direction, subject, text_body, created_at, sent_at, inbox, from_address, from_name, original_from_address, original_from_name, to_addresses, cc_addresses, customer_id, contact_id, job_id, suggested_customer_id, status, match, match_note, file_ids, thread_id, provider_message_id, sent_by";
const READ = 400;

export interface MailBox {
  rows: Array<MailRow & Record<string, unknown>>;
  states: ConvState[];
  inboxes: string[];
  /** Our inbox(es) and the org's forwarders — never "someone on the email". */
  ours: string[];
  /** Before migration 100 the conversation columns don't exist. */
  ready: boolean;
}

export async function loadMailBox(sb: Sb, orgId: string, opts: { conversation?: string } = {}): Promise<MailBox> {
  let q = sb.from("emails").select(MAIL_COLS).eq("org_id", orgId);
  q = opts.conversation ? q.eq("conversation", opts.conversation).order("created_at") : q.order("created_at", { ascending: false }).limit(READ);
  const [mail, inb, snd] = await Promise.all([
    q,
    sb.from("org_inbound_addresses").select("address").eq("org_id", orgId),
    sb.from("org_inbound_senders").select("email").eq("org_id", orgId),
  ]);
  const inboxes = ((inb.data ?? []) as Array<{ address: string }>).map((x) => x.address.toLowerCase());
  const ours = [...inboxes, ...((snd.data ?? []) as Array<{ email: string }>).map((x) => x.email.toLowerCase())];
  if (mail.error) {
    if (/conversation|direction/.test(mail.error.message)) return { rows: [], states: [], inboxes, ours, ready: false };
    throw new Error(mail.error.message);
  }
  const rows = (mail.data ?? []) as unknown as Array<MailRow & Record<string, unknown>>;
  const ids = rows.map((r) => r.id);
  const keys = [...new Set(rows.map((r) => r.conversation).filter(Boolean) as string[])];
  const [atts, st] = await Promise.all([
    ids.length ? sb.from("email_attachments").select("email_id, fetch_state, inline").eq("org_id", orgId).in("email_id", ids) : Promise.resolve({ data: [] }),
    keys.length ? sb.from("email_conversations").select("conversation, triage, archived_at, last_read_at, summary, asks, read_for, read_by_dusty_at").eq("org_id", orgId).in("conversation", keys) : Promise.resolve({ data: [] }),
  ]);
  const files = new Map<string, number>();
  for (const a of (atts.data ?? []) as Array<{ email_id: string; fetch_state: string; inline: boolean }>) {
    if (a.fetch_state === "skipped") continue;
    files.set(a.email_id, (files.get(a.email_id) ?? 0) + 1);
  }
  for (const r of rows) r.files = files.get(r.id) ?? 0;
  return { rows, states: (st.data ?? []) as ConvState[], inboxes, ours, ready: true };
}

/** Names for the customers, jobs and people a list of conversations is filed on. */
export async function mailNames(sb: Sb, orgId: string, convs: Conversation[]) {
  const pick = (k: "customer_id" | "job_id" | "contact_id") => [...new Set(convs.map((c) => c[k]).filter(Boolean) as string[])];
  const [cu, jo, co] = await Promise.all([
    pick("customer_id").length ? sb.from("customers").select("id, name").eq("org_id", orgId).in("id", pick("customer_id")) : Promise.resolve({ data: [] }),
    pick("job_id").length ? sb.from("jobs").select("id, title").eq("org_id", orgId).in("id", pick("job_id")) : Promise.resolve({ data: [] }),
    pick("contact_id").length ? sb.from("contacts").select("id, name, contact_type, classification_confirmed_at, auto_classified_at").eq("org_id", orgId).in("id", pick("contact_id")) : Promise.resolve({ data: [] }),
  ]);
  const map = (d: unknown, key = "name") => new Map(((d ?? []) as Array<Record<string, unknown>>).map((x) => [x.id as string, x[key] as string | null]));
  const bucket = new Map(((co.data ?? []) as Array<{ id: string; contact_type: string | null; classification_confirmed_at: string | null; auto_classified_at: string | null }>)
    .map((x) => [x.id, x.classification_confirmed_at || x.auto_classified_at ? x.contact_type : "unsorted"]));
  return { customers: map(cu.data), jobs: map(jo.data, "title"), people: map(co.data), bucket };
}

export function conversationsOf(box: MailBox) {
  return groupConversations(box.rows, box.states, box.ours);
}

// ── AgentMail ────────────────────────────────────────────────────────────────

const API = () => (process.env.AGENTMAIL_API_URL ?? "https://api.agentmail.to").replace(/\/+$/, "");
const key = () => (process.env.AGENTMAIL_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
export const agentMailConfigured = () => !!key();

export interface OutMail {
  inbox: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: Array<{ filename: string; content_type: string; content: string }>;
  /** Reply on this message (AgentMail threads it — In-Reply-To / References). */
  replyTo?: string | null;
}

/** AgentMail's refusal in words Coy can act on — never the key. */
function refusal(status: number, msg: string): string {
  if (status === 401 || status === 403) return `AgentMail refused the key (HTTP ${status}) — check AGENTMAIL_API_KEY in Vercel.`;
  if (status === 404) return `AgentMail doesn't know that inbox or message (HTTP 404)${msg ? `: ${msg}` : ""}.`;
  if (status === 413) return "The attachments are too big for one email.";
  if (status === 429) return "AgentMail is limiting sends right now (HTTP 429) — try again in a minute.";
  return `AgentMail answered HTTP ${status}${msg ? `: ${msg}` : ""}.`;
}

/**
 * Send (or reply) through the inbox. Never retried: an email that may have
 * gone must not go twice. Returns AgentMail's message and thread ids.
 */
export async function sendAgentMail(m: OutMail): Promise<{ ok: true; message_id: string; thread_id: string | null; replied: boolean } | { ok: false; error: string }> {
  if (!key()) return { ok: false, error: "Sending isn't switched on yet: AGENTMAIL_API_KEY is not set in Vercel." };
  const inbox = encodeURIComponent(m.inbox);
  const body = {
    to: m.to, ...(m.cc.length ? { cc: m.cc } : {}), subject: m.subject, text: m.text,
    ...(m.attachments.length ? { attachments: m.attachments } : {}),
  };
  const call = async (path: string, payload: Record<string, unknown>) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch(`${API()}${path}`, {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as { message_id?: string; thread_id?: string; message?: string; error?: string; name?: string };
      return { r, j };
    } finally { clearTimeout(t); }
  };
  try {
    let replied = false;
    let res = null as Awaited<ReturnType<typeof call>> | null;
    if (m.replyTo) {
      res = await call(`/v0/inboxes/${inbox}/messages/${encodeURIComponent(m.replyTo)}/reply`, body);
      // A message AgentMail can't reply on (it isn't in this inbox): send it new instead. Nothing went.
      if (res.r.status === 404 || res.r.status === 400 || res.r.status === 422) res = null; else replied = true;
    }
    if (!res) res = await call(`/v0/inboxes/${inbox}/messages/send`, body);
    if (!res.r.ok) return { ok: false, error: refusal(res.r.status, String(res.j.message ?? res.j.error ?? res.j.name ?? "").slice(0, 200)) };
    if (!res.j.message_id) return { ok: false, error: "AgentMail took the email but didn't say its id — check the Sent folder in AgentMail before sending again." };
    return { ok: true, message_id: res.j.message_id, thread_id: res.j.thread_id ?? null, replied };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "AgentMail didn't answer in 30 seconds — check its Sent folder before sending again." : `Couldn't reach AgentMail: ${e instanceof Error ? e.message : String(e)}` };
  }
}
