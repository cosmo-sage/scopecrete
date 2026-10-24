"use client";
/**
 * The org's vendor kinds and trades (Settings → Vendors), read once per tab and shared by the
 * Vendors list, the vendor forms and the drawer. Until it loads — or when it can't — the app's
 * own defaults stand in, so nothing waits on it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_KINDS, defaultTrades, type Kind, type Trade } from "@/lib/vendor-taxonomy";

export interface VendorTaxonomy { kinds: Kind[]; trades: Trade[]; missing: string | null; loaded: boolean }

let state: VendorTaxonomy = { kinds: DEFAULT_KINDS, trades: defaultTrades(), missing: null, loaded: false };
let asked = false;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

export function refreshVendorTaxonomy() {
  asked = true;
  fetch("/api/vendors/taxonomy").then((r) => (r.ok ? r.json() : null)).then((b) => {
    if (!b || !Array.isArray(b.kinds)) return;
    state = { kinds: b.kinds, trades: b.trades ?? state.trades, missing: b.missing ?? null, loaded: true };
    emit();
  }).catch(() => {});
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => state;

export function useVendorTaxonomy(): VendorTaxonomy {
  const t = useSyncExternalStore(subscribe, get, get);
  useEffect(() => { if (!asked) refreshVendorTaxonomy(); }, []);
  return t;
}

/** A kind's label: the org's own, else the slug made readable. */
export const kindLabel = (kinds: Kind[], slug: string | null | undefined) =>
  !slug ? null : kinds.find((k) => k.slug === slug)?.label ?? slug.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
