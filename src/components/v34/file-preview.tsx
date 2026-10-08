"use client";

/**
 * A file seen inside the app (Coy, 2026-10-08: "I need a way to actually view
 * the file inside the APP … PDF's, word documents, .md files"). The browser's
 * own PDF viewer downloads instead of showing on a phone, and a Word file
 * always downloads, so each kind is drawn here:
 *
 * - PDF: its pages with pdf.js (src/lib/pdf.ts), each drawn as it scrolls near.
 * - Word (.docx): its paragraphs, headings, lists and tables (src/lib/doc-text.ts).
 * - Markdown: rendered (the same renderer as Dusty's answers); other text as is.
 * - Anything else says it can't be shown here; Download is under the details.
 */

import React, { useEffect, useRef, useState } from "react";
import { T, F } from "@/lib/v34/tokens";
import { Markdown } from "@/components/v34/markdown";
import { docKind, docxFromBytes, type DocBlock } from "@/lib/doc-text";
import type { FileRow } from "@/components/v34/files-panel";

const MAX_PAGES = 60;
const MAX_TEXT_BYTES = 12 * 1024 * 1024;

const frame = (big?: boolean): React.CSSProperties => ({
  width: "100%", maxHeight: big ? "70vh" : "55vh", overflow: "auto", border: `1px solid ${T.hair}`,
  borderRadius: 4, background: T.slab,
});
const note: React.CSSProperties = { fontSize: F.xs, color: T.ink3, padding: "10px 12px" };

/** Whether FilePreview can show this file. */
export function canPreview(f: FileRow) {
  return f.kind === "pdf" || /\.pdf$/i.test(f.name) || !!docKind(f.mime_type, f.name);
}

export function FilePreview({ f, big }: { f: FileRow; big?: boolean }) {
  if (!f.url) return null;
  if (f.kind === "pdf" || /\.pdf$/i.test(f.name)) return <PdfPages key={f.id} id={f.id} url={f.url} big={big} />;
  const kind = docKind(f.mime_type, f.name);
  if (kind) return <DocView key={f.id} url={f.url} kind={kind} big={big} size={f.byte_size} />;
  const ext = f.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
  return <div style={{ ...note, background: T.slab, borderRadius: 4 }}>{ext ? `A .${ext.toLowerCase()} file` : "This file"} can&apos;t be shown here yet — Download it below.</div>;
}

function PdfPages({ id, url, big }: { id: string; url: string; big?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<import("@/lib/pdf").Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let live = true;
    import("@/lib/pdf").then(({ openPdf }) => openPdf(id, url)).then((d) => { if (live) setDoc(d); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [id, url]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(0, el.clientWidth - 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pages = doc ? Math.min(doc.numPages, MAX_PAGES) : 0;
  return (
    <div ref={box} style={frame(big)}>
      {err ? <div style={note}>Couldn&apos;t open the PDF: {err}</div>
        : !doc ? <div style={note}>Opening the PDF…</div>
        : (
          <div className="flex flex-col items-center gap-2" style={{ padding: 8 }}>
            {Array.from({ length: pages }, (_, i) => <PdfPage key={i} doc={doc} n={i + 1} width={width} root={box} />)}
            {doc.numPages > MAX_PAGES && <div style={note}>{doc.numPages - MAX_PAGES} more pages — Download it to see them all.</div>}
          </div>
        )}
    </div>
  );
}

function PdfPage({ doc, n, width, root }: { doc: import("@/lib/pdf").Doc; n: number; width: number; root: React.RefObject<HTMLDivElement | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(n === 1);
  const [ratio, setRatio] = useState(1.294);
  useEffect(() => {
    const el = wrap.current;
    if (!el || near) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { root: root.current, rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);
  useEffect(() => {
    if (!near || !width || !canvas.current) return;
    let cancel = () => {};
    let live = true;
    void (async () => {
      const { pageSize, drawPage } = await import("@/lib/pdf");
      const p = await doc.getPage(n);
      if (!live || !canvas.current) return;
      const s = pageSize(p);
      setRatio(s.h / s.w);
      const job = drawPage(doc, n, canvas.current, width / s.w);
      cancel = job.cancel;
    })();
    return () => { live = false; cancel(); };
  }, [near, width, doc, n]);
  return (
    <div ref={wrap} style={{ width: width || "100%", minHeight: width ? width * ratio : 200, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.15)" }}>
      <canvas ref={canvas} style={{ display: "block" }} aria-label={`Page ${n}`} />
    </div>
  );
}

function DocView({ url, kind, big, size }: { url: string; kind: "docx" | "markdown" | "text"; big?: boolean; size: number | null }) {
  const [got, setGot] = useState<{ blocks?: DocBlock[]; text?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if ((size ?? 0) > MAX_TEXT_BYTES) return;
    let live = true;
    fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => {
        if (!live) return;
        const bytes = new Uint8Array(buf);
        if (kind === "docx") {
          const blocks = docxFromBytes(bytes);
          if (!blocks) throw new Error("it isn't a Word document we can open");
          setGot({ blocks });
        } else setGot({ text: new TextDecoder().decode(bytes).replace(/^﻿/, "") });
      })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [url, kind, size]);
  if ((size ?? 0) > MAX_TEXT_BYTES) return <div style={{ ...note, background: T.slab, borderRadius: 4 }}>It&apos;s too big to show here — Download it below.</div>;
  if (err) return <div style={{ ...note, background: T.slab, borderRadius: 4 }}>Couldn&apos;t show it: {err}</div>;
  if (!got) return <div style={{ ...note, background: T.slab, borderRadius: 4 }}>Opening…</div>;
  return (
    <div style={{ ...frame(big), background: T.card, padding: "12px 14px", color: T.ink }}>
      {got.blocks ? <WordBlocks blocks={got.blocks} />
        : kind === "markdown" ? <Markdown text={got.text ?? ""} size={F.sm} />
        : <pre style={{ margin: 0, fontSize: F.xs, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--sc-font-code, monospace)" }}>{got.text}</pre>}
    </div>
  );
}

function WordBlocks({ blocks }: { blocks: DocBlock[] }) {
  if (!blocks.length) return <div style={{ fontSize: F.sm, color: T.ink3 }}>No words in this document.</div>;
  return (
    <div className="flex flex-col gap-2" style={{ fontSize: F.sm, lineHeight: 1.5 }}>
      {blocks.map((b, i) => {
        if (b.t === "table") return (
          <div key={i} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: F.xs }}>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={{ border: `1px solid ${T.hair}`, padding: "3px 6px", fontWeight: j === 0 ? 600 : 400, verticalAlign: "top" }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        const runs = b.runs.map((r, j) => <span key={j} style={{ fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? "italic" : undefined, whiteSpace: "pre-wrap" }}>{r.v}</span>);
        if (b.style === "h1") return <div key={i} style={{ fontSize: F.lg, fontWeight: 700 }}>{runs}</div>;
        if (b.style === "h2") return <div key={i} style={{ fontSize: F.md, fontWeight: 700 }}>{runs}</div>;
        if (b.style === "h3") return <div key={i} style={{ fontWeight: 700 }}>{runs}</div>;
        if (b.style === "li") return <div key={i} style={{ paddingLeft: 14, textIndent: -10 }}>• {runs}</div>;
        return <p key={i} style={{ margin: 0 }}>{runs}</p>;
      })}
    </div>
  );
}
