/**
 * Texting through Quo (Coy, 2026-10-05: "send text messages through the app
 * through quo manually or through dusty"). Pure — tests/texting.test.mjs.
 *
 * Nothing here sends. The route (src/app/api/texts/route.ts) checks who and
 * from which line with these, then asks Quo's API to send on Coy's tap. The
 * text comes back to us like any other: Quo's webhook → quo_events → messages.
 */

export const MAX_TEXT = 1600;

/** A US number as E.164, or null. Accepts (225) 555-0100, 225.555.0100, +1… */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/[^\d+]/g, "");
  const digits = d.replace(/\D/g, "");
  if (d.startsWith("+")) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** The text as it will go: trimmed, not empty, not over Quo's length. */
export function cleanBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Write the text first." };
  if (body.length > MAX_TEXT) return { ok: false, error: `That's ${body.length} characters — a text can be ${MAX_TEXT} at most.` };
  return { ok: true, body };
}

const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

/**
 * How many segments a carrier bills: 160 plain characters in one, 153 each when
 * split; 70 / 67 once there is an emoji or a curly quote. Quo charges per
 * segment on API sends ($0.01 each in the US, from prepaid credits).
 */
export function segments(body: string): number {
  if (!body) return 0;
  const plain = GSM.test(body);
  const n = plain ? body.length + (body.match(/[\^{}\\[~\]|€]/g)?.length ?? 0) : [...body].length;
  const one = plain ? 160 : 70, many = plain ? 153 : 67;
  return n <= one ? 1 : Math.ceil(n / many);
}

export interface TextLine { id: string; phone_e164: string; provider: string | null; provider_number_id: string | null; is_primary: boolean; active: boolean }

/**
 * Which of the org's lines a text goes from: the one Coy picked; else the Quo
 * line this person last reached (or was reached on); else the primary Quo line;
 * else the only Quo line. Only a Quo line can send — the others aren't ours to
 * send from.
 */
export function pickLine(lines: TextLine[], picked: string | null, lastUsed: string | null):
  { ok: true; line: TextLine } | { ok: false; error: string } {
  const quo = lines.filter((l) => l.active && l.provider === "quo");
  if (picked) {
    const l = lines.find((x) => x.id === picked);
    if (!l) return { ok: false, error: "That line isn't one of yours." };
    if (l.provider !== "quo") return { ok: false, error: "Only a Quo line can send texts from here — pick your Quo line." };
    if (!l.active) return { ok: false, error: "That line is switched off." };
    return { ok: true, line: l };
  }
  const last = lastUsed ? quo.find((l) => l.id === lastUsed) : undefined;
  const line = last ?? quo.find((l) => l.is_primary) ?? (quo.length === 1 ? quo[0] : undefined);
  if (line) return { ok: true, line };
  return { ok: false, error: quo.length ? "Pick which Quo line to send from." : "No Quo line is set up — set one's provider to Quo in Settings → Lines." };
}

/** Quo's reply put in words Coy can act on. */
export function quoError(status: number, msg: string | null): string {
  const m = (msg ?? "").trim();
  const low = m.toLowerCase();
  if (status === 401 || status === 403) return `Quo refused the API key (${status}) — check QUO_API_KEY in Vercel, and that your Quo plan includes the API.`;
  if (/credit|balance|insufficient|payment/.test(low)) return `Quo says there aren't enough API credits — buy some in Quo → Plans & Billing.${m ? ` (${m})` : ""}`;
  if (/registr|10dlc|a2p|campaign|brand/.test(low)) return `Quo says the line's US carrier registration isn't done — finish it in Quo → Settings.${m ? ` (${m})` : ""}`;
  return `Quo didn't send it (${status})${m ? `: ${m}` : ""}.`;
}
