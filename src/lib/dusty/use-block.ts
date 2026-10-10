/**
 * "Use this" takes only the boxed words (Coy, 2026-10-10: "the 'use this as the scope intro' button in
 * the chat pulls everything … put the actual response that goes into the proposal into some highlighted
 * box"). When a page asks Dusty for text to put in a document, he is told to put exactly those words in
 * a ```proposal block; the chat draws it as a highlighted box and "Use this" copies only what is in it.
 * An answer with no box is used whole, as before.
 */

export const USE_FENCE = "proposal";

/** The instruction a page adds to its question so the answer comes back boxed. */
export const USE_ASK = `Put exactly the words to use, and nothing else, inside a block that opens with \`\`\`${USE_FENCE} and closes with \`\`\`. Anything you want to say to me goes outside it.`;

export interface UseSplit { before: string; box: string | null; after: string }

/** Splits an answer around its first ```proposal block (a block still being written counts to the end). */
export function splitUse(text: string): UseSplit {
  const m = text.match(/```proposal[^\S\n]*\n([\s\S]*?)(?:\n?```|$)/);
  if (!m || m.index === undefined) return { before: text, box: null, after: "" };
  return {
    before: text.slice(0, m.index).trim(),
    box: m[1].trim(),
    after: text.slice(m.index + m[0].length).trim(),
  };
}

/** What "Use this" puts on the page: the box when there is one, else the whole answer. */
export function useText(text: string): string {
  const s = splitUse(text);
  return s.box ?? text;
}
