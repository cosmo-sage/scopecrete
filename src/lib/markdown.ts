/**
 * A small Markdown reader for Dusty's answers (Coy, 2026-09-30: "showing the
 * calculations in .md format in the chat panel"). Pure — tested in
 * tests/markdown.test.mjs — and it returns data, never HTML: the chat renders
 * the tree with React, so nothing in a reply can become markup or script.
 *
 * Blocks: # headings, | tables |, - / * / 1. lists, ``` code, ```drawing sketches, > quotes,
 * paragraphs. A quote may come as "&gt;" (a model escaping its own reply).
 * Inline: **bold**, *italic*, `code`.
 */

export type Inline = { t: "text" | "b" | "i" | "code"; v: string };
export type MdBlock =
  | { k: "h"; level: 1 | 2 | 3; text: Inline[] }
  | { k: "p"; text: Inline[] }
  | { k: "ul"; items: Inline[][] }
  | { k: "ol"; items: Inline[][] }
  | { k: "table"; head: Inline[][]; rows: Inline[][][]; align: Array<"left" | "right" | "center"> }
  | { k: "code"; v: string }
  /** A ```drawing block (src/lib/dusty/drawing.ts); `open` while it is still being written. */
  | { k: "drawing"; v: string; open: boolean }
  | { k: "quote"; blocks: MdBlock[] };

/** "&gt;" and friends, written out by a model that escaped its own reply. */
const unescape = (s: string) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function inline(raw: string): Inline[] {
  const s = unescape(raw);
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ t: "b", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "code", v: m[3] });
    else out.push({ t: "i", v: m[4] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSep = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);

const QUOTE = /^\s*(?:>|&gt;)\s?/;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ k: "p", text: inline(para.join(" ")) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush();
      const lang = l.trim().slice(3).trim().toLowerCase();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      if (lang === "drawing" || lang === "svg") out.push({ k: "drawing", v: body.join("\n"), open: i >= lines.length });
      else out.push({ k: "code", v: body.join("\n") });
      continue;
    }
    if (QUOTE.test(l)) {
      flush();
      const body: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(QUOTE, ""));
      i--;
      const inner = parseMarkdown(body.join("\n"));
      if (inner.length) out.push({ k: "quote", blocks: inner });
      continue;
    }
    const h = l.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) { flush(); out.push({ k: "h", level: h[1].length as 1 | 2 | 3, text: inline(h[2].trim()) }); continue; }
    if (l.includes("|") && i + 1 < lines.length && isSep(lines[i + 1])) {
      flush();
      const head = cells(l);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left") as "left" | "right" | "center");
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(cells(lines[i]).map(inline));
      i--;
      // Money and numbers read right-aligned even when the model didn't say so.
      const numeric = head.map((_, c) => rows.length > 0 && rows.every((r) => /^[\s$€£(−-]*[\d.,]+%?\)?\s*$|^—$|^-$/.test((r[c] ?? []).map((x) => x.v).join(""))));
      out.push({ k: "table", head: head.map(inline), rows, align: align.map((a, c) => (a === "left" && numeric[c] ? "right" : a)) });
      continue;
    }
    const li = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const kind = /\d/.test(li[1]) ? "ol" : "ul";
      const items: Inline[][] = [inline(li[2])];
      for (; i + 1 < lines.length; i++) {
        const n = lines[i + 1].match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
        if (!n || (/\d/.test(n[1]) ? "ol" : "ul") !== kind) break;
        items.push(inline(n[2]));
      }
      out.push(kind === "ol" ? { k: "ol", items } : { k: "ul", items });
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    para.push(l.trim());
  }
  flush();
  return out;
}
