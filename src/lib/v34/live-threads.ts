"use client";

/**
 * Threads stay live (Coy, 2026-10-05: "I would like the webhooks to be near
 * instant from quo"). Quo's webhook lands a text in `messages` about two
 * seconds after it is sent; the Threads list, the open conversation and a
 * person's page used to read once when opened and never again, so a text that
 * arrived while they were on screen didn't show until a reload.
 *
 * One watcher per tab, shared by every screen that subscribes:
 *  - Supabase Realtime on `messages` INSERT (migration 082 puts the table in
 *    the `supabase_realtime` publication; RLS decides which rows a member
 *    hears about) — instant;
 *  - a poll of /api/threads/latest every 15 s while the tab is visible, and at
 *    once when it comes back into view — it works before 082 and catches what
 *    a dropped socket missed, and it also notices Dusty filing someone.
 * Subscribers are told "something changed" (debounced), and refetch their own
 * reads, which stay the one source of what is shown — the realtime payload is
 * never drawn.
 */
import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
// supabase-js (~55 KB gzipped) is loaded only when a screen first listens,
// not with the dashboard's first paint.
import { shouldPoll } from "@/lib/v34/idle-poll";
const client = () => import("@/lib/supabase").then((m) => m.supabase);

type Listener = (contactId: string | null) => void;
const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let stamp: string | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;
let pendingContacts = new Set<string | null>();

const POLL_MS = 15_000;
const DEBOUNCE_MS = 600;

function notify(contactId: string | null) {
  pendingContacts.add(contactId);
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const ids = pendingContacts;
    pendingContacts = new Set();
    // An unknown contact (a poll) is news for everyone.
    const any = ids.has(null);
    for (const l of listeners) {
      if (any) l(null);
      else for (const id of ids) l(id);
    }
  }, DEBOUNCE_MS);
}

let lastPoll = 0;
let live = false;

async function poll(force = false) {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  // With Realtime connected the poll is only a safety net: once a minute, or every 5 min on an idle tab.
  if (!force && (!shouldPoll(lastPoll) || (live && Date.now() - lastPoll < 60_000))) return;
  lastPoll = Date.now();
  try {
    const r = await fetch("/api/threads/latest", { cache: "no-store" });
    if (!r.ok) return;
    const b = (await r.json()) as { stamp?: string };
    if (typeof b.stamp !== "string") return;
    if (stamp !== null && b.stamp !== stamp) notify(null);
    stamp = b.stamp;
  } catch { /* offline: the next poll tries again */ }
}

const onVisible = () => { if (document.visibilityState === "visible") void poll(true); };

function start() {
  void poll(true);
  timer = setInterval(() => void poll(), POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  void (async () => {
    let supabase: Awaited<ReturnType<typeof client>>;
    try { supabase = await client(); } catch { return; /* offline: the poll still works */ }
    try { await supabase.realtime.setAuth(); } catch { /* the poll still works */ }
    if (!listeners.size || channel) return;
    channel = supabase
      .channel("sc-live-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const row = p.new as { contact_id?: string | null } | undefined;
        notify(row?.contact_id ?? null);
      })
      .subscribe((status) => { live = status === "SUBSCRIBED"; });
  })();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("focus", onVisible);
  if (channel) { const ch = channel; void client().then((sb) => sb.removeChannel(ch)); }
  channel = null;
  live = false;
  stamp = null;
}

/**
 * A text was just sent from this tab (the composer or Dusty's plan). Quo's
 * webhook brings it back a few seconds later; check soon rather than waiting
 * for the next 15 s poll, and tell the person's screens to re-read even if no
 * poll has set a stamp yet.
 */
export function expectMessage(contactId: string | null) {
  if (typeof window === "undefined") return;
  for (const ms of [3_000, 8_000, 16_000]) setTimeout(() => notify(contactId), ms);
}

/**
 * Call `onChange` when a message lands (or Dusty files someone). With
 * `contactId`, only for news about that person — or news nobody could place.
 */
export function useLiveThreads(onChange: () => void, contactId?: string | null) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  useEffect(() => {
    const l: Listener = (id) => {
      if (contactId && id && id !== contactId) return;
      cb.current();
    };
    listeners.add(l);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(l);
      if (!listeners.size) stop();
    };
  }, [contactId]);
}
