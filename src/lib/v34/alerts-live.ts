"use client";

/**
 * Incoming alerts, one watcher per tab (Coy, 2026-10-06: "notified inside the
 * scopecrete app for incoming emails, text messages and phone calls … if there
 * is an active phone call I would like that thread channel to show it's
 * active").
 *
 * What it listens to — kept light (the Supabase plan is over its limits):
 *  - Supabase Realtime: inbound `messages` (082), `emails` and `live_calls`
 *    (086) — a nudge only; the payload is never drawn;
 *  - a poll of /api/alerts every 30 s while the tab is visible, and at once
 *    when it comes back — the fallback, and how a ring shows before 086.
 * Each nudge reads only what is newer than the last read. The bell, the
 * pop-ups and every thread read this one store (useAlerts / useLiveCalls).
 */
import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { mergeAlerts, unreadCount, type Alert, type LiveCall } from "@/lib/alerts";

import { shouldPoll } from "@/lib/v34/idle-poll";
const client = () => import("@/lib/supabase").then((m) => m.supabase);

const POLL_MS = 30_000;
const SEEN_KEY = "sc:alerts-seen";

interface State {
  items: Alert[];
  live: LiveCall[];
  /** New since this tab started watching — the pop-ups. */
  fresh: Alert[];
  seenAt: string | null;
  loaded: boolean;
}

let state: State = { items: [], live: [], fresh: [], seenAt: null, loaded: false };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; for (const s of subs) s(); };

let cursor: string | null = null;
let channel: RealtimeChannel | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let again = false;
let users = 0;

function readSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

/** A system notification while the app is in the background (desktop browsers; a phone needs an installed app with a service worker, not built). */
function systemNotify(a: Alert) {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(a.title, { body: a.body, tag: a.id, icon: "/icon-192.png" });
    n.onclick = () => { window.focus(); if (a.href) window.location.href = a.href; n.close(); };
  } catch { /* Android Chrome: only a service worker may show one */ }
}

async function read() {
  if (inflight) { again = true; return; }
  inflight = true;
  try {
    const q = cursor ? `?since=${encodeURIComponent(cursor)}` : "";
    const r = await fetch(`/api/alerts${q}`, { cache: "no-store" });
    if (!r.ok) return;
    const b = (await r.json()) as { items?: Alert[]; live?: LiveCall[]; now?: string };
    const got = Array.isArray(b.items) ? b.items : [];
    const known = new Set(state.items.map((x) => x.id));
    const news = state.loaded ? got.filter((x) => !known.has(x.id)) : [];
    // The next read overlaps the last by 30 s: a row stamped just before the
    // server's clock may not have been committed when it read.
    if (b.now) cursor = new Date(Date.parse(b.now) - 30_000).toISOString();
    for (const a of news) systemNotify(a);
    set({
      items: mergeAlerts(got, state.items),
      live: Array.isArray(b.live) ? b.live : state.live,
      fresh: news.length ? [...news, ...state.fresh].slice(0, 6) : state.fresh,
      loaded: true,
    });
  } catch { /* offline: the next nudge tries again */ }
  finally {
    inflight = false;
    if (again) { again = false; void read(); }
  }
}

function nudge() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; void read(); }, 700);
}

const onVisible = () => { if (document.visibilityState === "visible") void read(); };

function start() {
  state = { ...state, seenAt: readSeen() };
  void read();
  let last = Date.now();
  // Realtime nudges at once; the poll is the safety net, and an idle tab polls every 5 min (idle-poll.ts).
  timer = setInterval(() => { if (shouldPoll(last)) { last = Date.now(); void read(); } }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  void (async () => {
    let supabase: Awaited<ReturnType<typeof client>>;
    try { supabase = await client(); } catch { return; }
    try { await supabase.realtime.setAuth(); } catch { /* the poll still works */ }
    if (!users || channel) return;
    channel = supabase
      .channel("sc-incoming")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "direction=eq.inbound" }, nudge)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "emails" }, nudge)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_calls" }, nudge)
      .subscribe();
  })();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisible);
  if (channel) { const ch = channel; void client().then((sb) => sb.removeChannel(ch)); }
  channel = null;
}

/** Mounted once, in the dashboard layout. */
export function useAlertsWatcher(on: boolean) {
  useEffect(() => {
    if (!on) return;
    users += 1;
    if (users === 1) start();
    return () => { users -= 1; if (!users) stop(); };
  }, [on]);
}

const snap = () => state;
// Hydration reads this, so the first client render matches the server's
// (nothing yet), however soon the first read lands.
const EMPTY: State = { items: [], live: [], fresh: [], seenAt: null, loaded: false };
const NO_CALLS: LiveCall[] = [];
const serverSnap = () => EMPTY;
const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function useAlerts() {
  const s = useSyncExternalStore(subscribe, snap, serverSnap);
  return { ...s, unread: unreadCount(s.items, s.seenAt) };
}

/** Calls happening now — for the thread list and the open thread. */
export function useLiveCalls(): LiveCall[] {
  return useSyncExternalStore(subscribe, () => state.live, () => NO_CALLS);
}

export function markAlertsSeen() {
  const at = state.items[0]?.at ?? new Date().toISOString();
  try { localStorage.setItem(SEEN_KEY, at); } catch { /* private mode */ }
  set({ seenAt: at });
}

export function dropFresh(id: string) {
  set({ fresh: state.fresh.filter((x) => x.id !== id) });
}

export function dropAllFresh() {
  if (state.fresh.length) set({ fresh: [] });
}
