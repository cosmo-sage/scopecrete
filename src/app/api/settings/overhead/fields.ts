/** Validation for an `overhead_items` row — one line of the monthly nut. */

export const CADENCES = ["monthly", "quarterly", "annual", "one_time"] as const;
export const CATEGORIES = ["fixed", "equipment", "variable", "insurance", "other"] as const;
export const OVERHEAD_SELECT = "id, label, category, amount, cadence, active, notes, due_day";

export function readOverheadFields(body: Record<string, unknown>, creating: boolean):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  if ("label" in body || creating) {
    if (typeof body.label !== "string" || !body.label.trim()) return { ok: false, error: "label is required." };
    patch.label = body.label.trim().slice(0, 120);
  }
  if ("amount" in body || creating) {
    const n = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false, error: "amount must be a number, zero or more." };
    patch.amount = n;
  }
  if ("cadence" in body) {
    if (!(CADENCES as readonly unknown[]).includes(body.cadence)) return { ok: false, error: `cadence must be one of: ${CADENCES.join(", ")}.` };
    patch.cadence = body.cadence;
  }
  if ("category" in body) {
    if (!(CATEGORIES as readonly unknown[]).includes(body.category)) return { ok: false, error: `category must be one of: ${CATEGORIES.join(", ")}.` };
    patch.category = body.category;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "active must be true or false." };
    patch.active = body.active;
  }
  if ("notes" in body) {
    patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
  }
  return { ok: true, patch };
}
