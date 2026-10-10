/**
 * Price book imports (migration 049) — the pure parts: reading a CSV, guessing
 * which column is which, turning a row into a card, and matching it against
 * the cards Coy already has. Pure and self-contained (no imports), so
 * tests/price-import.test.mjs runs it.
 *
 * Coy, 2026-09-29: "Import excel csv files from jobtread and other crms."
 * Nothing is assumed: a blank cost stays blank, an unknown type is flagged, and
 * how a card is counted is shown as a guess Coy can change before importing.
 * Nothing is written until he confirms the preview.
 */

// ---------------------------------------------------------------- CSV

/** RFC 4180: quoted fields, "" escapes, commas and newlines inside quotes, a BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"' && f === "") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// ---------------------------------------------------------------- columns

export const TARGETS = ["name", "group", "cost_type", "unit", "unit_cost", "unit_price", "markup", "taxable",
  "description", "vendor", "sku", "cost_code"] as const;
export type Target = (typeof TARGETS)[number];
export const TARGET_LABEL: Record<Target, string> = {
  name: "Name", group: "Group", cost_type: "Cost type", unit: "Unit", unit_cost: "Unit cost", unit_price: "Unit price",
  markup: "Markup %", taxable: "Taxed", description: "Description", vendor: "Vendor", sku: "Item # / SKU", cost_code: "Cost code",
};

/** Header words from JobTread's cost catalog export and the usual CRMs / spreadsheets. Checked in order. */
const ALIASES: Record<Target, string[]> = {
  name: ["name", "item", "item name", "cost item", "cost item name", "product", "product name", "title"],
  group: ["cost group", "group", "category", "cost category", "section", "folder", "parent group"],
  cost_type: ["cost type", "type", "item type", "kind"],
  unit: ["unit", "uom", "units", "unit of measure", "unit name"],
  unit_cost: ["unit cost", "cost", "cost per unit", "our cost", "base cost", "unit cost ($)"],
  unit_price: ["unit price", "price", "price per unit", "sell price", "sale price", "unit price ($)"],
  markup: ["markup", "markup %", "markup percent", "markup percentage", "mark up"],
  taxable: ["taxable", "tax", "is taxable", "taxed", "sales tax"],
  description: ["description", "notes", "details", "memo"],
  vendor: ["vendor", "supplier", "vendor name", "supplier name", "manufacturer"],
  sku: ["sku", "item #", "item number", "item no", "part #", "part number", "part no", "vendor sku", "product code", "code"],
  cost_code: ["cost code", "cost code name", "costcode", "phase code"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

/** Which header is which. Each header is used once; an exact alias beats a partial one. */
export function guessMapping(headers: string[]): Record<Target, number | null> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const out = Object.fromEntries(TARGETS.map((t) => [t, null])) as Record<Target, number | null>;
  // Exact pass, most specific targets first so "cost code" is not taken as "cost".
  const order: Target[] = ["cost_code", "cost_type", "unit_cost", "unit_price", "group", "markup", "sku", "vendor", "name", "unit", "taxable", "description"];
  for (const t of order) {
    for (const a of ALIASES[t]) {
      const i = h.findIndex((x, j) => !used.has(j) && x === a);
      if (i >= 0) { out[t] = i; used.add(i); break; }
    }
  }
  return out;
}

/**
 * Which row is the header: exports often open with a title or a date line. The
 * first of the first 10 rows that names a name column and at least one other,
 * else the first row.
 */
export function findHeader(table: unknown[][]): number {
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const m = guessMapping(table[i].map((c) => (c === null || c === undefined ? "" : String(c))));
    if (m.name !== null && Object.values(m).filter((v) => v !== null).length >= 2) return i;
  }
  return 0;
}

// ---------------------------------------------------------------- values

/** "$1,234.50" → 1234.5. Blank → null. Anything else unreadable → "bad". */
export function parseMoney(v: unknown): number | null | "bad" {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : "bad";
  const s = String(v).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[$,\s()]/g, "").replace(/^-/, ""));
  if (!Number.isFinite(n) || neg) return "bad";
  return n;
}

/** "30%" / "30" / "0.3" (a fraction under 1 from a spreadsheet cell formatted as %) → 30. */
export function parsePct(v: unknown): number | null | "bad" {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? (v > 0 && v < 1 ? round(v * 100, 4) : v) : "bad";
  const s = String(v).trim();
  if (!s) return null;
  const pct = s.endsWith("%");
  const n = Number(s.replace(/[%,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return "bad";
  return !pct && n > 0 && n < 1 ? round(n * 100, 4) : n;
}

export function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "x", "taxable", "taxed"].includes(s)) return true;
  if (["n", "no", "false", "0", "non taxable", "non-taxable", "exempt"].includes(s)) return false;
  return null;
}

export type CostType = "material" | "labor" | "equipment" | "subcontract" | "other";
const TYPE_WORDS: Array<[CostType, string[]]> = [
  ["material", ["material", "materials", "mat", "supplies", "supply", "product"]],
  ["labor", ["labor", "labour", "lab", "crew", "install", "installation"]],
  ["equipment", ["equipment", "equip", "rental", "rentals", "machine"]],
  ["subcontract", ["subcontract", "subcontractor", "subcontractors", "sub", "subs", "sub contractor", "trade"]],
  ["other", ["other", "misc", "miscellaneous", "fee", "fees", "overhead", "admin"]],
];
/** A cost type from the file's word. `known` false means it was guessed as other — flagged in the preview. */
export function mapType(v: unknown): { type: CostType; known: boolean } {
  const s = norm(String(v ?? ""));
  if (!s) return { type: "other", known: false };
  for (const [t, words] of TYPE_WORDS) if (words.includes(s)) return { type: t, known: true };
  return { type: "other", known: false };
}

export type QtyRule = "per_cy" | "per_sqft" | "per_lf_perimeter" | "per_sheet" | "per_stick" | "per_day" | "per_job" | "manual";
const UNIT_RULES: Array<[QtyRule, string[]]> = [
  ["per_cy", ["cy", "cyd", "yd", "yd3", "yard", "yards", "cubic yard", "cubic yards", "cu yd"]],
  ["per_sqft", ["sf", "sqft", "sq ft", "ft2", "square foot", "square feet", "sq. ft."]],
  ["per_lf_perimeter", ["lf", "lin ft", "linear foot", "linear feet", "ln ft"]],
  ["per_sheet", ["sheet", "sheets", "sht"]],
  ["per_stick", ["stick", "sticks", "bar", "bars"]],
  ["per_day", ["day", "days", "dy"]],
  ["per_job", ["job", "ls", "lump sum", "lump", "lot"]],
];
/** How a card might be counted, from its unit. A GUESS: the preview labels it and Coy can change it. */
export function ruleFromUnit(unit: string | null): QtyRule {
  const u = norm(unit ?? "").replace(/\.$/, "");
  for (const [r, words] of UNIT_RULES) if (words.includes(u)) return r;
  return "manual";
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const txt = (v: unknown, max: number) => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

// ---------------------------------------------------------------- rows

export interface ImportRow {
  /** 1-based row in the file, after the header, as Coy would count it in the sheet. */
  line: number;
  name: string | null;
  group: string | null;
  cost_type: CostType;
  type_known: boolean;
  unit: string | null;
  unit_cost: number | null;
  markup_pct: number | null;
  markup_from: "file" | "price" | null;
  taxable: boolean;
  description: string | null;
  vendor: string | null;
  sku: string | null;
  qty_rule: QtyRule;
  /** Things wrong with the row. A row with any is skipped unless fixed. */
  problems: string[];
}

/** Turn the file's rows into cards, one per data row. `table[0]` is the header. */
export function toRows(table: unknown[][], map: Record<Target, number | null>): ImportRow[] {
  const at = (r: unknown[], t: Target) => (map[t] === null ? null : r[map[t] as number] ?? null);
  const out: ImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const problems: string[] = [];
    const name = txt(at(r, "name"), 120);
    if (!name) problems.push("no name");
    const unit = txt(at(r, "unit"), 20);
    if (!unit) problems.push("no unit");
    const ty = map.cost_type === null ? { type: "other" as CostType, known: false } : mapType(at(r, "cost_type"));
    const cost = parseMoney(at(r, "unit_cost"));
    if (cost === "bad") problems.push("unit cost isn't a number");
    const price = parseMoney(at(r, "unit_price"));
    const mk = parsePct(at(r, "markup"));
    if (mk === "bad") problems.push("markup isn't a number");
    let markup: number | null = mk === "bad" ? null : mk;
    let from: ImportRow["markup_from"] = markup === null ? null : "file";
    if (markup === null && typeof cost === "number" && cost > 0 && typeof price === "number" && price >= cost) {
      markup = round((price / cost - 1) * 100, 2);
      from = "price";
    }
    if (markup !== null && markup > 500) { problems.push("markup over 500%"); markup = null; from = null; }
    const tax = map.taxable === null ? null : parseBool(at(r, "taxable"));
    // A cost code is the card's group (Coy, 2026-09-29) unless the file has
    // its own group column; then the code is kept in the description.
    const code = txt(at(r, "cost_code"), 60);
    const fileGroup = txt(at(r, "group"), 60);
    const group = fileGroup ?? code;
    const desc = [txt(at(r, "description"), 440), code && fileGroup && fileGroup !== code ? `Cost code ${code}` : null].filter(Boolean).join(" · ") || null;
    // How it is counted, guessed from the unit — but slab geometry (yards,
    // sq ft, edge, sheets, sticks) only for concrete: a gutter sold by the
    // foot is not counted by a slab's perimeter.
    const guess = ruleFromUnit(unit);
    const qtyRule: QtyRule = GEOMETRY.has(guess) && group && !/concrete/i.test(group) ? "manual" : guess;
    out.push({
      line: i, name, group, cost_type: ty.type, type_known: ty.known, unit,
      unit_cost: typeof cost === "number" ? cost : null, markup_pct: markup, markup_from: from,
      taxable: tax ?? ty.type === "material", description: desc, vendor: txt(at(r, "vendor"), 120), sku: txt(at(r, "sku"), 60),
      qty_rule: qtyRule, problems,
    });
  }
  return out;
}

/** The rules that measure a slab: only concrete cards are counted this way. */
export const GEOMETRY = new Set<QtyRule>(["per_cy", "per_sqft", "per_lf_perimeter", "per_sheet", "per_stick"]);

// ---------------------------------------------------------------- matching

export interface ExistingCard {
  id: string; name: string; unit: string; unit_cost: number | null;
  vendor_contact_id: string | null; vendor_sku: string | null; active?: boolean;
}
export type RowStatus = "new" | "change" | "same" | "skip";
export interface Matched {
  line: number;
  status: RowStatus;
  card_id: string | null;
  old_cost: number | null;
  why: string | null;
}

const key = (s: string | null) => norm(s ?? "").replace(/[^a-z0-9#./ ]/g, "");

/**
 * Match each row to a card: by vendor + item # when both exist, else by vendor
 * + name + unit. `vendorOf(row)` is the vendor Coy picked for the row's vendor
 * name (or null). Two rows landing on the same card: the later one is skipped.
 */
export function matchRows(rows: ImportRow[], cards: ExistingCard[], vendorOf: (r: ImportRow) => string | null): Matched[] {
  const live = cards.filter((c) => c.active !== false);
  const bySku = new Map<string, ExistingCard>();
  const byName = new Map<string, ExistingCard>();
  for (const c of live) {
    if (c.vendor_sku) bySku.set(`${c.vendor_contact_id ?? ""}|${key(c.vendor_sku)}`, c);
    byName.set(`${c.vendor_contact_id ?? ""}|${key(c.name)}|${key(c.unit)}`, c);
  }
  const taken = new Set<string>();
  const seenNew = new Set<string>();
  return rows.map((r) => {
    if (r.problems.length) return { line: r.line, status: "skip", card_id: null, old_cost: null, why: r.problems.join(", ") };
    const v = vendorOf(r) ?? "";
    const hit = (r.sku ? bySku.get(`${v}|${key(r.sku)}`) : undefined) ?? byName.get(`${v}|${key(r.name)}|${key(r.unit)}`);
    if (!hit) {
      const k = `${v}|${key(r.name)}|${key(r.unit)}`;
      if (seenNew.has(k)) return { line: r.line, status: "skip", card_id: null, old_cost: null, why: "same item twice in the file" };
      seenNew.add(k);
      return { line: r.line, status: "new", card_id: null, old_cost: null, why: null };
    }
    if (taken.has(hit.id)) return { line: r.line, status: "skip", card_id: hit.id, old_cost: hit.unit_cost, why: "same item twice in the file" };
    taken.add(hit.id);
    const same = r.unit_cost === null || (hit.unit_cost !== null && Math.abs(hit.unit_cost - r.unit_cost) < 0.005);
    return { line: r.line, status: same ? "same" : "change", card_id: hit.id, old_cost: hit.unit_cost, why: null };
  });
}

// ---------------------------------------------------------------- vendor quotes

export interface PriceLine { name: string; sku: string | null; unit: string | null; unit_cost: number; qty: number | null }

/**
 * Dusty's read of a vendor quote (read-files v2, `facts.price_lines`) → rows
 * for the same preview a spreadsheet gets. A quote's lines are what that
 * vendor sells, so they start as materials (taxed) — Coy changes a card
 * afterwards if one is labor or a rental. A line with no unit is flagged: a
 * card needs one.
 */
export function quoteRows(lines: unknown): ImportRow[] {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 200).map((x, i) => {
    const l = (x && typeof x === "object" ? x : {}) as Partial<PriceLine>;
    const name = txt(l.name, 120);
    const unit = txt(l.unit, 20);
    const cost = typeof l.unit_cost === "number" && Number.isFinite(l.unit_cost) && l.unit_cost >= 0 ? l.unit_cost : null;
    const problems: string[] = [];
    if (!name) problems.push("no name");
    if (!unit) problems.push("no unit on the quote");
    if (cost === null) problems.push("no unit price");
    return {
      line: i + 1, name, group: null, cost_type: "material" as CostType, type_known: true, unit, unit_cost: cost,
      markup_pct: null, markup_from: null, taxable: true, description: null, vendor: null, sku: txt(l.sku, 60),
      qty_rule: ruleFromUnit(unit), problems,
    };
  });
}

// ---------------------------------------------------------------- a sample file

/**
 * A spreadsheet the importer reads without a column picked by hand (Coy,
 * 2026-10-10: "give me a clickable downloadable sample"): the header words
 * guessMapping() knows best, and three made-up rows.
 */
export const SAMPLE_HEADERS = ["Group", "Name", "Description", "Cost Type", "Unit", "Unit Cost", "Markup %", "Taxable", "Vendor", "Item #"];
export const SAMPLE_ROWS: string[][] = [
  ["Concrete", "3000 psi ready mix", "Delivered, 4\" slump", "Material", "CY", "145.00", "", "Yes", "", "RM3000"],
  ["Labor", "Form and finish", "Set forms, place and broom finish", "Labor", "SF", "1.45", "", "No", "", ""],
  ["Equipment", "Skid steer", "Rental with delivery", "Equipment", "Day", "250.00", "15", "No", "", ""],
];
/** The sample as CSV text, quoted where it must be. */
export function sampleCsv(): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [SAMPLE_HEADERS, ...SAMPLE_ROWS].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}
