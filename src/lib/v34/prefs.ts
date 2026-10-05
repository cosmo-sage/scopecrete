"use client";

/**
 * Settings that follow Coy across devices (migration 053, /api/prefs):
 * `menus`, `home`, `pricebook_cols`. Read once per page load, kept in memory,
 * mirrored to this browser so the first paint is right, and saved to his
 * account a moment after each change.
 */

import { useCallback, useEffect, useState } from "react";

type Prefs = Record<string, unknown>;
const LS = "sc:prefs";
let cache: Prefs | null = null;
let loading: Promise<Prefs> | null = null;
const listeners = new Set<(p: Prefs) => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function local(): Prefs {
  try { return JSON.parse(localStorage.getItem(LS) ?? "{}") as Prefs; } catch { return {}; }
}
function load(): Promise<Prefs> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch("/api/prefs").then((r) => (r.ok ? r.json() : null)).then((b) => {
      cache = { ...local(), ...((b?.prefs as Prefs) ?? {}) };
      try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* private mode */ }
      listeners.forEach((f) => f(cache as Prefs));
      return cache;
    }).catch(() => (cache = local()));
  }
  return loading;
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => cache ?? {});
  useEffect(() => {
    const on = (p: Prefs) => setPrefs({ ...p });
    listeners.add(on);
    if (cache) on(cache); else { on(local()); void load(); }
    return () => { listeners.delete(on); };
  }, []);
  const set = useCallback((v: T) => {
    cache = { ...(cache ?? local()), [key]: v };
    try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* private mode */ }
    listeners.forEach((f) => f(cache as Prefs));
    const t = timers.get(key);
    if (t) clearTimeout(t);
    timers.set(key, setTimeout(() => {
      void fetch("/api/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: v }) });
    }, 600));
  }, [key]);
  const v = prefs[key];
  return [(v === undefined || v === null ? fallback : v) as T, set];
}
