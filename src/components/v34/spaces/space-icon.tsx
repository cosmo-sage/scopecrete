"use client";

/**
 * A Work Space's picture on the rail: Dusty's icon when he has drawn one (migration 117,
 * src/lib/space-icons.ts), else the silhouette. The icons are read once per tab and kept in a
 * small store the rail and Arrange share; a rail Space with no icon is drawn two at a time,
 * once per visit, so existing Spaces fill in on their own and a new one gets its own.
 * The SVG is parsed by Dusty's drawing filter and drawn with React elements — never as markup.
 */

import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { parseDrawing, type DrawNode } from "@/lib/dusty/drawing";
import { iconMap, keysToDraw, type SpaceIconRow } from "@/lib/space-icons";
import { SpaceSilhouette, type SpaceKind } from "@/components/v34/spaces/space-silhouette";

type State = { supported: boolean | null; icons: Map<string, SpaceIconRow>; drawing: Set<string> };
let state: State = { supported: null, icons: new Map(), drawing: new Set() };
const subs = new Set<() => void>();
const tried = new Set<string>();
let loading: Promise<void> | null = null;
const set = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function load() {
  if (!loading) {
    loading = fetch("/api/spaces/icons").then((r) => r.json()).then((j: { supported?: boolean; icons?: unknown }) => {
      set({ supported: j.supported !== false, icons: iconMap(j.icons) });
    }).catch(() => set({ supported: false }));
  }
  return loading;
}

/** Ask Dusty to draw (or draw again) one Space's icon. */
export async function drawIcon(key: string): Promise<string | null> {
  tried.add(key);
  set({ drawing: new Set(state.drawing).add(key) });
  try {
    const r = await fetch("/api/spaces/icons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const j = (await r.json().catch(() => ({}))) as { icon?: unknown; error?: string; supported?: boolean };
    if (j.supported === false) set({ supported: false });
    if (r.ok && j.icon) set({ icons: new Map(state.icons).set(key, iconMap([j.icon]).get(key)!) });
    return r.ok ? null : j.error ?? "Dusty couldn't draw it.";
  } catch {
    return "Couldn't reach ScopeCrete.";
  } finally {
    const d = new Set(state.drawing); d.delete(key); set({ drawing: d });
  }
}

/** Back to the silhouette for good (until Draw again). */
export async function setShapeIcon(key: string): Promise<void> {
  const r = await fetch("/api/spaces/icons", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, source: "shape" }) });
  if (r.ok) set({ icons: new Map(state.icons).set(key, { key, source: "shape", svg: null, about: null }) });
}

export function useSpaceIcons(): State {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Draw the rail's Spaces that have no icon yet, two at a time. */
export function useDrawMissing(keys: string[]) {
  const s = useSpaceIcons();
  const sig = keys.join(",");
  useEffect(() => {
    if (s.supported !== true || s.drawing.size > 0) return;
    const next = keysToDraw(sig ? sig.split(",") : [], s.icons, tried, 2);
    next.forEach((k) => { void drawIcon(k); });
  }, [s, sig]);
}

const CAMEL: Record<string, string> = {
  "stroke-width": "strokeWidth", "stroke-dasharray": "strokeDasharray", "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin", "fill-opacity": "fillOpacity", "stroke-opacity": "strokeOpacity",
  "fill-rule": "fillRule", "font-size": "fontSize", "font-weight": "fontWeight", "font-style": "fontStyle",
  "text-anchor": "textAnchor", "dominant-baseline": "dominantBaseline",
};
function draw(n: DrawNode | string, key: number | string): React.ReactNode {
  if (typeof n === "string") return n;
  const props: Record<string, string | number> = { key };
  for (const [k, v] of Object.entries(n.attrs)) props[CAMEL[k] ?? k] = v;
  return React.createElement(n.tag, props, ...n.kids.map((c, i) => draw(c, i)));
}

export function SpaceIcon({ spaceKey, kind, color, initials, size = 44, on }: {
  spaceKey: string; kind: SpaceKind; color: string; initials: string; size?: number; on?: boolean;
}) {
  const s = useSpaceIcons();
  const row = s.icons.get(spaceKey);
  const d = useMemo(() => (row?.source === "dusty" && row.svg ? parseDrawing(row.svg) : null), [row]);
  if (!d) {
    return (
      <span style={{ position: "relative", display: "inline-flex", opacity: s.drawing.has(spaceKey) ? 0.55 : 1 }}
        title={s.drawing.has(spaceKey) ? "Dusty is drawing this icon…" : undefined}>
        <SpaceSilhouette kind={kind} color={color} initials={initials} size={size} on={on} />
      </span>
    );
  }
  return (
    <svg viewBox={d.root.attrs.viewBox} width={size} height={size} aria-hidden="true" fontFamily="Inter, Arial, sans-serif"
      style={{ display: "block", flex: "none", borderRadius: Math.round(size * 0.22) }}>
      {d.root.kids.map((c, i) => draw(c, i))}
    </svg>
  );
}
