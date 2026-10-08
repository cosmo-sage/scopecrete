/**
 * Word documents and text files — what is in them, for the Files preview
 * and for Dusty (Coy, 2026-10-08: "any file I upload I want the agent to be
 * able to read and I want to view it. PDF's, word documents, .md files").
 *
 * Pure apart from fflate (unzip), so `npm test` runs it, and
 * supabase/functions/read-files/doc-text.ts is a copy of this file
 * (tests/doc-text.test.mjs checks they are the same).
 *
 * A .docx is a zip; its words are in word/document.xml. Only paragraphs
 * (with headings, list items, bold and italic) and tables are read — no
 * pictures, headers, footers, comments or tracked deletions. An old binary
 * .doc is not read.
 */

import { unzipSync, strFromU8 } from "fflate";

export type DocKind = "docx" | "markdown" | "text";

/** Whether a file is a Word document or plain text we can read, from its type, then its name. */
export function docKind(mime: string | null | undefined, name: string): DocKind | null {
  const m = (mime ?? "").toLowerCase();
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) ?? "";
  if (ext === "docx" || m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (["md", "markdown"].includes(ext) || m === "text/markdown") return "markdown";
  if (["txt", "csv", "tsv", "json", "log"].includes(ext) || m === "text/plain" || m === "text/csv" || m === "application/json") return "text";
  return null;
}

export interface Run { v: string; b?: boolean; i?: boolean }
export type DocBlock =
  | { t: "p"; style: "h1" | "h2" | "h3" | "li" | "p"; runs: Run[] }
  | { t: "table"; rows: string[][] };

const decode = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, "&");

const on = (rpr: string, tag: "b" | "i") => {
  const m = rpr.match(new RegExp(`<w:${tag}(\\s+w:val="([^"]*)")?\\s*/>`));
  return !!m && (!m[2] || /^(1|true|on)$/i.test(m[2]));
};

function runsOf(px: string): Run[] {
  const out: Run[] = [];
  for (const r of px.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const body = r[1];
    const rpr = body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    let v = "";
    for (const t of body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>/g)) {
      v += t[0].startsWith("<w:tab") ? "\t" : t[0].startsWith("<w:br") ? "\n" : decode(t[1] ?? "");
    }
    if (!v) continue;
    const run: Run = { v };
    if (on(rpr, "b")) run.b = true;
    if (on(rpr, "i")) run.i = true;
    const last = out[out.length - 1];
    if (last && !!last.b === !!run.b && !!last.i === !!run.i) last.v += v; else out.push(run);
  }
  return out;
}

function styleOf(px: string): "h1" | "h2" | "h3" | "li" | "p" {
  const s = px.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1]?.toLowerCase() ?? "";
  if (s === "title" || s === "heading1") return "h1";
  if (s === "heading2" || s === "subtitle") return "h2";
  if (/^heading\d$/.test(s)) return "h3";
  if (/<w:numPr>/.test(px) || /list/.test(s)) return "li";
  return "p";
}

const plain = (runs: Run[]) => runs.map((r) => r.v).join("");

/** word/document.xml → paragraphs and tables, in order. */
export function docxBlocks(xml: string): DocBlock[] {
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const out: DocBlock[] = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const x = m[0];
    if (x.startsWith("<w:tbl")) {
      const rows = [...x.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((tr) =>
        [...tr[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((tc) =>
          [...tc[1].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((p) => plain(runsOf(p[1]))).filter(Boolean).join(" ").trim()));
      if (rows.some((r) => r.some(Boolean))) out.push({ t: "table", rows });
      continue;
    }
    if (x.endsWith("/>") && !x.includes("</w:p>")) continue;
    const runs = runsOf(x);
    if (!plain(runs).trim()) continue;
    out.push({ t: "p", style: styleOf(x), runs });
  }
  return out;
}

/** The blocks as plain text — headings marked with #, list items with -, table cells with |. */
export function blocksText(blocks: DocBlock[]): string {
  return blocks.map((b) => {
    if (b.t === "table") return b.rows.map((r) => r.join(" | ")).join("\n");
    const s = plain(b.runs).trim();
    return b.style === "h1" ? `# ${s}` : b.style === "h2" ? `## ${s}` : b.style === "h3" ? `### ${s}` : b.style === "li" ? `- ${s}` : s;
  }).join("\n\n");
}

/** A .docx file's blocks, or null when it isn't one we can open. */
export function docxFromBytes(bytes: Uint8Array): DocBlock[] | null {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = files["word/document.xml"];
    return xml ? docxBlocks(strFromU8(xml)) : null;
  } catch {
    return null;
  }
}

/** A Word or text file's words, or null when there are none to read. */
export function docText(kind: DocKind, bytes: Uint8Array): string | null {
  const text = kind === "docx"
    ? (() => { const b = docxFromBytes(bytes); return b ? blocksText(b) : null; })()
    : strFromU8(bytes).replace(/^﻿/, "");
  return text && text.replace(/\s/g, "").length ? text : null;
}
