/**
 * Dusty's streaming reply, for the activity line — a tiny store outside React
 * state so a token re-renders only the line that shows it, not the whole
 * dashboard layout (Coy's interaction timing, 2026-09-30: every token used to
 * re-render the header, rail, footer and Settings sheet).
 */
import { useSyncExternalStore } from "react";

let text = "";
const subs = new Set<() => void>();

export function setDustyLive(next: string) {
  if (next === text) return;
  text = next;
  for (const f of subs) f();
}

function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
const get = () => text;
const getServer = () => "";

export function useDustyLive(): string {
  return useSyncExternalStore(subscribe, get, getServer);
}

/**
 * "Use this" — a page that is editing text (the proposal's warranty or terms)
 * registers where Dusty's answer can go; Dusty's panel then offers
 * "Use this in the warranty" under each answer. Coy's tap puts it there: Dusty
 * never writes to the page himself (§6 — read-only toward the business).
 */
/** apply returns false when the answer held nothing it could use (no bullets), so the chat can say so. */
export interface DustyUseTarget { label: string; apply: (text: string) => boolean | void }
let target: DustyUseTarget | null = null;
const useSubs = new Set<() => void>();
export function setDustyUse(next: DustyUseTarget | null) {
  target = next;
  for (const f of useSubs) f();
}
function subscribeUse(f: () => void) { useSubs.add(f); return () => { useSubs.delete(f); }; }
export function useDustyUse(): DustyUseTarget | null {
  return useSyncExternalStore(subscribeUse, () => target, () => null);
}

/**
 * The open chat, for the artifacts column beside Dusty on Home (Coy, 2026-10-19). The panel
 * publishes it when a chat loads, a question goes out and an answer finishes — never per token.
 */
export interface DustyChatTurn { role: "user" | "assistant"; content: string; files?: Array<{ id: string; name: string; kind?: string; url: string | null }> }
export interface DustyChat { id: string | null; title: string | null; items: DustyChatTurn[]; streaming: number | null }
let chat: DustyChat = { id: null, title: null, items: [], streaming: null };
const chatSubs = new Set<() => void>();
export function setDustyChat(next: DustyChat) {
  chat = next;
  for (const f of chatSubs) f();
}
function subscribeChat(f: () => void) { chatSubs.add(f); return () => { chatSubs.delete(f); }; }
const EMPTY_CHAT: DustyChat = { id: null, title: null, items: [], streaming: null };
export function useDustyChat(): DustyChat {
  return useSyncExternalStore(subscribeChat, () => chat, () => EMPTY_CHAT);
}

// Where something Dusty made is saved in Files (a drawing's "Save to Files"): what the open chat is about —
// the job, the person, the customer — else unfiled. Read on the tap, so no subscription.
export type DustyFileTarget = { job_id: string } | { contact_id: string } | { customer_id: string } | { from_dusty: true };
let fileTarget: DustyFileTarget = { from_dusty: true };
export function setDustyFileTarget(next: DustyFileTarget) { fileTarget = next; }
export function dustyFileTarget(): DustyFileTarget { return fileTarget; }
