"use client";
/**
 * Send a job's proposal — the one road for the Preview, a thread and Dusty's
 * plan (Coy, 2026-10-05). Always Coy's tap:
 *   1. the link: the live one for the newest final, or a new one (a draft is
 *      frozen first, as Preview does) — POST /api/jobs/[id]/proposal/link {auto};
 *   2. the words, with {link} / {first} / {title} filled in;
 *   3. a text goes through Quo (POST /api/texts); an email opens in Coy's own
 *      mail app (mailto:) — ScopeCrete has no outbound email yet;
 *   4. the link is marked sent, and the words are kept so the next send — and
 *      Dusty — start from how Coy writes them (POST /api/proposal-sends).
 */
import { fillLink, firstName, fromTemplate, type Via } from "@/lib/proposal-send";
import { mailtoHref } from "@/lib/proposal-links";
import { expectMessage } from "@/lib/v34/live-threads";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** Where a thread's text box keeps its words on this device (the composer reads it when it opens). */
export const draftKey = (contactId: string) => `sc:draft:${contactId}`;

export interface Recipient { contact_id: string; name: string | null; phone: string | null; email: string | null }
export interface LinkReply { link: { id: string; url: string; token: string }; recipient: Recipient | null; job: { id: string; title: string | null }; version: number }

/**
 * The live link for the job's newest version — made (and a draft frozen) if there isn't one. With a
 * version, that final's own link (an older one picked on the Proposal tab), nothing frozen.
 */
export async function proposalLink(jobId: string, version?: number | null): Promise<LinkReply> {
  return (await call(`/api/jobs/${jobId}/proposal/link`, "POST", version ? { version } : { auto: true })) as LinkReply;
}

/** The words as they will go: the link, the first name and the job put in. */
export function wordsFor(body: string, r: LinkReply, name?: string | null): string {
  return fromTemplate(fillLink(body, r.link.url), { first: firstName(name ?? r.recipient?.name), title: r.job.title, url: r.link.url });
}

export async function sendProposal(o: {
  jobId: string; via: Via; body: string; subject?: string | null;
  /** Someone other than the job's person (one of the customer's people). */
  contactId?: string | null; contactName?: string | null; email?: string | null;
  /** Dusty's words, when the send is from his plan — kept beside Coy's for learning. */
  dustyDraft?: string | null;
  /** Already made (the send sheet made it to show the preview). */
  link?: LinkReply;
  /** Other names the words may greet them by (the Preview greets by the customer's name) — kept as {first}, never as words. */
  names?: Array<string | null | undefined>;
}): Promise<{ ok: boolean; text: string; url?: string }> {
  try {
    const r = o.link ?? await proposalLink(o.jobId);
    const to = o.contactId ?? r.recipient?.contact_id ?? null;
    const name = o.contactId && o.contactId !== r.recipient?.contact_id ? o.contactName ?? null : r.recipient?.name ?? null;
    const words = wordsFor(o.body, r, name);
    const subject = o.subject ? fromTemplate(o.subject, { first: firstName(name), title: r.job.title, url: "" }).trim() : `${r.job.title ? `${r.job.title} — ` : ""}proposal`;
    const record = async () => {
      await call(`/api/proposal-links/${r.link.id}`, "PATCH", { sent: o.via }).catch(() => {});
      await call("/api/proposal-sends", "POST", {
        via: o.via, sent: words, subject: o.via === "email" ? subject : null, dusty: o.dustyDraft ? wordsFor(o.dustyDraft, r, name) : null,
        first: firstName(name), title: r.job.title, url: r.link.url,
        names: [name, r.recipient?.name, o.contactName, ...(o.names ?? [])].filter((n): n is string => !!n && !!n.trim()),
      }).catch(() => {});
    };
    let said: string;
    if (o.via === "text") {
      if (!to) return { ok: false, text: "This job has no person to text — put someone on it first." };
      const t = await call("/api/texts", "POST", { contact_id: to, body: words });
      expectMessage(to);
      await record();
      said = `Proposal texted to ${String(t.to).replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")} through Quo — it shows in their thread once Quo confirms`;
    } else {
      const email = o.email ?? (to === r.recipient?.contact_id ? r.recipient?.email : null) ?? "";
      await record();
      window.location.href = mailtoHref(email, subject, words);
      said = email ? `Opened your mail to ${email} with the proposal — press send there` : "Opened your mail with the proposal — they have no email on file, so add the address there";
    }
    return { ok: true, text: said, url: r.link.url };
  } catch (e) {
    return { ok: false, text: `Proposal not sent: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Send it from Threads (Coy, 2026-10-11: "Sending the proposal should open up the threads for that
 * customer. I can email or text it from there"). The link is made (a draft frozen first), the words
 * filled in, and Coy is taken to the person: a text waits in their thread's box, an email opens in
 * the email composer with To, subject and words. Nothing goes until he presses Send there; the
 * server marks the link sent when a text or email carrying it goes out (/api/texts, /api/emails/send).
 * The words are kept now so the next send — and Dusty — start from how Coy writes them.
 */
export async function openInThreads(o: {
  jobId: string; via: Via; body: string; subject?: string | null;
  contactId: string | null; contactName?: string | null; email?: string | null;
  link: LinkReply; names?: Array<string | null | undefined>;
}): Promise<{ ok: boolean; text: string; href?: string }> {
  const r = o.link;
  const name = o.contactName ?? r.recipient?.name ?? null;
  const words = wordsFor(o.body, r, name);
  const subject = o.subject ? fromTemplate(o.subject, { first: firstName(name), title: r.job.title, url: "" }).trim() : `${r.job.title ? `${r.job.title} — ` : ""}proposal`;
  let href: string;
  if (o.via === "text") {
    if (!o.contactId) return { ok: false, text: "They have no thread to text from — pick one of the customer's people." };
    try { window.localStorage.setItem(draftKey(o.contactId), JSON.stringify({ channel: "text", text: words })); }
    catch { return { ok: false, text: "This browser won't keep the words for the thread — use Copy link instead." }; }
    href = `/dashboard/messages/${o.contactId}`;
  } else {
    const qs = new URLSearchParams();
    if (o.contactId) qs.set("contact", o.contactId);
    if (o.email) qs.set("to", o.email);
    qs.set("subject", subject);
    qs.set("body", words);
    href = `/dashboard/messages/email/new?${qs}`;
  }
  await call("/api/proposal-sends", "POST", {
    via: o.via, sent: words, subject: o.via === "email" ? subject : null, dusty: null,
    first: firstName(name), title: r.job.title, url: r.link.url,
    names: [name, r.recipient?.name, ...(o.names ?? [])].filter((n): n is string => !!n && !!n.trim()),
  }).catch(() => {});
  return { ok: true, text: "Opening the thread…", href };
}
