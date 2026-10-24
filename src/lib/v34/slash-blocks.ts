/**
 * "/" in a thread's text box (Claude Design "Contact Thread", Coy 2026-10-24: "typing a / in the threads
 * text box gives me all the / commands and email is one of them. That is the path I'd like to follow to
 * access a unified email experience"). The blocks it offers, in the design's order, and the filter by
 * what is typed after the "/".
 */
export type SlashKey = "email" | "proposal" | "document" | "takeoff" | "file" | "note" | "dusty";

export interface SlashBlock { key: SlashKey; label: string; hint: string; soon?: boolean; more?: boolean }

export const SLASH_BLOCKS: SlashBlock[] = [
  { key: "email", label: "Email draft", hint: "To, Cc, Subject · the email drafter" },
  { key: "proposal", label: "Proposal", hint: "Link a proposal · tracks opens", more: true },
  { key: "document", label: "Document", hint: "From their Files · attached to an email", more: true },
  { key: "takeoff", label: "Takeoff sheet", hint: "A sheet with its marks · coming", soon: true },
  { key: "file", label: "Photo or file", hint: "From their Files · attached to an email", more: true },
  { key: "note", label: "Internal note", hint: "Only your team sees it" },
  { key: "dusty", label: "Dusty draft", hint: "Dusty writes it from this thread" },
];

/** Blocks whose name has a word starting with what was typed ("/em", "/pro", "/dus"); all with nothing typed. */
export function slashBlocks(q: string): SlashBlock[] {
  const t = q.trim().toLowerCase();
  if (!t) return SLASH_BLOCKS;
  return SLASH_BLOCKS.filter((b) => b.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(t)) || b.key.startsWith(t));
}

/** The box's words without the "/word" at its end. */
export function withoutSlash(text: string): string {
  return text.replace(/(^|\s)\/[\w-]*$/, "$1").trimEnd();
}
