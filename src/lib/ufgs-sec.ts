/**
 * UFGS sections (.SEC, SpecsIntact) → Price book cards to make. Coy,
 * 2026-10-10: "I need to be able to upload and process .sec files from
 * WBDG-UFGS https://www.wbdg.org/dod/ufgs and other pricing standards."
 *
 * A UFGS section is a SPECIFICATION, not a price list: it says what a product
 * must be (ASTM C150, Type I/II…), never what it costs. So what comes out is
 * the section as a group ("03 30 00 Cast-in-Place Concrete") and the products
 * PART 2 PRODUCTS names, as cards with a blank unit cost — never a price — and
 * a unit only where the text states one ("measured by the cubic yard").
 *
 * The format is SpecsIntact's SGML-like markup: <SEC> the section, <SCN> its
 * number ("SECTION 03 30 00"), <STL> its title, <PRT> a part with its <TTL>,
 * <SPT> nested articles and paragraphs each with a <TTL>, <TXT> text, <LST>
 * lists of <ITM>, <NTE> designer's notes (left out), <BRK>/<TAI> bracketed
 * and tailored options (kept as words), <REF>/<RID> references. Read
 * tolerantly: tags in any case, unclosed tags closed by their parent, XML
 * exports (a declaration, a DOCTYPE, comments, CDATA), and plain text with
 * "PART 2 PRODUCTS" / "2.1 MATERIALS" headings when there are no tags at all.
 * Parsed in the browser — the file is never uploaded. Pure, no imports but
 * price-import's own, tested in tests/ufgs-sec.test.mjs.
 */

import { ruleFromUnit, GEOMETRY, type ImportRow } from "./price-import.ts";

export interface UfgsItem {
  name: string;
  /** The article titles above it, outermost first ("Materials", "Cementitious Materials"). */
  path: string[];
  /** What the section says about it, notes left out. */
  text: string;
  /** Only when the text states how it is measured. */
  unit: string | null;
}
export interface UfgsSection {
  number: string | null;
  title: string | null;
  /** "03 30 00 Cast-in-Place Concrete" — the Price book group. */
  group: string;
  /** False when no PART 2 was found: nothing to offer. */
  part2: boolean;
  items: UfgsItem[];
}

// ---------------------------------------------------------------- bytes

/** A .SEC from SpecsIntact may be UTF-8, UTF-16 (with a BOM) or Windows-1252. */
export function decodeSec(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8;
  // Windows-1252 by hand: some runtimes decode that label as Latin-1, losing the curly quotes and dashes.
  let out = "";
  for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] || " " : String.fromCharCode(b);
  return out;
}
const CP1252 = "€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ".split("").map((c) => (c === "\u0000" ? "" : c));

/** Does this text look like a SpecsIntact section at all? */
export function looksLikeSec(text: string): boolean {
  return /<\s*(SEC|SCN|PRT|SPT)\b/i.test(text) || /\bPART\s+2\b[\s\S]{0,40}\bPRODUCTS\b/i.test(text);
}

// ---------------------------------------------------------------- markup

interface Node { tag: string; kids: Array<Node | string> }

const ENT: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "°", plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾",
  mdash: "—", ndash: "–", times: "×", reg: "®", trade: "™", copy: "©", micro: "µ", sup2: "²", sup3: "³", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", bull: "•", hellip: "…", le: "≤", ge: "≥", divide: "÷", prime: "′", Prime: "″",
};
const entities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  }
  return ENT[e] ?? ENT[e.toLowerCase()] ?? m;
});

/** A tolerant tree: an unknown close tag is ignored, an unclosed one is closed by its parent's. */
export function parseMarkup(text: string): Node {
  const root: Node = { tag: "#root", kids: [] };
  const stack: Node[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\s*(\/?)\s*([A-Za-z][\w.:-]*)\b[^>]*?(\/?)\s*>/g;
  let at = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1];
  while ((m = re.exec(text))) {
    if (m.index > at) top().kids.push(entities(text.slice(at, m.index)));
    at = re.lastIndex;
    if (m[1] !== undefined) { top().kids.push(m[1]); continue; }
    if (!m[3]) continue; // comment, declaration, doctype
    const tag = m[3].toUpperCase();
    if (m[2] === "/") {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const node: Node = { tag, kids: [] };
    top().kids.push(node);
    if (m[4] !== "/") stack.push(node);
  }
  if (at < text.length) top().kids.push(entities(text.slice(at)));
  return root;
}

/** Designer's notes and other things that are not the spec's words. */
const SKIP = new Set(["NTE", "NPR", "NOTE", "AUT", "AUTHOR", "COPYRIGHT"]);
const SUBPART = new Set(["SPT", "ART", "PAR", "SUB", "SUBPART"]);
const BLOCK = new Set(["TXT", "ITM", "LST", "TTL", "SPT", "PRT", "PAR", "ART", "P", "BR", "TAB", "ROW", "CEL", "TR", "TD"]);

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function textOf(n: Node | string, skip: (n: Node) => boolean = () => false): string {
  if (typeof n === "string") return n;
  if (SKIP.has(n.tag) || skip(n)) return "";
  const inner = n.kids.map((k) => textOf(k, skip)).join("");
  return BLOCK.has(n.tag) ? ` ${inner} ` : inner;
}

function find(n: Node, tag: string): Node | null {
  for (const k of n.kids) {
    if (typeof k === "string") continue;
    if (k.tag === tag) return k;
    const f = find(k, tag);
    if (f) return f;
  }
  return null;
}
function findAll(n: Node, tags: Set<string>, out: Node[] = []): Node[] {
  for (const k of n.kids) {
    if (typeof k === "string") continue;
    if (tags.has(k.tag)) out.push(k);
    else findAll(k, tags, out);
  }
  return out;
}
/** Its own title: the first TTL that isn't inside a sub-article. */
function titleOf(n: Node): string {
  for (const k of n.kids) {
    if (typeof k === "string") continue;
    if (k.tag === "TTL") return squash(textOf(k));
    if (!SUBPART.has(k.tag) && k.tag !== "LST") { const t = titleOf(k); if (t) return t; }
  }
  return "";
}

// ---------------------------------------------------------------- words

/** Words that say an article is about the work, the paperwork or the checks — not a product. */
const NOT_A_PRODUCT = /\b(tests?|testing|inspections?|verifications?|requirements?|submittals?|quality|qualifications?|certifications?|certificates?|sampling|tolerances?|criteria|warrant(y|ies)|sustainab\w*|performance|designs?|description|general|delivery|storage|handling|proportion\w*|calculations?|summary|references?|definitions?|scope|procedures?|preparation|execution|installation|schedule|meetings?|coordination|mock-?ups?|samples?|records?|data|plans?|reports?)\b/i;
const GENERIC = new Set(["materials", "material", "products", "product", "components", "systems", "system", "manufactured units", "items", "other materials", "miscellaneous", "miscellaneous materials"]);

/** "2.1.3 PORTLAND CEMENT." → "Portland Cement"; brackets (UFGS's options) lose their marks. */
export function cleanTitle(s: string): string {
  let t = squash(s.replace(/[[\]{}]/g, " "))
    .replace(/^(?:PART\s+\d+\s*[-–—:]?\s*)?/i, "")
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/^[A-Z]\.\s+/, "")
    .replace(/[\s.:;,–—-]+$/, "");
  if (t && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
      .replace(/\b(And|Or|Of|For|The|In|On|To|With|A|An)\b/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase()))
      .replace(/\b(Astm|Aci|Aashto|Ansi|Pvc|Hdpe|Cmu|Psi|Gfrp|Frp)\b/g, (w) => w.toUpperCase());
  }
  return t.slice(0, 120);
}

const productish = (name: string) => !!name && /[a-z]/i.test(name) && !NOT_A_PRODUCT.test(name) && !GENERIC.has(name.toLowerCase())
  && name.split(/\s+/).length <= 10;

const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^cubic (yards?|yd)/i, "CY"], [/^square (yards?|yd)/i, "SY"], [/^square (feet|foot|ft)/i, "SF"],
  [/^(linear|lineal) (feet|foot|ft)/i, "LF"], [/^tons?\b/i, "Ton"], [/^gallons?\b/i, "Gal"], [/^pounds?\b/i, "Lb"],
  [/^each\b/i, "EA"], [/^lump sum\b/i, "LS"], [/^sheets?\b/i, "Sheet"], [/^bags?\b/i, "Bag"],
  [/^cubic met(er|re)s?\b/i, "m3"], [/^square met(er|re)s?\b/i, "m2"], [/^(linear )?met(er|re)s?\b/i, "m"],
];
/**
 * A unit only when the words state how it is measured or paid — "will be
 * measured by the cubic yard", "unit of measure: square foot". Never from a
 * rate ("pounds per cubic yard" is a mix design, not how it is bought).
 */
export function statedUnit(text: string): string | null {
  const re = /(?:\b(?:measured|paid|payment|priced|measurement)\b[^.;]{0,40}?\b(?:by|per|in|on)\s+(?:the\s+)?|\bunit\s+of\s+measure(?:ment)?\s*(?:is|shall\s+be|[:-])?\s*(?:the\s+)?)([a-z ]{2,20})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    for (const [w, u] of UNIT_WORDS) if (w.test(m[1].trim())) return u;
  }
  return null;
}

// ---------------------------------------------------------------- the section

function heading(root: Node, text: string): { number: string | null; title: string | null } {
  const scn = find(root, "SCN");
  const stl = find(root, "STL");
  const scnText = scn ? squash(textOf(scn)) : "";
  const num = /(\d{2}\s?\d{2}\s?\d{2}(?:\.\d{2})?)/.exec(scnText) ?? /\bSECTION\s+(\d{2}\s?\d{2}\s?\d{2}(?:\.\d{2})?)/i.exec(text);
  let title = stl ? squash(textOf(stl)) : "";
  if (!title) {
    // Plain text: the line after "SECTION 03 30 00", else the rest of its line.
    const t = /\bSECTION\s+\d{2}\s?\d{2}\s?\d{2}(?:\.\d{2})?[ \t]*([^\n\r]*)(?:[\r\n]+[ \t]*([^\n\r]+))?/i.exec(text);
    if (t) title = squash(t[1] || t[2] || "");
  }
  const number = num ? num[1].replace(/\s+/g, "").replace(/^(\d{2})(\d{2})(\d{2})/, "$1 $2 $3") : null;
  return { number, title: title ? cleanTitle(title) : null };
}

function fromTree(part: Node): UfgsItem[] {
  const out: UfgsItem[] = [];
  const walk = (n: Node, path: string[]) => {
    for (const sp of findAll(n, SUBPART)) {
      const title = cleanTitle(titleOf(sp));
      const kids = findAll(sp, SUBPART);
      const own = squash(textOf(sp, (x) => (SUBPART.has(x.tag) && x !== sp) || x.tag === "TTL"));
      // A list of products: "Fly ash: ASTM C618, Class F."
      const listed: UfgsItem[] = [];
      for (const it of findAll(sp, new Set(["ITM"]))) {
        if (kids.some((k) => contains(k, it))) continue;
        const item = fromListItem(squash(textOf(it)), title ? [...path, title] : path);
        if (item) listed.push(item);
      }
      // A product is an article with no product articles under it (Aggregates
      // keeps its name though "Aggregate Testing" sits under it) and no list
      // of products of its own (Admixtures is the heading of its list).
      const productKids = kids.some((k) => productish(cleanTitle(titleOf(k))));
      if (!productKids && !listed.length && productish(title)) out.push({ name: title, path, text: own, unit: statedUnit(own) });
      out.push(...listed);
      walk(sp, title ? [...path, title] : path);
    }
  };
  walk(part, []);
  return out;
}
const contains = (n: Node, x: Node): boolean => n.kids.some((k) => typeof k !== "string" && (k === x || contains(k, x)));

function fromListItem(s: string, path: string[]): UfgsItem | null {
  const m = /^\s*(?:[a-z0-9]{1,3}[.)]\s+)?([^:]{2,60}?)\s*:\s*(\S[\s\S]*)$/i.exec(s);
  if (!m) return null;
  const name = cleanTitle(m[1]);
  if (name.split(/\s+/).length > 6 || !productish(name)) return null;
  return { name, path, text: squash(m[2]), unit: statedUnit(m[2]) };
}

/** No tags: numbered headings between "PART 2" and "PART 3". */
function fromPlain(text: string): { found: boolean; items: UfgsItem[] } {
  const start = /^[ \t]*PART\s+2\b.*$/im.exec(text);
  if (!start) return { found: false, items: [] };
  const rest = text.slice(start.index + start[0].length);
  const end = /^[ \t]*PART\s+3\b/im.exec(rest);
  const body = end ? rest.slice(0, end.index) : rest;
  const lines = body.split(/\r?\n/);
  const heads: Array<{ depth: number; title: string; at: number }> = [];
  lines.forEach((l, i) => {
    const h = /^[ \t]*(2(?:\.\d+)+)\.?[ \t]+(.{2,120})$/.exec(l);
    if (h) heads.push({ depth: h[1].split(".").length, title: cleanTitle(h[2]), at: i });
  });
  const items: UfgsItem[] = [];
  heads.forEach((h, i) => {
    const next = heads[i + 1];
    const leaf = !next || next.depth <= h.depth;
    const own = squash(lines.slice(h.at + 1, next ? next.at : lines.length).join(" "));
    const path = heads.slice(0, i).filter((p, j) => p.depth < h.depth && !heads.slice(j + 1, i).some((q) => q.depth <= p.depth)).map((p) => p.title);
    if (leaf && productish(h.title)) items.push({ name: h.title, path, text: own, unit: statedUnit(own) });
  });
  return { found: true, items };
}

/** Read a section. Never throws; `part2` false when there's nothing to offer. */
export function parseUfgsSec(text: string): UfgsSection {
  const root = parseMarkup(text);
  const { number, title } = heading(root, text);
  const parts = findAll(root, new Set(["PRT"]));
  let part2 = false;
  let items: UfgsItem[] = [];
  const p2 = parts.find((p) => /\bPART\s*2\b|\bPRODUCTS\b/i.test(titleOf(p) || squash(textOf(p)).slice(0, 60)));
  if (p2) { part2 = true; items = fromTree(p2); }
  else if (!parts.length) {
    const plain = fromPlain(textOf(root));
    part2 = plain.found; items = plain.items;
  }
  const seen = new Set<string>();
  items = items.filter((it) => { const k = it.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 200);
  const group = [number, title].filter(Boolean).join(" ").slice(0, 60) || "UFGS section";
  return { number, title, group, part2, items };
}

/**
 * The section's products as rows for the Price book import's preview: the
 * section the group, materials (taxed, as a quote's lines), a blank unit cost
 * always, and the unit only when stated — a row with none waits for Coy to
 * pick one (it is "no unit" until he does).
 */
export function ufgsRows(sec: UfgsSection): ImportRow[] {
  return sec.items.map((it, i) => {
    const where = [sec.number ? `UFGS ${sec.number}` : "UFGS", ...it.path].join(" › ");
    const desc = `${where}${it.text ? ` — ${it.text}` : ""}`.slice(0, 440);
    const guess = ruleFromUnit(it.unit);
    return {
      line: i + 1, name: it.name, group: sec.group, cost_type: "material", type_known: true, unit: it.unit, unit_cost: null,
      markup_pct: null, markup_from: null, taxable: true, description: desc, vendor: null, sku: null,
      qty_rule: GEOMETRY.has(guess) && !/concrete/i.test(sec.group) ? "manual" : guess,
      problems: it.unit ? [] : ["no unit"],
    };
  });
}
