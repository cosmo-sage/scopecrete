/**
 * Dusty's drawings (Coy, 2026-10-21: "How do we give dusty the ability to create artifacts like simple
 * drawings or renderings?"). Dusty writes a sketch — a slab or pour layout, a section through a footing,
 * a site sketch with its dimensions — as one small SVG inside a ```drawing block. The chat never puts
 * that text on the page: this reads it into a tree of the few shapes a sketch needs and nothing else
 * (no links, scripts, styles, images, fonts, filters or url() references), and the chat draws the tree
 * with React elements. A reply built from a customer's text can't turn into markup.
 * Pure — tests/dusty-drawing.test.mjs runs it.
 */

export const DRAWING_FENCE = "drawing";

export type DrawNode = { tag: DrawTag; attrs: Record<string, string>; kids: Array<DrawNode | string> };
export type DrawTag = "svg" | "g" | "rect" | "line" | "polyline" | "polygon" | "path" | "circle" | "ellipse" | "text" | "tspan";

export interface Drawing {
  /** The <title>, else "Drawing". */
  title: string;
  root: DrawNode;
  /** Elements or attributes left out because a sketch doesn't need them. */
  dropped: number;
}

const MAX_CHARS = 80_000;
const MAX_NODES = 4_000;

const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px|pt|%)?$/i;
const NUMS = /^[-+\d.,\seE]*$/;
const PATH = /^[-+\d.,\seEMmLlHhVvCcSsQqTtAaZz]*$/;
const XFORM = /^(?:\s*(?:translate|rotate|scale|matrix|skewX|skewY)\s*\([-+\d.,\seE]*\)\s*,?)*\s*$/;
const DASH = /^(?:none|[\d.,\s]+)$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_WORDS = new Set([
  "none", "currentcolor", "transparent", "black", "white", "gray", "grey", "silver", "red", "orange", "yellow", "green",
  "blue", "navy", "teal", "purple", "brown", "tan", "beige", "maroon", "olive", "darkgray", "darkgrey", "lightgray",
  "lightgrey", "darkgreen", "darkblue", "darkred", "gold", "khaki", "wheat", "sienna", "slategray", "steelblue",
]);
const RGB = /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)$/i;

const isColor = (v: string) => HEX.test(v) || RGB.test(v) || COLOR_WORDS.has(v.toLowerCase());

/** Each attribute a sketch may carry, and what its value must look like. */
const ATTR: Record<string, (v: string) => boolean> = {
  x: (v) => NUM.test(v), y: (v) => NUM.test(v), x1: (v) => NUM.test(v), y1: (v) => NUM.test(v),
  x2: (v) => NUM.test(v), y2: (v) => NUM.test(v), cx: (v) => NUM.test(v), cy: (v) => NUM.test(v),
  r: (v) => NUM.test(v), rx: (v) => NUM.test(v), ry: (v) => NUM.test(v),
  width: (v) => NUM.test(v), height: (v) => NUM.test(v),
  dx: (v) => NUMS.test(v), dy: (v) => NUMS.test(v),
  viewBox: (v) => /^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/.test(v),
  points: (v) => NUMS.test(v), d: (v) => PATH.test(v), transform: (v) => XFORM.test(v),
  fill: isColor, stroke: isColor,
  "stroke-width": (v) => NUM.test(v), "stroke-dasharray": (v) => DASH.test(v),
  "stroke-linecap": (v) => /^(?:butt|round|square)$/.test(v), "stroke-linejoin": (v) => /^(?:miter|round|bevel)$/.test(v),
  opacity: (v) => NUM.test(v), "fill-opacity": (v) => NUM.test(v), "stroke-opacity": (v) => NUM.test(v),
  "fill-rule": (v) => /^(?:nonzero|evenodd)$/.test(v),
  "font-size": (v) => NUM.test(v), "font-weight": (v) => /^(?:normal|bold|[1-9]00)$/.test(v),
  "font-style": (v) => /^(?:normal|italic)$/.test(v),
  "text-anchor": (v) => /^(?:start|middle|end)$/.test(v),
  "dominant-baseline": (v) => /^(?:auto|middle|central|hanging|alphabetic)$/.test(v),
};

const TAGS = new Set<DrawTag>(["svg", "g", "rect", "line", "polyline", "polygon", "path", "circle", "ellipse", "text", "tspan"]);
/** Left out with everything inside them. */
const SKIP_WHOLE = new Set(["script", "style", "foreignobject", "image", "use", "a", "defs", "symbol", "marker", "pattern",
  "mask", "clippath", "filter", "lineargradient", "radialgradient", "iframe", "metadata", "desc", "animate", "set"]);

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  const k = e.toLowerCase();
  if (ENT[k] !== undefined) return ENT[k];
  if (k.startsWith("#x")) return safeChar(parseInt(k.slice(2), 16));
  if (k.startsWith("#")) return safeChar(parseInt(k.slice(1), 10));
  return m;
});
const safeChar = (n: number) => (n >= 32 && n < 0xd800) || n === 10 ? String.fromCharCode(n) : "";

/** The drawing inside a ```drawing block, or null when there is no whole <svg>…</svg> in it yet. */
export function parseDrawing(src: string): Drawing | null {
  if (!src || src.length > MAX_CHARS) return null;
  const s = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const start = s.search(/<svg[\s>]/i);
  if (start < 0 || !/<\/svg\s*>/i.test(s)) return null;

  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  re.lastIndex = start;
  const stack: Array<DrawNode | null> = [];
  let root: DrawNode | null = null;
  let title = "";
  let inTitle = false;
  let skipDepth = 0;
  let dropped = 0;
  let nodes = 0;

  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[5] !== undefined) {
      const text = decode(m[5]);
      if (skipDepth) continue;
      if (inTitle) { title += text; continue; }
      const top = stack[stack.length - 1];
      if (top && (top.tag === "text" || top.tag === "tspan") && text.trim()) top.kids.push(text.replace(/\s+/g, " "));
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase().replace(/^svg:/, "");
    const selfClose = m[4] === "/";

    if (skipDepth) {
      if (SKIP_WHOLE.has(name) && !selfClose) skipDepth += closing ? -1 : 1;
      continue;
    }
    if (name === "title") { inTitle = !closing && !selfClose; continue; }
    if (closing) {
      stack.pop();
      if (name === "svg" && stack.length === 0) break;
      continue;
    }
    if (SKIP_WHOLE.has(name)) { dropped++; if (!selfClose) skipDepth = 1; continue; }

    const tag = (name === "svg" ? "svg" : name) as DrawTag;
    const parent = stack[stack.length - 1];
    if (!TAGS.has(tag) || (tag === "svg" && root) || (!root && tag !== "svg") || parent === null) {
      dropped++;
      if (!selfClose) stack.push(null);
      continue;
    }
    if (++nodes > MAX_NODES) break;
    const attrs: Record<string, string> = {};
    const ar = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    for (let a = ar.exec(m[3]); a; a = ar.exec(m[3])) {
      const key = a[1] === "viewbox" ? "viewBox" : a[1];
      const val = decode(a[2] ?? a[3] ?? "").trim();
      if (key === "xmlns" || key.startsWith("xmlns:")) continue;
      const ok = ATTR[key];
      if (ok && val && ok(val)) attrs[key] = val;
      else dropped++;
    }
    const node: DrawNode = { tag, attrs, kids: [] };
    if (!root) root = node;
    else parent!.kids.push(node);
    if (!selfClose) stack.push(node);
  }
  if (!root) return null;
  if (!root.attrs.viewBox) {
    const w = parseFloat(root.attrs.width ?? ""), h = parseFloat(root.attrs.height ?? "");
    if (!(w > 0 && h > 0)) return null;
    root.attrs.viewBox = `0 0 ${w} ${h}`;
  }
  delete root.attrs.width;
  delete root.attrs.height;
  return { title: title.replace(/\s+/g, " ").trim().slice(0, 120) || "Drawing", root, dropped };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The cleaned drawing written back out as an .svg file — only what parseDrawing kept. */
export function drawingSvg(d: Drawing, opts: { width?: number; background?: string } = {}): string {
  const out = (n: DrawNode | string): string => {
    if (typeof n === "string") return esc(n);
    const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    const extra = n === d.root
      ? ` xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif"${opts.width ? ` width="${opts.width}"` : ""}`
      : "";
    const bg = n === d.root && opts.background ? `<rect x="-100000" y="-100000" width="200000" height="200000" fill="${esc(opts.background)}"/>` : "";
    const title = n === d.root ? `<title>${esc(d.title)}</title>` : "";
    return `<${n.tag}${extra}${attrs}>${title}${bg}${n.kids.map(out).join("")}</${n.tag}>`;
  };
  return out(d.root);
}

/** "Sacco Driveway layout" → "sacco-driveway-layout" for a file name. */
export function drawingFileName(d: Drawing, ext: "svg" | "png"): string {
  const base = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "drawing";
  return `${base}.${ext}`;
}
