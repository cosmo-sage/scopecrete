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
