"use client";

import { useSyncExternalStore } from "react";

/**
 * True while Dusty is docked on the right of a desktop (the shell sets
 * <html data-dusty="open"> and fires "sc:dusty-state"). The job page moves its
 * totals into his panel then (Coy, 2026-09-30).
 */
function subscribe(cb: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  window.addEventListener("sc:dusty-state", cb);
  mq.addEventListener("change", cb);
  return () => { window.removeEventListener("sc:dusty-state", cb); mq.removeEventListener("change", cb); };
}
const read = () => document.documentElement.dataset.dusty === "open" && window.matchMedia("(min-width: 1024px)").matches;

export function useDustyDocked(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
