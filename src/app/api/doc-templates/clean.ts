/** Cleans a template's fields from a request body (POST and PATCH share it). */
export function cleanTemplate(b: Record<string, unknown>, kind: "warranty" | "terms"):
  { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const row: Record<string, unknown> = {};
  if ("name" in b) row.name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if ("title" in b) row.title = typeof b.title === "string" ? b.title.slice(0, 160) : null;
  if ("project_types" in b) {
    if (!Array.isArray(b.project_types)) return { ok: false, error: "Bad project types." };
    row.project_types = (b.project_types as unknown[]).filter((x): x is string => typeof x === "string" && /^[a-z0-9_]{1,30}$/.test(x)).slice(0, 20);
  }
  if (kind === "warranty" && "body" in b) row.body = typeof b.body === "string" ? b.body.slice(0, 20000) : null;
  if (kind === "terms" && "clauses" in b) {
    if (!Array.isArray(b.clauses) || b.clauses.length > 60) return { ok: false, error: "Up to 60 clauses." };
    row.clauses = (b.clauses as Array<Record<string, unknown>>).map((c) => ({ h: typeof c.h === "string" ? c.h.slice(0, 120) : "", b: typeof c.b === "string" ? c.b.slice(0, 4000) : "" }));
  }
  return { ok: true, row };
}
