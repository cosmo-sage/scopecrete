/**
 * What a client may write on a `job_sections` row, and how it is checked.
 *
 * Shared by POST (create) and PATCH (edit). `sqft` and `cubic_yards` are
 * GENERATED columns and are never written. Note `cubic_yards` is generated as
 * `… * COALESCE(depth_in, 4)` — it assumes four inches when depth is unknown —
 * so the app never reads it; the engine (src/lib/engine) computes yards.
 *
 * `depth_in` defaults to 4 and `psi` to 3000 in the schema. A create therefore
 * writes both EXPLICITLY, as null when the caller did not give them, so a
 * section someone never measured is not silently four inches deep.
 */

export const WORK_TYPES = ["slab", "driveway", "patio", "sidewalk", "footing", "curb", "demo", "prep", "other"] as const;

const NUMERIC = ["length_ft", "width_ft", "sqft_override", "depth_in", "count_qty"] as const;
const TEXT = ["name", "rebar", "prep_notes", "access_notes"] as const;

export const SECTION_SELECT =
  "id, job_id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, access_notes, sort_order, created_at, updated_at, reinforcement_item_id, reinforcement_source, origin, source_ref, count_qty, count_unit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readSectionFields(body: Record<string, unknown>):
  { ok: true; patch: Record<string, unknown>; reinforcement?: string | null } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  for (const f of NUMERIC) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null || v === "") { patch[f] = null; continue; }
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return { ok: false, error: `${f} must be a positive number, or null.` };
    patch[f] = n;
  }

  if ("psi" in body) {
    const v = body.psi;
    if (v === null || v === "") patch.psi = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 10000) patch.psi = v;
    else return { ok: false, error: "psi must be a whole number between 2000 and 10000, or null." };
  }

  for (const f of TEXT) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null) patch[f] = null;
    else if (typeof v === "string") patch[f] = v.trim() === "" ? null : v.trim().slice(0, 500);
    else return { ok: false, error: `${f} must be text.` };
  }

  // Measured by count (migration 065): the unit counted, short ("EA", "LS").
  if ("count_unit" in body) {
    const v = body.count_unit;
    if (v === null || v === "") patch.count_unit = null;
    else if (typeof v === "string" && v.trim().length <= 12) patch.count_unit = v.trim().toUpperCase();
    else return { ok: false, error: "count_unit must be a short unit like EA, or null." };
  }

  if ("work_type" in body) {
    if (typeof body.work_type !== "string" || !(WORK_TYPES as readonly string[]).includes(body.work_type)) {
      return { ok: false, error: `work_type must be one of: ${WORK_TYPES.join(", ")}.` };
    }
    patch.work_type = body.work_type;
  }

  // Reinforcement is a card (step 3b, migration 050). It is not a column
  // write: the route records it AND puts that card on the area's budget
  // (setReinforcement in src/lib/budget-server.ts). null = none.
  let reinforcement: string | null | undefined;
  if ("reinforcement_item_id" in body) {
    const v = body.reinforcement_item_id;
    if (v === null || v === "") reinforcement = null;
    else if (typeof v === "string" && UUID.test(v)) reinforcement = v;
    else return { ok: false, error: "reinforcement_item_id must be a card id, or null." };
  }

  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isInteger(body.sort_order)) {
      return { ok: false, error: "sort_order must be a whole number." };
    }
    patch.sort_order = body.sort_order;
  }

  return { ok: true, patch, ...(reinforcement !== undefined ? { reinforcement } : {}) };
}
