/**
 * Dusty's budget plans (Coy, 2026-10-02: "chat with Dusty to analyze the list of
 * items in my cost book and apply the items that I might need or create new
 * items or modify cost items and organize by groups").
 *
 * Dusty still changes nothing himself (§6). When asked to build or fix a budget
 * he may end his answer with one fenced block:
 *
 *   ```scopecrete-plan
 *   [{"do":"add","item":"3f2a91c0","area":"bc237d33"}, …]
 *   ```
 *
 * The panel shows it as a list of plain steps with Apply; Coy's tap runs them
 * through the ordinary APIs (src/lib/dusty/apply-plan.ts), under his session.
 * Items and areas are named by the first 8 characters of their id, exactly as
 * the CONTEXT lists them. Pure — tests/dusty-plan.test.mjs runs it.
 */

export type PlanAction =
  | { do: "add"; item: string; area: string | null; qty: number | null; takeoff?: string }
  | { do: "new_area"; key: string; name: string; work_type: string; sqft: number | null; lf: number | null; count: number | null; unit: string | null; depth_in: number | null }
  | { do: "add_group"; group: string; area: string | null }
  | { do: "new_item"; name: string; unit: string; cost_type: string; unit_cost: number | null; qty_rule: string; group: string | null; area: string | null; add: boolean; qty: number | null }
  | { do: "update_item"; item: string; unit_cost?: number | null; unit?: string; name?: string; group?: string }
  | { do: "new_group"; name: string; cost_type: string };

const FENCE = /```scopecrete-plan\s*\n([\s\S]*?)```/;
const REF = /^[0-9a-f]{8}$/i;
/** An area made by this same plan (new_area), named by its key: new1, new2 … */
const NEW_KEY = /^new\d{1,2}$/i;
export const WORK_TYPES = ["slab", "driveway", "patio", "sidewalk", "footing", "curb", "demo", "prep", "other"];
const COST_TYPES = ["material", "labor", "equipment", "subcontract", "other"];
const RULES = ["per_cy", "per_sqft", "per_lf_perimeter", "per_sheet", "per_stick", "per_day", "per_job", "manual"];
const MAX_ACTIONS = 60;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const numOr = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : undefined;
const ref = (v: unknown) => (typeof v === "string" && REF.test(v.trim()) ? v.trim().toLowerCase() : null);
const newKey = (v: unknown) => (typeof v === "string" && NEW_KEY.test(v.trim()) ? v.trim().toLowerCase() : null);
const area = (v: unknown) => (v === "job" || v === null || v === undefined ? null : ref(v) ?? newKey(v));
const areaOk = (v: unknown) => v === undefined || v === null || v === "job" || !!ref(v) || !!newKey(v);
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e6 ? v : null);

/** One action from the model, checked; null when it doesn't make sense (it is then listed as dropped). */
export function cleanAction(raw: unknown): PlanAction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.do) {
    case "add": {
      const item = ref(r.item);
      if (!item || !areaOk(r.area)) return null;
      const qty = numOr(r.qty);
      // Counted from a Plan Room takeoff group (the aerial, a plan sheet): the line moves when it is re-measured.
      if (r.takeoff !== undefined && r.takeoff !== null) {
        const t = ref(r.takeoff);
        if (!t) return null;
        return { do: "add", item, area: null, qty: null, takeoff: t };
      }
      return { do: "add", item, area: area(r.area), qty: qty === undefined ? null : qty };
    }
    case "new_area": {
      const key = newKey(r.key), name = str(r.name, 80);
      const wt = String(r.work_type ?? "other");
      if (!key || !name || !WORK_TYPES.includes(wt)) return null;
      const sqft = pos(r.sqft), lf = pos(r.lf), count = pos(r.count);
      if ([sqft, lf, count].filter((x) => x !== null).length > 1) return null;
      const depth = pos(r.depth_in);
      return { do: "new_area", key, name, work_type: wt, sqft, lf, count, unit: count !== null ? (str(r.unit, 12) ?? "EA").toUpperCase() : null,
        depth_in: depth !== null && depth <= 120 ? depth : null };
    }
    case "add_group": {
      const group = str(r.group, 80);
      return group && areaOk(r.area) ? { do: "add_group", group, area: area(r.area) } : null;
    }
    case "new_item": {
      const name = str(r.name, 120), unit = str(r.unit, 20);
      const t = String(r.cost_type ?? "");
      const rule = String(r.qty_rule ?? "manual");
      if (!name || !unit || !COST_TYPES.includes(t) || !RULES.includes(rule) || !areaOk(r.area)) return null;
      const cost = numOr(r.unit_cost);
      const qty = numOr(r.qty);
      return { do: "new_item", name, unit, cost_type: t, unit_cost: cost === undefined ? null : cost, qty_rule: rule,
        group: str(r.group, 80), area: area(r.area), add: r.add !== false, qty: qty === undefined ? null : qty };
    }
    case "update_item": {
      const item = ref(r.item);
      if (!item) return null;
      const out: Extract<PlanAction, { do: "update_item" }> = { do: "update_item", item };
      if ("unit_cost" in r) { const c = numOr(r.unit_cost); if (c === undefined) return null; out.unit_cost = c; }
      const unit = str(r.unit, 20), name = str(r.name, 120), group = str(r.group, 80);
      if (unit) out.unit = unit;
      if (name) out.name = name;
      if (group) out.group = group;
      return Object.keys(out).length > 2 ? out : null;
    }
    case "new_group": {
      const name = str(r.name, 80), t = String(r.cost_type ?? "other");
      return name && COST_TYPES.includes(t) ? { do: "new_group", name, cost_type: t } : null;
    }
    default: return null;
  }
}

/** Split an answer into what is shown and the plan it carries. */
export function parsePlan(text: string): { shown: string; actions: PlanAction[]; dropped: number } {
  const m = FENCE.exec(text);
  if (!m) return { shown: text, actions: [], dropped: 0 };
  const shown = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  let raw: unknown;
  try { raw = JSON.parse(m[1]); } catch { return { shown, actions: [], dropped: 1 }; }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { actions?: unknown }).actions) ? (raw as { actions: unknown[] }).actions : [];
  const actions: PlanAction[] = [];
  let dropped = 0;
  for (const a of list.slice(0, MAX_ACTIONS)) { const c = cleanAction(a); if (c) actions.push(c); else dropped++; }
  dropped += Math.max(0, list.length - MAX_ACTIONS);
  return { shown, actions, dropped };
}

/** A step said the way Coy reads it, with the names the caller knows. */
export function describe(a: PlanAction, names: { item: (r: string) => string | null; area: (r: string | null) => string; takeoff?: (r: string) => string | null }): string {
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "no cost yet" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  switch (a.do) {
    case "add": return a.takeoff
      ? `Add ${names.item(a.item) ?? `item ${a.item} (not found)`}, counted from the measured “${names.takeoff?.(a.takeoff) ?? a.takeoff}”`
      : `Add ${names.item(a.item) ?? `item ${a.item} (not found)`} to ${names.area(a.area)}${a.qty !== null ? ` — qty ${a.qty}` : ""}`;
    case "new_area": {
      const size = a.sqft !== null ? `${a.sqft.toLocaleString("en-US")} sf` : a.lf !== null ? `${a.lf} LF` : a.count !== null ? `${a.count} ${a.unit}` : "size not set";
      return `New area “${a.name}” (${a.work_type}, ${size}${a.depth_in !== null ? `, ${a.depth_in}"` : ""})`;
    }
    case "add_group": return `Add every item in ${a.group} to ${names.area(a.area)}`;
    case "new_item": return `New Price book item “${a.name}” — ${a.unit}, ${a.cost_type}, ${money(a.unit_cost)}${a.group ? `, in ${a.group}` : ""}${a.add ? ` → on ${names.area(a.area)}${a.qty !== null ? `, qty ${a.qty}` : ""}` : ""}`;
    case "update_item": {
      const what = [a.name ? `rename to “${a.name}”` : null, a.unit ? `unit ${a.unit}` : null, "unit_cost" in a ? `unit cost ${money(a.unit_cost)}` : null, a.group ? `move to ${a.group}` : null].filter(Boolean).join(", ");
      return `Change ${names.item(a.item) ?? `item ${a.item} (not found)`}: ${what}`;
    }
    case "new_group": return `New group “${a.name}” (${a.cost_type})`;
  }
}

/** The instructions Dusty is given about plans — appended to his system prompt. */
export const PLAN_RULES = `Budget plans. When Coy asks you to build, fill or fix a job's budget, or to add, change or organise items in his Price book, answer in words first, then end with ONE fenced block in this exact form, which the app shows to Coy as steps with an Apply button (you change nothing yourself — Coy's tap does):
\`\`\`scopecrete-plan
[{"do":"add","item":"<8-char item ref>","area":"<8-char area ref, new-area key, or job>","qty":<number or omit>},
 {"do":"add","item":"<8-char item ref>","takeoff":"<8-char takeoff group ref>"},
 {"do":"add_group","group":"<group name>","area":"<area ref or job>"},
 {"do":"new_item","name":"…","unit":"SY","cost_type":"material|labor|equipment|subcontract|other","unit_cost":<number or null>,"qty_rule":"per_sqft|per_cy|per_lf_perimeter|per_day|per_job|manual","group":"<group name or omit>","area":"<area ref or job>","add":true,"qty":<number or omit>},
 {"do":"update_item","item":"<ref>","unit_cost":<number>,"unit":"…","name":"…","group":"<group name>"},
 {"do":"new_group","name":"…","cost_type":"…"},
 {"do":"new_area","key":"new1","name":"Driveway","work_type":"slab|driveway|patio|sidewalk|footing|curb|demo|prep|other","sqft":<number or omit>,"lf":<number or omit>,"count":<number or omit>,"unit":"EA","depth_in":<number or omit>}]
\`\`\`
To put items on an area this plan makes, use its key ("new1") as the area. To count an item from a Plan Room takeoff group (the aerial or a plan sheet), add it with "takeoff":"<8-char takeoff group ref>" instead of an area — the line then moves when Coy re-measures.
Rules for plans: use ONLY item refs, area refs and takeoff group refs listed in the CONTEXT — never make one up. Prefer an existing item over a new one. A unit_cost is a number only if Coy said it or the CONTEXT has it; otherwise null (the budget then asks for it by name). A qty, or a new area's size or depth, only when it is written in the CONTEXT (a bid line, a section, a measured takeoff total, Coy's notes, a transcript line) or Coy said it; otherwise leave it out and let the item's rule count it from the area. Counted by the area with unit SY counts square yards. Keep a plan to what was asked.`;
