/**
 * email-intake's pure rules (migration 061) — no Deno, no network, so
 * tests/email-intake.test.mjs runs them under node --test.
 *
 *   verifySvix()       — the webhook signature (Svix scheme: HMAC-SHA256 over
 *                        "id.timestamp.body" with the whsec_ key, base64).
 *   readMessage()      — the fields we need from a delivery, read tolerantly:
 *                        AgentMail's exact payload is confirmed on the first
 *                        real forward, so each field accepts the likely names.
 *   parseAddress()     — "Ben Ortiz <ben@x.com>" → { name, address }.
 *   originalSender()   — who wrote the email Coy forwarded, from the
 *                        forwarded block (Gmail, Outlook, Apple Mail).
 *   matchableDomain()  — a domain worth matching on; free mail never is.
 *   attachmentSkip()   — inline signature images are not files.
 */

export interface Addr { name: string | null; address: string }
export interface Att { id: string; name: string; mime: string | null; size: number | null; inline: boolean }
export interface Msg {
  eventId: string | null; eventType: string | null;
  messageId: string | null; inbox: string | null; to: string[];
  from: Addr | null; subject: string | null; text: string | null; html: string | null;
  sentAt: string | null; attachments: Att[];
}

const ENC = new TextEncoder();

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** The base64 signature for one delivery (exported for the test's own signing). */
export async function svixSign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", b64decode(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(`${id}.${timestamp}.${body}`));
  return b64encode(new Uint8Array(sig));
}

/**
 * True only when one of the v1 signatures matches and the timestamp is within
 * five minutes of now (a replayed old delivery is refused).
 */
export async function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, nowSec = Math.floor(Date.now() / 1000)): Promise<{ ok: boolean; why?: string }> {
  if (!secret) return { ok: false, why: "no secret" };
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, why: "unsigned" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return { ok: false, why: "timestamp too old or new" };
  let want: string;
  try { want = await svixSign(secret, headers.id, headers.timestamp, body); } catch { return { ok: false, why: "bad secret" }; }
  const given = headers.signature.split(/\s+/).map((p) => p.split(",")).filter(([v, s]) => v === "v1" && s).map(([, s]) => s);
  // Constant-time compare per candidate.
  const eq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  return given.some((s) => eq(s, want)) ? { ok: true } : { ok: false, why: "signature mismatch" };
}

/** "Ben Ortiz <ben@x.com>", "<ben@x.com>", "ben@x.com", or {name, address|email}. */
export function parseAddress(v: unknown): Addr | null {
  if (!v) return null;
  if (Array.isArray(v)) return parseAddress(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const a = (o.address ?? o.email ?? o.addr) as string | undefined;
    if (typeof a === "string") return parseAddress(o.name ? `${o.name} <${a}>` : a);
    return null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
  if (m) {
    const name = m[1].trim().replace(/^["']|["']$/g, "").trim();
    return { name: name || null, address: m[2].toLowerCase() };
  }
  const bare = /([^\s<>"'()[\]]+@[^\s<>"'()[\]]+\.[a-z]{2,})/i.exec(s);
  return bare ? { name: null, address: bare[1].toLowerCase().replace(/[.,;:]+$/, "") } : null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const pick = (o: Record<string, unknown> | undefined, ...keys: string[]) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

/** The fields we use, from whatever shape the delivery has (data / message / root). */
export function readMessage(payload: unknown): Msg {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const m = (pick(root, "message", "data", "email") ?? root) as Record<string, unknown>;
  const inner = (m && typeof m === "object" && typeof m.message === "object" ? m.message : m) as Record<string, unknown>;
  const toRaw = pick(inner, "to", "recipients");
  const to = (Array.isArray(toRaw) ? toRaw : toRaw ? [toRaw] : []).map((x) => parseAddress(x)?.address).filter((x): x is string => !!x);
  const inboxRaw = str(pick(inner, "inbox_id", "inbox", "inboxId"));
  const attsRaw = pick(inner, "attachments", "files");
  const attachments: Att[] = (Array.isArray(attsRaw) ? attsRaw : []).map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return {
      id: String(pick(o, "attachment_id", "id", "attachmentId") ?? `idx-${i}`),
      name: String(pick(o, "filename", "name", "file_name") ?? `attachment-${i + 1}`),
      mime: str(pick(o, "content_type", "mime_type", "contentType", "type")),
      size: typeof pick(o, "size", "byte_size") === "number" ? (pick(o, "size", "byte_size") as number) : null,
      inline: pick(o, "inline", "is_inline") === true || pick(o, "content_disposition") === "inline",
    };
  });
  return {
    eventId: str(pick(root, "event_id", "id", "eventId")),
    eventType: str(pick(root, "event_type", "type", "event")),
    messageId: str(pick(inner, "message_id", "id", "messageId")),
    inbox: inboxRaw ? (parseAddress(inboxRaw)?.address ?? inboxRaw.toLowerCase()) : null,
    to,
    from: parseAddress(pick(inner, "from", "from_", "sender")),
    subject: str(pick(inner, "subject")),
    text: str(pick(inner, "text", "extracted_text", "text_body", "plain")),
    html: str(pick(inner, "html", "html_body")),
    sentAt: str(pick(inner, "timestamp", "sent_at", "date", "created_at")),
    attachments,
  };
}

/** Plain text from HTML, for an email that came with no text part. */
export function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const FORWARD_MARKERS = [
  /-{3,}\s*Forwarded message\s*-{3,}/i,                 // Gmail
  /Begin forwarded message:/i,                           // Apple Mail
  /-{3,}\s*Original Message\s*-{3,}/i,                   // Outlook (older)
  /^\s*_{10,}\s*$/m,                                     // Outlook (a rule above From:)
];

/**
 * Who wrote the email that was forwarded: the first "From:" line after a
 * forward marker (or, failing a marker, an Outlook-style "From: … Sent: …"
 * header block). Null when it isn't a forward — never a guess.
 */
export function originalSender(text: string | null): Addr | null {
  if (!text) return null;
  let start = -1;
  for (const re of FORWARD_MARKERS) {
    const m = re.exec(text);
    if (m && (start < 0 || m.index < start)) start = m.index;
  }
  const scope = start >= 0 ? text.slice(start) : (/^\s*\*?From:\*?.*\n\s*\*?(Sent|Date):/im.test(text) ? text : null);
  if (!scope) return null;
  const line = /^\s*[>*]*\s*\*?From:\*?\s*(.+)$/im.exec(scope);
  return line ? parseAddress(line[1].replace(/\*+/g, "").trim()) : null;
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "att.net",
  "comcast.net", "cox.net", "bellsouth.net", "sbcglobal.net", "verizon.net", "zoho.com", "yandex.com",
]);

/** The domain to match a company on — null for free mail or one of our own domains. */
export function matchableDomain(address: string, ours: string[] = []): string | null {
  const d = address.toLowerCase().split("@")[1];
  if (!d || FREE_MAIL.has(d)) return null;
  if (ours.some((o) => o.toLowerCase().split("@").pop() === d)) return null;
  return d;
}

/** Inline images under 20 KB are signature logos, not documents. */
export function attachmentSkip(a: Att): string | null {
  const image = (a.mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name);
  if (a.inline && image && (a.size ?? 0) < 20_000) return "a small inline image (signature logo)";
  if (a.size !== null && a.size > 100 * 1024 * 1024) return "over 100 MB";
  return null;
}

/** File kind and first-guess category — the same rules as src/lib/files.ts (kept in step by the test). */
export function fileKind(mime: string | null, name: string): "pdf" | "image" | "video" | "doc" | "sheet" | "other" {
  const m = (mime ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4", "mov", "3gp", "webm"].includes(ext)) return "video";
  if (/spreadsheet|excel|csv/.test(m) || ["xlsx", "xls", "csv"].includes(ext)) return "sheet";
  if (/word|document|rtf|text\/plain/.test(m) || ["doc", "docx", "rtf", "txt"].includes(ext)) return "doc";
  return "other";
}
export function categoryGuess(kind: string, name: string): string {
  const n = name.toLowerCase();
  if (/receipt|invoice/.test(n)) return "receipt";
  if (/plan|drawing|sheet|dwg/.test(n) && kind === "pdf") return "plan";
  if (/spec/.test(n)) return "spec";
  if (/bid|itb|rfp|rfq/.test(n)) return "bid";
  if (/contract|agreement/.test(n)) return "contract";
  if (kind === "image") return "photo";
  return "other";
}
export function safeName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]+/g, "_");
  const dot = trimmed.lastIndexOf(".");
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "file";
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}
