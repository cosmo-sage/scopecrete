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

const NUMERIC = ["length_ft", "width_ft", "sqft_override", "depth_in"] as const;
const TEXT = ["name", "rebar", "prep_notes", "access_notes"] as const;

export const SECTION_SELECT =
  "id, job_id, name, work_type, length_ft, width_ft, sqft_override, depth_in, psi, rebar, prep_notes, access_notes, sort_order, created_at, updated_at, reinforcement_type_id, reinforcement_source";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readSectionFields(body: Record<string, unknown>):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
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

  if ("work_type" in body) {
    if (typeof body.work_type !== "string" || !(WORK_TYPES as readonly string[]).includes(body.work_type)) {
      return { ok: false, error: `work_type must be one of: ${WORK_TYPES.join(", ")}.` };
    }
    patch.work_type = body.work_type;
  }

  // Reinforcement Coy picked (migration 042): 'set', so a later work-type
  // change never swaps it for a default. null = none chosen.
  if ("reinforcement_type_id" in body) {
    const v = body.reinforcement_type_id;
    if (v === null || v === "") { patch.reinforcement_type_id = null; patch.reinforcement_source = null; }
    else if (typeof v === "string" && UUID.test(v)) { patch.reinforcement_type_id = v; patch.reinforcement_source = "set"; }
    else return { ok: false, error: "reinforcement_type_id must be an id, or null." };
  }

  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || !Number.isInteger(body.sort_order)) {
      return { ok: false, error: "sort_order must be a whole number." };
    }
    patch.sort_order = body.sort_order;
  }

  return { ok: true, patch };
}

/**
 * The default reinforcement for a job type × work type (migration 042), or
 * null. Used when a section is created, and when a section whose
 * reinforcement came from the defaults changes work type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function defaultReinforcement(supabase: any, orgId: string, jobType: string | null, workType: string | null): Promise<string | null> {
  if (!jobType || !workType) return null;
  const { data } = await supabase.from("org_reinforcement_defaults").select("reinforcement_type_id")
    .eq("org_id", orgId).eq("job_type", jobType).eq("work_type", workType).maybeSingle();
  return (data?.reinforcement_type_id as string | undefined) ?? null;
}
