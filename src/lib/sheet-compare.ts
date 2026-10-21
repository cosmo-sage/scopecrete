/**
 * Sheets side by side in Takeoffs — the pure part (src/components/v34/plan-room/sheet-compare.tsx).
 * Two to four panes on a desktop, two on a phone; one is active.
 */
export type Layout = "side" | "stack" | "three" | "four";
export interface Compare {
  /** A sheet id per pane, in order. */
  panes: string[];
  layout: Layout;
  /** The pane the tools act on. */
  active: number;
  /** Zoom and the spot in view move together. */
  link: boolean;
  /** One pane filling the drawing for now. */
  max: number | null;
  /** Where the divider of a two-pane layout sits, 0.2 – 0.8. */
  split: number;
}

export const maxPanes = (phone: boolean) => (phone ? 2 : 4);

/** The layout that fits a number of panes, keeping a two-pane choice. */
export function gridFor(n: number, two: Layout): Layout {
  return n >= 4 ? "four" : n === 3 ? "three" : two === "stack" ? "stack" : "side";
}

/**
 * The panes a compare starts with: the sheets ticked (2 – 4, in the list's order, the current one
 * first if ticked), else the current sheet and the next one.
 */
export function startPanes(all: string[], current: string | null, pick: string[] | undefined, phone: boolean): string[] {
  const max = maxPanes(phone);
  if (pick?.length) {
    const p = all.filter((id) => pick.includes(id));
    const ordered = current && p.includes(current) ? [current, ...p.filter((id) => id !== current)] : p;
    return ordered.slice(0, max);
  }
  const cur = current && all.includes(current) ? current : all[0];
  if (!cur) return [];
  const i = all.indexOf(cur);
  const next = all[i + 1] ?? all.find((id) => id !== cur);
  return next ? [cur, next] : [cur];
}

/** One more pane, with the next sheet not already shown (or null at the limit). */
export function addPane(c: Compare, all: string[], phone: boolean): Compare | null {
  if (c.panes.length >= maxPanes(phone)) return null;
  const last = c.panes[c.panes.length - 1];
  const from = Math.max(0, all.indexOf(last));
  const rot = [...all.slice(from + 1), ...all.slice(0, from + 1)];
  const id = rot.find((x) => !c.panes.includes(x)) ?? rot[0];
  if (!id) return null;
  const panes = [...c.panes, id];
  return { ...c, panes, layout: gridFor(panes.length, c.layout), max: null };
}

/** A pane closed; down to one pane the compare ends (null). */
export function closePane(c: Compare, i: number): Compare | null {
  const panes = c.panes.filter((_, j) => j !== i);
  if (panes.length < 2) return null;
  const active = i === c.active ? Math.min(i, panes.length - 1) : c.active > i ? c.active - 1 : c.active;
  const max = c.max === null || c.max === i ? null : c.max > i ? c.max - 1 : c.max;
  return { ...c, panes, active, max, layout: gridFor(panes.length, c.layout === "stack" ? "stack" : "side") };
}

/** A compare read back from the device, checked: deleted sheets kept (shown as removed), the rest repaired. */
export function cleanCompare(raw: unknown, ids: Set<string>, phone: boolean): Compare | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Compare>;
  let panes = Array.isArray(r.panes) ? r.panes.filter((x): x is string => typeof x === "string").slice(0, maxPanes(phone)) : [];
  if (panes.length < 2 || !panes.some((id) => ids.has(id))) return null;
  let active = typeof r.active === "number" && r.active >= 0 && r.active < panes.length ? r.active : 0;
  if (!ids.has(panes[active])) active = panes.findIndex((id) => ids.has(id));
  panes = [...panes];
  const two: Layout = r.layout === "stack" || phone ? "stack" : "side";
  const split = typeof r.split === "number" && r.split >= 0.2 && r.split <= 0.8 ? r.split : 0.5;
  const max = typeof r.max === "number" && r.max >= 0 && r.max < panes.length ? r.max : null;
  return { panes, layout: gridFor(panes.length, phone ? "stack" : r.layout === "three" || r.layout === "four" ? two : r.layout ?? two), active, link: !!r.link, max, split };
}

type Sized = { page_w: number; scale_ft_per_pt: number | null };
/**
 * The zoom a linked pane takes to follow the active one: the same feet per screen pixel when both
 * sheets have a scale, else the same share of the page across. `fitW` is each pane's width at zoom 1.
 */
export function linkedZoom(zoom: number, a: Sized, fitA: number, b: Sized, fitB: number): number {
  let z = zoom;
  if (a.scale_ft_per_pt && b.scale_ft_per_pt) {
    const pxPerFt = ((fitA / a.page_w) * zoom) / a.scale_ft_per_pt;
    z = (pxPerFt * b.scale_ft_per_pt * b.page_w) / fitB;
  }
  return Math.max(0.25, Math.min(8, z));
}
