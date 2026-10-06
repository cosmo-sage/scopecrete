/**
 * The ScopeCrete emblem on a thread opens Dusty and asks him for where things
 * stand (Coy, 2026-10-06: "will pull the latest brief summary from this thread
 * and give the next steps") — so the call cards no longer carry Quo's next
 * steps. Coy's tap is the ask; the panel sends it once the thread's chat has
 * loaded (`send: true` on sc:dusty-draft).
 */
export const BRIEF_QUESTION =
  "Catch me up on this thread: a brief summary of where things stand from the latest calls and texts, then the next steps.";

export function askDustyBrief(): void {
  window.dispatchEvent(new Event("sc:dusty-open"));
  setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: BRIEF_QUESTION, send: true } })), 250);
}
