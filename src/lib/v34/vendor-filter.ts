/**
 * The Vendors list's trade and kind, shared with the Spaces drawer (Coy, 2026-10-19: the trade
 * list "should be nested under the Vendors bucket in the drawer (and should stay collapsed) but
 * expand once the page is selected … so I can just swipe over to access the list"). The list page
 * publishes its counts here while it is open and reads the pick back; the drawer lists them under
 * its Vendors row. Nothing is kept once the page closes.
 */
import { useSyncExternalStore } from "react";

export interface VendorFilter {
  /** null while the Vendors list isn't open. */
  trades: Array<{ trade: string; n: number }> | null;
  kinds: Array<{ k: string; label: string; n: number }>;
  /** Kinds with the trades under each (Settings → Vendors), for the drawer's nested list. */
  groups?: Array<{ k: string | null; label: string; n: number; trades: Array<{ trade: string; n: number }> }>;
  trade: string;
  sub: string;
}

let state: VendorFilter = { trades: null, kinds: [], trade: "All", sub: "all" };
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

export function setVendorFilter(patch: Partial<VendorFilter>) {
  state = { ...state, ...patch };
  emit();
}
/** The page closed: the drawer folds its list away; the pick is forgotten. */
export function clearVendorFilter() {
  state = { trades: null, kinds: [], groups: [], trade: "All", sub: "all" };
  emit();
}

function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
const get = () => state;
export function useVendorFilter(): VendorFilter {
  return useSyncExternalStore(subscribe, get, get);
}
