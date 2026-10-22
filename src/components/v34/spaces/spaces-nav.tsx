"use client";

/**
 * The Spaces navigation, step 1 (Claude Design "Dusty Home", 2026-10-16; Coy,
 * 2026-10-17: "map the new design to the live feedback site"). Behind Settings →
 * Appearance → New navigation (`new_nav`); the old rail stays the default.
 *
 * A 72px rail of Spaces — Dusty (Home) first, then every open job as a tile in its
 * stage's colour (look 1b), then the threads Coy made — beside a 280px drawer: on
 * Home the app's pages and every thread by bucket; in a job its Job pages
 * and a Channels shelf of its Phone · Email · Internal threads (one thread per number). Settings is the
 * gear at the rail's foot. On a desktop it is fixed at the left (`--sc-rail-w` is
 * 352px, 136px with the drawer folded by « to a strip of icons, › opening it again — frame 11; tiles drawn as silhouettes by kind, Rail Silhouettes 1a); on a phone it slides over the page from ☰
 * or a swipe from the left edge. No migration: src/lib/v34/spaces.ts, /api/spaces.
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, disp } from "@/lib/v34/tokens";
import { NavIcon } from "@/components/v34/primitives";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { SpaceIcon, useDrawMissing } from "@/components/v34/spaces/space-icon";
import { NewSpaceDialog, PickList, ItemPicker, peopleOf } from "@/components/v34/spaces/new-space";
import { ArrangeRail, type RailTileInfo } from "@/components/v34/spaces/arrange-rail";
import { PAGE } from "@/lib/v34/pages";
import { SETTINGS_HOME } from "@/lib/v34/settings-sections";
import { usePref } from "@/lib/v34/prefs";
import { setVendorFilter, useVendorFilter } from "@/lib/v34/vendor-filter";
import { ROLE_LABEL, type ContactRole } from "@/lib/v34/threads";
import {
  activeTreeRow, internalThreads, jobTree, monogram, phoneThreads, spaceOf, stageColor, stageLabel,
  homeShelves, moveToShelf, nudge, MAX_SHELVES, MAX_SHELF_NAME, CHANNELS, isChannel, looseChannels, pickSections, COLLECTION_PAGES, offShelf,
  customerShelves, vendorShelves, activeTab, cleanPins, addPin, removePin,
  emailThreads, SPACES_HREF, cleanLayout, kindRows, placeRow, removeKindShelf, CHANNELS_SHELF,
  type LayoutKind, type KindLayout, type TreeRow,
  type Shelf, type SpaceRef, type SpacePerson, type SpaceEmail, type ThreadRow, type SpacePin,
  cleanRail, orderTiles, moveTile, hideTile, showTile, cleanCollectionPicks, setPicks, cleanMembers, setMembers,
} from "@/lib/v34/spaces";

interface RailJob { id: string; title: string; status: string | null; customer: string | null }
interface RailCustomer { id: string; name: string }
interface RailCollection { id: string; name: string; count: number; source: string }
interface JobDetail { job?: { id: string; title: string; status: string | null }; people: SpacePerson[]; emails: SpaceEmail[] }
interface HomeThread { contact_id: string; display_name: string; bucket: string | null; numbers?: number; occurred_at: string | null; role?: string; customer_id?: string | null; company?: string | null }

const BUCKETS: Array<{ k: string; label: string; key: string; color: string }> = [
  { k: "customer", label: "Customers", key: "customers", color: "var(--sc-bucket-customer)" },
  { k: "vendor", label: "Vendors", key: "vendors", color: "var(--sc-bucket-vendor)" },
  { k: "personal", label: "Personal", key: "personal", color: "var(--sc-bucket-personal)" },
  { k: "unsorted", label: "Unsorted", key: "unsorted", color: "var(--sc-bucket-unsorted)" },
];
const PER_BUCKET = 6;

/* ------------------------------------------------------------ data */

// Read once per tab and kept between page changes; the rail refreshes on its own every few minutes.
let railCache: { at: number; jobs: RailJob[]; customers: RailCustomer[]; collections: RailCollection[] } | null = null;
let homeCache: { at: number; threads: HomeThread[] } | null = null;
const jobCache = new Map<string, { at: number; d: JobDetail }>();
const FRESH = 3 * 60_000;

function useRail(on: boolean) {
  const [d, setD] = useState(railCache);
  useEffect(() => {
    if (!on) return;
    let off = false;
    const load = () => {
      if (railCache && Date.now() - railCache.at < FRESH) { setD(railCache); return; }
      fetch("/api/spaces").then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (off || !j) return;
        railCache = { at: Date.now(), jobs: j.jobs ?? [], customers: j.customers ?? [], collections: j.collections ?? [] };
        setD(railCache);
      }).catch(() => {});
    };
    load();
    const t = window.setInterval(load, FRESH);
    // A Space just made (New Space) asks for the rail again.
    const again = () => { railCache = null; load(); };
    window.addEventListener("sc:spaces-reload", again);
    return () => { off = true; window.clearInterval(t); window.removeEventListener("sc:spaces-reload", again); };
  }, [on]);
  return d;
}

/** A Space's people and email (a job's, a customer's or a vendor's), for its Channels shelf. */
function useSpaceDetail(kind: "job" | "customer" | "vendor", id: string | null) {
  const ck = id ? `${kind}:${id}` : "";
  const [d, setD] = useState<JobDetail | null>(ck ? jobCache.get(ck)?.d ?? null : null);
  useEffect(() => {
    if (!id) return;
    let off = false;
    const hit = jobCache.get(ck);
    Promise.resolve().then(() => { if (!off) setD(hit?.d ?? null); });
    if (hit && Date.now() - hit.at < FRESH) return () => { off = true; };
    fetch(`/api/spaces?${kind}=${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (off || !j?.people) return;
      jobCache.set(ck, { at: Date.now(), d: j });
      setD(j);
    }).catch(() => {});
    return () => { off = true; };
  }, [kind, id, ck]);
  return d;
}

function useHomeThreads(on: boolean) {
  const [d, setD] = useState<HomeThread[] | null>(homeCache?.threads ?? null);
  useEffect(() => {
    if (!on) return;
    if (homeCache && Date.now() - homeCache.at < FRESH) return;
    let off = false;
    fetch("/api/threads").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (off || !j?.threads) return;
      homeCache = { at: Date.now(), threads: j.threads };
      setD(j.threads);
    }).catch(() => {});
    return () => { off = true; };
  }, [on]);
  return d;
}

/* ------------------------------------------------------------ pieces */

function Tile({ label, title, color, on, href, onPick, children, dashed, bare, home, drag }: {
  label: string; title: string; color?: string; on?: boolean; href?: string; onPick?: () => void; children?: React.ReactNode; dashed?: boolean;
  bare?: boolean; home?: boolean; drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
  const inner = children ?? <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".02em" }}>{label}</span>;
  const style: React.CSSProperties = {
    "--sc-tile": color ?? "var(--sc-rail-ink)",
  } as React.CSSProperties;
  const cls = `sc-space-tile${dashed ? " sc-space-tile-new" : ""}${bare ? " sc-space-tile-bare" : ""}${home ? " sc-space-tile-home" : ""}`;
  return (
    <div className="sc-space-slot" data-on={on ? "" : undefined} {...drag}>
      {href
        ? <Link href={href} onClick={onPick} className={`${cls} no-underline`} style={style} aria-label={title} title={title} aria-current={on ? "page" : undefined}>{inner}</Link>
        : <button type="button" onClick={onPick} className={cls} style={style} aria-label={title} title={title}>{inner}</button>}
    </div>
  );
}

/**
 * Which shelves are folded, per device (Coy, 2026-10-18: "collapse/expand all Shelves").
 * One set of keys ("home:<shelf>", "job:phone" …) shared by every drawer.
 */
const CLOSED_KEY = "sc:shelves-closed";
const closedListeners = new Set<(v: Set<string>) => void>();
let closedNow: Set<string> | null = null;
function readClosed(): Set<string> {
  if (closedNow) return closedNow;
  try { closedNow = new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]") as string[]); } catch { closedNow = new Set(); }
  return closedNow;
}
function writeClosed(v: Set<string>) {
  closedNow = v;
  try { localStorage.setItem(CLOSED_KEY, JSON.stringify([...v].slice(0, 200))); } catch { /* private mode */ }
  closedListeners.forEach((f) => f(v));
}
function useClosed() {
  const [v, setV] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setV(readClosed()); });
    closedListeners.add(setV);
    return () => { off = true; closedListeners.delete(setV); };
  }, []);
  const toggle = useCallback((k: string) => { const n = new Set(readClosed()); if (n.has(k)) n.delete(k); else n.add(k); writeClosed(n); }, []);
  const setAll = useCallback((keys: string[], close: boolean) => {
    const n = new Set(readClosed());
    keys.forEach((k) => (close ? n.add(k) : n.delete(k)));
    writeClosed(n);
  }, []);
  return { closed: v, toggle, setAll };
}

function Group({ title, children, count, id, closed, onToggle, gear }: {
  title: string; children: React.ReactNode; count?: number;
  id?: string; closed?: Set<string>; onToggle?: (k: string) => void; gear?: React.ReactNode;
}) {
  const [own, setOwn] = useState(true);
  const open = id && closed ? !closed.has(id) : own;
  const flip = () => (id && onToggle ? onToggle(id) : setOwn(!own));
  return (
    <div className="sc-space-group">
      <div className="sc-space-group-h" style={{ cursor: "default" }}>
        <button type="button" onClick={flip} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit", textAlign: "left" }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>›</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {count != null && <span style={{ marginLeft: "auto", opacity: .7 }}>{count}</span>}
        </button>
        {gear}
      </div>
      {open && children}
    </div>
  );
}

/** Collapse all / Expand all, at the top of a drawer's list. */
function FoldAll({ keys, closed, setAll }: { keys: string[]; closed: Set<string>; setAll: (k: string[], c: boolean) => void }) {
  const allClosed = keys.length > 0 && keys.every((k) => closed.has(k));
  return (
    <button type="button" className="sc-space-more" style={{ padding: "2px 14px 4px", marginLeft: "auto" }} onClick={() => setAll(keys, !allClosed)}>
      {allClosed ? "Expand all" : "Collapse all"}
    </button>
  );
}

function GearIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

function Row({ href, label, sub, on, icon, avatar, color, indent, onPick, when }: {
  href: string; label: string; sub?: string; on?: boolean; icon?: React.ReactNode; avatar?: string; color?: string; indent?: boolean; onPick?: () => void; when?: string | null;
}) {
  return (
    <Link href={href} onClick={onPick} className="sc-space-row no-underline" aria-current={on ? "page" : undefined}
      style={indent ? { paddingLeft: 30 } : undefined}>
      {icon ?? (avatar != null && (
        <span className="sc-space-av" style={{ background: `color-mix(in srgb, ${color ?? T.ink3} 18%, ${T.card})`, color: color ?? T.ink2 }}>{avatar}</span>
      ))}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="sc-space-row-l">{label}</span>
        {sub && <span className="sc-space-row-s">{sub}</span>}
      </span>
      {when && <span className="sc-space-row-s" style={{ flexShrink: 0, alignSelf: "flex-start", paddingTop: 2, fontVariantNumeric: "tabular-nums" }}>{when}</span>}
    </Link>
  );
}

/** A page's row is lit on its own page, and Jobs on the Scope Builder's, which it opens under Spaces. */
const isOn = (active: string, k: string) => active === k || (k === "scope" && active === "scopebuilder");

/* ------------------------------------------------------------ drawers */

/**
 * Arranging Home's shelves (Coy, 2026-10-18: "my Shelves can be renamed and customized
 * similar to how on discord I create categories and put any channels inside it").
 */
function ShelfArranger({ shelves, onChange, onReset }: { shelves: Shelf[]; onChange: (v: Shelf[]) => void; onReset: () => void }) {
  const [adding, setAdding] = useState("");
  const set = (i: number, patch: Partial<Shelf>) => onChange(shelves.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)));
  const add = () => {
    const name = adding.trim().slice(0, MAX_SHELF_NAME);
    if (!name || shelves.length >= MAX_SHELVES) return;
    onChange([...shelves, { id: `s${Date.now().toString(36)}`, name, pages: [] }]);
    setAdding("");
  };
  return (
    <div className="sc-shelf-arr">
      <p className="sc-shelf-hint">Rename a shelf, move it up or down, or put any page on another shelf. A shelf you remove sends its pages to More.</p>
      {shelves.map((sh, i) => (
        <div key={sh.id} className="sc-shelf-box">
          <div className="sc-shelf-row">
            <input className="sc-shelf-name" value={sh.name} maxLength={MAX_SHELF_NAME} aria-label="Shelf name"
              onChange={(e) => set(i, { name: e.target.value })}
              onBlur={(e) => { if (!e.target.value.trim()) set(i, { name: "Shelf" }); }} />
            <button type="button" className="sc-shelf-btn" onClick={() => onChange(nudge(shelves, i, -1))} disabled={i === 0} aria-label="Move shelf up">↑</button>
            <button type="button" className="sc-shelf-btn" onClick={() => onChange(nudge(shelves, i, 1))} disabled={i === shelves.length - 1} aria-label="Move shelf down">↓</button>
            {sh.id !== "more" && (
              <button type="button" className="sc-shelf-btn" aria-label={`Remove ${sh.name}`} title="Remove this shelf"
                onClick={() => {
                  const left = shelves.filter((_, j) => j !== i);
                  const more = left.find((x) => x.id === "more");
                  onChange(more ? left.map((x) => (x.id === "more" ? { ...x, pages: [...x.pages, ...sh.pages] } : x)) : [...left, { id: "more", name: "More", pages: sh.pages }]);
                }}>×</button>
            )}
          </div>
          {sh.pages.length === 0 && <div className="sc-space-empty">Empty — move a page here.</div>}
          {sh.pages.map((k, pi) => {
            const p = PAGE.get(k);
            if (!p) return null;
            return (
              <div key={k} className="sc-shelf-page">
                <span className="sc-space-ico"><NavIcon k={k} on={false} color="currentColor" /></span>
                <span className="sc-shelf-page-l">{p.label}</span>
                <button type="button" className="sc-shelf-btn" onClick={() => set(i, { pages: nudge(sh.pages, pi, -1) })} disabled={pi === 0} aria-label={`Move ${p.label} up`}>↑</button>
                <button type="button" className="sc-shelf-btn" onClick={() => set(i, { pages: nudge(sh.pages, pi, 1) })} disabled={pi === sh.pages.length - 1} aria-label={`Move ${p.label} down`}>↓</button>
                <select className="sc-shelf-move" value={sh.id} aria-label={`Shelf for ${p.label}`} onChange={(e) => onChange(moveToShelf(shelves, k, e.target.value))}>
                  {shelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      ))}
      {shelves.length < MAX_SHELVES && (
        <form className="sc-shelf-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="sc-shelf-name" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New shelf name" maxLength={MAX_SHELF_NAME} aria-label="New shelf name" />
          <button type="submit" className="sc-shelf-arrange" disabled={!adding.trim()}>+ Shelf</button>
        </form>
      )}
      <button type="button" className="sc-space-more" onClick={onReset}>Put the default shelves back</button>
    </div>
  );
}

/**
 * One shelf's gear (Coy, 2026-10-18: "a settings button on the Shelf Group that allows me to
 * add/remove whatever tools / channels into the group i want"): rename it, tick any tool or
 * channel onto it (taking it off the shelf it was on), order what is on it, or delete it.
 */
function ShelfEditor({ shelves, shelf, pages, onChange, onDone }: {
  shelves: Shelf[]; shelf: Shelf; pages: string[]; onChange: (v: Shelf[]) => void; onDone: () => void;
}) {
  const i = shelves.findIndex((x) => x.id === shelf.id);
  const where = (k: string) => shelves.find((x) => x.pages.includes(k)) ?? null;
  const set = (patch: Partial<Shelf>) => onChange(shelves.map((x) => (x.id === shelf.id ? { ...x, ...patch } : x)));
  const tick = (k: string, on: boolean) => {
    if (on) { onChange(moveToShelf(shelves, k, shelf.id)); return; }
    // A tool taken off goes to More, so no page is lost; a channel goes back under the shelves.
    if (isChannel(k)) { onChange(offShelf(shelves, k)); return; }
    const more = shelves.some((x) => x.id === "more");
    const next = more ? shelves : [...shelves, { id: "more", name: "More", pages: [] }];
    onChange(moveToShelf(next, k, shelf.id === "more" ? shelves.find((x) => x.id !== "more")?.id ?? "more" : "more"));
  };
  const label = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? PAGE.get(k)?.label ?? k;
  const box = (k: string) => {
    const on = shelf.pages.includes(k);
    const other = on ? null : where(k);
    return (
      <label key={k} className="sc-shelf-tick">
        <input type="checkbox" checked={on} onChange={(e) => tick(k, e.target.checked)} />
        {label(k)}
        {other && <small>on {other.name}</small>}
      </label>
    );
  };
  return (
    <div className="sc-shelf-edit">
      <div className="sc-shelf-row">
        <input className="sc-shelf-name" value={shelf.name} maxLength={MAX_SHELF_NAME} aria-label="Shelf name"
          onChange={(e) => set({ name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) set({ name: "Shelf" }); }} />
        <button type="button" className="sc-shelf-btn" onClick={() => onChange(nudge(shelves, i, -1))} disabled={i <= 0} aria-label="Move shelf up">↑</button>
        <button type="button" className="sc-shelf-btn" onClick={() => onChange(nudge(shelves, i, 1))} disabled={i === shelves.length - 1} aria-label="Move shelf down">↓</button>
      </div>
      {shelf.pages.length > 1 && <span className="sc-shelf-edit-h">On this shelf, in order</span>}
      {shelf.pages.length > 1 && shelf.pages.map((k, pi) => (
        <div key={k} className="sc-shelf-page">
          <span className="sc-shelf-page-l">{label(k)}</span>
          <button type="button" className="sc-shelf-btn" onClick={() => set({ pages: nudge(shelf.pages, pi, -1) })} disabled={pi === 0} aria-label={`Move ${label(k)} up`}>↑</button>
          <button type="button" className="sc-shelf-btn" onClick={() => set({ pages: nudge(shelf.pages, pi, 1) })} disabled={pi === shelf.pages.length - 1} aria-label={`Move ${label(k)} down`}>↓</button>
        </div>
      ))}
      {pickSections(pages.filter((k) => PAGE.has(k))).map((sec) => (
        <Fragment key={sec.title}>
          <span className="sc-shelf-edit-h">{sec.title}</span>
          {sec.keys.map(box)}
        </Fragment>
      ))}
      <div className="sc-shelf-row" style={{ justifyContent: "space-between" }}>
        {shelf.id !== "more" ? (
          <button type="button" className="sc-space-more" style={{ padding: "4px 0", color: "var(--sc-red)" }}
            onClick={() => {
              const left = shelves.filter((x) => x.id !== shelf.id);
              const tools = shelf.pages.filter((k) => !isChannel(k));
              const more = left.find((x) => x.id === "more");
              onChange(more ? left.map((x) => (x.id === "more" ? { ...x, pages: [...x.pages, ...tools] } : x)) : tools.length ? [...left, { id: "more", name: "More", pages: tools }] : left);
              onDone();
            }}>Delete shelf</button>
        ) : <span />}
        <button type="button" className="sc-shelf-arrange" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/** The rows of Home's thread channels — each bucket's people, or Spam and Archived — shared by Home and collections. */
function useChannels(onPick: () => void) {
  const threads = useHomeThreads(true);
  const path = usePathname() ?? "";
  const openContact = /^\/dashboard\/messages\/([0-9a-f-]{36})/i.exec(path)?.[1] ?? null;
  const byBucket = useMemo(() => {
    const m = new Map<string, HomeThread[]>();
    for (const t of threads ?? []) {
      const k = t.bucket ?? "unsorted";
      if (k === "spam") continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [threads]);
  // The whole bucket opens in place (Coy, 2026-10-17: the drawer is the list now).
  const [all, setAllOpen] = useState<Set<string>>(new Set());
  const flip = (k: string) => setAllOpen((m) => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const channelRows = (ch: string, indent?: boolean): React.ReactNode => {
    if (ch === "ch:more") return <>
      <Row href="/dashboard/messages?t=spam" label="Spam" onPick={onPick} indent />
      <Row href="/dashboard/messages?t=archived" label="Archived" onPick={onPick} indent />
    </>;
    const b = BUCKETS.find((x) => `ch:${x.k}` === ch);
    if (!b) return null;
    if (threads === null) return <div className="sc-space-empty">Loading threads…</div>;
    const list = byBucket.get(b.k) ?? [];
    return <>
      {indent && <div className="sc-space-empty" style={{ paddingTop: 2, paddingBottom: 2, fontWeight: 600 }}>{b.label} · {list.length}</div>}
      {list.length === 0 && <div className="sc-space-empty">No one here yet.</div>}
      {(all.has(b.k) ? list : list.slice(0, PER_BUCKET)).map((t) => (
        <Row key={t.contact_id} href={`/dashboard/messages/${t.contact_id}?t=${b.key}`} onPick={onPick}
          label={t.display_name} sub={(t.numbers ?? 0) > 1 ? `${t.numbers} numbers` : undefined}
          on={openContact === t.contact_id} avatar={monogram(t.display_name)} color={b.color} />
      ))}
      {list.length > PER_BUCKET && (
        <button type="button" onClick={() => flip(b.k)} className="sc-space-more">{all.has(b.k) ? "Fewer" : `All ${list.length}`}</button>
      )}
    </>;
  };
  const chCount = (ch: string) => {
    const b = BUCKETS.find((x) => `ch:${x.k}` === ch);
    return b && threads ? (byBucket.get(b.k) ?? []).length : undefined;
  };
  return { channelRows, chCount };
}

/**
 * The Vendors list's trades and kinds, under its row in the drawer while that page is open, folded
 * away otherwise (Coy, 2026-10-19: "nested under the Vendors bucket … stay collapsed … expand once
 * the page is selected"). The page publishes them (`vendor-filter.ts`); a pick filters it.
 */
function VendorTrades({ onPick }: { onPick: () => void }) {
  const f = useVendorFilter();
  if (!f.trades) return null;
  const item = (key: string, label: string, n: number, on: boolean, act: () => void) => (
    <button key={key} type="button" className="sc-space-row" aria-current={on ? "true" : undefined} onClick={() => { act(); onPick(); }}
      style={{ paddingLeft: 40, border: 0, width: "100%", background: on ? undefined : "none", textAlign: "left", cursor: "pointer", minHeight: 30 }}>
      <span className="sc-space-row-l" style={{ flex: 1, fontWeight: on ? 600 : 400 }}>{label}</span>
      <span className="sc-space-row-s" style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Vendors by trade">
      {f.trades.map((t) => item(`t:${t.trade}`, t.trade, t.n, f.trade === t.trade, () => setVendorFilter({ trade: t.trade })))}
      {f.kinds.length > 0 && <div className="sc-space-row-s" style={{ padding: "8px 0 2px 40px", textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10 }}>Kind</div>}
      {f.kinds.filter((k) => k.k === "all" || k.n > 0).map((k) => item(`k:${k.k}`, k.label, k.n, f.sub === k.k, () => setVendorFilter({ sub: k.k })))}
    </div>
  );
}

/**
 * The top of every Space's drawer (Coy, 2026-10-22: "it should define what type of space it
 * is. Is it a vendor? collection? … a gear icon further in the top right corner … across from
 * the job name"): its name with the gear at the right, then what kind of Space it is.
 */
function SpaceHead({ name, kind, color, tags, sub, back, editing, onGear, gearLabel }: {
  name: string; kind: string; color: string; tags?: React.ReactNode; sub?: React.ReactNode; back?: React.ReactNode;
  editing?: boolean; onGear?: () => void; gearLabel?: string;
}) {
  return (
    <div className="sc-space-head">
      {back}
      <div className="sc-space-top">
        <span className="sc-space-name" title={name}>{name}</span>
        {onGear && (
          <button type="button" className="sc-space-gear" onClick={onGear} aria-pressed={!!editing}
            aria-label={gearLabel ?? "Edit this drawer"} title={editing ? "Done" : (gearLabel ?? "Edit this drawer")}>
            {editing ? <span style={{ fontSize: 12, fontWeight: 600 }}>Done</span> : <GearIcon size={16} />}
          </button>
        )}
      </div>
      <span className="sc-space-sub" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="sc-space-tag" style={{ color, borderColor: color }}>{kind}</span>
        {tags}
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

const KIND_WORD: Record<LayoutKind, string> = { job: "job", customer: "customer", vendor: "vendor" };

/**
 * Editing a job's, customer's or vendor's drawer (Coy, 2026-10-22: "Everything on the rail is
 * supposed to be a kind of 'workspace' that has an editable drawer"): its shelves renamed, moved,
 * added and removed, each page moved to another shelf or out of the drawer, and the Space put on
 * or taken off the rail. One layout per kind (`space_layouts`).
 */
function KindLayoutEditor({ kind, layout, rows, onChange, onReset, onDone, rail }: {
  kind: LayoutKind; layout: KindLayout; rows: TreeRow[]; onChange: (l: KindLayout) => void; onReset: () => void; onDone: () => void;
  rail?: { on: boolean; set: (on: boolean) => void };
}) {
  const [adding, setAdding] = useState("");
  const label = (k: string) => rows.find((r) => r.k === k)?.label ?? k;
  const setShelf = (i: number, patch: Partial<KindLayout["shelves"][number]>) =>
    onChange({ ...layout, shelves: layout.shelves.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)) });
  const pageShelves = layout.shelves.filter((sh) => sh.id !== CHANNELS_SHELF);
  const add = () => {
    const name = adding.trim().slice(0, MAX_SHELF_NAME);
    if (!name || layout.shelves.length >= MAX_SHELVES) return;
    onChange({ ...layout, shelves: [...layout.shelves, { id: `s${Date.now().toString(36)}`, name, rows: [] }] });
    setAdding("");
  };
  return (
    <div className="sc-shelf-arr">
      <p className="sc-shelf-hint">This is how every {KIND_WORD[kind]}&apos;s drawer reads. Rename a shelf, move it, or move any page to another shelf or out of the drawer.</p>
      {rail && (
        <div className="sc-shelf-row" style={{ justifyContent: "space-between" }}>
          <span className="sc-shelf-page-l">{rail.on ? "On the rail" : "Not on the rail"}</span>
          <button type="button" className="sc-shelf-arrange" onClick={() => rail.set(!rail.on)}>{rail.on ? "Take it off the rail" : "Put it on the rail"}</button>
        </div>
      )}
      {layout.shelves.map((sh, i) => (
        <div key={sh.id} className="sc-shelf-box">
          <div className="sc-shelf-row">
            <input className="sc-shelf-name" value={sh.name} maxLength={MAX_SHELF_NAME} aria-label="Shelf name"
              onChange={(e) => setShelf(i, { name: e.target.value })}
              onBlur={(e) => { if (!e.target.value.trim()) setShelf(i, { name: "Shelf" }); }} />
            <button type="button" className="sc-shelf-btn" onClick={() => onChange({ ...layout, shelves: nudge(layout.shelves, i, -1) })} disabled={i === 0} aria-label="Move shelf up">↑</button>
            <button type="button" className="sc-shelf-btn" onClick={() => onChange({ ...layout, shelves: nudge(layout.shelves, i, 1) })} disabled={i === layout.shelves.length - 1} aria-label="Move shelf down">↓</button>
            <button type="button" className="sc-shelf-btn" aria-label={`Remove ${sh.name}`} title="Remove this shelf — its pages leave the drawer"
              onClick={() => onChange(removeKindShelf(layout, sh.id))}>×</button>
          </div>
          {sh.id === CHANNELS_SHELF
            ? <div className="sc-space-empty">Phone · Email · Internal threads</div>
            : sh.rows.length === 0 && <div className="sc-space-empty">Empty — move a page here.</div>}
          {sh.rows.map((k, ri) => (
            <div key={k} className="sc-shelf-page">
              <span className="sc-shelf-page-l">{label(k)}</span>
              <button type="button" className="sc-shelf-btn" onClick={() => setShelf(i, { rows: nudge(sh.rows, ri, -1) })} disabled={ri === 0} aria-label={`Move ${label(k)} up`}>↑</button>
              <button type="button" className="sc-shelf-btn" onClick={() => setShelf(i, { rows: nudge(sh.rows, ri, 1) })} disabled={ri === sh.rows.length - 1} aria-label={`Move ${label(k)} down`}>↓</button>
              <select className="sc-shelf-move" value={sh.id} aria-label={`Shelf for ${label(k)}`} onChange={(e) => onChange(placeRow(layout, k, e.target.value || null))}>
                {pageShelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="">Not in the drawer</option>
              </select>
            </div>
          ))}
        </div>
      ))}
      {layout.hidden.length > 0 && (
        <div className="sc-shelf-box">
          <span className="sc-shelf-edit-h">Not in the drawer</span>
          {layout.hidden.map((k) => (
            <div key={k} className="sc-shelf-page">
              <span className="sc-shelf-page-l">{k === CHANNELS_SHELF ? "Channels" : label(k)}</span>
              {k === CHANNELS_SHELF
                ? <button type="button" className="sc-shelf-arrange" onClick={() => onChange({ shelves: [...layout.shelves, { id: CHANNELS_SHELF, name: "Channels", rows: [] }], hidden: layout.hidden.filter((x) => x !== k) })}>Put back</button>
                : pageShelves.length > 0 && (
                  <select className="sc-shelf-move" value="" aria-label={`Put ${label(k)} on a shelf`} onChange={(e) => e.target.value && onChange(placeRow(layout, k, e.target.value))}>
                    <option value="">Put it on…</option>
                    {pageShelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
            </div>
          ))}
        </div>
      )}
      {layout.shelves.length < MAX_SHELVES && (
        <form className="sc-shelf-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="sc-shelf-name" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New shelf name" maxLength={MAX_SHELF_NAME} aria-label="New shelf name" />
          <button type="submit" className="sc-shelf-arrange" disabled={!adding.trim()}>+ Shelf</button>
        </form>
      )}
      <div className="sc-shelf-row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="sc-space-more" style={{ padding: "4px 0" }} onClick={onReset}>Put the default drawer back</button>
        <button type="button" className="sc-shelf-arrange" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/** A kind of Space's drawer layout, saved on the account (`space_layouts`). */
function useKindLayout(kind: LayoutKind) {
  const [raw, setRaw] = usePref<Record<string, unknown> | null>("space_layouts", null);
  const layout = useMemo(() => cleanLayout(kind, raw?.[kind]), [kind, raw]);
  const set = (l: KindLayout | null) => {
    const next: Record<string, unknown> = { ...(raw && typeof raw === "object" ? raw : {}) };
    if (l) next[kind] = l; else delete next[kind];
    setRaw(next);
  };
  return { layout, set };
}

export type RailCtl = { on: boolean; set: (on: boolean, name: string) => void };

function HomeDrawer({ pages, active, onPick }: { pages: string[]; active: string; onPick: () => void }) {
  const pathname = usePathname();
  const [saved, setSaved] = usePref<Shelf[] | null>("shelves", null);
  const shelves = useMemo(() => homeShelves(saved, pages), [saved, pages]);
  const [arranging, setArranging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { closed, toggle, setAll } = useClosed();
  const saveShelves = (v: Shelf[] | null) => setSaved(v);
  const loose = looseChannels(shelves);
  const { channelRows, chCount } = useChannels(onPick);
  const groupKeys = [
    ...shelves.filter((sh) => sh.pages.length > 0 || sh.id !== "more").map((sh) => `home:${sh.id}`),
    ...loose.map((ch) => `home:${ch}`),
  ];

  return (
    <>
      <SpaceHead name="Home" kind="Home" color="var(--sc-hiviz)" sub="Dusty · your shelves and threads"
        editing={arranging} onGear={() => { setArranging(!arranging); setEditing(null); }} gearLabel="Arrange Home's shelves" />
      <div className="sc-space-scroll">
        {/* Dusty's chat in the main window, what he made beside it (Coy, 2026-10-19). */}
        {!arranging && <Row href="/dashboard/dusty" label="Chat with Dusty" sub="His answers here, what he made beside them" on={pathname === "/dashboard/dusty"} onPick={onPick}
          icon={<span className="sc-space-av" style={{ background: "transparent" }}><DustyAvatar state="idle" size={22} hidden /></span>} />}
        {!arranging && <div style={{ display: "flex" }}><FoldAll keys={groupKeys} closed={closed} setAll={setAll} /></div>}
        {arranging
          ? <ShelfArranger shelves={shelves} onChange={saveShelves} onReset={() => saveShelves(null)} />
          : shelves.map((sh) => (sh.pages.length > 0 || sh.id !== "more" || editing === sh.id) && (
            <Group key={sh.id} id={`home:${sh.id}`} closed={closed} onToggle={toggle} title={sh.name}
              gear={(
                <button type="button" className="sc-shelf-gear" aria-label={`Edit the ${sh.name} shelf`} title="Edit this shelf"
                  aria-pressed={editing === sh.id} onClick={() => setEditing(editing === sh.id ? null : sh.id)}
                  style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }}><GearIcon /></button>
              )}>
              {editing === sh.id && <ShelfEditor shelves={shelves} shelf={sh} pages={pages} onChange={saveShelves} onDone={() => setEditing(null)} />}
              {sh.pages.length === 0 && editing !== sh.id && <div className="sc-space-empty">Empty — the gear puts tools and channels here.</div>}
              {sh.pages.map((k) => {
                if (isChannel(k)) return <React.Fragment key={k}>{channelRows(k, true)}</React.Fragment>;
                const p = PAGE.get(k);
                if (!p) return null;
                return (
                  <React.Fragment key={k}>
                    <Row href={SPACES_HREF[k] ?? p.href} label={p.label} on={isOn(active, k)} onPick={onPick}
                      icon={<span className="sc-space-ico"><NavIcon k={k} on={isOn(active, k)} color="currentColor" /></span>} />
                    {k === "vendors" && <VendorTrades onPick={onPick} />}
                  </React.Fragment>
                );
              })}
            </Group>
          ))}
        {!arranging && loose.map((ch) => (
          <Group key={ch} id={`home:${ch}`} closed={closed} onToggle={toggle} count={chCount(ch)}
            title={ch === "ch:more" ? "More" : BUCKETS.find((b) => `ch:${b.k}` === ch)?.label ?? ch}>
            {channelRows(ch)}
          </Group>
        ))}
        {!arranging && shelves.length < MAX_SHELVES && (
          <button type="button" className="sc-space-more" style={{ paddingLeft: 14 }} onClick={() => {
            const id = `s${Date.now().toString(36)}`;
            saveShelves([...shelves, { id, name: "New shelf", pages: [] }]);
            setEditing(id);
          }}>+ Shelf</button>
        )}
      </div>
    </>
  );
}

function JobDrawer({ id, fallback, onPick, rail }: { id: string; fallback: RailJob | null; onPick: () => void; rail: RailCtl }) {
  const d = useSpaceDetail("job", id);
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  // A link inside the same page (Budget's ?tab=) doesn't change the path; read it after the tap.
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const status = d?.job?.status ?? fallback?.status ?? null;
  const title = d?.job?.title ?? fallback?.title ?? "Job";
  const here = activeTreeRow(path, search);
  const [editing, setEditing] = useState(false);
  const customer = fallback?.customer ?? null;
  return (
    <>
      <SpaceHead name={title} kind="Job" color="var(--sc-hiviz)" editing={editing} onGear={() => setEditing(!editing)} gearLabel="Edit every job's drawer"
        tags={<span className="sc-space-tag" style={{ color: stageColor(status), borderColor: stageColor(status) }}>{stageLabel(status)}</span>}
        sub={customer ?? undefined} />
      <LayoutDrawer kind="job" id={id} here={here} pick={pick} editing={editing} setEditing={setEditing}
        rail={{ on: rail.on, set: (on) => rail.set(on, title) }}
        channels={(name, g) => <ChannelsShelf title={name} scope="job" d={d} onPick={pick} {...g}
          empty={<>No numbers on this job yet. <Link href={`/dashboard/scope/${id}/summary`} onClick={pick}>+ Add a contact</Link></>} />} />
    </>
  );
}

/**
 * A job's, customer's or vendor's shelves, laid out as Coy set them for that kind of Space
 * (`space_layouts`), or the editor while the head's gear is on.
 */
function LayoutDrawer({ kind, id, here, pick, editing, setEditing, rail, channels }: {
  kind: LayoutKind; id: string; here: string; pick: () => void; editing: boolean; setEditing: (v: boolean) => void;
  rail: { on: boolean; set: (on: boolean) => void };
  channels: (name: string, g: { closed: Set<string>; onToggle: (k: string) => void }) => React.ReactNode;
}) {
  const { layout, set } = useKindLayout(kind);
  const rows = useMemo(() => kindRows(kind, id), [kind, id]);
  const byK = useMemo(() => new Map(rows.map((r) => [r.k, r])), [rows]);
  const { closed, toggle, setAll } = useClosed();
  const g = { closed, onToggle: toggle };
  if (editing) {
    return (
      <div className="sc-space-scroll">
        <KindLayoutEditor kind={kind} layout={layout} rows={rows} onChange={set} onReset={() => set(null)} onDone={() => setEditing(false)} rail={rail} />
      </div>
    );
  }
  const keys = layout.shelves.flatMap((sh) => (sh.id === CHANNELS_SHELF ? CHANNEL_KEYS(kind) : [`${kind}:${sh.id}`]));
  return (
    <div className="sc-space-scroll">
      <div style={{ display: "flex" }}><FoldAll keys={keys} closed={closed} setAll={setAll} /></div>
      {layout.shelves.map((sh) => sh.id === CHANNELS_SHELF
        ? <React.Fragment key={sh.id}>{channels(sh.name, g)}</React.Fragment>
        : (
          <Group key={sh.id} title={sh.name} id={`${kind}:${sh.id}`} {...g}>
            {sh.rows.length === 0 && <div className="sc-space-empty">Empty — the gear moves pages here.</div>}
            {sh.rows.map((k) => {
              const r = byK.get(k);
              return r ? <Row key={k} href={r.href} label={r.label} indent={r.sub} on={here === k} onPick={pick} /> : null;
            })}
          </Group>
        ))}
    </div>
  );
}

const CHANNEL_KEYS = (scope: string) => [`${scope}:channels`, `${scope}:phone`, `${scope}:email`, `${scope}:internal`];

/**
 * The Channels shelf (Coy, 2026-10-18: "Every customer gets a 'Channels' shelf that lists the
 * channels by type 'Phone', 'Email', 'Internal'. and under each channel type will be the
 * individual threads shown by the phone number, email address, and 'contact name' under the
 * internal channel"): one shelf, its three channels folding on their own, each thread under it.
 */
function ChannelsShelf({ title = "Channels", scope, d, onPick, closed, onToggle, empty }: {
  title?: string; scope: string; d: JobDetail | null; onPick: () => void; closed: Set<string>; onToggle: (k: string) => void; empty?: React.ReactNode;
}) {
  const phones: ThreadRow[] = d ? phoneThreads(d.people) : [];
  const mails: ThreadRow[] = d ? emailThreads(d.people, d.emails) : [];
  const notes: ThreadRow[] = d ? internalThreads(d.people) : [];
  const sub = (k: string, label: string, rows: ThreadRow[], none: React.ReactNode) => {
    const key = `${scope}:${k}`;
    const open = !closed.has(key);
    return (
      <div key={k}>
        <button type="button" className="sc-space-sub-h" onClick={() => onToggle(key)} aria-expanded={open}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>›</span>
          <span style={{ flex: 1 }}>{label}</span>
          {d && <span style={{ opacity: .7 }}>{rows.length}</span>}
        </button>
        {open && <>
          {!d && <div className="sc-space-empty">Loading…</div>}
          {d && rows.length === 0 && <div className="sc-space-empty" style={{ paddingLeft: 30 }}>{none}</div>}
          {rows.map((t) => (
            <Row key={t.key} href={t.href} label={t.title} sub={t.sub} when={t.when} indent onPick={onPick} avatar={t.avatar} />
          ))}
        </>}
      </div>
    );
  };
  return (
    <Group title={title} id={`${scope}:channels`} closed={closed} onToggle={onToggle}>
      {sub("phone", "Phone", phones, empty ?? "No numbers here yet.")}
      {sub("email", "Email", mails, "No email addresses or filed email.")}
      {sub("internal", "Internal", notes, "No one here yet.")}
    </Group>
  );
}


/** Names of customers and vendors, for a Space opened by link before it is pinned. */
const nameCache = new Map<string, string>();
let namesLoading: Promise<void> | null = null;
function loadNames(): Promise<void> {
  if (!namesLoading) {
    namesLoading = Promise.all([
      fetch("/api/customers").then((r) => (r.ok ? r.json() : null)).then((j) => {
        for (const c of j?.customers ?? []) if (c?.id && c?.name) nameCache.set(`customer:${c.id}`, c.name);
      }).catch(() => {}),
      fetch("/api/vendors").then((r) => (r.ok ? r.json() : null)).then((j) => {
        for (const v of j?.vendors ?? []) if (v?.id) nameCache.set(`vendor:${v.id}`, v.company_name || v.name || "");
      }).catch(() => {}),
    ]).then(() => {});
  }
  return namesLoading;
}
function useRecordName(kind: "customer" | "vendor", id: string, pinned: string | null) {
  const [n, setN] = useState<string | null>(pinned ?? nameCache.get(`${kind}:${id}`) ?? null);
  useEffect(() => {
    if (pinned) { Promise.resolve().then(() => setN(pinned)); return; }
    let off = false;
    void loadNames().then(() => { if (!off) setN(nameCache.get(`${kind}:${id}`) ?? null); });
    return () => { off = true; };
  }, [kind, id, pinned]);
  return n;
}

/**
 * A customer's or vendor's Space (Claude Design "Dusty Home" SPEC): its record page's tabs as
 * shelves — Account (a customer) or Supply (a vendor) — and a Toolbox, with Add to the rail.
 */
function RecordDrawer({ kind, id, rail, onPick, onBack, pinnedName }: {
  kind: "customer" | "vendor"; id: string; rail: RailCtl; onPick: () => void; onBack: () => void; pinnedName: string | null;
}) {
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const name = useRecordName(kind, id, pinnedName);
  const onPage = path.startsWith(kind === "customer" ? `/dashboard/customers/${id}` : `/dashboard/vendors/${id}`);
  const here = onPage ? activeTab(search) : "";
  const detail = useSpaceDetail(kind, id);
  const [editing, setEditing] = useState(false);
  const color = kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)";
  const word = kind === "customer" ? "Customer" : "Vendor";
  return (
    <>
      <SpaceHead name={name ?? word} kind={word} color={color} editing={editing} onGear={() => setEditing(!editing)}
        gearLabel={`Edit every ${kind}'s drawer`} sub={rail.on ? undefined : "Not on the rail"}
        back={/* Back to Home (Coy, 2026-10-19: "I need a back button here once I click into a customer or vendor"). */
          <button type="button" className="sc-space-back" onClick={onBack}>‹ {kind === "customer" ? "Customers" : "Vendors"}</button>} />
      <LayoutDrawer kind={kind} id={id} here={here} pick={pick} editing={editing} setEditing={setEditing}
        rail={{ on: rail.on, set: (on) => name && rail.set(on, name) }}
        channels={(n, g) => <ChannelsShelf title={n} scope={kind} d={detail} onPick={pick} {...g} />} />
    </>
  );
}

/**
 * A collection's Space (Coy, 2026-10-18: "Collections aren't allowing me to actually pick
 * tools/channels"): its people (the thread), then the tools and channels picked for it in New
 * Space, changed with the gear (`spaces_collections`).
 */
/** A collection's people, read from its thread (073) — listed in its drawer, not a side panel. */
function useCollectionPeople(id: string) {
  const [d, setD] = useState<HomeThread[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener("sc:spaces-reload", on);
    return () => window.removeEventListener("sc:spaces-reload", on);
  }, []);
  useEffect(() => {
    let off = false;
    fetch(`/api/threads?thread=${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!off) setD(Array.isArray(j?.threads) ? j.threads : []);
    }).catch(() => { if (!off) setD([]); });
    return () => { off = true; };
  }, [id, tick]);
  return d;
}

/** The second line under a person in a collection: Sub, Cust. contact, their company. */
function personSub(t: HomeThread): string | undefined {
  const role = t.role && t.role !== t.bucket && t.role in ROLE_LABEL ? ROLE_LABEL[t.role as ContactRole] : null;
  return [role, t.company].filter(Boolean).join(" · ") || undefined;
}

function CollectionDrawer({ col, id, pages, active, onPick }: {
  col: RailCollection | null; id: string; pages: string[]; active: string; onPick: () => void;
}) {
  const [raw, setRaw] = usePref<unknown>("spaces_collections", {});
  const all = useMemo(() => cleanCollectionPicks(raw), [raw]);
  const picks = all[id] ?? [];
  const [memRaw, setMemRaw] = usePref<unknown>("spaces_col_members", {});
  const allMembers = useMemo(() => cleanMembers(memRaw), [memRaw]);
  const members = allMembers[id] ?? [];
  const [editing, setEditing] = useState(false);
  const { closed, toggle, setAll } = useClosed();
  const { channelRows, chCount } = useChannels(onPick);
  const folk = useCollectionPeople(id);
  const path = usePathname() ?? "";
  const openContact = /^\/dashboard\/messages\/([0-9a-f-]{36})/i.exec(path)?.[1] ?? null;
  const tools = picks.filter((k) => !isChannel(k) && PAGE.has(k));
  const chans = picks.filter((k) => isChannel(k));
  // Its people by what they are (Coy, 2026-10-19: "I don't want a people shelf … if I'm selecting
  // a customer, it should be a customer"): the jobs, customers and vendors picked, then each person
  // on its thread under their own bucket — skipping anyone a picked customer or vendor already covers.
  const covered = (t: HomeThread) => members.some((m) => (m.kind === "vendor" && m.id === t.contact_id) || (m.kind === "customer" && !!t.customer_id && m.id === t.customer_id));
  const loose = (folk ?? []).filter((t) => !covered(t));
  const kindOf = (t: HomeThread) => (BUCKETS.some((b) => b.k === t.bucket) ? t.bucket! : "unsorted");
  const sections = [
    { k: "job", title: "Jobs", color: "var(--sc-hiviz)" },
    ...BUCKETS.map((b) => ({ k: b.k, title: b.label, color: b.color })),
  ].map((g) => ({
    ...g,
    picked: members.filter((m) => m.kind === g.k),
    people: loose.filter((t) => g.k !== "job" && kindOf(t) === g.k),
  })).filter((g) => g.picked.length + g.people.length > 0);
  const keys = [...sections.map((g) => `col:${id}:m:${g.k}`), ...(tools.length ? [`col:${id}:tools`] : []), ...chans.map((c) => `col:${id}:${c}`)];
  // Jobs, customers and vendors added while editing put their people on its thread.
  const changeMembers = (v: SpacePin[]) => {
    const added = v.filter((m) => !members.some((x) => x.kind === m.kind && x.id === m.id));
    setMemRaw(setMembers(allMembers, id, v));
    if (added.length) void peopleOf(added).then(async (contact_ids) => {
      if (!contact_ids.length) return;
      await fetch(`/api/threads/custom/${id}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_ids }) });
      window.dispatchEvent(new Event("sc:spaces-reload"));
    }).catch(() => {});
  };
  // Taking something out (Coy, 2026-10-21: "I have Elena Sacco there … I want to remove her"):
  // a person leaves the thread; a picked customer or vendor takes its people with it.
  const takePerson = async (contactId: string) => {
    await fetch(`/api/threads/custom/${id}/contacts?contact_id=${contactId}`, { method: "DELETE" }).catch(() => {});
    window.dispatchEvent(new Event("sc:spaces-reload"));
  };
  const takeMember = async (m: SpacePin) => {
    setMemRaw(setMembers(allMembers, id, members.filter((x) => !(x.kind === m.kind && x.id === m.id))));
    const theirs = (folk ?? []).filter((t) => (m.kind === "vendor" && t.contact_id === m.id) || (m.kind === "customer" && t.customer_id === m.id));
    await Promise.all(theirs.map((t) => fetch(`/api/threads/custom/${id}/contacts?contact_id=${t.contact_id}`, { method: "DELETE" }).catch(() => {})));
    window.dispatchEvent(new Event("sc:spaces-reload"));
  };
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const rename = async () => {
    const v = (nameDraft ?? "").replace(/\s+/g, " ").trim();
    setNameDraft(null);
    if (!v || v === col?.name) return;
    await fetch(`/api/threads/custom/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) }).catch(() => {});
    window.dispatchEvent(new Event("sc:spaces-reload"));
  };
  const memberHref = (m: SpacePin) => m.kind === "job" ? `/dashboard/scope/${m.id}/summary` : m.kind === "customer" ? `/dashboard/customers/${m.id}` : `/dashboard/vendors/${m.id}`;
  const name = col?.name ?? "Work Space";
  const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "");
  const holds = [
    count(members.filter((m) => m.kind === "job").length, "job", "jobs"),
    count(members.filter((m) => m.kind === "customer").length, "customer", "customers"),
    count(members.filter((m) => m.kind === "vendor").length, "vendor", "vendors"),
    count(loose.length, "person", "people"),
  ].filter(Boolean).join(" · ");
  return (
    <>
      {/* What kind of Space it is (Coy, 2026-10-22: "What is fort polk; a job or a customer?"): one
          you made, holding only what was picked into it. */}
      <SpaceHead name={name} kind="Your own Work Space" color="var(--sc-violet)" editing={editing} onGear={() => setEditing(!editing)}
        gearLabel="Rename it, take things out, or add jobs, customers, vendors, tools and channels"
        sub={holds || "Empty — the gear adds jobs, customers and vendors"} />
      <div className="sc-space-scroll">
        {editing ? (
          <div className="sc-shelf-edit">
            <div className="sc-shelf-row">
              <input className="sc-shelf-name" value={nameDraft ?? name} maxLength={80} aria-label="Work Space name"
                onChange={(e) => setNameDraft(e.target.value)} onBlur={() => void rename()}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </div>
            <span className="sc-shelf-edit-h">In it now · × takes it out</span>
            {members.length === 0 && (folk ?? []).length === 0 && <div className="sc-space-empty">Nothing yet.</div>}
            {members.map((m) => (
              <div key={`${m.kind}:${m.id}`} className="sc-shelf-page">
                <span className="sc-shelf-page-l">{m.name} <small style={{ color: "var(--sc-ink3)" }}>{m.kind === "job" ? "Job" : m.kind === "customer" ? "Customer" : "Vendor"}</small></span>
                <button type="button" className="sc-shelf-btn" onClick={() => void takeMember(m)} aria-label={`Take ${m.name} out`} title="Take out of this Work Space">×</button>
              </div>
            ))}
            {(folk ?? []).filter((t) => !covered(t)).map((t) => (
              <div key={t.contact_id} className="sc-shelf-page">
                <span className="sc-shelf-page-l">{t.display_name} <small style={{ color: "var(--sc-ink3)" }}>{BUCKETS.find((b) => b.k === kindOf(t))?.label ?? "Unsorted"}</small></span>
                <button type="button" className="sc-shelf-btn" onClick={() => void takePerson(t.contact_id)} aria-label={`Take ${t.display_name} out`} title="Take out of this Work Space">×</button>
              </div>
            ))}
            {tools.map((k) => (
              <div key={k} className="sc-shelf-page">
                <span className="sc-shelf-page-l">{PAGE.get(k)!.label} <small style={{ color: "var(--sc-ink3)" }}>{COLLECTION_PAGES.includes(k) ? "Collection" : "Tool"}</small></span>
                <button type="button" className="sc-shelf-btn" onClick={() => setRaw(setPicks(all, id, picks.filter((x) => x !== k)))} aria-label={`Take ${PAGE.get(k)!.label} out`} title="Take out of this Work Space">×</button>
              </div>
            ))}
            <span className="sc-shelf-edit-h">Add jobs, customers and vendors</span>
            <ItemPicker kinds={["job", "customer", "vendor"]} picked={members} onChange={changeMembers} />
            <PickList pages={pages} picks={picks} onChange={(v) => setRaw(setPicks(all, id, v))} />
            <div className="sc-shelf-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="sc-shelf-arrange" onClick={() => setEditing(false)}>Done</button>
            </div>
          </div>
        ) : <>
          <div style={{ display: "flex" }}><FoldAll keys={keys} closed={closed} setAll={setAll} /></div>
          {folk === null && members.length === 0 && <div className="sc-space-empty">Loading…</div>}
          {sections.map((g) => (
            <Group key={g.k} id={`col:${id}:m:${g.k}`} closed={closed} onToggle={toggle} count={g.picked.length + g.people.length} title={g.title}>
              {g.picked.map((m) => <Row key={m.id} href={memberHref(m)} label={m.name} onPick={onPick} avatar={monogram(m.name)} color={g.color} />)}
              {g.people.map((t) => (
                <Row key={t.contact_id} href={`/dashboard/messages/${t.contact_id}?t=${id}`} onPick={onPick}
                  label={t.display_name} sub={personSub(t)}
                  on={openContact === t.contact_id} avatar={monogram(t.display_name)} color={g.color} />
              ))}
            </Group>
          ))}
          {([["collections", "Collections", tools.filter((k) => COLLECTION_PAGES.includes(k))],
            ["tools", "Tools", tools.filter((k) => !COLLECTION_PAGES.includes(k))]] as const).map(([gk, gt, list]) => list.length > 0 && (
            <Group key={gk} id={`col:${id}:${gk}`} closed={closed} onToggle={toggle} title={gt}>
              {list.map((k) => {
                const p = PAGE.get(k)!;
                return <Row key={k} href={SPACES_HREF[k] ?? p.href} label={p.label} on={isOn(active, k)} onPick={onPick}
                  icon={<span className="sc-space-ico"><NavIcon k={k} on={isOn(active, k)} color="currentColor" /></span>} />;
              })}
            </Group>
          ))}
          {chans.map((ch) => (
            <Group key={ch} id={`col:${id}:${ch}`} closed={closed} onToggle={toggle} count={chCount(ch)}
              title={ch === "ch:more" ? "More" : BUCKETS.find((b) => `ch:${b.k}` === ch)?.label ?? ch}>
              {channelRows(ch)}
            </Group>
          ))}
          {picks.length === 0 && members.length === 0 && <div className="sc-space-empty">Nothing in it yet — Edit picks its jobs, customers, vendors, tools and channels.</div>}
        </>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ the folded drawer */

// Claude Design "Dusty Home" frame 11 (Coy, 2026-10-18: "when I collapse the drawer it
// disappears"): folded, the drawer is a 64px strip — › to open it, the pages as icons, then
// the Space's groups as small chips in their colour, each opening the drawer.
const TREE_ICON: Record<string, string> = { summary: "dashboard", plans: "scopebuilder", market: "cash", proposed: "pricebook", tracker: "logs", schedule: "logs", locations: "map", files: "files" };
const TAB_ICON: Record<string, string> = {
  overview: "dashboard", contacts: "contacts", jobs: "scope", threads: "threads", payments: "cash", schedule: "logs",
  files: "files", timeline: "threads", prices: "pricebook", receipts: "documents", bids: "vendors",
};

function ProposalIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 2.5h7l3 3v11h-10z" /><path d="M11.5 2.5v3h3" /><path d="M7 11l1.8 1.8L12.2 9" />
    </svg>
  );
}

function FoldedDrawer({ shown, pages, active, onOpen, bar }: {
  shown: SpaceRef; pages: string[]; active: string; onOpen: () => void; bar?: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  const [saved] = usePref<Shelf[] | null>("shelves", null);
  const [colRaw] = usePref<unknown>("spaces_collections", {});
  const shelves = useMemo(() => homeShelves(saved, pages), [saved, pages]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const icon = (key: string, label: string, href: string, on: boolean, glyph: React.ReactNode) => (
    <Link key={key} href={href} className="sc-strip-ico no-underline" title={label} aria-label={label} aria-current={on ? "page" : undefined}>{glyph}</Link>
  );
  const chip = (ab: string, label: string, color: string) => (
    <button key={ab} type="button" className="sc-strip-chip" style={{ color, borderColor: color }} onClick={onOpen} title={label} aria-label={`${label} — open the drawer`}>{ab}</button>
  );
  let icons: React.ReactNode[];
  let chips: React.ReactNode[];
  if (shown.kind === "home") {
    const order = shelves.flatMap((sh) => sh.pages);
    icons = order.map((k) => {
      const p = PAGE.get(k);
      return p ? icon(k, p.label, SPACES_HREF[k] ?? p.href, isOn(active, k), <NavIcon k={k} on={isOn(active, k)} color="currentColor" />) : null;
    });
    chips = BUCKETS.map((b) => chip(b.label.slice(0, 2).toUpperCase(), b.label, b.color));
  } else if (shown.kind === "customer" || shown.kind === "vendor") {
    const onPage = path.startsWith(shown.kind === "customer" ? `/dashboard/customers/${shown.id}` : `/dashboard/vendors/${shown.id}`);
    const here = onPage ? activeTab(search) : "";
    const sh = shown.kind === "customer" ? customerShelves(shown.id) : vendorShelves(shown.id);
    icons = sh.flatMap((x) => x.rows).map((r) => icon(r.k, r.label, r.href, here === r.k, <NavIcon k={TAB_ICON[r.k] ?? "files"} on={here === r.k} color="currentColor" />));
    chips = [...sh.map((x) => chip(x.name.slice(0, 2).toUpperCase(), x.name, shown.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)")),
      chip("CH", "Channels", "var(--sc-bucket-customer)")];
  } else if (shown.kind === "collection") {
    const tools = (cleanCollectionPicks(colRaw)[shown.id] ?? []).filter((k) => PAGE.has(k));
    icons = [
      icon("contacts", "Who's in it", `/dashboard/messages?t=${shown.id}`, false, <NavIcon k="contacts" on={false} color="currentColor" />),
      ...tools.map((k) => icon(k, PAGE.get(k)!.label, SPACES_HREF[k] ?? PAGE.get(k)!.href, isOn(active, k), <NavIcon k={k} on={isOn(active, k)} color="currentColor" />)),
    ];
    chips = [chip("WS", "Work Space", "var(--sc-violet)")];
  } else {
    const here = activeTreeRow(path, search);
    icons = jobTree(shown.id).filter((r) => !r.sub).map((r) => {
      const on = here === r.k;
      const glyph = r.k === "proposal" ? <ProposalIcon /> : <NavIcon k={TREE_ICON[r.k] ?? "files"} on={on} color="currentColor" />;
      return icon(r.k, r.label, r.href, on, glyph);
    });
    chips = [chip("CH", "Channels", "var(--sc-bucket-customer)")];
  }
  return (
    <div className="sc-spaces-strip">
      <button type="button" className="sc-strip-open" onClick={onOpen} aria-label="Open the drawer" title="Open the drawer">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2l5 5-5 5" /><path d="M9 2v10" opacity=".35" />
        </svg>
      </button>
      {bar && <div className="sc-strip-bar">{bar}</div>}
      {icons}
      <span className="sc-strip-sep" aria-hidden="true" />
      {chips}
    </div>
  );
}

/* ------------------------------------------------------------ the nav */

// The Space you are in, kept across remounts of the nav (a page change on a phone can remount it).
let stayed: SpaceRef | null = null;

export function SpacesNav({ desktop, pages, active, dustyState, phoneOpen, onPhoneClose, folded, onFold, bar }: {
  bar?: React.ReactNode;
  desktop: boolean; pages: string[]; active: string; dustyState: EmblemState;
  phoneOpen: boolean; onPhoneClose: () => void; folded: boolean; onFold: () => void;
}) {
  const path = usePathname() ?? "";
  const rail = useRail(true);
  const here = spaceOf(path);
  // The Space whose drawer shows: the page's own, unless a tile was tapped to look into another.
  const [peek, setPeek] = useState<SpaceRef | null>(null);
  const [pinsRaw, setPins] = usePref<unknown>("spaces_pins", []);
  const pins = useMemo(() => cleanPins(pinsRaw), [pinsRaw]);
  const [making, setMaking] = useState(false);
  const [pathSeen, setPathSeen] = useState(path);
  // The Space you are in stays the drawer's when a page it opened isn't its own — a thread, an
  // email, Files, the Map (Coy, 2026-10-19: "when I slide the drawer open from any page, it
  // should go back to whatever space I'm in"). Set by whichever drawer a row was picked from and
  // by landing on a Space's own page; only Home's rows and its tile go back to Home.
  const [stay, setStayState] = useState<SpaceRef | null>(stayed);
  const setStay = setStayState;
  if (pathSeen !== path) {
    setPathSeen(path); setPeek(null);
    if (here.kind !== "home") setStayState(here);
  }
  useEffect(() => { stayed = stay; }, [stay]);
  const jobs = rail?.jobs ?? [];
  const jobOf = (id: string) => jobs.find((j) => j.id === id) ?? null;
  const close = desktop ? () => {} : onPhoneClose;
  const [threadParam, setThreadParam] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setThreadParam(new URLSearchParams(window.location.search).get("t")); });
    return () => { off = true; };
  }, [path]);
  const colHere = /^\/dashboard\/messages(\/[^/]+)?$/.test(path) && threadParam && (rail?.collections ?? []).some((c) => c.id === threadParam)
    ? { kind: "collection" as const, id: threadParam } : null;
  const shown: SpaceRef = peek ?? colHere ?? (here.kind !== "home" ? here : stay ?? here);
  // A row picked in a drawer makes that drawer's Space the one you are in.
  const picked = (from: SpaceRef) => () => { setStay(from.kind === "home" ? null : from); close(); };

  // The rail's tiles, in Coy's order (Coy, 2026-10-18: "remove and rearrange the Rail items").
  const [railRaw, setRail] = usePref<unknown>("spaces_rail", {});
  const railPrefs = useMemo(() => cleanRail(railRaw), [railRaw]);
  const [arranging, setArranging] = useState(false);
  type DragProps = React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  interface RailTile { info: RailTileInfo; render: (drag: DragProps) => React.ReactNode }
  const all: RailTile[] = [
    ...jobs.map((j): RailTile => {
      const on = shown.kind === "job" && shown.id === j.id;
      const title = `${j.title}${j.customer ? ` · ${j.customer}` : ""} · ${stageLabel(j.status)}`;
      const color = stageColor(j.status);
      return {
        info: { key: `job:${j.id}`, name: j.title, sub: `Job · ${stageLabel(j.status)}${j.customer ? ` · ${j.customer}` : ""}`, shape: "job", color, initials: monogram(j.title), pinned: false },
        // A desktop opens the job (its Summary) as Discord opens a server; a phone looks into
        // its drawer first, so the tree is there to pick from before the panel closes.
        render: (drag) => (
          <Tile key={j.id} label={monogram(j.title)} title={title} color={color} on={on} bare drag={drag}
            href={desktop ? `/dashboard/scope/${j.id}/summary` : undefined}
            onPick={desktop ? undefined : () => setPeek({ kind: "job", id: j.id })}>
            <SpaceIcon spaceKey={`job:${j.id}`} kind="job" color={color} initials={monogram(j.title)} on={on} />
          </Tile>
        ),
      };
    }),
    ...(rail?.collections ?? []).map((c): RailTile => {
      // A thread made from a customer is that customer's address book; any other is a folder.
      const customer = c.source === "customer";
      const color = customer ? "var(--sc-chalk)" : "var(--sc-violet)";
      const on = shown.kind === "collection" && shown.id === c.id;
      const col = { kind: "collection" as const, id: c.id };
      const people = `${c.count} ${c.count === 1 ? "person" : "people"}`;
      return {
        info: { key: `col:${c.id}`, name: c.name, sub: `Work Space · ${people}`, shape: customer ? "contact" : "collection", color, initials: monogram(c.name), pinned: false },
        render: (drag) => (
          <Tile key={c.id} label={monogram(c.name)} title={`${c.name} · ${people}`} drag={drag}
            href={desktop ? `/dashboard/messages?t=${c.id}` : undefined}
            onPick={() => { setPeek(col); if (desktop) setStay(col); }} color={color} on={on} bare>
            <SpaceIcon spaceKey={`col:${c.id}`} kind={customer ? "contact" : "collection"} color={color} initials={monogram(c.name)} on={on} />
          </Tile>
        ),
      };
    }),
    // Jobs picked in New Space that aren't open (a complete or lost one) are pins of their own.
    ...pins.filter((p) => p.kind === "job" && !jobs.some((j) => j.id === p.id)).map((p): RailTile => {
      const on = shown.kind === "job" && shown.id === p.id;
      const color = "var(--sc-ink3)";
      return {
        info: { key: `job:${p.id}`, name: p.name, sub: "Job", shape: "job", color, initials: monogram(p.name), pinned: true },
        render: (drag) => (
          <Tile key={`pin-job:${p.id}`} label={monogram(p.name)} title={`${p.name} · Job`} color={color} on={on} bare drag={drag}
            href={desktop ? `/dashboard/scope/${p.id}/summary` : undefined} onPick={desktop ? undefined : () => setPeek({ kind: "job", id: p.id })}>
            <SpaceIcon spaceKey={`job:${p.id}`} kind="job" color={color} initials={monogram(p.name)} on={on} />
          </Tile>
        ),
      };
    }),
    // A customer with an open job is a Work Space of its own; one Coy pinned keeps its pin.
    ...(rail?.customers ?? []).filter((c) => !pins.some((p) => p.kind === "customer" && p.id === c.id)).map((c): RailTile => {
      const on = shown.kind === "customer" && shown.id === c.id;
      const color = "var(--sc-chalk)";
      return {
        info: { key: `customer:${c.id}`, name: c.name, sub: "Customer · open job", shape: "contact", color, initials: monogram(c.name), pinned: false },
        render: (drag) => (
          <Tile key={`cust:${c.id}`} label={monogram(c.name)} title={`${c.name} · Customer`} color={color} on={on} bare drag={drag}
            href={desktop ? `/dashboard/customers/${c.id}` : undefined} onPick={desktop ? undefined : () => setPeek({ kind: "customer", id: c.id })}>
            <SpaceIcon spaceKey={`customer:${c.id}`} kind="contact" color={color} initials={monogram(c.name)} on={on} />
          </Tile>
        ),
      };
    }),
    ...pins.filter((p): p is SpacePin & { kind: "customer" | "vendor" } => p.kind !== "job").map((p): RailTile => {
      const on = (shown.kind === "customer" || shown.kind === "vendor") && shown.kind === p.kind && shown.id === p.id;
      const color = p.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)";
      const href = p.kind === "customer" ? `/dashboard/customers/${p.id}` : `/dashboard/vendors/${p.id}`;
      const kindName = p.kind === "customer" ? "Customer" : "Vendor";
      return {
        info: { key: `${p.kind}:${p.id}`, name: p.name, sub: kindName, shape: p.kind === "customer" ? "contact" : "vendor", color, initials: monogram(p.name), pinned: true },
        render: (drag) => (
          <Tile key={`${p.kind}:${p.id}`} label={monogram(p.name)} title={`${p.name} · ${kindName}`} color={color} on={on} bare drag={drag}
            href={desktop ? href : undefined} onPick={desktop ? undefined : () => setPeek({ kind: p.kind, id: p.id })}>
            <SpaceIcon spaceKey={`${p.kind}:${p.id}`} kind={p.kind === "customer" ? "contact" : "vendor"} color={color} initials={monogram(p.name)} on={on} />
          </Tile>
        ),
      };
    }),
  ];
  const byKey = new Map(all.map((t) => [t.info.key, t]));
  const order = orderTiles(all.map((t) => t.info.key), railPrefs);
  const tiles = order.map((k) => byKey.get(k)!);
  // Dusty draws an icon for each Space on the rail that has none yet (migration 117).
  useDrawMissing(order);
  const hiddenTiles = railPrefs.hidden.map((k) => byKey.get(k)?.info).filter((x): x is RailTileInfo => !!x);
  const moveTo = (key: string, to: number) => setRail(moveTile(railPrefs, order, key, to));
  const removeTile = (t: RailTileInfo) => {
    if (t.pinned) {
      const [kind, id] = t.key.split(":") as [SpacePin["kind"], string];
      setPins(removePin(pins, kind, id));
      setRail(showTile(railPrefs, t.key));
    } else setRail(hideTile(railPrefs, t.key));
  };
  // On or off the rail, from a Space's drawer editor: a tile taken off is hidden (a pin unpinned);
  // put back, a hidden tile shows again, else the job, customer or vendor is pinned.
  const railFor = (kind: SpacePin["kind"], id: string): RailCtl => {
    const key = `${kind}:${id}`;
    return {
      on: order.includes(key),
      set: (on, name) => {
        const t = byKey.get(key);
        if (!on) { if (t) removeTile(t.info); return; }
        if (railPrefs.hidden.includes(key)) setRail(showTile(railPrefs, key));
        if (!t) setPins(addPin(pins, { kind, id, name }));
      },
    };
  };
  const arrangeMenu = (e: React.MouseEvent) => { e.preventDefault(); setArranging(true); };
  // Desktop: drag a tile up or down the rail; right-click opens Arrange.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dragFor = (key: string, i: number): DragProps => ({
    draggable: true,
    onContextMenu: arrangeMenu,
    onDragStart: (e) => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", key); } catch { /* old browsers */ } },
    onDragOver: (e) => { if (dragKey && dragKey !== key) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e) => {
      e.preventDefault();
      const k = dragKey;
      setDragKey(null);
      if (!k || k === key) return;
      const from = order.indexOf(k);
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const below = e.clientY > box.top + box.height / 2;
      let to = i + (below ? 1 : 0);
      if (from < to) to -= 1;
      moveTo(k, to);
    },
    onDragEnd: () => setDragKey(null),
  });

  const railEl = (
    <div className="sc-spaces-rail" role="navigation" aria-label="Work Spaces">
      <Tile label="Home" title="Home — Dusty" on={shown.kind === "home"} home href={desktop ? "/dashboard/dusty" : undefined} onPick={() => { setPeek({ kind: "home" }); setStay(null); }}>
        <span className="sc-space-home"><DustyAvatar state={dustyState} size={40} hidden /></span>
      </Tile>
      <span className="sc-spaces-sep" aria-hidden="true" />
      {rail === null && <span className="sc-spaces-note">…</span>}
      {tiles.map((t, i) => {
        const prev = tiles[i - 1];
        const group = (k: string) => (k.startsWith("job:") ? "job" : k.startsWith("col:") ? "col" : "pin");
        return (
          <React.Fragment key={t.info.key}>
            {prev && group(prev.info.key) !== group(t.info.key) && <span className="sc-spaces-sep" aria-hidden="true" />}
            {t.render(desktop ? dragFor(t.info.key, i) : { onContextMenu: arrangeMenu })}
          </React.Fragment>
        );
      })}
      <Tile label="+" title="New Work Space — a job, customer, vendor or your own" onPick={() => setMaking(true)} dashed>
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      </Tile>
      <span style={{ flex: 1 }} />
      {(tiles.length > 0 || railPrefs.hidden.length > 0) && (
        <button type="button" className="sc-spaces-foot" onClick={() => setArranging(true)} aria-label="Rail settings" title="Rail settings — move or take off Work Spaces">
          <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v14M3 6l3-3 3 3M14 17V3M11 14l3 3 3-3" />
          </svg>
        </button>
      )}
      <Link href={SETTINGS_HOME} onClick={close} className="sc-spaces-foot no-underline" aria-label="Settings" title="Settings">
        <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
      </Link>
    </div>
  );

  const drawerEl = desktop && folded ? <FoldedDrawer shown={shown} pages={pages} active={active} onOpen={onFold} bar={bar} /> : (
    <div className="sc-spaces-drawer">
      {desktop && (
        // Coy, 2026-10-17: "the inner drawer … should be collapsible on desktop". The folded
        // strip's › opens it again; a phone's drawer is covered by the page picked instead.
        <button type="button" className="sc-drawer-fold" onClick={onFold} aria-label="Collapse the drawer" title="Collapse the drawer">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 4L4.5 8l4 4M12.5 4l-4 4 4 4" />
          </svg>
        </button>
      )}
      {bar}
      {shown.kind === "home"
        ? <HomeDrawer pages={pages} active={active} onPick={picked(shown)} />
        : shown.kind === "job"
          ? <JobDrawer id={shown.id} fallback={jobOf(shown.id)} onPick={picked(shown)} rail={railFor("job", shown.id)} />
          : shown.kind === "collection"
            ? <CollectionDrawer id={shown.id} col={(rail?.collections ?? []).find((c) => c.id === shown.id) ?? null} pages={pages} active={active}
                onPick={picked(shown)} />
            : <RecordDrawer kind={shown.kind} id={shown.id} rail={railFor(shown.kind, shown.id)} onPick={picked(shown)}
                pinnedName={pins.find((p) => p.kind === shown.kind && p.id === shown.id)?.name ?? (rail?.customers ?? []).find((c) => shown.kind === "customer" && c.id === shown.id)?.name ?? null}
                onBack={() => { setPeek({ kind: "home" }); setStay(null); }} />}
    </div>
  );

  // Phone: the rail and drawer sit UNDER the page (Coy, 2026-10-17: "it should be underneath
  // the pages"). The dashboard layout slides the page right to show them and back over them
  // when a page is picked; here they are only kept out of reach while covered.
  useEffect(() => {
    if (desktop || !phoneOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onPhoneClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [desktop, phoneOpen, onPhoneClose]);

  // Made outside the nav, so a phone's covered Spaces (inert) never hold it.
  const dialog = (
    <>
      {making && <NewSpaceDialog pages={pages} openJobs={jobs.map((j) => j.id)} onClose={() => setMaking(false)} onMade={() => window.dispatchEvent(new Event("sc:spaces-reload"))} />}
      {arranging && <ArrangeRail shown={tiles.map((t) => t.info)} hidden={hiddenTiles} onMove={moveTo} onRemove={removeTile}
        onShow={(k) => setRail(showTile(railPrefs, k))} onReset={() => setRail({ order: [], hidden: railPrefs.hidden })} onClose={() => setArranging(false)}
        onDelete={(t) => {
          void fetch(`/api/threads/custom/${t.key.slice(4)}`, { method: "DELETE" }).then((r) => {
            if (!r.ok) { window.alert("Couldn't delete that Work Space — try again."); return; }
            setRail(showTile(railPrefs, t.key));
            window.dispatchEvent(new Event("sc:spaces-reload"));
          });
        }} />}
    </>
  );
  if (desktop) {
    return <><nav aria-label="Main" className="sc-spaces" data-folded={folded ? "" : undefined}>{railEl}{drawerEl}</nav>{dialog}</>;
  }
  return (
    <>
      <nav aria-label="Main" className="sc-spaces sc-spaces-under" aria-hidden={phoneOpen ? undefined : true} inert={!phoneOpen}>
        {railEl}{drawerEl}
      </nav>
      {dialog}
    </>
  );
}

/**
 * The page's own edge while it is slid aside on a phone: a tap, or a swipe left, puts the
 * page back over the Spaces.
 */
export function PageEdge({ onClose }: { onClose: () => void }) {
  return (
    <div className="sc-page-edge" role="button" tabIndex={0} aria-label="Back to the page"
      onClick={onClose} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClose(); }} />
  );
}

/**
 * The phone's page slides aside over the Spaces under the finger, Discord's way (Coy,
 * 2026-10-18: "Need the page to slide over smooth from anywhere on the screen"). A drag
 * right from anywhere on the page, or left on the open Spaces or the page's edge, moves the
 * page with the finger (transform only, no transition while dragging); let go and it
 * settles open or closed by a flick (over 0.5 px a millisecond) or by being past halfway.
 * A move that is more up-and-down than sideways once it passes 8 px is a scroll and left
 * alone. A touch on something that pans sideways itself (the plans, the map, a scrolling
 * table or tab row, a text box, a dialog) is left to it, unless it starts within EDGE_PX of
 * the edge: that strip always belongs to the Spaces, caught on the window before React sees
 * it. Anything marked data-edge-own keeps even the edge. While aside the page is a fixed,
 * screen-high layer scrolled to where the window was (data-spaces-open), so it slides as it
 * looked, and the window's scroll comes back when it slides back over.
 */
export const EDGE_PX = 24;
const EDGE_GAP = 56;
export function usePageSlide(on: boolean, isOpen: boolean, setOpen: (v: boolean) => void,
                             layerRef: React.RefObject<HTMLDivElement | null>) {
  const savedY = useRef(0);
  const aside = useCallback((v: boolean) => {
    const html = document.documentElement, el = layerRef.current;
    const now = "spacesOpen" in html.dataset;
    if (v && !now && el) {
      savedY.current = window.scrollY;
      html.dataset.spacesOpen = "";
      el.scrollTop = savedY.current;
    } else if (!v && now) {
      delete html.dataset.spacesOpen;
      window.scrollTo(0, savedY.current);
    }
  }, [layerRef]);
  const openRef = useRef(isOpen);
  React.useLayoutEffect(() => { openRef.current = isOpen; aside(on && isOpen); }, [on, isOpen, aside]);
  useEffect(() => {
    if (!on) return;
    type Start = { x: number; y: number; edge: boolean; from: number };
    let s: Start | null = null;
    let drag = false, x = 0, lastX = 0, lastT = 0, vel = 0;
    const own = (e: TouchEvent) => e.target instanceof Element && !!e.target.closest("[data-edge-own], [role=dialog]");
    const width = () => window.innerWidth - EDGE_GAP;
    const ts = (e: TouchEvent) => {
      s = null; drag = false;
      if (e.touches.length !== 1 || own(e)) return;
      const t = e.touches[0];
      const open = openRef.current;
      const edge = !open && t.clientX <= EDGE_PX;
      if (!edge && pansSideways(e.target)) return;
      s = { x: t.clientX, y: t.clientY, edge, from: open ? width() : 0 };
      lastX = t.clientX; lastT = e.timeStamp; vel = 0;
      if (edge) e.stopPropagation();
    };
    const tm = (e: TouchEvent) => {
      if (!s) return;
      if (s.edge) e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!drag) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Up and down is a scroll; and a closed page only opens, an open one only closes.
        if (Math.abs(dy) >= Math.abs(dx) || (s.from === 0 ? dx < 0 : dx > 0)) { s = null; return; }
        const el = layerRef.current;
        if (!el) { s = null; return; }
        drag = true;
        el.style.transition = "none";
        el.style.willChange = "transform";
        el.style.transform = `translateX(${s.from}px)`;
        aside(true);
      }
      if (e.cancelable) e.preventDefault();
      x = Math.max(0, Math.min(width(), s.from + dx));
      const el = layerRef.current;
      if (el) el.style.transform = `translateX(${x}px)`;
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = 0.7 * ((t.clientX - lastX) / dt) + 0.3 * vel;
      lastX = t.clientX; lastT = e.timeStamp;
    };
    const te = (e: TouchEvent) => {
      if (!s) return;
      if (s.edge) e.stopPropagation();
      if (drag) {
        // A pause before letting go is not a flick.
        if (e.timeStamp - lastT > 90) vel = 0;
        const target = Math.abs(vel) > 0.5 ? vel > 0 : x > width() / 2;
        const el = layerRef.current;
        if (el) { el.style.transition = ""; el.style.transform = ""; el.style.willChange = ""; }
        aside(target);
        if (target !== openRef.current) setOpen(target);
      }
      s = null; drag = false;
    };
    const cap = { capture: true, passive: true } as const;
    const move = { capture: true, passive: false } as const;
    window.addEventListener("touchstart", ts, cap);
    window.addEventListener("touchmove", tm, move);
    window.addEventListener("touchend", te, cap);
    window.addEventListener("touchcancel", te, cap);
    return () => {
      window.removeEventListener("touchstart", ts, cap);
      window.removeEventListener("touchmove", tm, move);
      window.removeEventListener("touchend", te, cap);
      window.removeEventListener("touchcancel", te, cap);
    };
  }, [on, setOpen, aside, layerRef]);
}

/** Does the touch land on something that moves sideways under a finger itself? */
function pansSideways(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, canvas, [contenteditable], [data-pan-x], .sc-drawer, .sc-sheet, .sc-dusty-sheet")) return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.touchAction === "none" || cs.touchAction.includes("pan-y") && !cs.touchAction.includes("pan-x")) return true;
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
  }
  return false;
}
