"use client";
import { useEffect, useRef } from "react";

/** A drop-down menu closes on a tap or click anywhere outside it, and on Esc
 *  (Coy, 2026-10-24: "when I click somewhere else on the screen, the hamburger
 *  menu should minimize. This should be true for every hamburger menu on the
 *  app"). Put the returned ref on the box holding the button and its menu. */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [open]);
  return ref;
}
