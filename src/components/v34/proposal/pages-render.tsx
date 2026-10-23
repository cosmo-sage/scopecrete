"use client";
/**
 * The proposal's own pages and the two new built ones (Claude Design "Proposal Builder v2",
 * 2026-10-23): At a glance, If we find…, a text page, a photos page and an attached PDF.
 * Drawn inside ProposalDocument; nothing here prices anything — At a glance reads the total
 * priceProposal() worked out, and If we find… shows Price book prices that are never in it.
 */
import React, { useEffect, useRef, useState } from "react";
import { disp, strong, nums } from "@/lib/v34/tokens";
import { openPdf, pageThumb } from "@/lib/pdf";
import { paymentLine, validLabel, textBlocks, inlineRuns, patchPage, type ProposalPage, type IfFindLine } from "@/lib/proposal-pages";
import { drawAmount, type Draw, type ProposalDisplay } from "@/lib/proposal";

export type DocFile = { url: string; name: string };

const kicker: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "#9A4527" };
const chip: React.CSSProperties = { fontFamily: disp, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", border: "1px solid #E6DCC8", borderRadius: 999, padding: "2px 10px", background: "#fff", color: "#5E5A52", cursor: "pointer" };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ── At a glance

export function GlancePage({ title, total, draws, areas, start, display, setD }: {
  title: string; total: number | null; draws: Draw[]; areas: string[]; start: string | null;
  display: ProposalDisplay; setD: ((p: Partial<ProposalDisplay>) => void) | null;
}) {
  const pay = paymentLine(draws.map((d) => ({ when: d.when, pct: d.pct ?? null, amount: total && total > 0 ? drawAmount(d, total) : d.amt ?? null })));
  const valid = validLabel(display.valid_until);
  const cell = (k: string, v: React.ReactNode) => (
    <div style={{ borderTop: "1px solid #F1E9DA", paddingTop: 8 }}>
      <div style={{ ...kicker, color: "#8C8578", fontSize: 10 }}>{k}</div>
      <div style={{ fontSize: 13.5, marginTop: 2 }}>{v}</div>
    </div>
  );
  return (
    <>
      <div style={kicker}>{title}</div>
      <div style={{ fontFamily: strong, fontWeight: 700, fontSize: 48, lineHeight: 1.1, margin: "6px 0 12px", ...nums }}>{total !== null ? usd0(total) : "—"}</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {cell("Payment", pay)}
        {cell("Valid until", setD
          ? <>
              <input type="date" aria-label="Valid until" value={display.valid_until ?? ""} onChange={(e) => setD({ valid_until: e.target.value || undefined })}
                className="sc-no-print" style={{ border: "1px solid #E6DCC8", borderRadius: 3, padding: "1px 6px", font: "inherit" }} />
              <span className="sc-print-only">{valid ?? "—"}</span>
            </>
          : valid ?? "Ask us")}
        {cell("Included", areas.length ? areas.join(" · ") : "See the scope of work")}
        {cell("Start", start ?? "To be scheduled")}
      </div>
    </>
  );
}

// ── If we find…

export function IfFindPage({ title, lines, setD, onAdd }: { title: string; lines: IfFindLine[]; setD: ((p: Partial<ProposalDisplay>) => void) | null; onAdd?: () => void }) {
  const set = (id: string, patch: Partial<IfFindLine>) => setD?.({ ifind: lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  return (
    <>
      <div style={kicker}>{title}</div>
      <p style={{ fontSize: 12.5, margin: "4px 0 10px", color: "#5E5A52" }}>Some things can&apos;t be seen until the work starts. If we find any of these, this is what they cost. They are not in the total.</p>
      <div style={{ display: "grid", gap: 6 }}>
        {lines.map((l) => (
          <div key={l.id} className="flex items-baseline gap-2 flex-wrap" style={{ borderBottom: "1px solid #F1E9DA", paddingBottom: 6, fontSize: 13 }}>
            <div className="flex-1" style={{ minWidth: 160 }}>
              <b style={{ fontWeight: 600 }}>{l.name}</b>
              {l.note && <div style={{ fontSize: 11.5, color: "#5E5A52" }}>{l.note}</div>}
            </div>
            <span style={{ fontFamily: disp, fontSize: 9.5, letterSpacing: ".12em", color: "#8C8578", border: "1px solid #E6DCC8", borderRadius: 2, padding: "0 5px" }}>NOT IN TOTAL</span>
            {setD ? (
              <span className="flex items-baseline gap-1 sc-no-print">
                <span style={{ color: "#8C8578" }}>$</span>
                <input aria-label={`${l.name} price`} inputMode="decimal" defaultValue={l.sell.toFixed(2)}
                  onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) set(l.id, { sell: Math.round(n * 100) / 100 }); }}
                  style={{ width: 80, textAlign: "right", border: "1px solid #E6DCC8", borderRadius: 3, padding: "1px 4px", ...nums }} />
                <span style={{ color: "#5E5A52" }}>/ {l.unit || "each"}</span>
                <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setD({ ifind: lines.filter((x) => x.id !== l.id) })}
                  style={{ border: 0, background: "transparent", color: "#8C8578", cursor: "pointer", width: 20 }}>×</button>
              </span>
            ) : null}
            <span className={setD ? "sc-print-only" : undefined} style={{ ...nums, fontWeight: 600 }}>{usd(l.sell)} / {l.unit || "each"}</span>
          </div>
        ))}
        {!lines.length && <div style={{ color: "#8C8578", fontSize: 12.5 }}>Nothing listed yet.</div>}
      </div>
      {setD && onAdd && <div className="sc-no-print mt-2"><button type="button" style={chip} onClick={onAdd}>+ Add from the Price book</button></div>}
      <div style={{ fontSize: 11, color: "#8C8578", marginTop: 8 }}>Prices from your Price book. Used on the job, a line becomes a change order.</div>
    </>
  );
}

// ── A text page

function Runs({ text }: { text: string }) {
  return <>{inlineRuns(text).map((r, i) => (r.b ? <b key={i}>{r.t}</b> : r.i ? <i key={i}>{r.t}</i> : <React.Fragment key={i}>{r.t}</React.Fragment>))}</>;
}

export function TextBody({ body }: { body: string | undefined }) {
  const blocks = textBlocks(body);
  if (!blocks.length) return <div style={{ color: "#8C8578", fontSize: 13 }}>This page is empty.</div>;
  return (
    <div style={{ fontSize: 15, lineHeight: 1.6, color: "#1C2126" }}>
      {blocks.map((b, i) => b.t === "h"
        ? <h3 key={i} style={{ fontFamily: strong, fontWeight: 700, fontSize: 17, margin: i ? "14px 0 4px" : "0 0 4px" }}><Runs text={b.text!} /></h3>
        : b.t === "ul"
          ? <ul key={i} style={{ margin: "4px 0 8px 20px", padding: 0 }}>{b.items!.map((t, j) => <li key={j}><Runs text={t} /></li>)}</ul>
          : <p key={i} style={{ margin: "0 0 8px" }}><Runs text={b.text!} /></p>)}
    </div>
  );
}

export function TextEditor({ body, onChange, onDusty }: { body: string; onChange: (s: string) => void; onDusty?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [v, setV] = useState(body);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the box follows a body changed elsewhere
  useEffect(() => { setV(body); }, [body]);
  const commit = (s: string) => { setV(s); onChange(s); };
  // Wraps the selection, or starts the line it is on, then puts the caret back.
  const wrap = (mark: string) => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const sel = v.slice(a, b) || "text";
    commit(v.slice(0, a) + mark + sel + mark + v.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, a + mark.length + sel.length); });
  };
  const lineStart = (prefix: string) => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart;
    const s = v.lastIndexOf("\n", a - 1) + 1;
    const has = v.slice(s).startsWith(prefix);
    commit(has ? v.slice(0, s) + v.slice(s + prefix.length) : v.slice(0, s) + prefix + v.slice(s));
    requestAnimationFrame(() => el.focus());
  };
  const cellBtn: React.CSSProperties = { height: 28, minWidth: 28, padding: "0 8px", background: "#FAFBFC", border: "1px solid #E1E5EA", borderRadius: 5, cursor: "pointer", fontSize: 12.5, color: "#1C2126" };
  return (
    <>
      <div className="sc-no-print flex gap-1.5 flex-wrap" style={{ marginBottom: 8 }}>
        <button type="button" style={cellBtn} onClick={() => lineStart("# ")}>Heading</button>
        <button type="button" style={{ ...cellBtn, fontWeight: 700 }} onClick={() => wrap("**")} aria-label="Bold">B</button>
        <button type="button" style={{ ...cellBtn, fontStyle: "italic" }} onClick={() => wrap("_")} aria-label="Italic">I</button>
        <button type="button" style={cellBtn} onClick={() => lineStart("- ")}>• List</button>
        {onDusty && <button type="button" style={cellBtn} onClick={onDusty}>Ask Dusty</button>}
      </div>
      <textarea ref={ref} aria-label="Page text" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== body) onChange(v); }}
        placeholder={"Write this page. A blank line starts a new paragraph, \"# \" a heading, \"- \" a bullet."}
        style={{ width: "100%", minHeight: 260, fontSize: 15, lineHeight: 1.6, color: "#1C2126", border: "1px solid #E1E5EA", borderRadius: 5, padding: "10px 12px", fieldSizing: "content", resize: "vertical", font: "inherit" } as React.CSSProperties} />
    </>
  );
}

// ── A photos page

export function PhotosPage({ page, title, files, pages, setD, onAdd, onOpen }: {
  page: ProposalPage; title: string; files: Record<string, DocFile>; pages: ProposalPage[];
  setD: ((p: Partial<ProposalDisplay>) => void) | null; onAdd?: () => void; onOpen?: (i: number) => void;
}) {
  const list = (page.photos ?? []).filter((p) => files[p.id]);
  const across = page.across ?? 2;
  const set = (patch: Partial<ProposalPage>) => setD?.({ pages: patchPage(pages, page.id, patch) });
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div style={kicker}>{title}</div>
        <span className="flex-1" />
        {setD && (
          <span className="sc-no-print flex items-center gap-1" style={{ fontSize: 11.5, color: "#5E5A52" }}>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => set({ across: n as 1 | 2 | 3 })} aria-pressed={across === n}
                style={{ ...chip, padding: "1px 8px", background: across === n ? "#2A2A2A" : "#fff", color: across === n ? "#fff" : "#5E5A52" }}>{n} across</button>
            ))}
          </span>
        )}
      </div>
      {setD && <div className="sc-no-print" style={{ fontSize: 11.5, color: "#8C8578", margin: "2px 0 8px" }}>{list.length} photo{list.length === 1 ? "" : "s"} · captions print with them</div>}
      <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))` }}>
        {list.map((ph, i) => (
          <figure key={ph.id} style={{ margin: 0, breakInside: "avoid" }}>
            <div style={{ position: "relative", aspectRatio: "4 / 3", maxWidth: "100%", background: "#E9E4DA", borderRadius: 3, overflow: "hidden" }}>
              <button type="button" onClick={() => onOpen?.(i)} aria-label={`Open ${files[ph.id].name}`} style={{ position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", cursor: onOpen ? "zoom-in" : "default" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed link, printed */}
                <img src={files[ph.id].url} alt={ph.caption || files[ph.id].name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
              {setD && (
                <button type="button" aria-label="Take this photo off the page" className="sc-no-print"
                  onClick={() => set({ photos: (page.photos ?? []).filter((x) => x.id !== ph.id) })}
                  style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 999, border: 0, background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer" }}>×</button>
              )}
            </div>
            {setD ? (
              <>
                <input aria-label="Caption" defaultValue={ph.caption ?? ""} placeholder="Caption"
                  onBlur={(e) => { const c = e.target.value.trim(); if (c !== (ph.caption ?? "")) set({ photos: (page.photos ?? []).map((x) => (x.id === ph.id ? { ...x, caption: c || undefined } : x)) }); }}
                  className="sc-no-print" style={{ width: "100%", marginTop: 4, fontSize: 13, border: "1px dashed transparent", borderBottomColor: "#E1E5EA", padding: "2px 0", background: "transparent" }} />
                {ph.caption && <figcaption className="sc-print-only" style={{ fontSize: 13 }}>{ph.caption}</figcaption>}
              </>
            ) : ph.caption ? <figcaption style={{ fontSize: 13, marginTop: 4 }}>{ph.caption}</figcaption> : null}
          </figure>
        ))}
        {setD && onAdd && (
          <button type="button" onClick={onAdd} className="sc-no-print"
            style={{ aspectRatio: "4 / 3", maxWidth: "100%", border: "1px dashed #C9BDA6", borderRadius: 3, background: "transparent", color: "#8C8578", fontSize: 12.5, cursor: "pointer", padding: 10 }}>
            + Add photos from the job
          </button>
        )}
      </div>
      {!list.length && !setD && <div style={{ color: "#8C8578", fontSize: 12.5 }}>No photos.</div>}
    </>
  );
}

// ── An attached PDF

/** How many pages a PDF has, opened once per visit. */
function usePdfPages(fileId: string | undefined, url: string | undefined) {
  const [n, setN] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!fileId || !url) return;
    let live = true;
    openPdf(fileId, url).then((d) => { if (live) setN(d.numPages); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [fileId, url]);
  return { n, err };
}

function PdfThumb({ fileId, url, page, width, faded }: { fileId: string; url: string; page: number; width: number; faded?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    pageThumb(fileId, url, page, width).then((s) => { if (live) setSrc(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [fileId, url, page, width]);
  return (
    <div style={{ aspectRatio: "8.5 / 11", maxWidth: "100%", background: "#F4F1EA", border: "1px solid #E6DCC8", opacity: faded ? 0.3 : 1, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn in the browser from the PDF */}
      {src && <img src={src} alt={`Page ${page}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />}
    </div>
  );
}

export function PdfPage({ page, title, file, pages, setD, onPick }: {
  page: ProposalPage; title: string; file: DocFile | null; pages: ProposalPage[];
  setD: ((p: Partial<ProposalDisplay>) => void) | null; onPick?: () => void;
}) {
  const { n, err } = usePdfPages(page.file, file?.url);
  const skip = new Set(page.skip ?? []);
  const count = Math.min(n ?? 0, 40);
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  const toggle = (p: number) => {
    const next = new Set(skip);
    if (next.has(p)) next.delete(p); else next.add(p);
    setD?.({ pages: patchPage(pages, page.id, { skip: [...next].sort((a, b) => a - b) }) });
  };
  if (!page.file || !file) {
    return (
      <>
        <div style={kicker}>{title}</div>
        <div style={{ color: "#8C8578", fontSize: 13, marginTop: 6 }}>{setD ? "No file picked yet." : "Document not attached."}</div>
        {setD && onPick && <div className="sc-no-print mt-2"><button type="button" style={chip} onClick={onPick}>Pick a PDF from the job&apos;s files</button></div>}
      </>
    );
  }
  if (!setD) {
    // The customer's copy: each page kept, as its own sheet.
    return (
      <>
        <div className="sc-no-print" style={kicker}>{title}</div>
        {err && <div style={{ color: "#8C8578", fontSize: 12.5 }}>This document couldn&apos;t be shown here.</div>}
        <div className="flex flex-col gap-3 mt-2">
          {nums.filter((p) => !skip.has(p)).map((p, i) => (
            <div key={p} style={{ breakBefore: i ? "page" : undefined }}><PdfThumb fileId={page.file!} url={file.url} page={p} width={1100} /></div>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div style={kicker}>{title}</div>
      <div className="flex items-center gap-2 flex-wrap" style={{ margin: "4px 0 10px", fontSize: 13 }}>
        <b style={{ fontWeight: 600 }}>{file.name}</b>
        {onPick && <button type="button" className="sc-no-print" style={chip} onClick={onPick}>Change</button>}
      </div>
      {err && <div style={{ color: "#8E2B1C", fontSize: 12.5 }}>This PDF wouldn&apos;t open.</div>}
      {n !== null && (
        <>
          <div style={{ ...kicker, color: "#8C8578", fontSize: 10 }}>Pages to include</div>
          <div className="flex gap-1 flex-wrap mt-1 mb-3">
            {nums.map((p) => {
              const on = !skip.has(p);
              return (
                <button key={p} type="button" onClick={() => toggle(p)} aria-pressed={on} aria-label={`Page ${p} ${on ? "included" : "left out"}`}
                  style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${on ? "#1E5AA8" : "#E1E5EA"}`, background: on ? "#1E5AA8" : "#fff", color: on ? "#fff" : "#5E5A52", fontSize: 12, cursor: "pointer" }}>{p}</button>
              );
            })}
            {(n ?? 0) > 40 && <span style={{ fontSize: 11.5, color: "#8C8578", alignSelf: "center" }}>first 40 of {n}</span>}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
            {nums.map((p) => <PdfThumb key={p} fileId={page.file!} url={file.url} page={p} width={240} faded={skip.has(p)} />)}
          </div>
        </>
      )}
      <div style={{ fontSize: 11, color: "#8C8578", marginTop: 8 }}>Prints as its own pages, in this spot. Nothing on it is read into the price.</div>
    </>
  );
}
