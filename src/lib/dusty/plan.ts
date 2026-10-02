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
  | { do: "add"; item: string; area: string | null; qty: number | null }
  | { do: "add_group"; group: string; area: string | null }
  | { do: "new_item"; name: string; unit: string; cost_type: string; unit_cost: number | null; qty_rule: string; group: string | null; area: string | null; add: boolean; qty: number | null }
  | { do: "update_item"; item: string; unit_cost?: number | null; unit?: string; name?: string; group?: string }
  | { do: "new_group"; name: string; cost_type: string };

const FENCE = /```scopecrete-plan\s*\n([\s\S]*?)```/;
const REF = /^[0-9a-f]{8}$/i;
const COST_TYPES = ["material", "labor", "equipment", "subcontract", "other"];
const RULES = ["per_cy", "per_sqft", "per_lf_perimeter", "per_sheet", "per_stick", "per_day", "per_job", "manual"];
const MAX_ACTIONS = 60;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const numOr = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : undefined;
const ref = (v: unknown) => (typeof v === "string" && REF.test(v.trim()) ? v.trim().toLowerCase() : null);
const area = (v: unknown) => (v === "job" || v === null || v === undefined ? null : ref(v));

/** One action from the model, checked; null when it doesn't make sense (it is then listed as dropped). */
export function cleanAction(raw: unknown): PlanAction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.do) {
    case "add": {
      const item = ref(r.item);
      if (!item || (r.area !== undefined && r.area !== null && r.area !== "job" && !ref(r.area))) return null;
      const qty = numOr(r.qty);
      return { do: "add", item, area: area(r.area), qty: qty === undefined ? null : qty };
    }
    case "add_group": {
      const group = str(r.group, 80);
      return group ? { do: "add_group", group, area: area(r.area) } : null;
    }
    case "new_item": {
      const name = str(r.name, 120), unit = str(r.unit, 20);
      const t = String(r.cost_type ?? "");
      const rule = String(r.qty_rule ?? "manual");
      if (!name || !unit || !COST_TYPES.includes(t) || !RULES.includes(rule)) return null;
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
export function describe(a: PlanAction, names: { item: (r: string) => string | null; area: (r: string | null) => string }): string {
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "no cost yet" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  switch (a.do) {
    case "add": return `Add ${names.item(a.item) ?? `item ${a.item} (not found)`} to ${names.area(a.area)}${a.qty !== null ? ` — qty ${a.qty}` : ""}`;
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
[{"do":"add","item":"<8-char item ref>","area":"<8-char area ref or job>","qty":<number or omit>},
 {"do":"add_group","group":"<group name>","area":"<area ref or job>"},
 {"do":"new_item","name":"…","unit":"SY","cost_type":"material|labor|equipment|subcontract|other","unit_cost":<number or null>,"qty_rule":"per_sqft|per_cy|per_lf_perimeter|per_day|per_job|manual","group":"<group name or omit>","area":"<area ref or job>","add":true,"qty":<number or omit>},
 {"do":"update_item","item":"<ref>","unit_cost":<number>,"unit":"…","name":"…","group":"<group name>"},
 {"do":"new_group","name":"…","cost_type":"…"}]
\`\`\`
Rules for plans: use ONLY item refs and area refs listed in the CONTEXT's Price book and areas — never make one up. Prefer an existing item over a new one. A unit_cost is a number only if Coy said it or the CONTEXT has it; otherwise null (the budget then asks for it by name). A qty only when it is written in the CONTEXT (a bid line, a section) or Coy said it; otherwise leave it out and let the item's rule count it from the area. Counted by the area with unit SY counts square yards. Keep a plan to what was asked.`;
