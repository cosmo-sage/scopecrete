"use client";
/**
 * Runs a Dusty budget plan (src/lib/dusty/plan.ts) on Coy's tap, step by step,
 * through the same APIs the screens use — under his session, every id checked
 * by the server against his org and the job. Nothing here is new authority:
 * it is exactly the taps Coy would make by hand, made for him once he says so.
 */
import { RECORD_STEPS, type PlanAction } from "@/lib/dusty/plan";
import { archiveNow } from "@/components/v34/archive-actions";

export interface PlanLookup {
  items: Array<{ id: string; name: string; cost_group_id: string | null }>;
  groups: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string | null }>;
  takeoff: Array<{ id: string; name: string }>;
}
export interface StepResult { ok: boolean; text: string }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

export async function loadLookup(jobId: string): Promise<PlanLookup> {
  const [c, s, t] = await Promise.all([call("/api/cost-items?all=1", "GET"), call(`/api/jobs/${jobId}/sections`, "GET"),
    call(`/api/jobs/${jobId}/takeoff/parameters`, "GET").catch(() => ({ parameters: [] }))]);
  return {
    items: ((c.items ?? []) as Array<{ id: string; name: string; cost_group_id: string | null; active?: boolean }>).filter((i) => i.active !== false),
    groups: (c.groups ?? []) as PlanLookup["groups"],
    sections: (s.sections ?? []) as PlanLookup["sections"],
    takeoff: (t.parameters ?? []) as PlanLookup["takeoff"],
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
  // Areas this plan makes (new_area), by their key: new1 → the section's id once made.
  const made = new Map<string, string>();
  const areaId = (ref: string | null): { ok: true; id: string | null } | { ok: false } => {
    if (ref === null) return { ok: true, id: null };
    if (/^new\d/i.test(ref)) { const id = made.get(ref.toLowerCase()); return id ? { ok: true, id } : { ok: false }; }
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
  const order = { new_group: 0, update_item: 1, new_area: 2, new_item: 3, add: 4, add_group: 5, archive: 6, restore: 6 } as const;
  // Archive / restore steps run through applyRecords (no job needed).
  const steps = [...actions].filter((a) => !RECORD_STEPS.has(a.do)).sort((a, b) => order[a.do] - order[b.do]);
  for (const a of steps) {
    try {
      if (a.do === "new_area") {
        const body: Record<string, unknown> = { name: a.name, work_type: a.work_type };
        if (a.sqft !== null) body.sqft_override = a.sqft;
        if (a.lf !== null) { body.count_qty = a.lf; body.count_unit = "LF"; }
        if (a.count !== null) { body.count_qty = a.count; body.count_unit = a.unit ?? "EA"; }
        if (a.depth_in !== null) body.depth_in = a.depth_in;
        const b = await call(`/api/jobs/${jobId}/sections`, "POST", body);
        made.set(a.key, b.section.id);
        look.sections.push({ id: b.section.id, name: a.name });
        out.push({ ok: true, text: `Made area “${a.name}”${b.assembly?.loaded ? ` (your ${b.assembly.loaded} assembly loaded ${b.assembly.lines} line${b.assembly.lines === 1 ? "" : "s"} on it)` : ""}` });
        continue;
      }
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
        if (a.takeoff) {
          const g = byRef(look.takeoff, a.takeoff);
          if (!g) { out.push({ ok: false, text: `Takeoff group ${a.takeoff} isn't on this job — ${it.name} skipped` }); continue; }
          await addLine({ cost_item_id: it.id, takeoff_parameter_id: g.id }, null);
          out.push({ ok: true, text: `Added ${it.name}, counted from “${g.name}”` });
          continue;
        }
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

/**
 * Archive / delete / restore steps (migration 066) — the same calls Coy's own
 * taps make, marked as from Dusty's plan; each archive is one Undo in the toast.
 */
export async function applyRecords(actions: PlanAction[]): Promise<StepResult[]> {
  const out: StepResult[] = [];
  for (const a of actions) {
    if (a.do !== "archive" && a.do !== "restore") continue;
    try {
      if (a.do === "archive") {
        const r = await archiveNow(a.kind, a.ids, a.delete ? "delete" : "archive", "dusty");
        out.push({ ok: r.count > 0, text: r.count ? r.label : "Nothing to do — already archived, or not yours" });
      } else {
        const r = await call("/api/archive/restore", "POST", { kind: a.kind, ids: a.ids });
        out.push({ ok: true, text: `Restored ${r.restored}` });
      }
    } catch (e) {
      out.push({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
