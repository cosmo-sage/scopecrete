"use client";
/**
 * A slippy map drawn from our own tile route (/api/aerial/tile — the Mapbox
 * token stays on the server): Mapbox Streets for "Map", Mapbox Satellite for
 * "Satellite". Drag to pan, wheel or pinch to zoom (around the pointer),
 * double-click to zoom in. Zoom is fractional; the tiles of the nearest whole
 * zoom are drawn scaled. What sits on the map (pins, the clip frame's marks) is
 * drawn by the page through `overlay`, given a function that places a point.
 *
 * No map library: the projection is src/lib/map.ts (the same Web Mercator as
 * the saved aerial, src/lib/aerial.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { TILE, fromWorldPx, worldPx } from "@/lib/map";

export interface View { lat: number; lng: number; zoom: number }
export type Place = (lat: number, lng: number) => { x: number; y: number };

export const MIN_Z = 3;
export const MAX_Z = 21;
const clampZ = (z: number) => Math.max(MIN_Z, Math.min(MAX_Z, z));

/** The view that fits these points in a w × h box with `pad` px around them. */
export function fitView(pts: Array<{ lat: number; lng: number }>, w: number, h: number, pad = 48, maxZoom = 16): View | null {
  if (!pts.length || w <= 0 || h <= 0) return null;
  const ws = pts.map((p) => worldPx(p.lat, p.lng, 0));
  const xs = ws.map((p) => p.x), ys = ws.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zx = x1 - x0 > 0 ? Math.log2((w - pad * 2) / (x1 - x0)) : maxZoom;
  const zy = y1 - y0 > 0 ? Math.log2((h - pad * 2) / (y1 - y0)) : maxZoom;
  const zoom = clampZ(Math.min(maxZoom, zx, zy));
  const c = fromWorldPx((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return { lat: c.lat, lng: c.lng, zoom };
}

export function MapView({ view, onView, mode, overlay, onSize, onBackgroundTap, children }: {
  view: View;
  onView: (v: View) => void;
  mode: "map" | "sat";
  /** Drawn over the tiles, moved with the map. */
  overlay?: (place: Place, size: { w: number; h: number }) => React.ReactNode;
  onSize?: (s: { w: number; h: number }) => void;
  onBackgroundTap?: () => void;
  /** Drawn over everything, fixed on the screen (search, buttons, the frame). */
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const onSizeRef = useRef(onSize);
  useEffect(() => { onSizeRef.current = onSize; }, [onSize]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const s = { w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) };
      setSize(s); onSizeRef.current?.(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zoom to z keeping the point under (sx, sy) where it is. */
  const zoomAt = useCallback((z: number, sx: number, sy: number) => {
    const v = viewRef.current, el = box.current;
    if (!el) return;
    const nz = clampZ(z);
    const dx = sx - el.clientWidth / 2, dy = sy - el.clientHeight / 2;
    const c = worldPx(v.lat, v.lng, v.zoom);
    const under = fromWorldPx(c.x + dx, c.y + dy, v.zoom);
    const u = worldPx(under.lat, under.lng, nz);
    const nc = fromWorldPx(u.x - dx, u.y - dy, nz);
    onView({ lat: nc.lat, lng: nc.lng, zoom: nz });
  }, [onView]);

  // Wheel: passive: false so the page doesn't scroll under the map.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const r = el.getBoundingClientRect();
      zoomAt(viewRef.current.zoom - px / 300, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
  }, [zoomAt]);

  // Pointers: one drags, two pinch. A drag only starts after 4 px, so a tap on a pin is still a tap.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; z: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; z: number; mx: number; my: number } | null>(null);
  const moved = useRef(false);
  const span = () => { const [a, b] = [...pts.current.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
  const local = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pts.current.set(e.pointerId, local(e));
    moved.current = false;
    if (pts.current.size === 2) {
      drag.current = null;
      const s = span();
      pinch.current = { d: s.d, z: viewRef.current.zoom, mx: s.mx, my: s.my };
      return;
    }
    const v = viewRef.current, c = worldPx(v.lat, v.lng, v.zoom);
    drag.current = { ...local(e), cx: c.x, cy: c.y, z: v.zoom, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, local(e));
    if (pinch.current && pts.current.size === 2) {
      moved.current = true;
      const s = span();
      zoomAt(pinch.current.z + Math.log2(s.d / pinch.current.d), s.mx, s.my);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 4) return;
    if (!d.moved) { d.moved = true; moved.current = true; box.current?.setPointerCapture?.(e.pointerId); }
    const c = fromWorldPx(d.cx - (p.x - d.x), d.cy - (p.y - d.y), d.z);
    onView({ lat: c.lat, lng: c.lng, zoom: d.z });
  };
  const up = (e: React.PointerEvent) => {
    const wasDrag = drag.current?.moved || !!pinch.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) {
      drag.current = null;
      if (!wasDrag && !moved.current && (e.target as HTMLElement).hasAttribute?.("data-tiles")) onBackgroundTap?.();
    }
  };

  // Tiles at the nearest whole zoom, scaled to the fractional one.
  const p = mode === "sat" ? "mapbox" : "streets";
  const tz = Math.max(2, Math.min(22, Math.round(view.zoom)));
  const k = 2 ** (view.zoom - tz);
  const c = worldPx(view.lat, view.lng, tz);
  const tiles: Array<{ k: string; x: number; y: number; left: number; top: number }> = [];
  if (size.w && size.h) {
    const n = 2 ** tz;
    const x0 = Math.floor((c.x - size.w / 2 / k) / TILE), x1 = Math.floor((c.x + size.w / 2 / k) / TILE);
    const y0 = Math.max(0, Math.floor((c.y - size.h / 2 / k) / TILE)), y1 = Math.min(n - 1, Math.floor((c.y + size.h / 2 / k) / TILE));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      tiles.push({ k: `${tx}/${ty}`, x: ((tx % n) + n) % n, y: ty, left: (tx * TILE - c.x) * k + size.w / 2, top: (ty * TILE - c.y) * k + size.h / 2 });
    }
  }
  const cz = worldPx(view.lat, view.lng, view.zoom);
  const place: Place = (lat, lng) => { const w = worldPx(lat, lng, view.zoom); return { x: w.x - cz.x + size.w / 2, y: w.y - cz.y + size.h / 2 }; };
  const t = TILE * k;

  return (
    <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={(e) => { if (e.target !== e.currentTarget.querySelector("[data-tiles]")) return; const r = box.current!.getBoundingClientRect(); zoomAt(Math.round(view.zoom) + 1, e.clientX - r.left, e.clientY - r.top); }}
      className="relative overflow-hidden select-none" style={{ overflow: "clip", width: "100%", height: "100%", background: mode === "sat" ? "#2b2e2b" : "#ECE7DC", touchAction: "none", cursor: "grab" }}>
      <div data-tiles="" style={{ position: "absolute", inset: 0 }}>
        {tiles.map((tl) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${p}/${tz}/${tl.k}`} src={`/api/aerial/tile?p=${p}&z=${tz}&x=${tl.x}&y=${tl.y}`} alt="" draggable={false}
            style={{ position: "absolute", left: tl.left, top: tl.top, width: t + 0.5, height: t + 0.5, pointerEvents: "none", userSelect: "none" }} />
        ))}
      </div>
      {size.w > 0 && overlay?.(place, size)}
      {children}
      <div aria-hidden style={{ position: "absolute", right: 4, bottom: 2, fontSize: 9.5, color: mode === "sat" ? "rgba(255,255,255,.85)" : T.ink3, textShadow: mode === "sat" ? "0 0 2px #000" : "0 0 2px #fff", pointerEvents: "none", fontFamily: "inherit" }}>
        © Mapbox © OpenStreetMap{mode === "sat" ? " © Maxar" : ""}
      </div>
    </div>
  );
}

/** + / − buttons for the map (bottom right). */
export function ZoomButtons({ view, onView, bottom = 16 }: { view: View; onView: (v: View) => void; bottom?: number }) {
  const b: React.CSSProperties = { width: 36, height: 36, background: T.card, color: T.ink, fontSize: 20, lineHeight: 1, cursor: "pointer", border: `1px solid ${T.hairStrong}` };
  return (
    <div className="absolute flex flex-col rounded overflow-hidden" style={{ right: 12, bottom, zIndex: 5, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
      <button type="button" aria-label="Zoom in" onClick={() => onView({ ...view, zoom: clampZ(Math.round(view.zoom) + 1) })} style={{ ...b, borderBottom: "none" }}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => onView({ ...view, zoom: clampZ(Math.round(view.zoom) - 1) })} style={{ ...b, fontSize: F.lg }}>−</button>
    </div>
  );
}
