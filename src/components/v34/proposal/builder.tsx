"use client";
/**
 * The proposal builder's own pieces (Claude Design "Proposal Builder v2", 2026-10-23): the page list
 * with its ⋯ menu and drag to reorder, + Add page, the editor's head (title, source, switched-off
 * banner), Pull in, the pickers, the check before sending and the undo toast. The rules — what a
 * page is, how the list changes — are src/lib/proposal-pages.ts; the pages themselves are drawn by
 * document.tsx.
 */
import React, { useEffect, useRef, useState } from "react";
import { T, disp } from "@/lib/v34/tokens";
import {
  BUILT, duplicatePage, isBuilt, makePage, missingBuilt, movePage, patchPage, removePage, sourceOf, stepPage,
  type PageKind, type ProposalPage, type SendFinding,
} from "@/lib/proposal-pages";

const kicker: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: T.ink3 };
const tag = (bg: string, fg: string): React.CSSProperties => ({ height: 18, padding: "0 5px", borderRadius: 2, background: bg, color: fg, fontSize: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", letterSpacing: ".04em" });

export type Undoable = (text: string, before: ProposalPage[], after: ProposalPage[], open?: string | null) => void;

/** The page list: number, name, Off / New, ⋯ — tap opens, drag reorders (a mouse), ⋯ does the rest. */
export function PageColumn({ pages, openId, onOpen, editable, change, onAdd, onSaveTemplate }: {
  pages: ProposalPage[]; openId: string | null; onOpen: (id: string) => void; editable: boolean;
  /** Every change to the list goes through here, with its words for the undo toast. */
  change: Undoable; onAdd: (el: HTMLElement) => void; onSaveTemplate: (p: ProposalPage) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  return (
    <div role="list" aria-label="Pages">
      {pages.map((p, i) => {
        const open = p.id === openId;
        return (
          <div key={p.id} role="listitem" draggable={editable && renaming !== p.id}
            onDragStart={(e) => { setDrag(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
            onDragOver={(e) => { if (drag && drag !== p.id) { e.preventDefault(); setOver(p.id); } }}
            onDragLeave={() => setOver((x) => (x === p.id ? null : x))}
            onDrop={(e) => { e.preventDefault(); if (drag && drag !== p.id) change(`Moved "${pages.find((x) => x.id === drag)?.label}"`, pages, movePage(pages, drag, p.id)); setDrag(null); setOver(null); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            className="group relative flex items-center gap-2"
            style={{ height: 32, paddingLeft: 8, paddingRight: 4, cursor: "pointer", background: open ? T.sunk : "transparent", boxShadow: `${open ? `inset 3px 0 0 ${T.hiviz}` : ""}${over === p.id ? `${open ? "," : ""}inset 0 2px 0 ${T.chalk}` : ""}` || undefined, opacity: drag === p.id ? 0.4 : 1 }}
            onClick={() => renaming !== p.id && onOpen(p.id)}>
            <span style={{ width: 18, textAlign: "right", fontFamily: disp, fontSize: 11, fontWeight: 600, color: T.ink3 }}>{i + 1}</span>
            {renaming === p.id ? (
              <RenameInput value={p.label} onDone={(v) => { setRenaming(null); if (v !== null && v.trim() && v.trim() !== p.label) change(`Renamed "${p.label}"`, pages, patchPage(pages, p.id, { label: v.trim().slice(0, 80) })); }} />
            ) : (
              <span className="flex-1 truncate" style={{ fontSize: 12.5, color: p.off ? T.ink3 : T.ink, fontWeight: open ? 600 : 400 }}>{p.label || "Untitled"}</span>
            )}
            {p.isNew && !p.off && <span style={tag(T.hivizDim, T.hivizText)}>New</span>}
            {/* Each page switched on or off from its row (Coy, 2026-10-24: "toggle on/off pages"). */}
            {editable ? (
              <MiniSwitch on={!p.off} label={`${p.off ? "Switch on" : "Switch off"} ${p.label || "this page"}`}
                onChange={(on) => change(on ? `Switched on "${p.label}"` : `Switched off "${p.label}"`, pages, patchPage(pages, p.id, { off: on ? undefined : true }))} />
            ) : p.off && <span style={tag(T.card, T.ink3)}>Off</span>}
            {editable && (
              <button aria-label={`More for ${p.label}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}
                className="opacity-40 group-hover:opacity-100" style={{ width: 22, height: 22, color: T.ink2, opacity: open || menu === p.id ? 1 : undefined }}>⋯</button>
            )}
            {menu === p.id && (
              <Popover onClose={() => setMenu(null)} style={{ right: 4, top: 30, width: 216 }}>
                <MenuItem onClick={() => { setMenu(null); setRenaming(p.id); }}>Rename</MenuItem>
                {!isBuilt(p.kind) && <MenuItem onClick={() => { setMenu(null); const d = duplicatePage(pages, p.id); if (d.id) change(`Duplicated "${p.label}"`, pages, d.pages, d.id); }}>Duplicate</MenuItem>}
                <MenuItem onClick={() => { setMenu(null); change(p.off ? `Switched on "${p.label}"` : `Switched off "${p.label}"`, pages, patchPage(pages, p.id, { off: p.off ? undefined : true })); }}>
                  {p.off ? "Switch on" : "Switch off"} <span style={{ color: T.ink3, fontSize: 11.5 }}>{p.off ? "" : "· hide from customer"}</span>
                </MenuItem>
                {i > 0 && <MenuItem onClick={() => { setMenu(null); change(`Moved "${p.label}" up`, pages, stepPage(pages, p.id, -1)); }}>Move up</MenuItem>}
                {i < pages.length - 1 && <MenuItem onClick={() => { setMenu(null); change(`Moved "${p.label}" down`, pages, stepPage(pages, p.id, 1)); }}>Move down</MenuItem>}
                {(p.kind === "text") && <MenuItem onClick={() => { setMenu(null); onSaveTemplate(p); }}>Save as template…</MenuItem>}
                <div style={{ borderTop: `1px solid ${T.hair}`, margin: "4px 0" }} />
                <MenuItem danger onClick={() => {
                  setMenu(null);
                  const next = removePage(pages, p.id);
                  change(`Deleted "${p.label}"`, pages, next, open ? (next[Math.max(0, i - 1)]?.id ?? null) : undefined);
                }}>Delete page</MenuItem>
              </Popover>
            )}
          </div>
        );
      })}
      {editable && (
        <button onClick={(e) => onAdd(e.currentTarget)} className="w-full flex items-center gap-2 text-left" style={{ height: 34, paddingLeft: 8, color: T.ink3, fontSize: 12.5 }}>
          <span style={{ width: 18, height: 18, marginLeft: 0, border: `1px dashed ${T.ink3}`, borderRadius: 3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>+</span>
          Add page
        </button>
      )}
    </div>
  );
}

function RenameInput({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (x: string | null) => { if (done.current) return; done.current = true; onDone(x); };
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()} maxLength={80}
      onKeyDown={(e) => { if (e.key === "Enter") finish(v); if (e.key === "Escape") finish(null); }} onBlur={() => finish(v)}
      className="flex-1" style={{ minWidth: 0, height: 24, fontSize: 12.5, border: `1px solid ${T.chalk}`, borderRadius: 3, padding: "0 6px", background: T.card, color: T.ink }} />
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="w-full text-left hover:bg-black/5"
      style={{ display: "block", padding: "7px 12px", fontSize: 13, color: danger ? T.red : T.ink }}>{children}</button>
  );
}

/** A small card that closes on a click outside it or Esc. */
export function Popover({ children, onClose, style }: { children: React.ReactNode; onClose: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} className="absolute z-30"
      style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 8, boxShadow: "0 18px 50px rgba(0,0,0,.22)", padding: "4px 0", ...style }}>{children}</div>
  );
}

export type AddPick = { kind: PageKind; then?: "photos" | "pdf" | "upload" };

/** + Add page: what can go after the open page. Pages from the job stay linked to it. */
function Row({ glyph, tint, title, sub, onClick, off }: { glyph: string; tint: "live" | "job" | "own"; title: string; sub?: string; onClick?: () => void; off?: boolean }) {
  const [bg, fg] = tint === "live" ? [T.greenDim, T.green] : tint === "job" ? [T.chalkDim, T.chalk] : [T.sunk, T.ink2];
  return (
    <button disabled={off} onClick={onClick} className="w-full flex items-center gap-2.5 text-left hover:bg-black/5" style={{ minHeight: 40, padding: "4px 12px", opacity: off ? 0.5 : 1 }}>
      <span style={{ width: 28, height: 28, borderRadius: 5, background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, flex: "none" }}>{glyph}</span>
      <span className="min-w-0"><span style={{ display: "block", fontSize: 13, color: T.ink }}>{title}</span>{sub && <span style={{ display: "block", fontSize: 11.5, color: T.ink3 }}>{sub}</span>}</span>
    </button>
  );
}

export function AddPageMenu({ after, pages, hasPhotos, hasPdfs, onPick, onClose, style }: {
  after: string; pages: ProposalPage[]; hasPhotos: boolean; hasPdfs: boolean; onPick: (p: AddPick) => void; onClose: () => void; style?: React.CSSProperties;
}) {
  const missing = missingBuilt(pages);
  const group = (t: string) => <div style={{ ...kicker, padding: "8px 12px 2px" }}>{t}</div>;
  return (
    <Popover onClose={onClose} style={{ width: "min(380px, calc(100vw - 24px))", maxHeight: "70vh", overflowY: "auto", ...style }}>
      <div style={{ padding: "8px 12px 4px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Add a page after &ldquo;{after}&rdquo;</div>
        <div style={{ fontSize: 11.5, color: T.ink3 }}>Pages from the job stay linked to it.</div>
      </div>
      {group("From this job")}
      <Row glyph="▦" tint="job" title="Photos page" sub={hasPhotos ? "Pick from the job's photos" : "No photos on the job yet — add some on the job page"} onClick={() => onPick({ kind: "photos", then: "photos" })} />
      <Row glyph="⎙" tint="own" title="Vendor quote or file" sub={hasPdfs ? "A PDF from the job's files, as its own pages" : "No PDFs on the job yet — upload one below"} off={!hasPdfs} onClick={() => onPick({ kind: "pdf", then: "pdf" })} />
      {missing.map((m) => <Row key={m.kind} glyph={m.kind === "ifind" ? "?" : m.kind === "glance" ? "◎" : "▤"} tint={sourceOf(m).tint} title={m.label} sub={m.about} onClick={() => onPick({ kind: m.kind })} />)}
      {group("Your templates")}
      <div style={{ padding: "2px 12px 6px", fontSize: 12, color: T.ink3 }}>Pages you save with ⋯ → Save as template show here once page templates are switched on (a database change, waiting on your OK).</div>
      {group("Start fresh")}
      <Row glyph="T" tint="own" title="Blank text page" onClick={() => onPick({ kind: "text" })} />
      <Row glyph="↑" tint="own" title="Upload a PDF" sub="Saved to the job's files" onClick={() => onPick({ kind: "pdf", then: "upload" })} />
    </Popover>
  );
}

/** A small on/off switch for the builder's chrome (the document has its own). */
export function MiniSwitch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className="shrink-0" style={{ width: 26, height: 15, borderRadius: 999, background: on ? T.green : T.hair, position: "relative", border: 0, padding: 0, cursor: "pointer" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 13 : 2, width: 11, height: 11, borderRadius: 999, background: "#fff", transition: "left .12s" }} />
    </button>
  );
}

/** Over the open page: its title (renames it), where it comes from, its on/off switch, the sections
 *  on it that switch on and off by themselves, and the switched-off banner. */
export function EditorHead({ page, editable, who, onRename, onSwitchOn, onSwitchOff, sections, onPart }: {
  page: ProposalPage; editable: boolean; who: string; onRename: (s: string) => void; onSwitchOn: () => void; onSwitchOff: () => void;
  sections: Array<{ key: string; label: string; off: boolean }>; onPart: (key: string, on: boolean) => void;
}) {
  const [v, setV] = useState(page.label);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the box follows a rename made elsewhere
  useEffect(() => setV(page.label), [page.id, page.label]);
  const src = sourceOf(page);
  const [bg, fg] = src.tint === "live" ? [T.greenDim, T.green] : src.tint === "job" ? [T.chalkDim, T.chalk] : [T.sunk, T.ink2];
  return (
    <div className="sc-no-print" style={{ maxWidth: 720, margin: "0 auto 10px" }}>
      <div className="flex items-center gap-2">
        <input value={v} disabled={!editable} onChange={(e) => setV(e.target.value)} maxLength={80} aria-label="Page title"
          onBlur={() => { if (v.trim() && v.trim() !== page.label) onRename(v.trim()); else setV(page.label); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(page.label); (e.target as HTMLInputElement).blur(); } }}
          className="flex-1 sc-page-title-input" style={{ minWidth: 0, background: "transparent", border: 0, borderBottom: "1px dashed transparent", fontFamily: disp, fontSize: 14, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "#7B8590", padding: "2px 0" }} />
        <span style={{ ...tag(bg, fg), fontSize: 10.5 }}>{src.label}</span>
        {editable && (
          <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: T.ink2 }}>
            {page.off ? "Off" : "On"}
            <MiniSwitch on={!page.off} label={page.off ? "Switch this page on" : "Switch this page off"} onChange={(on) => (on ? onSwitchOn() : onSwitchOff())} />
          </label>
        )}
      </div>
      {editable && sections.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, color: T.ink3 }}>On this page:</span>
          {sections.map((x) => (
            <button key={x.key} type="button" role="switch" aria-checked={!x.off} onClick={() => onPart(x.key, x.off)}
              title={x.off ? `${x.label} is hidden — tap to show it` : `Tap to hide ${x.label.toLowerCase()} from the customer`}
              style={{ fontSize: 11.5, borderRadius: 999, padding: "2px 9px", border: `1px solid ${x.off ? T.hair : T.green}`, background: x.off ? "transparent" : T.greenDim, color: x.off ? T.ink3 : T.green, textDecoration: x.off ? "line-through" : "none", cursor: "pointer" }}>
              {x.off ? "○" : "✓"} {x.label}
            </button>
          ))}
        </div>
      )}
      {page.off && (
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8, padding: "8px 12px", background: T.sunk, borderRadius: 4, fontSize: 12.5, color: T.ink2 }}>
          <span className="flex-1">Switched off — {who} won&apos;t see this page. It stays here for next time.</span>
          {editable && <button onClick={onSwitchOn} style={{ fontWeight: 600, color: T.chalk }}>Switch on</button>}
        </div>
      )}
    </div>
  );
}

/** Pull in: the job's photos and files, onto the open page or as new pages. */
export function PullIn({ photos, pdfs, areas, used, onPhoto, onPdf, onClose, budgetHref }: {
  photos: Array<{ id: string; name: string | null; url: string | null; when: string | null }>;
  pdfs: Array<{ id: string; name: string | null; category: string | null }>;
  areas: string[]; used: Set<string>;
  onPhoto: (id: string) => void; onPdf: (id: string) => void; onClose: () => void; budgetHref: string;
}) {
  const [tab, setTab] = useState<"photos" | "scope" | "quotes" | "files">("photos");
  const quotes = pdfs.filter((f) => f.category === "vendor_quote" || f.category === "bid");
  const files = pdfs.filter((f) => !(f.category === "vendor_quote" || f.category === "bid"));
  const hint = { photos: "Adds to the open photos page, else makes a Photos page.", scope: "Areas come from the Budget and update with it.", quotes: "A quote comes in as its own pages. It never touches the price.", files: "A file comes in as its own pages, in this spot." }[tab];
  const pdfRow = (f: { id: string; name: string | null }) => (
    <div key={f.id} className="flex items-center gap-2" style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairSoft}` }}>
      <span className="flex-1 truncate" style={{ fontSize: 13, color: T.ink }}>{f.name || "File"}</span>
      <button onClick={() => onPdf(f.id)} disabled={used.has(f.id)} style={{ fontSize: 12, fontWeight: 600, color: used.has(f.id) ? T.ink3 : T.chalk }}>{used.has(f.id) ? "Added" : "Add as page"}</button>
    </div>
  );
  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <div className="flex items-center" style={{ borderBottom: `1px solid ${T.hair}`, padding: "0 8px" }}>
        {(["photos", "scope", "quotes", "files"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} style={{ height: 34, padding: "0 8px", fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: tab === k ? T.ink : T.ink3, boxShadow: tab === k ? `inset 0 -2px 0 ${T.hiviz}` : undefined }}>{k}</button>
        ))}
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close Pull in" style={{ color: T.ink3, fontSize: 16, padding: "0 4px" }}>×</button>
      </div>
      <div style={{ padding: "6px 12px", fontSize: 11.5, color: T.ink3 }}>{hint}</div>
      <div className="flex-1 overflow-y-auto" style={{ padding: "0 12px 16px" }}>
        {tab === "photos" && (photos.length ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {photos.filter((f) => f.url).map((f) => (
              <div key={f.id} style={{ opacity: used.has(f.id) ? 0.5 : 1 }}>
                <div style={{ aspectRatio: "4/3", background: `#ddd url("${f.url}") center/cover`, borderRadius: 3 }} title={f.name ?? ""} />
                <div className="flex items-center" style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                  <span className="flex-1 truncate">{f.when ?? ""}</span>
                  <button onClick={() => onPhoto(f.id)} disabled={used.has(f.id)} style={{ fontWeight: 600, color: used.has(f.id) ? T.ink3 : T.chalk }}>{used.has(f.id) ? "Added" : "+ Add"}</button>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty>No photos on this job yet. Each area on the job page has Photos, and the Camera files shots on the job.</Empty>)}
        {tab === "scope" && (
          <>
            {areas.map((a, i) => <div key={i} className="flex items-center" style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairSoft}`, fontSize: 13, color: T.ink }}><span className="flex-1 truncate">{a}</span><span style={{ fontSize: 12, color: T.green }}>On Scope ✓</span></div>)}
            {!areas.length && <Empty>No areas on the budget yet.</Empty>}
            <a href={budgetHref} style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, color: T.chalk }}>Open Budget ↗</a>
          </>
        )}
        {tab === "quotes" && (quotes.length ? quotes.map(pdfRow) : <Empty>No vendor quotes filed on this job. A PDF filed as a vendor quote or bid shows here.</Empty>)}
        {tab === "files" && (files.length ? files.map(pdfRow) : <Empty>No PDFs on this job yet.</Empty>)}
      </div>
    </div>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12.5, color: T.ink3, padding: "10px 0" }}>{children}</div>;

/** A modal card in the middle of the screen. */
export function Modal({ title, children, onClose, width = 560, foot }: { title: string; children: React.ReactNode; onClose: () => void; width?: number; foot?: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="sc-no-print fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.4)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} className="rounded-lg flex flex-col" style={{ background: T.card, width: `min(${width}px, 94vw)`, maxHeight: "84vh" }}>
        <div className="flex items-center" style={{ padding: "12px 14px 8px" }}><b style={{ color: T.ink, fontSize: 15 }}>{title}</b><span className="flex-1" /><button onClick={onClose} aria-label="Close" style={{ color: T.ink3, fontSize: 18 }}>×</button></div>
        <div className="overflow-y-auto" style={{ padding: "0 14px 12px" }}>{children}</div>
        {foot && <div className="flex items-center justify-end gap-2" style={{ padding: "10px 14px", borderTop: `1px solid ${T.hair}` }}>{foot}</div>}
      </div>
    </div>
  );
}

/** The check before sending: each finding with Go to; Send anyway or Fix first. */
export function SendCheck({ findings, label, onGo, onSend, onClose }: {
  findings: SendFinding[]; label: (id: string | null) => string; onGo: (id: string) => void; onSend: () => void; onClose: () => void;
}) {
  return (
    <Modal title={`${findings.length} ${findings.length === 1 ? "thing" : "things"} to look at before sending`} onClose={onClose} width={520}
      foot={<>
        <button onClick={onSend} style={{ height: 32, padding: "0 12px", fontSize: 13, color: T.ink2 }}>Send anyway</button>
        <button onClick={onClose} className="rounded" style={{ height: 32, padding: "0 14px", background: T.hiviz, color: T.onHiviz, fontWeight: 600, fontSize: 13 }}>Fix first</button>
      </>}>
      {findings.map((f, i) => (
        <div key={i} className="flex items-center gap-2.5" style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairSoft}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: f.tone === "red" ? T.red : "#C08A2E", flex: "none" }} />
          <span className="flex-1" style={{ fontSize: 13, color: T.ink }}>{f.what}<span style={{ display: "block", fontSize: 11.5, color: T.ink3 }}>{label(f.page)}</span></span>
          {f.page && <button onClick={() => onGo(f.page!)} style={{ fontSize: 12.5, fontWeight: 600, color: T.chalk }}>Go to</button>}
        </div>
      ))}
    </Modal>
  );
}

/** What happened, with Undo, for four seconds. */
export function UndoToast({ text, onUndo, onDone }: { text: string; onUndo?: () => void; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [text, onDone]);
  return (
    <div className="sc-no-print fixed z-50 flex items-center gap-4" role="status"
      style={{ left: "50%", transform: "translateX(-50%)", bottom: "calc(var(--sc-foot, 0px) + 20px)", background: "#1C2126", color: "#fff", fontSize: 13, padding: "10px 16px", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.25)", maxWidth: "calc(100vw - 32px)" }}>
      <span className="truncate">{text}</span>
      {onUndo && <button onClick={() => { onUndo(); onDone(); }} style={{ color: "#9CC3FF", fontWeight: 600 }}>Undo</button>}
    </div>
  );
}

/** A new page from a pick, with its name; built pages keep their own name. */
export function pageFromPick(pick: AddPick, pages: ProposalPage[]): ProposalPage {
  const b = BUILT.find((x) => x.kind === pick.kind);
  return makePage(pick.kind, pages.map((p) => p.id), b ? {} : pick.kind === "text" ? { label: "New page", body: "" } : {});
}
