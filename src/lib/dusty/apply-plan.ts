"use client";
/**
 * Runs a Dusty budget plan (src/lib/dusty/plan.ts) on Coy's tap, step by step,
 * through the same APIs the screens use — under his session, every id checked
 * by the server against his org and the job. Nothing here is new authority:
 * it is exactly the taps Coy would make by hand, made for him once he says so.
 */
import { APPOINTMENTS_EVENT, whenText } from "@/lib/appointments";
import { CUST_KEY, JOB_KEY, RECORD_STEPS, VEND_KEY, needsJob, type PlanAction } from "@/lib/dusty/plan";
import { markEstimate } from "@/lib/estimate-flag";

const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { archiveNow } from "@/components/v34/archive-actions";
import { expectMessage } from "@/lib/v34/live-threads";
import { sendProposal } from "@/lib/v34/send-proposal";
import { applyBidToBudget } from "@/lib/v34/bid-to-budget";
import { forwardBody, forwardSubject, replySubject, replyTargets, type MailRow } from "@/lib/email-client";

export interface PlanLookup {
  items: Array<{ id: string; name: string; cost_group_id: string | null }>;
  groups: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string | null }>;
  takeoff: Array<{ id: string; name: string }>;
  assemblies: Array<{ id: string; name: string; items: Array<{ id: string; cost_item_id: string }> }>;
}
/** href: where the result can be seen — an email draft opens in its thread (Coy, 2026-10-14). */
export interface StepResult { ok: boolean; text: string; href?: string; hrefLabel?: string }

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

export async function applyPlan(jobId: string | null, actions: PlanAction[], look: PlanLookup, optionId: string | null = null,
  vendors: Map<string, string> = new Map()): Promise<StepResult[]> {
  // A vendor this plan made (vend1) → their contact id, from applyVendors, which runs first.
  const vendorOf = (v: string) => (VEND_KEY.test(v) ? vendors.get(v.toLowerCase()) ?? null : v);
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
  // An estimated number (Coy, 2026-10-09) marks its line "Estimate — <basis>" until Coy confirms it on the budget.
  const addLine = async (body: Record<string, unknown>, qty: number | null, estimate?: string) => {
    if (!jobId) throw new Error("needs the job open");
    const b = await call(`/api/jobs/${jobId}/budget/lines`, "POST", { option_id: optionId, ...body });
    const line = (b.lines ?? [])[0] as { id: string; description?: string | null } | undefined;
    const patch: Record<string, unknown> = {};
    if (qty !== null) patch.quantity = qty;
    if (estimate) patch.description = markEstimate(line?.description ?? null, estimate);
    if (line && Object.keys(patch).length) await call(`/api/jobs/${jobId}/budget/lines/${line.id}`, "PATCH", patch);
    return (b.lines ?? []).length as number;
  };
  // Groups first, so items can be filed in them; then changes; then the budget.
  const order = { new_group: 0, rename_group: 1, update_item: 1, new_area: 2, new_item: 3, vendor_price: 4, retire_item: 4, new_assembly: 5, add_to_assembly: 6, remove_from_assembly: 6,
    add: 7, add_group: 8, load_assembly: 9, remove_group: 10, set_tax: 10, archive: 11, restore: 11, set_address: 11, new_job: 11, new_customer: 11, attach_contact: 11, new_contact: 11, set_name: 11, file: 11, file_email: 11, text: 11, email: 11, send_proposal: 11, new_vendor: 11, appointment: 11, update_appointment: 11, work_space: 12, bid_request: 12, use_bid: 12 } as const;
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
        if (a.estimate) body.access_notes = `Size is Dusty's estimate — ${a.estimate}. Measure it before you send a price.`;
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
        const b = await call(`/api/cost-items/${it.id}`, "PATCH", body);
        if (a.estimate) await call(`/api/cost-items/${it.id}`, "PATCH", { description: markEstimate((b.item?.description as string | null) ?? null, a.estimate) });
        out.push({ ok: true, text: `Changed ${a.name ?? it.name}${a.estimate ? " (marked an estimate)" : ""}` });
      } else if (a.do === "new_item") {
        const ar = areaId(a.area);
        const vendor = a.vendor ? vendorOf(a.vendor) : null;
        if (a.vendor && !vendor) { out.push({ ok: false, text: `“${a.name}”: the vendor it was for wasn't added — skipped` }); continue; }
        // With a vendor, the price is theirs (their first, default price — the vendor page's Prices tab shows it).
        const b = await call("/api/cost-items", "POST", { name: a.name, unit: a.unit, cost_type: a.cost_type, unit_cost: a.unit_cost,
          qty_rule: a.qty_rule, rule_params: {}, cost_group_id: groupId(a.group), ...(a.estimate ? { description: markEstimate(a.note ?? null, a.estimate) } : a.note ? { description: a.note } : {}),
          ...(vendor ? { vendor_contact_id: vendor, price_source: a.unit_cost === null ? undefined : "quote" } : {}) });
        look.items.push({ id: b.item.id, name: a.name, cost_group_id: b.item.cost_group_id ?? null });
        if (a.key) madeItem.set(a.key, b.item.id);
        if (a.add) {
          if (!ar.ok) { out.push({ ok: false, text: `Made “${a.name}” in the Price book; its area wasn't found, so it isn't on the budget` }); continue; }
          await addLine({ cost_item_id: b.item.id, section_id: ar.id }, a.qty, a.estimate);
        }
        out.push({ ok: true, text: `Made “${a.name}”${a.add ? " and put it on the budget" : ""}${a.estimate ? " — marked an estimate" : ""}` });
      } else if (a.do === "vendor_price") {
        const it = itemOf(a.item);
        if (!it) { out.push({ ok: false, text: `Item ${a.item} isn't in the Price book — skipped` }); continue; }
        const vendor = vendorOf(a.vendor);
        if (!vendor) { out.push({ ok: false, text: `${it.name}: the vendor it was for wasn't added — skipped` }); continue; }
        await call(`/api/cost-items/${it.id}/sources`, "POST", { vendor_contact_id: vendor, unit_cost: a.unit_cost, unit: a.unit, note: `From Dusty's plan${a.note ? `: ${a.note}` : ""}${a.estimate ? ` · Estimate — ${a.estimate}` : ""}` });
        out.push({ ok: true, text: `Put their price on ${it.name}${a.unit_cost !== null ? ` — $${a.unit_cost}${a.unit ? `/${a.unit}` : ""}` : ""}` });
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
        await addLine({ cost_item_id: it.id, section_id: ar.id }, a.qty, a.estimate);
        out.push({ ok: true, text: `Added ${it.name}${a.estimate ? " — marked an estimate" : ""}` });
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
      if (a.do === "work_space") {
        try {
          // The people its thread holds: each job's and customer's (as + Add does), and each vendor's own contact.
          const ids = new Set(a.members.filter((m) => m.kind === "vendor").map((m) => m.id));
          await Promise.all(a.members.filter((m) => m.kind !== "vendor").slice(0, 40).map((m) =>
            fetch(`/api/threads/custom?${m.kind}=${m.id}`).then((r) => (r.ok ? r.json() : null))
              .then((j) => { for (const p of (j?.preview ?? []) as Array<{ id: string }>) ids.add(p.id); }).catch(() => {})));
          const r = await call("/api/threads/custom", "POST", { name: a.name, source: "manual", contact_ids: [...ids].slice(0, 500) });
          const id = r.thread?.id as string | undefined;
          if (!id) throw new Error("Couldn't make it.");
          // The rail's prefs are written by the drawer, which holds them (spaces-nav.tsx listens).
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sc:space-build", { detail: { id, shelves: a.shelves, members: a.members, tools: a.tools } }));
          out.push({ ok: true, text: `Made the Work Space “${a.name}”${a.members.length ? ` with ${a.members.length} in it` : ""} — it's on the rail` });
        } catch (e) {
          out.push({ ok: false, text: `Work Space “${a.name}”: ${e instanceof Error ? e.message : String(e)}` });
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
      if (a.do === "new_contact") {
        const made = a.customer && CUST_KEY.test(a.customer) ? madeCust.get(a.customer) : null;
        const target = !a.customer ? null : made ? made.id : FULL_ID.test(a.customer) ? a.customer : null;
        if (a.customer && !target) { out.push({ ok: false, text: `“${a.name}”: the customer to put them on wasn't made — skipped` }); continue; }
        try {
          const r = await call("/api/contacts", "POST", { name: a.name, bucket: a.bucket ?? undefined,
            phones: a.phone ? [{ number: a.phone, label: a.label }] : [], emails: a.email ? [{ address: a.email, label: a.label }] : [] });
          if (!target) { out.push({ ok: true, text: `Added “${a.name}” to Contacts${a.bucket ? ` as ${a.bucket}` : " (Unsorted)"}` }); continue; }
          await call(`/api/customers/${target}/contacts`, "POST", { contact_id: r.contact.id });
          out.push({ ok: true, text: `Added “${a.name}” to ${made ? `“${made.name}”` : "the customer"}` });
        } catch (e) {
          out.push({ ok: false, text: `“${a.name}”: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "new_vendor") continue; // applyVendors made them, before the Price book steps
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
      if (a.do === "file_email") {
        const made = a.kind === "customer" && CUST_KEY.test(a.id) ? madeCust.get(a.id) : a.kind === "job" && JOB_KEY.test(a.id) ? madeJob.get(a.id) : null;
        const target = made ? made.id : FULL_ID.test(a.id) ? a.id : null;
        if (!target) { out.push({ ok: false, text: `The ${a.kind} to file the email on wasn't made — it stays in the inbox` }); continue; }
        try {
          // The Emails sheet's own filing: its files follow it onto the customer, person or job.
          const r = await call(`/api/emails/${a.email}`, "PATCH", { [`${a.kind}_id`]: target });
          const where = made ? ("title" in made ? `“${made.title}”` : `“${made.name}”`) : `the ${a.kind === "contact" ? "person" : a.kind}`;
          // Learn the sender's address on the person it's filed on, so their next email files itself (§2h exact match).
          // Only when the person it landed on IS the writer (their own contact named, or the same name) — never
          // a colleague's address onto the company's primary person.
          const sender = r.email?.original_from_address as string | null | undefined, person = r.email?.contact_id as string | null | undefined;
          const same = (x: unknown, y: unknown) => typeof x === "string" && typeof y === "string" && x.trim().toLowerCase() === y.trim().toLowerCase();
          let learned = "";
          if (sender && person && (a.kind === "contact" || same(r.email?.original_from_name, r.email?.contact_name))) {
            try { await call(`/api/contacts/${person}/emails`, "POST", { email: sender }); learned = ` — ${sender} added to their contact, so the next one files itself`; }
            catch { /* already theirs, or someone else's: leave it */ }
          }
          out.push({ ok: true, text: `Filed the email “${r.email?.subject ?? ""}” and its files on ${where}${learned}` });
        } catch (e) {
          out.push({ ok: false, text: `Email not filed: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "text") {
        try {
          const r = await call("/api/texts", "POST", { contact_id: a.contact, body: a.body, to: a.to ?? undefined });
          expectMessage(a.contact);
          out.push({ ok: true, text: `Sent to ${String(r.to).replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")} through Quo — it shows in their thread once Quo confirms` });
        } catch (e) {
          out.push({ ok: false, text: `Text not sent: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "email") {
        try {
          let to = a.to, cc = a.cc, subject = a.subject, body = a.body, replyTo: string | null = null;
          let filing: Record<string, string | null> = {};
          if (a.conversation) {
            // The conversation as its page reads it: who a reply goes to, its subject, what a forward carries.
            const c = await call(`/api/emails/threads/${encodeURIComponent(a.conversation)}`, "GET") as { messages: MailRow[]; ours: string[] };
            const msgs = c.messages ?? [];
            const last = msgs[msgs.length - 1];
            if (a.mode === "reply" || a.mode === "reply_all") {
              const t = replyTargets(msgs, a.mode, c.ours ?? []);
              if (!to.length) to = t.to;
              if (!cc.length) cc = t.cc;
              subject = subject ?? replySubject(last?.subject);
              replyTo = ([...msgs].reverse().find((m) => m.direction !== "out") ?? last)?.id ?? null;
            } else if (a.mode === "forward" && last) {
              subject = subject ?? forwardSubject(last.subject);
              body = `${body}\n\n${forwardBody(last)}`;
            }
            if (last) filing = { customer_id: last.customer_id, contact_id: last.contact_id, job_id: last.job_id };
          } else if (a.contact && !to.length) {
            const p = await call(`/api/people/${a.contact}`, "GET") as { contact?: { email_list?: Array<{ email: string }> } };
            const first = (p.contact?.email_list ?? [])[0]?.email;
            if (first) to = [first.toLowerCase()];
            filing = { contact_id: a.contact };
          }
          const r = await call("/api/emails/drafts", "POST", { mode: a.mode, conversation: a.conversation, reply_to_email_id: replyTo, to, cc,
            subject: subject ?? "", body, file_ids: [], by: "dusty", ...filing });
          const id = r.draft?.id as string;
          const href = a.conversation
            ? `/dashboard/messages/email/${encodeURIComponent(a.conversation)}?draft=${id}`
            : `/dashboard/messages/email/new?draft=${id}`;
          out.push({ ok: true, text: `Draft saved${to.length ? ` to ${to.join(", ")}` : " — add who it goes to"}. Open it, check it and tap Send — nothing has gone out`, href, hrefLabel: "Open the draft ›" });
        } catch (e) {
          out.push({ ok: false, text: `Draft not saved: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "appointment") {
        const job = a.job && JOB_KEY.test(a.job) ? madeJob.get(a.job)?.id ?? null : a.job;
        if (a.job && !job) { out.push({ ok: false, text: "The job to book it on wasn't made — skipped" }); continue; }
        try {
          const r = await call("/api/appointments", "POST", { job_id: job ?? undefined, contact_id: a.contact ?? undefined, kind: a.kind, title: a.title ?? undefined,
            day: a.day, start: a.start, end: a.end ?? undefined, address: a.address ?? undefined, note: a.note ?? undefined, source: "dusty" });
          window.dispatchEvent(new Event(APPOINTMENTS_EVENT));
          out.push({ ok: true, text: `On the schedule: ${r.appointment?.title ?? "the appointment"}, ${whenText(r.appointment.starts_at, r.appointment.ends_at)} — Add to calendar is on the job's Summary and their contact card` });
        } catch (e) {
          out.push({ ok: false, text: `Not booked: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "update_appointment") {
        try {
          await call(`/api/appointments/${a.id}`, "PATCH", { ...(a.status ? { status: a.status } : {}), ...(a.reason ? { canceled_reason: a.reason } : {}),
            ...(a.day && a.start ? { day: a.day, start: a.start, end: a.end ?? "" } : {}) });
          window.dispatchEvent(new Event(APPOINTMENTS_EVENT));
          out.push({ ok: true, text: a.status === "canceled" ? "Canceled the appointment" : a.status === "confirmed" ? "Marked it confirmed" : a.status === "done" ? "Marked it done" : "Moved the appointment" });
        } catch (e) {
          out.push({ ok: false, text: `Appointment not changed: ${e instanceof Error ? e.message : String(e)}` });
        }
        continue;
      }
      if (a.do === "bid_request") {
        // Opens the composer (bid-request-host.tsx) with these ticked; Coy picks who and taps Send there.
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sc:bid-request", { detail: {
          job: a.job, seed: { sections: a.areas, groups: a.groups, items: a.items }, vendors: a.vendors, from: "Started by Dusty" } }));
        if (typeof window !== "undefined" && window.innerWidth < 1024) window.dispatchEvent(new Event("sc:dusty-close"));
        out.push({ ok: true, text: "Opened the bid request — pick who gets it and tap Send" });
        continue;
      }
      if (a.do === "use_bid") {
        // The vendor's answer read again under Coy's session, then the request sheet's own Use this bid.
        const r = await call(`/api/bid-requests?job=${a.job}`, "GET");
        type Rec = { id: string; name: string; answered_at: string | null; price_total: number | null; revoked_at: string | null };
        const req = ((r.requests ?? []) as Array<{ id: string; scopes: Array<{ lines: Array<{ key: string; supplied: boolean }> }>; recipients: Rec[] }>)
          .find((q) => q.recipients.some((x) => x.id === a.recipient));
        const rec = req?.recipients.find((x) => x.id === a.recipient);
        if (!req || !rec) { out.push({ ok: false, text: "Couldn't find that vendor's bid on the job." }); continue; }
        if (!rec.answered_at || rec.price_total === null) { out.push({ ok: false, text: `${rec.name} hasn't sent a total yet — nothing changed.` }); continue; }
        out.push(await applyBidToBudget({ jobId: a.job, requestId: req.id, recipientId: rec.id, vendor: rec.name, answeredAt: rec.answered_at,
          total: Number(rec.price_total), scopes: Array.isArray(req.scopes) ? req.scopes : [], replace: a.replace }));
        continue;
      }
      if (a.do === "send_proposal") {
        // Coy's words if he changed them on the card; Dusty's draft kept beside them, for learning.
        out.push(await sendProposal({ jobId: a.job, via: a.via, body: a.body, subject: a.subject, contactId: a.contact,
          dustyDraft: a.draft !== undefined && a.draft !== a.body ? a.draft : a.body }));
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

type VendorStep = Extract<PlanAction, { do: "new_vendor" }>;

/**
 * Vendors first (Coy, 2026-10-12: Dusty read Teague Rental's rate sheet and nothing was made), so a
 * new_item or vendor_price in the same plan can carry their price by the key (vend1). A number or
 * email that is already a contact — or the contact Dusty named, their thread — is filed as the
 * vendor and filled in where blank, never a second person and never written over; someone filed
 * customer or personal is left alone and named.
 */
export async function applyVendors(actions: PlanAction[]): Promise<{ results: StepResult[]; made: Map<string, string> }> {
  const results: StepResult[] = [];
  const made = new Map<string, string>();
  for (const a of actions) {
    if (a.do !== "new_vendor") continue;
    try {
      const r = await vendorStep(a);
      results.push(r.result);
      if (r.id && a.key) made.set(a.key, r.id);
    } catch (e) {
      results.push({ ok: false, text: `${a.name}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { results, made };
}

async function vendorStep(a: VendorStep): Promise<{ result: StepResult; id: string | null }> {
  let id = a.contact ?? null;
  let existing = false;
  if (!id) {
    const r = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: a.name, subtype: a.kind, phone: a.phone, email: a.email, website: a.website, address: a.address, service_area: a.service_area, trades: a.trades ?? [] }) });
    const b = await r.json().catch(() => ({}));
    if (r.status === 409 && b.existing?.id) {
      const bucket = b.existing.bucket as string | null;
      if (bucket && bucket !== "vendor") {
        return { id: null, result: { ok: false, text: `${a.name}: ${b.error ?? "already one of your contacts"} — filed ${bucket}, so not made a vendor; move them in Threads if they are one` } };
      }
      id = b.existing.id as string; existing = true;
    } else if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
    else id = b.vendor.id as string;
  } else existing = true;
  if (!id) return { id: null, result: { ok: false, text: `${a.name}: not added` } };
  if (existing) {
    // Their thread is the person: file them vendor (their tap in Threads would do the same), then fill the blanks.
    const cur = await call(`/api/vendors/${id}`, "GET").catch(() => null) as { vendor?: Record<string, unknown> } | null;
    const v = cur?.vendor ?? {};
    if (v.contact_type !== "vendor") await call(`/api/contacts/${id}/bucket`, "PATCH", { bucket: "vendor", subtype: a.kind });
    const blank = (k: string) => !(typeof v[k] === "string" && (v[k] as string).trim());
    const patch: Record<string, unknown> = {};
    if (blank("name")) patch.name = a.name;
    if (blank("company_name")) patch.company_name = a.name;
    if (a.phone && blank("phone")) patch.phone = a.phone;
    if (a.email && blank("email")) patch.email = a.email;
    if (a.website && blank("website")) patch.website = a.website;
    if (a.address && blank("address")) patch.address = a.address;
    if (a.service_area && blank("service_area")) patch.service_area = a.service_area;
    const had = Array.isArray(v.trades) ? (v.trades as string[]) : [];
    const more = (a.trades ?? []).filter((t) => !had.some((h) => h.toLowerCase() === t.toLowerCase()));
    if (more.length) patch.trades = [...had, ...more];
    if (Object.keys(patch).length) {
      // A number or email on someone else is refused (409): keep the rest.
      await call(`/api/vendors/${id}`, "PATCH", patch).catch(async () => {
        delete patch.phone; delete patch.email;
        if (Object.keys(patch).length) await call(`/api/vendors/${id}`, "PATCH", patch).catch(() => {});
      });
    }
  }
  const from = a.from === "web" ? `Found by Dusty on the web — check the details on their site.\nFound on: ${a.source}`
    : a.from === "file" ? "Added by Dusty from a document in Files — check the details against it."
    : `Added by Dusty from ${a.source === "Coy's words" ? "your words" : a.source} — check the details.`;
  const lines = [from, a.note ? `What they do: ${a.note}` : null, a.website ? `Website: ${a.website}` : null].filter(Boolean).join("\n");
  await call(`/api/people/${id}/notes`, "POST", { body: lines }).catch(() => {});
  return { id, result: { ok: true, text: existing
    ? `Filed ${a.name} as a vendor and filled in what was blank`
    : `Added ${a.name} to Vendors${a.phone ? " — a call to their number now lands on their thread" : " — no number yet"}` } };
}
