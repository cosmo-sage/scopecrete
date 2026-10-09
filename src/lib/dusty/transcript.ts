/**
 * Quo's transcripts label each line with the speaker's phone number
 * ("+12253782458: Hello."). Handed to Dusty as they are, he had two numbers and
 * no way to tell which was Coy's: on the Patio caller's call (2026-10-09) he
 * called the org's own Quo line the customer, because the caller asked "This
 * is Baton Rouge Concreeter, right?" and the transcriber heard Coy as "Corey".
 * The background reader has relabelled for a long time (enrich-contacts
 * relabelTranscript); Dusty's chat now does the same. Pure — tests/dusty-transcript.test.mjs.
 *
 * A label that is one of the org's lines (switched-off ones too) becomes
 * "Coy (our line)", any other number the other side's label ("Customer",
 * "Vendor", or their name). "Corey" / "Cory" on our side is Coy.
 */
const digits10 = (s: string) => s.replace(/\D/g, "").slice(-10);
const LABEL = /(^|\n|\s)(\+?1?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{4})\s*:/g;
export const OUR_SIDE = "Coy (our line)";

export function labelSpeakers(text: string, ourNumbers: string[], them = "Customer"): string {
  if (!text) return text;
  const mine = new Set(ourNumbers.map(digits10).filter((d) => d.length === 10));
  return text
    .replace(LABEL, (_all, pre: string, num: string) => `${pre}${mine.has(digits10(num)) ? OUR_SIDE : them}:`)
    .split("\n")
    .map((line) => line.startsWith(`${OUR_SIDE}:`) ? line.replace(/\bCor(?:e?y|ie)\b/g, "Coy") : line)
    .join("\n");
}
