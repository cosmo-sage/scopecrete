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
