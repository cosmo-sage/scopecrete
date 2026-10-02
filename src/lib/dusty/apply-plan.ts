"use client";
/**
 * Runs a Dusty budget plan (src/lib/dusty/plan.ts) on Coy's tap, step by step,
 * through the same APIs the screens use — under his session, every id checked
 * by the server against his org and the job. Nothing here is new authority:
 * it is exactly the taps Coy would make by hand, made for him once he says so.
 */
import type { PlanAction } from "@/lib/dusty/plan";

export interface PlanLookup {
  items: Array<{ id: string; name: string; cost_group_id: string | null }>;
  groups: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string | null }>;
}
export interface StepResult { ok: boolean; text: string }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export async function loadLookup(jobId: string): Promise<PlanLookup> {
  const [c, s] = await Promise.all([call("/api/cost-items?all=1", "GET"), call(`/api/jobs/${jobId}/sections`, "GET")]);
  return {
    items: ((c.items ?? []) as Array<{ id: string; name: string; cost_group_id: string | null; active?: boolean }>).filter((i) => i.active !== false),
    groups: (c.groups ?? []) as PlanLookup["groups"],
    sections: (s.sections ?? []) as PlanLookup["sections"],
  };
}

/** An 8-character ref to its one item / area — never a guess between two. */
export const byRef = <T extends { id: string }>(list: T[], ref: string | null): T | null => {
  if (!ref) return null;
  const hits = list.filter((x) => x.id.toLowerCase().startsWith(ref.toLowerCase()));
  return hits.length === 1 ? hits[0] : null;
};

export async function applyPlan(jobId: string, actions: PlanAction[], look: PlanLookup, optionId: string | null = null): Promise<StepResult[]> {
  const out: StepResult[] = [];
  const groups = [...look.groups];
  const groupId = (name: string | null | undefined) => (name ? groups.find((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null : null);
  const areaId = (ref: string | null): { ok: true; id: string | null } | { ok: false } => {
    if (ref === null) return { ok: true, id: null };
    const s = byRef(look.sections, ref);
    return s ? { ok: true, id: s.id } : { ok: false };
  };
  const addLine = async (body: Record<string, unknown>, qty: number | null) => {
    const b = await call(`/api/jobs/${jobId}/budget/lines`, "POST", { option_id: optionId, ...body });
    const line = (b.lines ?? [])[0] as { id: string } | undefined;
    if (qty !== null && line) await call(`/api/jobs/${jobId}/budget/lines/${line.id}`, "PATCH", { quantity: qty });
    return (b.lines ?? []).length as number;
  };
  // Groups first, so items can be filed in them; then changes; then the budget.
  const order = { new_group: 0, update_item: 1, new_item: 2, add: 3, add_group: 4 } as const;
  const steps = [...actions].sort((a, b) => order[a.do] - order[b.do]);
  for (const a of steps) {
    try {
      if (a.do === "new_group") {
        if (groupId(a.name)) { out.push({ ok: true, text: `Group “${a.name}” already there` }); continue; }
        const b = await call("/api/cost-groups", "POST", { name: a.name, cost_type: a.cost_type });
        groups.push({ id: b.group.id, name: b.group.name });
        out.push({ ok: true, text: `Made group “${a.name}”` });
      } else if (a.do === "update_item") {
        const it = byRef(look.items, a.item);
        if (!it) { out.push({ ok: false, text: `Item ${a.item} isn't in the Price book — skipped` }); continue; }
        const body: Record<string, unknown> = {};
        if (a.name) body.name = a.name;
        if (a.unit) body.unit = a.unit;
        if ("unit_cost" in a) {
          body.unit_cost = a.unit_cost;
          body.price_as_of = a.unit_cost === null ? null : new Date().toISOString().slice(0, 10);
          body.price_source = a.unit_cost === null ? null : "typed";
        }
        if (a.group) {
          const g = groupId(a.group);
          if (!g) { out.push({ ok: false, text: `No group “${a.group}” for ${it.name} — skipped` }); continue; }
          body.cost_group_id = g;
        }
        await call(`/api/cost-items/${it.id}`, "PATCH", body);
        out.push({ ok: true, text: `Changed ${a.name ?? it.name}` });
      } else if (a.do === "new_item") {
        const ar = areaId(a.area);
        const b = await call("/api/cost-items", "POST", { name: a.name, unit: a.unit, cost_type: a.cost_type, unit_cost: a.unit_cost,
          qty_rule: a.qty_rule, rule_params: {}, cost_group_id: groupId(a.group) });
        look.items.push({ id: b.item.id, name: a.name, cost_group_id: b.item.cost_group_id ?? null });
        if (a.add) {
          if (!ar.ok) { out.push({ ok: false, text: `Made “${a.name}” in the Price book; its area wasn't found, so it isn't on the budget` }); continue; }
          await addLine({ cost_item_id: b.item.id, section_id: ar.id }, a.qty);
        }
        out.push({ ok: true, text: `Made “${a.name}”${a.add ? " and put it on the budget" : ""}` });
      } else if (a.do === "add") {
        const it = byRef(look.items, a.item), ar = areaId(a.area);
        if (!it) { out.push({ ok: false, text: `Item ${a.item} isn't in the Price book — skipped` }); continue; }
        if (!ar.ok) { out.push({ ok: false, text: `Area ${a.area} isn't on this job — ${it.name} skipped` }); continue; }
        await addLine({ cost_item_id: it.id, section_id: ar.id }, a.qty);
        out.push({ ok: true, text: `Added ${it.name}` });
      } else if (a.do === "add_group") {
        const g = groupId(a.group), ar = areaId(a.area);
        if (!g) { out.push({ ok: false, text: `No group “${a.group}” — skipped` }); continue; }
        if (!ar.ok) { out.push({ ok: false, text: `Area ${a.area} isn't on this job — ${a.group} skipped` }); continue; }
        const n = await addLine({ cost_group_id: g, section_id: ar.id }, null);
        out.push({ ok: true, text: `Added ${n} item${n === 1 ? "" : "s"} from ${a.group}` });
      }
    } catch (e) {
      out.push({ ok: false, text: `${a.do.replace("_", " ")}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // The budget on the page reloads itself.
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sc:budget-changed"));
  return out;
}
