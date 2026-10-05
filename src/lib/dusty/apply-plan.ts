"use client";
/**
 * Runs a Dusty budget plan (src/lib/dusty/plan.ts) on Coy's tap, step by step,
 * through the same APIs the screens use — under his session, every id checked
 * by the server against his org and the job. Nothing here is new authority:
 * it is exactly the taps Coy would make by hand, made for him once he says so.
 */
import { CUST_KEY, JOB_KEY, RECORD_STEPS, needsJob, type PlanAction } from "@/lib/dusty/plan";

const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { archiveNow } from "@/components/v34/archive-actions";

export interface PlanLookup {
  items: Array<{ id: string; name: string; cost_group_id: string | null }>;
  groups: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string | null }>;
  takeoff: Array<{ id: string; name: string }>;
  assemblies: Array<{ id: string; name: string; items: Array<{ id: string; cost_item_id: string }> }>;
}
export interface StepResult { ok: boolean; text: string }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** The Price book, its assemblies, and — with a job open — the job's areas and takeoff groups. */
export async function loadLookup(jobId: string | null): Promise<PlanLookup> {
  const [c, s, t, a] = await Promise.all([call("/api/cost-items?all=1", "GET"),
    jobId ? call(`/api/jobs/${jobId}/sections`, "GET") : Promise.resolve({ sections: [] }),
    jobId ? call(`/api/jobs/${jobId}/takeoff/parameters`, "GET").catch(() => ({ parameters: [] })) : Promise.resolve({ parameters: [] }),
    call("/api/assemblies", "GET").catch(() => ({ assemblies: [] }))]);
  return {
    assemblies: (a.assemblies ?? []) as PlanLookup["assemblies"],
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

export async function applyPlan(jobId: string | null, actions: PlanAction[], look: PlanLookup, optionId: string | null = null): Promise<StepResult[]> {
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
  // Items and assemblies this plan makes, by their key: item1 / asm1 → the id once made.
  const madeItem = new Map<string, string>(), madeAsm = new Map<string, string>();
  const itemOf = (r: string) => (/^item\d/i.test(r) ? (madeItem.has(r) ? { id: madeItem.get(r)!, name: look.items.find((i) => i.id === madeItem.get(r))?.name ?? r } : null) : byRef(look.items, r));
  const asmOf = (r: string) => (/^asm\d/i.test(r) ? look.assemblies.find((x) => x.id === madeAsm.get(r)) ?? null : byRef(look.assemblies, r));
  const putInAssembly = async (asmId: string, itemId: string, qty: number | null) => {
    await call(`/api/assemblies/${asmId}/items`, "POST", { cost_item_ids: [itemId] });
    if (qty === null) return;
    const all = await call("/api/assemblies", "GET");
    const row = ((all.assemblies ?? []) as PlanLookup["assemblies"]).find((x) => x.id === asmId)?.items.find((i) => i.cost_item_id === itemId);
    if (row) await call(`/api/assemblies/${asmId}/items/${row.id}`, "PATCH", { quantity: qty });
  };
  const addLine = async (body: Record<string, unknown>, qty: number | null) => {
    if (!jobId) throw new Error("needs the job open");
    const b = await call(`/api/jobs/${jobId}/budget/lines`, "POST", { option_id: optionId, ...body });
    const line = (b.lines ?? [])[0] as { id: string } | undefined;
    if (qty !== null && line) await call(`/api/jobs/${jobId}/budget/lines/${line.id}`, "PATCH", { quantity: qty });
    return (b.lines ?? []).length as number;
  };
  // Groups first, so items can be filed in them; then changes; then the budget.
  const order = { new_group: 0, rename_group: 1, update_item: 1, new_area: 2, new_item: 3, retire_item: 4, new_assembly: 5, add_to_assembly: 6, remove_from_assembly: 6,
    add: 7, add_group: 8, load_assembly: 9, remove_group: 10, set_tax: 10, archive: 11, restore: 11, set_address: 11, new_job: 11, new_customer: 11, attach_contact: 11, set_name: 11, file: 11, text: 11 } as const;
  // Archive / restore steps run through applyRecords (no job needed).
  const steps = [...actions].filter((a) => !RECORD_STEPS.has(a.do)).sort((a, b) => order[a.do] - order[b.do]);
  for (const a of steps) {
    if (!jobId && needsJob(a)) { out.push({ ok: false, text: `${a.do.replace(/_/g, " ")}: needs the job open — skipped` }); continue; }
    try {
      if (a.do === "set_tax") {
        // Saved as Coy's rate — his Apply tap is the entry (Price book → Defaults shows and changes it).
        await call("/api/tax-parishes", "POST", { parish: a.parish, rate_pct: a.rate_pct, note: a.source ? `From Dusty's plan: ${a.source}` : "From Dusty's plan" });
        if (a.for_job && jobId) await call(`/api/jobs/${jobId}`, "PATCH", { tax_parish: a.parish });
        out.push({ ok: true, text: `${a.parish} Parish sales tax set to ${a.rate_pct}%${a.for_job && jobId ? " and used on this job" : ""}` });
        continue;
      }
      if (a.do === "retire_item") {
        const it = byRef(look.items, a.item);
        if (!it) { out.push({ ok: false, text: `Item ${a.item} isn't in the Price book — skipped` }); continue; }
        await call(`/api/cost-items/${it.id}`, "DELETE");
        out.push({ ok: true, text: `Retired ${it.name} (Show retired brings it back)` });
        continue;
      }
      if (a.do === "rename_group" || a.do === "remove_group") {
        const g = groupId(a.group);
        if (!g) { out.push({ ok: false, text: `No group “${a.group}” — skipped` }); continue; }
        if (a.do === "rename_group") {
          await call(`/api/cost-groups/${g}`, "PATCH", { name: a.name });
          const row = groups.find((x) => x.id === g); if (row) row.name = a.name;
          out.push({ ok: true, text: `Renamed “${a.group}” to “${a.name}”` });
        } else {
          const n = look.items.filter((i) => i.cost_group_id === g).length;
          if (n) { out.push({ ok: false, text: `“${a.group}” still has ${n} item${n === 1 ? "" : "s"} — move them first; kept` }); continue; }
          await call(`/api/cost-groups/${g}`, "DELETE");
          out.push({ ok: true, text: `Removed the empty group “${a.group}”` });
        }
        continue;
      }
      if (a.do === "new_assembly") {
        const b = await call("/api/assemblies", "POST", { name: a.name, job_type: a.job_type, work_type: a.work_type, auto_load: a.auto });
        madeAsm.set(a.key, b.assembly.id);
        look.assemblies.push({ id: b.assembly.id, name: a.name, items: [] });
        const missing: string[] = [];
        let n = 0;
        for (const x of a.items) {
          const it = itemOf(x.item);
          if (!it) { missing.push(x.item); continue; }
          await putInAssembly(b.assembly.id, it.id, x.qty); n++;
        }
        out.push({ ok: !missing.length, text: `Made assembly “${a.name}” with ${n} item${n === 1 ? "" : "s"}${missing.length ? ` — not found: ${missing.join(", ")}` : ""}` });
        continue;
      }
      if (a.do === "add_to_assembly" || a.do === "remove_from_assembly") {
        const asm = asmOf(a.assembly), it = itemOf(a.item);
        if (!asm) { out.push({ ok: false, text: `Assembly ${a.assembly} not found — skipped` }); continue; }
        if (!it) { out.push({ ok: false, text: `Item ${a.item} isn't in the Price book — skipped` }); continue; }
        if (a.do === "add_to_assembly") {
          await putInAssembly(asm.id, it.id, a.qty);
          out.push({ ok: true, text: `Added ${it.name} to ${asm.name}` });
        } else {
          const row = asm.items.find((i) => i.cost_item_id === it.id);
          if (!row) { out.push({ ok: false, text: `${it.name} isn't in ${asm.name}` }); continue; }
          await call(`/api/assemblies/${asm.id}/items/${row.id}`, "DELETE");
          out.push({ ok: true, text: `Took ${it.name} out of ${asm.name}` });
        }
        continue;
      }
      if (a.do === "load_assembly") {
        const asm = asmOf(a.assembly), ar = areaId(a.area);
        if (!asm) { out.push({ ok: false, text: `Assembly ${a.assembly} not found — skipped` }); continue; }
        if (!ar.ok || !ar.id) { out.push({ ok: false, text: `Area ${a.area} isn't on this job — ${asm.name} not loaded` }); continue; }
        const b = await call(`/api/jobs/${jobId}/budget/assembly`, "POST", { assembly_id: asm.id, section_id: ar.id });
        const n = Number(b.lines ?? 0);
        out.push({ ok: true, text: `Loaded ${asm.name}${n ? ` (${n} line${n === 1 ? "" : "s"})` : ""}` });
        continue;
      }
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
        if (a.key) madeItem.set(a.key, b.item.id);
        if (a.add) {
          if (!ar.ok) { out.push({ ok: false, text: `Made “${a.name}” in the Price book; its area wasn't found, so it isn't on the budget` }); continue; }
          await addLine({ cost_item_id: b.item.id, section_id: ar.id }, a.qty);
        }
        out.push({ ok: true, text: `Made “${a.name}”${a.add ? " and put it on the budget" : ""}` });
      } else if (a.do === "add") {
        const it = itemOf(a.item), ar = areaId(a.area);
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
      out.push({ ok: false, text: `${a.do.replace(/_/g, " ")}: ${e instanceof Error ? e.message : String(e)}` });
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
  // Customers and jobs this plan makes, by their key: cust1 → { customer, its person }, job1 → the job.
  const madeCust = new Map<string, { id: string; contact: string; name: string }>();
  const madeJob = new Map<string, { id: string; title: string }>();
  for (const a of actions) {
    try {
      if (a.do === "set_address") { out.push(await setAddress(a)); continue; }
      if (a.do === "new_customer") {
        try {
          const r = await call("/api/customers", "POST", { name: a.name, customer_type: a.customer_type ?? undefined, contact_id: a.contact ?? undefined,
            person: a.contact ? undefined : a.person ?? undefined, phone: a.contact ? undefined : a.phone ?? undefined, email: a.contact ? undefined : a.email ?? undefined, address: a.address ?? undefined, city: a.city ?? undefined, state: a.state ?? undefined, zip: a.zip ?? undefined });
          if (a.key) madeCust.set(a.key, { id: r.customer.id, contact: r.customer.contact_id, name: r.customer.name ?? a.name });
          out.push({ ok: true, text: `Made the customer “${r.customer?.name ?? a.name}”` });
        } catch (e) {
          out.push({ ok: false, text: `New customer “${a.name}”: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "attach_contact") {
        const made = CUST_KEY.test(a.customer) ? madeCust.get(a.customer) : null;
        const target = made ? made.id : FULL_ID.test(a.customer) ? a.customer : null;
        if (!target) { out.push({ ok: false, text: "The customer to put them on wasn't made — skipped" }); continue; }
        if (made?.contact === a.contact) { out.push({ ok: true, text: `Already on “${made.name}”` }); continue; }
        await call(`/api/customers/${target}/contacts`, "POST", { contact_id: a.contact });
        out.push({ ok: true, text: `Put them on ${made ? `“${made.name}”` : "the customer"}` });
        continue;
      }
      if (a.do === "set_name") {
        if (a.kind === "contact") await call(`/api/contacts/${a.id}/name`, "PATCH", { name: a.name });
        else await call(`/api/customers/${a.id}`, "PATCH", { name: a.name });
        out.push({ ok: true, text: `Named ${a.kind === "customer" ? "the customer" : "them"} “${a.name}”` });
        continue;
      }
      if (a.do === "new_job") {
        const cust = CUST_KEY.test(a.contact) ? madeCust.get(a.contact) : null;
        if (CUST_KEY.test(a.contact) && !cust?.contact) { out.push({ ok: false, text: `New job “${a.title}”: the customer it was for wasn't made — skipped` }); continue; }
        const r = await call("/api/jobs", "POST", { contact_id: cust ? cust.contact : a.contact, title: a.title, job_type: a.job_type ?? undefined, address: a.address ?? undefined, description: a.description ?? undefined });
        if (a.key && r.job?.id) madeJob.set(a.key, { id: r.job.id, title: r.job.title ?? a.title });
        out.push({ ok: true, text: `Made the job “${r.job?.title ?? a.title}” — it's in New lead on the Jobs board` });
        continue;
      }
      if (a.do === "file") {
        const made = a.kind === "customer" && CUST_KEY.test(a.id) ? madeCust.get(a.id) : a.kind === "job" && JOB_KEY.test(a.id) ? madeJob.get(a.id) : null;
        const target = made ? made.id : FULL_ID.test(a.id) ? a.id : null;
        if (!target) { out.push({ ok: false, text: `The ${a.kind} to file on wasn't made — files left where they are` }); continue; }
        let n = 0; const fails: string[] = [];
        for (const f of a.files) {
          try { await call(`/api/files/${f}`, "PATCH", { file_to: { kind: a.kind, id: target } }); n++; }
          catch (e) { fails.push(e instanceof Error ? e.message : String(e)); }
        }
        const where = made ? ("title" in made ? `“${made.title}”` : `“${made.name}”`) : `the ${a.kind === "contact" ? "person" : a.kind}`;
        out.push({ ok: n > 0, text: `Filed ${n} of ${a.files.length} on ${where}${fails.length ? ` — ${fails[0]}` : ""}` });
        continue;
      }
      if (a.do === "text") {
        try {
          const r = await call("/api/texts", "POST", { contact_id: a.contact, body: a.body, to: a.to ?? undefined });
          out.push({ ok: true, text: `Sent to ${String(r.to).replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")} through Quo — it shows in their thread once Quo confirms` });
        } catch (e) {
          out.push({ ok: false, text: `Text not sent: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do !== "archive" && a.do !== "restore") continue;
      if (a.do === "archive") {
        const r = await archiveNow(a.kind, a.ids, a.delete ? "delete" : "archive", "dusty", a.reason || a.label ? `${a.reason ?? a.label} (Dusty's plan)` : null);
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

/**
 * An address on a customer, a person or a job — checked against the map first
 * (`/api/address/check`): on a sure match of the house number and street the
 * map's spelling is saved; otherwise Dusty's words, and the result says so.
 */
async function setAddress(a: Extract<PlanAction, { do: "set_address" }>): Promise<StepResult> {
  const given = [a.line1, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const chk = await call(`/api/address/check?q=${encodeURIComponent(given)}`, "GET").catch(() => null) as
    { on?: boolean; sure?: boolean; match?: { line1: string; city: string | null; state: string | null; zip: string | null; formatted: string } | null } | null;
  const m = chk?.sure && chk.match ? chk.match : null;
  const parts = m ? { line1: m.line1, city: m.city, state: m.state, zip: m.zip } : { line1: a.line1, city: a.city, state: a.state, zip: a.zip };
  if (a.kind === "customer") await call(`/api/customers/${a.id}`, "PATCH", { address_line1: parts.line1, city: parts.city ?? "", state: parts.state ?? "", zip: parts.zip ?? "" });
  else if (a.kind === "contact") await call(`/api/contacts/${a.id}/address`, "PATCH", { address_line1: parts.line1, city: parts.city, state: parts.state, zip: parts.zip });
  else await call(`/api/jobs/${a.id}`, "PATCH", { address: parts.line1, city: parts.city ?? "", state: parts.state ?? "", zip: parts.zip ?? "" });
  const saved = m ? m.formatted : given;
  const note = m ? " — matched on the map" : !chk?.on ? " — the map check isn't set up (MAPBOX_TOKEN); check it" : chk.match ? ` — the map wasn't sure (it found ${chk.match.formatted}); check it` : " — the map didn't find it; check it";
  return { ok: true, text: `Address set to ${saved}${note}` };
}
