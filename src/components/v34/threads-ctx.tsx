"use client";
/**
 * Threads v2 state shared by the thread rail (desktop), the drawer (phone), the
 * contact list and the open contact: which thread is picked (`?t=` — a system
 * key or a custom thread id; the old `?f=` still works), the threads Coy made,
 * the counts, and whether the list is folded to initials.
 *
 * Counts and custom threads are read here once and refreshed on demand, so the
 * rail, the drawer and the list never disagree.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isSystemKey, type CustomThread, type SystemThreadKey } from "@/lib/v34/threads";

/** Threads opens on All, on every size (Coy, 2026-10-05: "it needs to default to the all bucket"). */
export const DEFAULT_THREAD: SystemThreadKey = "all";

interface Ctx {
  /** "customers" | "unsorted" | … | "archived" | a custom thread id. */
  thread: string;
  setThread: (t: string) => void;
  custom: CustomThread[] | null;
  counts: Record<string, number> | null;
  customCounts: Record<string, number>;
  refresh: () => void;
  folded: boolean;
  setFolded: (f: boolean) => void;
  newThread: boolean;
  setNewThread: (open: boolean) => void;
  drawer: boolean;
  setDrawer: (open: boolean) => void;
}

const C = createContext<Ctx | null>(null);
export const useThreads = () => useContext(C);

export function ThreadsProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const fromUrl = params.get("t") ?? params.get("f");
  const [thread, setThreadState] = useState<string>(fromUrl ?? DEFAULT_THREAD);
  const [seen, setSeen] = useState(fromUrl);
  if (fromUrl !== seen) { setSeen(fromUrl); if (fromUrl) setThreadState(fromUrl); }
  const [custom, setCustom] = useState<CustomThread[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let off = false;
    Promise.all([
      fetch("/api/threads/custom").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/threads/counts").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([c, n]) => {
      if (off) return;
      if (Array.isArray(c?.threads)) setCustom(c.threads as CustomThread[]);
      if (n?.counts) { setCounts(n.counts); window.dispatchEvent(new CustomEvent("sc:thread-counts", { detail: n.counts })); }
      if (n?.custom) setCustomCounts(n.custom);
    });
    return () => { off = true; };
  }, [tick]);
  // A thread that was retired (or another org's id) falls back to All.
  const valid = thread === "archived" || isSystemKey(thread) || custom === null || custom.some((t) => t.id === thread);
  const current = valid ? thread : DEFAULT_THREAD;

  const [folded, setFolded] = useState(false);
  const setThread = useCallback((t: string) => {
    setThreadState(t);
    setFolded(false);
    // history, not the router: Next keeps useSearchParams in step, and the open contact stays open.
    window.history.replaceState(null, "", `${pathname}?t=${encodeURIComponent(t)}`);
  }, [pathname]);
  const [newThread, setNewThread] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const value = useMemo<Ctx>(() => ({ thread: current, setThread, custom, counts, customCounts, refresh, folded, setFolded, newThread, setNewThread, drawer, setDrawer }),
    [current, setThread, custom, counts, customCounts, refresh, folded, newThread, drawer]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
