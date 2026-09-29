"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Is this element at least `min` px wide? Measured, not a media query: a page's
 * room on a desktop depends on the Threads list beside it and on whether Dusty
 * is docked on the right (Coy, 2026-09-29), not on the window alone.
 *
 * Returns a callback ref and the answer (false until measured, so the narrow
 * layout — the phone's — is what renders first).
 */
export function useWide<T extends HTMLElement>(min: number): [(el: T | null) => void, boolean] {
  const [wide, setWide] = useState(false);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    obs.current?.disconnect();
    obs.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= min));
    ro.observe(el);
    obs.current = ro;
  }, [min]);
  return [ref, wide];
}
