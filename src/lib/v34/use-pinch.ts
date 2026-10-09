"use client";
import { useEffect, useRef } from "react";

/**
 * Two-finger pinch to zoom a scrolling box (Coy, 2026-10-09: "pinch to zoom in / out on mobile on
 * plans"). The point between the fingers stays under them: the box's scroll is moved as the zoom
 * changes. One finger still scrolls. Returns a ref that is true while a pinch is under way (and a
 * moment after), so a tap handler can ignore the fingers lifting.
 */
export function usePinchZoom(box: React.RefObject<HTMLElement | null>, zoom: number, setZoom: (z: number) => void, min: number, max: number) {
  const pinching = useRef(false);
  const live = useRef({ zoom, setZoom, min, max });
  useEffect(() => { live.current = { zoom, setZoom, min, max }; });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let g: { d0: number; z0: number; ax: number; ay: number } | null = null;
    let clear: number | undefined;
    const pts = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      const r = el.getBoundingClientRect();
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2 - r.left, cy: (a.clientY + b.clientY) / 2 - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const p = pts(e);
      g = { d0: Math.max(1, p.d), z0: live.current.zoom, ax: el.scrollLeft + p.cx, ay: el.scrollTop + p.cy };
      pinching.current = true;
      window.clearTimeout(clear);
    };
    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const p = pts(e);
      const { min: lo, max: hi, setZoom: set } = live.current;
      const z = Math.min(hi, Math.max(lo, g.z0 * (p.d / g.d0)));
      set(z);
      const k = z / g.z0, ax = g.ax, ay = g.ay;
      requestAnimationFrame(() => { el.scrollLeft = ax * k - p.cx; el.scrollTop = ay * k - p.cy; });
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      if (g) { g = null; clear = window.setTimeout(() => { pinching.current = false; }, 300); }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      window.clearTimeout(clear);
    };
  }, [box]);
  return pinching;
}
