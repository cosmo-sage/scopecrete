"use client";

/**
 * The record page's pieces — one look for a customer, a contact and a vendor
 * (Coy, 2026-10-05: "I would rather have consistent formatting across
 * contact, customer and vendor … Right now the customer page is the most
 * developed. Can we apply that to the 'contact' and vendor pages as well?").
 *
 * The customer page (customer-page.tsx) set the shape; the contact's own page
 * (person-view.tsx) and the vendor page (vendors.tsx) use the same parts:
 *  - RecordHeader: ‹ back link · name and role tag · the button row (Edit ·
 *    New job · Ask Dusty …; on a phone they fold into ⋯) · the one-line facts
 *    · a slot under it · ONE row of tabs.
 *  - PanelCard / panelTitle / Facts / AddressRow — the right column's cards.
 *  - ContactCard — a person with a line per number and email, "Open in Threads ›".
 *  - ThreadChips — their bucket and every thread Coy made that holds them.
 *  - SectionHead, Empty, RecentCard, JobRow — the Overview's parts.
 */

import React, { useRef, useState } from "react";
import Link from "next/link";
import { T, F, disp, eyebrow, nums, clip, formatPhone, strong, light } from "@/lib/v34/tokens";
import { InitialsBox } from "@/components/v34/thread-list";
import { MenuButton, SlideDrawer } from "@/components/v34/primitives";
import { DustyEmblem } from "@/components/v34/dusty-avatar";

export const lbl: React.CSSProperties = { fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" };
export const panelTitle: React.CSSProperties = { fontFamily: light, fontWeight: 300, fontSize: 20, margin: 0, color: T.ink };

export function btn(primary?: boolean): React.CSSProperties {
  return { ...lbl, height: 32, padding: "0 12px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center",
    background: primary ? T.hiviz : T.card, color: primary ? T.onHiviz : T.ink, border: primary ? "none" : `1px solid ${T.hairStrong}`, textDecoration: "none" };
}

/** A row in the ⋯ menu — buttons and links alike. */
export const menuItem: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: F.sm, color: T.ink, background: "transparent", border: "none", cursor: "pointer", textDecoration: "none", display: "block" };

export async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

/** A header button: on a wide page in the row, on a narrow one in ⋯. */
export interface RecordAction {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Hi-viz fill — the page's main action (New job, + Receipt or quote). */
  primary?: boolean;
  /** Outlined in hi-viz — Ask Dusty. */
  accent?: boolean;
  disabled?: boolean;
  title?: string;
}

const askDusty: RecordAction = { label: "Ask Dusty", accent: true, onClick: () => window.dispatchEvent(new Event("sc:dusty-open")) };
/** Ask Dusty opens him HOT on the page that is open. */
export const ASK_DUSTY = askDusty;

export function RecordHeader({ back, title, wide, actions, menu, meta, children, tabs, tab, onTab, emblem }: {
  back: { href: string; label: string };
  /** The name — a heading, or the contact's NameEditor with its pencil. */
  title: React.ReactNode;
  wide: boolean;
  actions: RecordAction[];
  /** Always under ⋯ (Call notes, File as…, Delete …). Elements keep the menu open (an ArchiveButton's dialog lives in it). */
  menu?: Array<RecordAction | React.ReactElement>;
  meta: string;
  /** Under the facts line: notes, a filing strip. */
  children?: React.ReactNode;
  tabs: Array<[string, string]>;
  tab: string;
  onTab: (k: string) => void;
  /** The ScopeCrete emblem as its own button beside ⋯ on every size — opens Dusty (Coy, 2026-10-10: the customer page). */
  emblem?: { onClick: () => void; title: string };
}) {
  const [more, setMore] = useState(false);
  // The tab's word, without its count ("Jobs 2" → "Jobs").
  const tabLabel = (tabs.find(([k]) => k === tab)?.[1] ?? "").replace(/\s+\d+$/, "");
  const [tabMenu, setTabMenu] = useState(false);
  // The ☰ panel opens under this header (Coy, 2026-10-06: "let this slide out
  // panel sit below the … page header"), or under the dashboard header when
  // this one has scrolled away.
  const box = useRef<HTMLDivElement>(null);
  const [drawerTop, setDrawerTop] = useState<number | null>(null);
  const openTabs = () => {
    // --sc-head is a calc() (the View-as banner is added to it), so read the header's own bottom.
    const head = Math.max(0, document.querySelector(".sc-head-wrap")?.getBoundingClientRect().bottom ?? 0);
    const bottom = box.current?.getBoundingClientRect().bottom ?? head;
    setDrawerTop(Math.max(head, Math.round(bottom)));
    setTabMenu(true);
  };
  const pill: React.CSSProperties = { ...btn(), height: 30 };
  const style = (a: RecordAction): React.CSSProperties => a.primary ? { ...btn(true), height: 30, opacity: a.disabled ? 0.5 : 1 }
    : a.accent ? { ...pill, border: `1px solid ${T.hiviz}`, color: T.hiviz } : { ...pill, opacity: a.disabled ? 0.5 : 1 };
  const inMenu = [...(wide ? [] : actions), ...(menu ?? [])];
  const item = (a: RecordAction | React.ReactElement, i: number) => {
    if (React.isValidElement(a)) return <React.Fragment key={`n${i}`}>{a}</React.Fragment>;
    const x = a as RecordAction;
    return x.href
      ? <Link key={x.label} href={x.href} onClick={() => setMore(false)} style={menuItem}>{x.label}</Link>
      : <button key={x.label} disabled={x.disabled} title={x.title} onClick={() => { setMore(false); x.onClick?.(); }} style={{ ...menuItem, opacity: x.disabled ? 0.5 : 1 }}>{x.label}</button>;
  };
  return (
    // Fixed at the top of the page (Coy, 2026-10-09: "the headers here in the
    // customer page should be fixed and not slide up"); it rides up to the top when the dashboard header slides away.
    <div ref={box} className="px-4 pt-3 sticky z-20" style={{ top: "var(--sc-head)", background: T.card, borderBottom: `1px solid ${T.hair}` }}>
      {/* One line, like the main pages' subheader (Coy, 2026-10-11): "‹ Customers • Arts Apartments • Overview",
          a green dot between each. The back link is always the list; no role tag. */}
      <div className="flex items-center gap-2">
        {!wide && tabs.length > 1 && <MenuButton onClick={openTabs} label="Sections of this page" always />}
        <div className="flex items-center flex-1 min-w-0" style={{ gap: wide ? 8 : 6 }}>
          <Link href={back.href} className="sc-back-link" style={{ ...eyebrow, color: T.chalk, flexShrink: 0, fontSize: wide ? 12 : 11 }}>‹ {back.label}</Link>
          <span className="sc-subhead-sep sc-back-link" aria-hidden="true" />
          <div style={{ minWidth: 0, flexShrink: 1, ...clip }}>
            {typeof title === "string"
              ? <h1 style={{ fontFamily: strong, fontWeight: 700, fontSize: wide ? 20 : 16, lineHeight: 1.2, margin: 0, color: T.ink, ...clip }}>{title}</h1>
              : title}
          </div>
          {tabs.length > 0 && <span className="sc-subhead-sep" aria-hidden="true" />}
          {tabs.length > 0 && (
            !wide && tabs.length > 1
              ? <button onClick={openTabs} style={{ ...eyebrow, color: T.ink2, cursor: "pointer", flexShrink: 0, fontSize: 11 }}>{tabLabel} ▾</button>
              : <span style={{ ...eyebrow, color: T.ink2, flexShrink: 0, fontSize: wide ? 12 : 11 }}>{tabLabel}</span>
          )}
        </div>
        <div className="flex gap-1.5 items-center shrink-0">
          {wide && actions.map((a) => a.href
            ? <Link key={a.label} href={a.href} title={a.title} style={style(a)}>{a.label}</Link>
            : <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title} style={style(a)}>{a.label}</button>)}
          {emblem && (
            <button onClick={emblem.onClick} aria-label={emblem.title} title={emblem.title}
              style={{ ...pill, padding: "0 4px", width: 34, justifyContent: "center" }}>
              <DustyEmblem size={24} hidden />
            </button>
          )}
          {inMenu.length > 0 && (
            <div className="relative">
              <button onClick={() => setMore((v) => !v)} aria-label="More" aria-expanded={more} style={{ ...pill, padding: "0 9px" }}>⋯</button>
              {more && (
                <div className="absolute right-0 z-20 flex flex-col rounded" style={{ top: 34, minWidth: 200, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
                  {inMenu.map(item)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {wide && meta && <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, ...nums, whiteSpace: "normal" }}>{meta}</div>}
      {children}
      {wide ? <RecordTabs tabs={tabs} tab={tab} onTab={onTab} /> : <div style={{ height: 10 }} />}
      {!wide && tabs.length > 1 && <TabDrawer open={tabMenu} top={drawerTop} onClose={() => setTabMenu(false)} tabs={tabs} tab={tab} onTab={onTab} />}
    </div>
  );
}

/** On a phone, the page's tabs as a list that slides in from the left (Coy, 2026-10-06: "a hamburger menu … right to the left of the customer name"). */
function TabDrawer({ open, top, onClose, tabs, tab, onTab }: { open: boolean; top: number | null; onClose: () => void; tabs: Array<[string, string]>; tab: string; onTab: (k: string) => void }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, top: top ?? "var(--sc-head)", bottom: "var(--sc-foot)", zIndex: 45, pointerEvents: open ? "auto" : "none" }}>
      <SlideDrawer open={open} onClose={onClose} width={260} label="Sections of this page">
        <div style={{ ...eyebrow, padding: "14px 16px 8px" }}>On this page</div>
        <div role="tablist" aria-orientation="vertical" className="flex flex-col">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => { onTab(k); onClose(); }} className="text-left"
              style={{ fontFamily: disp, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", padding: "12px 16px", cursor: "pointer",
                color: tab === k ? T.ink : T.ink2, background: tab === k ? T.hivizDim : "transparent", borderLeft: `3px solid ${tab === k ? T.hiviz : "transparent"}` }}>{l}</button>
          ))}
        </div>
      </SlideDrawer>
    </div>
  );
}

/** One row of tabs on every size (Threads v2 handoff §4). */
export function RecordTabs({ tabs, tab, onTab }: { tabs: Array<[string, string]>; tab: string; onTab: (k: string) => void }) {
  return (
    <div role="tablist" className="flex gap-4 mt-2 overflow-x-auto">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => onTab(k)}
          style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", padding: "6px 0 7px", whiteSpace: "nowrap", cursor: "pointer",
            color: tab === k ? T.ink : T.ink3, borderBottom: `2px solid ${tab === k ? T.hiviz : "transparent"}` }}>{l}</button>
      ))}
    </div>
  );
}

/** A dismissable note under the facts line, with an optional action (Undo). */
export function HeaderNote({ text, action, onDismiss }: { text: React.ReactNode; action?: { label: string; onClick: () => void }; onDismiss: () => void }) {
  return (
    <div className="mt-2 rounded px-3 py-1.5 flex items-center gap-2" style={{ background: T.hivizDim, fontSize: F.sm }}>
      <span className="flex-1">{text}</span>
      {action && <button onClick={action.onClick} style={{ ...lbl, color: T.chalk, cursor: "pointer" }}>{action.label}</button>}
      <button onClick={onDismiss} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer" }}>×</button>
    </div>
  );
}

/** The Overview's grid: the main column, and a 400px right column when wide (its cards above the main column when narrow). */
export function OverviewGrid({ wide, side, sideCompact, meta, children }: { wide: boolean; side: React.ReactNode; sideCompact?: React.ReactNode; meta?: string; children: React.ReactNode }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: wide ? "minmax(0,1fr) 400px" : "minmax(0,1fr)", gap: 14, padding: "14px 16px" }}>
      {/* On a phone the header's facts line lives here (Coy, 2026-10-06). */}
      {!wide && meta && <div style={{ fontSize: 12, color: T.ink2, ...nums }}>{meta}</div>}
      {!wide && (sideCompact ?? null)}
      <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>{children}</div>
      {wide && side}
    </div>
  );
}

/** A card in the right column. */
export function PanelCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded overflow-hidden" style={{ background: T.card, border: `1px solid ${T.hair}` }}>{children}</div>;
}

/** The Overview's section label, with an optional action on the right. */
export function SectionHead({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center mb-1.5">
      <span style={{ ...eyebrow, flex: 1 }}>{title}</span>
      {action && <button onClick={action.onClick} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>{action.label}</button>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6" style={{ fontSize: F.sm, color: T.ink3 }}>{text}</div>;
}

/** Key · value rows under a panel title ("Customer", "Contact", "Vendor"), with Edit. */
export function Facts({ title, rows, onEdit }: { title: string; rows: Array<[string, string | null, string?]>; onEdit?: () => void }) {
  return (
    <section style={{ padding: "12px 16px", borderBottom: `1px solid ${T.hair}` }}>
      <div className="flex items-center"><h3 style={{ ...panelTitle, flex: 1 }}>{title}</h3>
        {onEdit && <button onClick={onEdit} style={{ ...lbl, fontSize: 11, color: T.chalk, cursor: "pointer" }}>Edit</button>}</div>
      {rows.map(([k, v, hint]) => (
        <div key={k} className="flex gap-3 py-1" style={{ fontSize: F.sm }}>
          <span style={{ ...lbl, fontSize: 11, width: 96, color: T.ink3, paddingTop: 2, flexShrink: 0 }}>{k}</span>
          <span style={{ flex: 1, minWidth: 0, color: v ? T.ink : T.ink3, overflowWrap: "anywhere" }}>{v ?? "—"}{hint && <span style={{ fontSize: 11, color: T.ink3 }}> {hint}</span>}</span>
        </div>
      ))}
    </section>
  );
}

/** An address: tap to copy, and Open in Maps. */
export function AddressRow({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };
  return (
    <div className="flex gap-1.5">
      <button onClick={() => void copy()} title="Copy address" className="flex items-center gap-2 text-left"
        style={{ flex: 1, minWidth: 0, padding: "7px 10px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, background: "transparent", cursor: "pointer", color: T.ink }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{addr}</span>
        <span style={{ ...lbl, fontSize: 11, color: copied ? T.green : T.ink3 }}>{copied ? "Copied ✓" : "Copy"}</span>
      </button>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer"
        style={{ ...lbl, fontSize: 11, height: 33, padding: "0 10px", borderRadius: 3, border: `1px solid ${T.hairStrong}`, display: "flex", alignItems: "center", color: T.chalk }}>
        Open in Maps ↗
      </a>
    </div>
  );
}

/** The Location panel for a person: their address (copy, Open in Maps), or "add one". */
export function LocationPanel({ addr, note, onAdd }: { addr: string | null; note?: string | null; onAdd?: () => void }) {
  return (
    <section style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={panelTitle}>Location</h3>
      {addr ? <AddressRow addr={addr} />
        : onAdd ? (
          <button onClick={onAdd} className="text-left" style={{ padding: "8px 10px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, color: T.hivizText, fontSize: F.sm, cursor: "pointer", background: "transparent" }}>
            No address on file — add one
          </button>
        ) : <span style={{ fontSize: F.sm, color: T.ink3 }}>No address on file.</span>}
      {note && <span style={{ fontSize: 11, color: T.ink3 }}>{note}</span>}
    </section>
  );
}

export interface CardMethod { kind: "phone" | "email"; label: string; value: string; can_text?: boolean | null }
export interface CardPerson { id: string; name: string | null; role: string | null; primary?: boolean; methods: CardMethod[]; href: string }

/** A person: who, their role, ★ Primary, a line per number and email (Call · Text · Email), and into Threads. */
export function ContactCard({ c, compact }: { c: CardPerson; compact?: boolean }) {
  const phones = c.methods.filter((m) => m.kind === "phone");
  const sub = [c.role, phones.length > 1 ? `${phones.length} numbers` : null, c.methods.some((m) => m.kind === "email") ? "email" : null].filter(Boolean).join(" · ");
  const act: React.CSSProperties = { ...lbl, fontSize: 10, color: T.chalk };
  return (
    <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: compact ? "8px 10px" : "10px 12px" }}>
      <div className="flex items-center gap-2.5">
        <InitialsBox name={c.name} size={compact ? 34 : 28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontFamily: strong, fontSize: 13.5, fontWeight: 600, ...clip }}>{c.name || formatPhone(phones[0]?.value ?? null)}</span>
            {c.primary && <span className="rounded" style={{ fontFamily: disp, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", padding: "0 4px", border: `1px solid ${T.hiviz}`, color: T.hiviz }}>Primary</span>}
          </div>
          {sub && <div style={{ fontSize: 11, color: T.ink3, ...clip }}>{sub}</div>}
        </div>
        {compact && <Link href={c.href} style={{ ...eyebrow, color: T.chalk }}>Threads ›</Link>}
      </div>
      {!compact && (
        <>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {c.methods.map((m) => (
              <div key={m.kind + m.value} className="flex items-baseline gap-2" style={{ fontSize: 12.5 }}>
                <span style={{ ...eyebrow, fontSize: 9.5, width: 52, color: T.ink3, ...clip }}>{m.label}</span>
                {m.kind === "email"
                  ? <a href={`mailto:${m.value}`} style={{ color: T.ink, flex: 1, minWidth: 0, ...clip }}>{m.value}</a>
                  : <a href={`tel:${m.value}`} style={{ color: T.ink, flex: 1, minWidth: 0, ...nums }}>{formatPhone(m.value)}</a>}
                {m.kind === "email"
                  ? <a href={`mailto:${m.value}`} style={act}>Email</a>
                  : <><a href={`tel:${m.value}`} style={act}>Call</a>{m.can_text !== false && <a href={`sms:${m.value}`} style={act}>Text</a>}</>}
              </div>
            ))}
            {!c.methods.length && <div style={{ fontSize: 12, color: T.ink3 }}>No number or email on file.</div>}
          </div>
          <Link href={c.href} className="inline-block mt-1.5" style={{ ...eyebrow, color: T.chalk }}>Open in Threads ›</Link>
        </>
      )}
    </div>
  );
}

/** The threads these people are in: their bucket (one of Coy's system threads) and each thread he made that holds one of them. */
export function ThreadChips({ bucket, threads, big, emptyText }: {
  bucket: { label: string; colour: string; href: string } | null;
  threads: Array<{ id: string; name: string; count: number }>;
  big?: boolean;
  emptyText?: string;
}) {
  const chip = (c: string): React.CSSProperties => ({ height: big ? 34 : 28, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 3,
    border: `1px solid ${c}`, color: c, fontFamily: disp, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" });
  return (
    <div className="flex flex-wrap gap-1.5">
      {bucket && <Link href={bucket.href} style={chip(bucket.colour)}>{bucket.label}</Link>}
      {threads.map((t) => (
        <Link key={t.id} href={`/dashboard/messages?t=${t.id}`} style={chip(T.hiviz)}>{t.name} <span style={nums}>{t.count}</span></Link>
      ))}
      {big && !threads.length && emptyText && <span style={{ fontSize: F.sm, color: T.ink3, alignSelf: "center" }}>{emptyText}</span>}
    </div>
  );
}

/** One call, text or email in "Recent, across every … channel". */
export function RecentCard({ href, kind, who, at, text }: { href: string; kind: string; who: string; at: string; text: string }) {
  return (
    <Link href={href} className="block rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "8px 10px", color: T.ink }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontFamily: disp, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>{kind}</span>
        <span style={{ fontSize: 11, color: T.ink3, flex: 1, ...clip }}>{who}</span>
        <span style={{ fontSize: 11, color: T.ink3, ...nums }}>{new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </div>
      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</div>
    </Link>
  );
}

/** A job in the Overview: title, its line under it, and the price (or stage) on the right. */
export function JobRow({ href, title, sub, right }: { href: string; title: string; sub: string; right: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "10px 12px", color: T.ink }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: strong, fontSize: 13.5, fontWeight: 600, ...clip }}>{title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: T.ink3, ...clip }}>{sub}</span>
      </span>
      <span style={{ fontFamily: disp, fontSize: 16, fontWeight: 600, ...nums }}>{right}</span>
    </Link>
  );
}

/** A labelled field in an edit sheet. */
export function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span style={{ ...eyebrow }}>{k}</span>{children}</label>;
}

export const fieldStyle: React.CSSProperties = { height: 34, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 3, padding: "0 8px", width: "100%" };
