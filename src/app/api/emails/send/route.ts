import { markLinksSent } from "@/lib/proposal-sent-server";
import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { FILES_BUCKET } from "@/lib/files";
import { isEmail, signatureOf } from "@/lib/email-client";
import { myOrgs } from "@/lib/access-server";
import { sendAgentMail } from "@/lib/mail-server";

/**
 * Send an email from the org's AgentMail inbox — a member's tap, never
 * Dusty's or the system's (DECISIONS §10). Migration 100.
 *
 * POST { to: string[], cc?: string[], subject, body, file_ids?: uuid[],
 *        conversation?, reply_to_email_id?, draft_id?,
 *        customer_id?, contact_id?, job_id? }
 *   → { email_id, conversation }
 *
 *   * A reply goes on AgentMail's reply endpoint when the message being
 *     answered was written straight to our inbox (it threads in the
 *     customer's mail); a reply to something Coy FORWARDED is a new message
 *     to the original writer (they never wrote to our inbox), kept in the
 *     same conversation here.
 *   * Files come from the org's Files (≤ 10, ≤ 20 MB together), read under
 *     the session from storage and attached.
 *   * The signature (name · org · phone, from Settings → You) goes under the
 *     body.
 *   * Filed on: what was asked, else the conversation's filing, else the
 *     person whose address is first in To.
 *   * Recorded with sc_record_sent_email (100) once AgentMail took it; a
 *     failed send records nothing and says why. Never retried.
 *
 * Session client; org from the session; AGENTMAIL_API_KEY server-side only.
 * Other parts of the app (proposals, bid requests) send through this same
 * route rather than their own.
 */

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 20 * 1024 * 1024;

const list = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [])
    .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")).filter(Boolean).slice(0, max);

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { supabase, orgId, applyCookies } = result.session;
  const bad = (error: string, status = 400) => applyCookies(NextResponse.json({ error }, { status }));
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Body must be JSON.");

  const to = [...new Set(list(b.to, 20))], cc = [...new Set(list(b.cc, 20))].filter((x) => !to.includes(x));
  const wrong = [...to, ...cc].filter((a) => !isEmail(a));
  if (!to.length) return bad("Who is it to? Add someone in To.");
  if (wrong.length) return bad(`${wrong[0]} isn't an email address.`);
  const subject = typeof b.subject === "string" ? b.subject.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trimEnd().slice(0, 50_000) : "";
  if (!body.trim()) return bad("The email has no words in it.");
  const fileIds = [...new Set(list(b.file_ids, 10))];
  if (fileIds.some((x) => !UUID.test(x))) return bad("Bad file.");
  for (const k of ["reply_to_email_id", "draft_id", "customer_id", "contact_id", "job_id"]) {
    if (b[k] != null && (typeof b[k] !== "string" || !UUID.test(b[k] as string))) return bad(`Bad ${k.replace(/_id$/, "").replace(/_/g, " ")}.`);
  }
  const conversationIn = typeof b.conversation === "string" && /^[A-Za-z0-9._:@<>+-]{1,200}$/.test(b.conversation) ? b.conversation : null;

  // The inbox it goes out from.
  const [{ data: inb }, { data: senders }] = await Promise.all([
    supabase.from("org_inbound_addresses").select("address").eq("org_id", orgId).order("created_at").limit(1),
    supabase.from("org_inbound_senders").select("email").eq("org_id", orgId),
  ]);
  const inbox = ((inb ?? []) as Array<{ address: string }>)[0]?.address;
  if (!inbox) return bad("There's no email inbox set up for this company yet.");
  const forwarders = new Set(((senders ?? []) as Array<{ email: string }>).map((s) => s.email.toLowerCase()));
  if ([...to, ...cc].includes(inbox.toLowerCase())) return bad("That's this inbox's own address.");

  // What it answers.
  type ReplyTo = { id: string; provider_message_id: string; direction: string; from_address: string | null; conversation: string | null };
  let replyTo: ReplyTo | null = null;
  if (b.reply_to_email_id) {
    const { data } = await supabase.from("emails").select("id, provider_message_id, direction, from_address, conversation")
      .eq("org_id", orgId).eq("id", b.reply_to_email_id as string).maybeSingle();
    if (!data) return bad("The email you're answering isn't here.", 404);
    replyTo = data as unknown as ReplyTo;
  }
  const conversation = replyTo?.conversation ?? conversationIn;
  // Reply on AgentMail only to someone who wrote to the inbox themselves and is getting this.
  const directWriter = replyTo && replyTo.direction !== "out" && replyTo.from_address && !forwarders.has(replyTo.from_address.toLowerCase())
    && [...to, ...cc].includes(replyTo.from_address.toLowerCase());

  // Where it's filed.
  type Filing = { customer_id: string | null; contact_id: string | null; job_id: string | null };
  let filing: Filing = { customer_id: (b.customer_id as string) ?? null, contact_id: (b.contact_id as string) ?? null, job_id: (b.job_id as string) ?? null };
  if (!filing.customer_id && !filing.contact_id && !filing.job_id && conversation) {
    const { data } = await supabase.from("emails").select("customer_id, contact_id, job_id").eq("org_id", orgId).eq("conversation", conversation)
      .eq("status", "filed").order("created_at", { ascending: false }).limit(1);
    const f = (data ?? [])[0] as Filing | undefined;
    if (f) filing = { customer_id: f.customer_id, contact_id: f.contact_id, job_id: f.job_id };
  }
  if (!filing.customer_id && !filing.contact_id && !filing.job_id) {
    const { data } = await supabase.from("contact_emails").select("contact_id").eq("org_id", orgId).eq("email", to[0]).limit(1);
    const cid = ((data ?? []) as Array<{ contact_id: string }>)[0]?.contact_id;
    if (cid) {
      const { data: c } = await supabase.from("contacts").select("id, customer_id, merged_into_contact_id").eq("org_id", orgId).eq("id", cid).maybeSingle();
      if (c) {
        const personId = (c.merged_into_contact_id as string | null) ?? (c.id as string);
        const { data: p } = await supabase.from("contacts").select("customer_id").eq("org_id", orgId).eq("id", personId).maybeSingle();
        filing = { customer_id: (p?.customer_id as string | null) ?? null, contact_id: personId, job_id: null };
      }
    }
  }

  // The files, read under the session.
  const attachments: Array<{ filename: string; content_type: string; content: string }> = [];
  if (fileIds.length) {
    const { data: files } = await supabase.from("files").select("id, name, mime_type, byte_size, storage_path").eq("org_id", orgId).in("id", fileIds).is("deleted_at", null);
    const rows = (files ?? []) as Array<{ id: string; name: string; mime_type: string | null; byte_size: number | null; storage_path: string | null }>;
    if (rows.length !== fileIds.length) return bad("One of the files isn't in Files any more.");
    if (rows.reduce((n, f) => n + (f.byte_size ?? 0), 0) > MAX_BYTES) return bad("The files come to more than 20 MB — too big for one email. Send fewer, or share them from Files.");
    let total = 0;
    for (const f of rows) {
      if (!f.storage_path) return bad(`${f.name} hasn't finished uploading.`);
      const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.storage_path);
      if (error || !blob) return bad(`Couldn't read ${f.name}: ${error?.message ?? "no file"}.`, 500);
      const buf = Buffer.from(await blob.arrayBuffer());
      total += buf.length;
      if (total > MAX_BYTES) return bad("The files come to more than 20 MB — too big for one email.");
      attachments.push({ filename: f.name, content_type: f.mime_type || blob.type || "application/octet-stream", content: buf.toString("base64") });
    }
  }

  // The signature.
  const [{ data: u }, orgs] = await Promise.all([supabase.auth.getUser(), myOrgs(supabase)]);
  const meta = (u.user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? null;
  const sig = signatureOf({ name: meta.full_name ?? null, org: orgName, phone: meta.phone ?? null });
  const text = sig ? `${body}\n\n${sig}` : body;

  const sent = await sendAgentMail({ inbox, to, cc, subject: subject || "(no subject)", text, attachments, replyTo: directWriter ? replyTo!.provider_message_id : null });
  if (!sent.ok) return bad(sent.error, 502);

  const { data: emailId, error: recErr } = await supabase.rpc("sc_record_sent_email", { p: {
    org_id: orgId, inbox, provider_message_id: sent.message_id, thread_id: sent.thread_id,
    conversation: conversation ?? sent.thread_id ?? sent.message_id,
    from_name: meta.full_name ?? orgName, subject: subject || "(no subject)", text_body: text,
    to, cc, in_reply_to: replyTo?.provider_message_id ?? null, reply_to_email_id: replyTo?.id ?? null, file_ids: fileIds,
    ...filing,
  } });
  // It went: say so even if the record failed, and why — never send it again.
  if (recErr) return applyCookies(NextResponse.json({ sent: true, recorded: false, error: `Sent, but it couldn't be saved here: ${recErr.message}` }, { status: 207 }));

  await markLinksSent(supabase, orgId, body, "email").catch(() => {});
  const conv = conversation ?? sent.thread_id ?? sent.message_id;
  if (b.draft_id) await supabase.from("email_drafts").delete().eq("org_id", orgId).eq("id", b.draft_id as string);
  // Answered: it no longer needs a reply, and it isn't archived out of sight.
  await supabase.from("email_conversations").upsert({ org_id: orgId, conversation: conv, triage: null, archived_at: null, last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "org_id,conversation" });
  return applyCookies(NextResponse.json({ sent: true, recorded: true, email_id: emailId, conversation: conv, filed: filing, threaded: !!sent.replied }));
}
