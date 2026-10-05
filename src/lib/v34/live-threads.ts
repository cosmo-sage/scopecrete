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
import { supabase } from "@/lib/supabase";

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

async function poll() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    const r = await fetch("/api/threads/latest", { cache: "no-store" });
    if (!r.ok) return;
    const b = (await r.json()) as { stamp?: string };
    if (typeof b.stamp !== "string") return;
    if (stamp !== null && b.stamp !== stamp) notify(null);
    stamp = b.stamp;
  } catch { /* offline: the next poll tries again */ }
}

const onVisible = () => { if (document.visibilityState === "visible") void poll(); };

function start() {
  void poll();
  timer = setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  void (async () => {
    try { await supabase.realtime.setAuth(); } catch { /* the poll still works */ }
    if (!listeners.size || channel) return;
    channel = supabase
      .channel("sc-live-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const row = p.new as { contact_id?: string | null } | undefined;
        notify(row?.contact_id ?? null);
      })
      .subscribe();
  })();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("focus", onVisible);
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  stamp = null;
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
