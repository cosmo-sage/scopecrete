/**
 * Assemblies (step 3b, migration 050) — the pure parts: the vocabulary and
 * the check on what the browser sends. Pure, so tests/assemblies.test.mjs runs it.
 */

export const JOB_TYPES = ["residential", "commercial", "public"] as const;
export const WORK_TYPES = ["slab", "driveway", "patio", "sidewalk", "footing", "curb", "demo", "prep", "other"] as const;
export const JOB_TYPE_LABEL: Record<string, string> = { residential: "Residential", commercial: "Commercial", public: "Government" };
export const WORK_TYPE_LABEL: Record<string, string> = {
  slab: "Slab", driveway: "Driveway", patio: "Patio", sidewalk: "Sidewalk", footing: "Footing", curb: "Curb", demo: "Demo", prep: "Prep", other: "Other",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Residential · Driveway", "Any job · Patio", "Loaded by hand" (no work type). */
export function appliesTo(a: { job_type: string | null; work_type: string | null }): string {
  if (!a.work_type) return "Loaded by hand";
  return `${a.job_type ? JOB_TYPE_LABEL[a.job_type] ?? a.job_type : "Any job"} · ${WORK_TYPE_LABEL[a.work_type] ?? a.work_type}`;
}

export function cleanAssembly(b: Record<string, unknown>, partial: boolean):
  { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("name")) {
    const n = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!n) return { ok: false, error: "An assembly needs a name." };
    out.name = n;
  }
  if ("job_type" in b) {
    const v = b.job_type === "" ? null : b.job_type;
    if (v !== null && !(JOB_TYPES as readonly unknown[]).includes(v)) return { ok: false, error: "Job type is residential, commercial, government, or any." };
    out.job_type = v;
  }
  if ("work_type" in b) {
    const v = b.work_type === "" ? null : b.work_type;
    if (v !== null && !(WORK_TYPES as readonly unknown[]).includes(v)) return { ok: false, error: "Unknown kind of area." };
    out.work_type = v;
  }
  if ("auto_load" in b) out.auto_load = b.auto_load === true;
  if ("reinforcement_item_id" in b) {
    const v = b.reinforcement_item_id;
    if (v === null || v === "") out.reinforcement_item_id = null;
    else if (typeof v === "string" && UUID.test(v)) out.reinforcement_item_id = v;
    else return { ok: false, error: "Bad reinforcement card." };
  }
  if ("sort_order" in b && Number.isInteger(b.sort_order)) out.sort_order = b.sort_order;
  return { ok: true, value: out };
}
