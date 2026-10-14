import { parsePlan } from "./plan.ts";

/**
 * What the Share button in Dusty's header shares (Coy, 2026-10-14: "a share button right next to the text
 * size adjuster"): the last answer, or the whole chat, as plain text — the plan block left out (its steps are
 * applied in the app, not pasted), ids hidden as the chat shows them. Pure; tested in tests/dusty-share.test.mjs.
 */
export interface ShareTurn { role: "user" | "assistant"; content: string }

function answerText(content: string): string {
  const p = parsePlan(content);
  const steps = p.actions.length ? `\n\n(Dusty proposed ${p.actions.length} step${p.actions.length === 1 ? "" : "s"} — open the chat in ScopeCrete to apply them.)` : "";
  return `${p.shown.replace(/```proposal\s*\n?/g, "").replace(/```/g, "").trim()}${steps}`.trim();
}

export function shareText(items: ShareTurn[], which: "last" | "chat", title?: string | null): string {
  const turns = items.filter((t) => t.content.trim());
  if (which === "last") {
    const last = [...turns].reverse().find((t) => t.role === "assistant");
    return last ? answerText(last.content) : "";
  }
  const body = turns.map((t) => (t.role === "user" ? `Coy: ${t.content.trim()}` : `Dusty: ${answerText(t.content)}`)).join("\n\n");
  return body ? `${title?.trim() ? `${title.trim()}\n\n` : ""}${body}` : "";
}
