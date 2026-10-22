"use client";

/**
 * Groups on the Spaces rail (Coy, 2026-10-22: "add workspaces to groups inside the rail by clicking
 * and dragging one workspace on top of another workspace, just the same way Discord does it, and
 * the same way android and apple phone can click and drag app icons into groups of apps").
 *
 * One drag for mouse and finger: a mouse drags once it moves 6px; a finger holds still for 350ms
 * first (a quicker move is a scroll), then the page stops scrolling and a copy of the tile follows
 * it. Where it lands is read off the element under it: a tile ("t:<key>"), a closed group
 * ("g:<id>"), an open group's head ("gh:<id>") or the + at the end ("end"). The middle of a tile
 * groups into it; its top or bottom quarter puts the tile before or after it. A finger held and
 * let go without moving is a hold (Arrange, or the group's menu). The rules are in spaces.ts.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { SpaceIcon } from "@/components/v34/spaces/space-icon";
import type { RailTileInfo } from "@/components/v34/spaces/arrange-rail";

export type DropZone = "before" | "after" | "into";
export interface DragLoad { keys: string[]; group?: string }
export interface DropAt { id: string; zone: DropZone; inGroup: string | null }

const HOLD_MS = 350;

export function useRailDrag({ onDrop, onHold }: {
  onDrop: (load: DragLoad, at: DropAt) => void;
  onHold: (load: DragLoad, el: HTMLElement) => void;
}) {
  const [drag, setDrag] = useState<{ load: DragLoad; x: number; y: number } | null>(null);
  const [over, setOver] = useState<DropAt | null>(null);
  const cb = useRef({ onDrop, onHold });
  useEffect(() => { cb.current = { onDrop, onHold }; });
  const live = useRef<{ load: DragLoad; el: HTMLElement; x: number; y: number; touch: boolean; active: boolean; moved: boolean; timer: number; id: number } | null>(null);
  const overRef = useRef<DropAt | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const zoneAt = useCallback((x: number, y: number, load: DragLoad): DropAt | null => {
    const hit = document.elementFromPoint(x, y);
    const el = hit instanceof Element ? hit.closest<HTMLElement>("[data-rail-drop]") : null;
    if (!el) return null;
    const id = el.dataset.railDrop!;
    if (id === `t:${load.keys[0]}` && load.keys.length === 1) return null;
    if (load.group && (id === `g:${load.group}` || id === `gh:${load.group}`)) return null;
    if (load.group && id.startsWith("t:") && load.keys.includes(id.slice(2))) return null;
    const inGroup = el.dataset.railIn ?? null;
    if (id === "end") return { id, zone: "before", inGroup: null };
    if (id.startsWith("gh:")) return { id, zone: load.group ? "before" : "into", inGroup: null };
    const r = el.getBoundingClientRect();
    const f = (y - r.top) / Math.max(1, r.height);
    // A group never goes into another; it only moves before or after.
    if (load.group) return { id, zone: f < 0.5 ? "before" : "after", inGroup };
    return { id, zone: f < 0.28 ? "before" : f > 0.72 ? "after" : "into", inGroup };
  }, []);

  const end = useCallback((drop: boolean) => {
    const s = live.current;
    live.current = null;
    cleanup.current();
    cleanup.current = () => {};
    if (!s) return;
    window.clearTimeout(s.timer);
    delete document.documentElement.dataset.railDrag;
    if (s.active) {
      // The pointer let go over a Link or button: that click is the drop, not a tap.
      const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
      window.addEventListener("click", eat, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 400);
      const at = overRef.current;
      if (drop && s.touch && !s.moved) cb.current.onHold(s.load, s.el);
      else if (drop && at) cb.current.onDrop(s.load, at);
    }
    overRef.current = null;
    setOver(null);
    setDrag(null);
  }, []);

  const start = useCallback((load: DragLoad) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || live.current) return;
    const touch = e.pointerType !== "mouse";
    const s = { load, el: e.currentTarget, x: e.clientX, y: e.clientY, touch, active: false, moved: false, timer: 0, id: e.pointerId };
    live.current = s;
    const activate = () => {
      s.active = true;
      document.documentElement.dataset.railDrag = "";
      if (touch) try { navigator.vibrate?.(12); } catch { /* not allowed */ }
      setDrag({ load, x: s.x, y: s.y });
    };
    if (touch) s.timer = window.setTimeout(activate, HOLD_MS);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== s.id) return;
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      if (!s.active) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (touch) { end(false); return; }
        activate();
      }
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) s.moved = true;
      const at = zoneAt(ev.clientX, ev.clientY, load);
      const prev = overRef.current;
      if (at?.id !== prev?.id || at?.zone !== prev?.zone) { overRef.current = at; setOver(at); }
      setDrag({ load, x: ev.clientX, y: ev.clientY });
    };
    // While a finger drags, the page doesn't scroll and the long press opens no menu.
    const noScroll = (ev: TouchEvent) => { if (s.active && ev.cancelable) ev.preventDefault(); };
    const noMenu = (ev: Event) => { if (touch) ev.preventDefault(); };
    const up = (ev: PointerEvent) => { if (ev.pointerId === s.id) end(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === s.id) end(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") end(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", noScroll, { passive: false });
    window.addEventListener("contextmenu", noMenu, true);
    window.addEventListener("keydown", key);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", noScroll);
      window.removeEventListener("contextmenu", noMenu, true);
      window.removeEventListener("keydown", key);
    };
  }, [end, zoneAt]);

  useEffect(() => () => end(false), [end]);
  return { drag, over, start };
}

/** What follows the pointer while dragging: the tile, or the group's little grid. */
export function DragGhost({ x, y, infos }: { x: number; y: number; infos: RailTileInfo[] }) {
  return (
    <div className="sc-rail-ghost" style={{ left: x, top: y }} aria-hidden="true">
      {infos.length === 1
        ? <SpaceIcon spaceKey={infos[0].key} kind={infos[0].shape} color={infos[0].color} initials={infos[0].initials} size={44} />
        : <MiniGrid infos={infos} />}
    </div>
  );
}

/** Up to four members drawn small, as a phone draws a folder of apps. */
export function MiniGrid({ infos }: { infos: RailTileInfo[] }) {
  return (
    <span className="sc-rail-folder-grid">
      {infos.slice(0, 4).map((t) => (
        <span key={t.key}><SpaceIcon spaceKey={t.key} kind={t.shape} color={t.color} initials={t.initials} size={18} /></span>
      ))}
    </span>
  );
}

/** A group's open / closed state, per device. */
const OPEN_KEY = "sc:rail-groups-open";
export function useOpenGroups(): [Set<string>, (id: string, open: boolean) => void] {
  const [v, setV] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      try { setV(new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[])); } catch { /* private mode */ }
    });
    return () => { off = true; };
  }, []);
  const set = useCallback((id: string, open: boolean) => {
    setV((prev) => {
      const n = new Set(prev);
      if (open) n.add(id); else n.delete(id);
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...n].slice(0, 60))); } catch { /* private mode */ }
      return n;
    });
  }, []);
  return [v, set];
}

/** Rename a group, open or close it, or ungroup it; beside the group on the rail. */
export function GroupMenu({ name, at, open, onRename, onToggle, onUngroup, onClose }: {
  name: string; at: DOMRect; open: boolean; onRename: (n: string) => void; onToggle: () => void; onUngroup: () => void; onClose: () => void;
}) {
  const [v, setV] = useState(name);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = window.setTimeout(() => window.addEventListener("pointerdown", away, true), 0);
    window.addEventListener("keydown", key);
    return () => { window.clearTimeout(t); window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key); };
  }, [onClose]);
  const save = () => { if (v.trim() && v.trim() !== name) onRename(v); };
  const top = Math.max(8, Math.min(at.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 190));
  return (
    <div ref={ref} className="sc-rail-gmenu" role="dialog" aria-label={`Group ${name}`} style={{ left: at.right + 8, top }}>
      <label className="sc-rail-gmenu-l">Group name</label>
      <input className="sc-shelf-name" value={v} maxLength={30} onChange={(e) => setV(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") { save(); onClose(); } }} />
      <button type="button" className="sc-rail-gmenu-b" onClick={() => { save(); onToggle(); onClose(); }}>{open ? "Close the group" : "Open the group"}</button>
      <button type="button" className="sc-rail-gmenu-b" onClick={() => { onUngroup(); onClose(); }}>Ungroup</button>
      <p className="sc-rail-gmenu-tip">Drag a Work Space onto the group to add it, or out of it to take it out.</p>
    </div>
  );
}
