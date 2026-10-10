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

/**
 * The scroll wheel zooms a scrolling box about the pointer (Coy, 2026-10-10: "zoom in and out of the
 * plans with my scroll wheel on desktop"). Shift + wheel is left to scroll sideways. A trackpad's
 * small steps zoom smoothly; a mouse notch is about 12%.
 */
export function useWheelZoom(box: React.RefObject<HTMLElement | null>, zoom: number, setZoom: (z: number) => void, min: number, max: number) {
  const live = useRef({ zoom, setZoom, min, max });
  useEffect(() => { live.current = { ...live.current, setZoom, min, max }; });
  useEffect(() => { live.current.zoom = zoom; }, [zoom]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const { zoom: z0, min: lo, max: hi, setZoom: set } = live.current;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const z = Math.min(hi, Math.max(lo, z0 * Math.exp(-Math.max(-120, Math.min(120, dy)) / 900)));
      if (z === z0) return;
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const ax = el.scrollLeft + cx, ay = el.scrollTop + cy, k = z / z0;
      live.current.zoom = z; // a burst of wheel events builds on the last, not the last render
      set(z);
      requestAnimationFrame(() => { el.scrollLeft = ax * k - cx; el.scrollTop = ay * k - cy; });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [box]);
}
