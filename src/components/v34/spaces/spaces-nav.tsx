"use client";

/**
 * The Spaces navigation, step 1 (Claude Design "Dusty Home", 2026-10-16; Coy,
 * 2026-10-17: "map the new design to the live feedback site"). Behind Settings →
 * Appearance → New navigation (`new_nav`); the old rail stays the default.
 *
 * A 72px rail of Spaces — Dusty (Home) first, then every open job as a tile in its
 * stage's colour (look 1b), then the threads Coy made — beside a 280px drawer: on
 * Home the app's pages and every contact by bucket; in a job its Job pages and a Contacts shelf
 * of the people on it, each opening their one thread page. Settings is the
 * gear at the rail's foot. On a desktop it is fixed at the left (`--sc-rail-w` is
 * 352px, 136px with the drawer folded by « to a strip of icons, › opening it again — frame 11; tiles drawn as silhouettes by kind, Rail Silhouettes 1a); on a phone it slides over the page from ☰
 * or a swipe from the left edge. No migration: src/lib/v34/spaces.ts, /api/spaces.
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, disp } from "@/lib/v34/tokens";
import { NavIcon } from "@/components/v34/primitives";
import { iconVar, BOOK_LABEL, type IconRole } from "@/lib/v34/menu-colors";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { SpaceIcon, useDrawMissing } from "@/components/v34/spaces/space-icon";
import { NewSpaceDialog, PickList, ItemPicker, peopleOf } from "@/components/v34/spaces/new-space";
import { ContactPicker } from "@/components/v34/contacts";
import { ArrangeRail, type RailTileInfo } from "@/components/v34/spaces/arrange-rail";
import { useRailDrag, useOpenGroups, DragGhost, MiniGrid, GroupMenu, type DragLoad, type DropAt } from "@/components/v34/spaces/rail-groups";
import { PAGE } from "@/lib/v34/pages";
import { SETTINGS_HOME } from "@/lib/v34/settings-sections";
import { usePref } from "@/lib/v34/prefs";
import { setVendorFilter, useVendorFilter } from "@/lib/v34/vendor-filter";
import { ROLE_LABEL, type ContactRole } from "@/lib/v34/threads";
import {
  activeTreeRow, contactThreads, jobTree, monogram, spaceOf, stageColor, stageLabel,
  homeShelves, moveToShelf, nudge, MAX_SHELVES, MAX_SHELF_NAME, CHANNELS, isChannel, pickSections, COLLECTION_PAGES, offShelf,
  customerShelves, vendorShelves, activeTab, cleanPins, addPin, removePin,
  SPACES_HREF, shelfIcon, isStandardShelf, SHELF_ICONS, iconColShelf, colorColShelf, shelfLine, SHELF_LINES, SHELF_LINE_DEFAULT, cleanLayout, kindRows, placeRow, removeKindShelf, JOBS_SHELF, isSpecialShelf, specialShelves, isToolRow,
  cleanColShelves, addColShelf, renameColShelf, moveColShelf, removeColShelf, setMemberShelf, membersByShelf, type ColShelf,
  type LayoutKind, type KindLayout, type TreeRow,
  type Shelf, type SpaceRef, type SpacePerson, type SpaceEmail, type SpacePin,
  cleanRail, orderTiles, moveTile, hideTile, showTile, railItems, groupTiles, ungroupTile, placeKeys, renameGroup, dissolveGroup, newGroupId, type RailGroup, cleanCollectionPicks, setPicks, cleanMembers, setMembers, holdsSpace,
  collectionListAt, collectionRecordAt, collectionListRows, filterListRows, homeLooseGroups, COLLECTION_LIST_LABEL, type CollectionList, type ListRow,
} from "@/lib/v34/spaces";

interface RailJob { id: string; title: string; status: string | null; customer: string | null }
interface RailCustomer { id: string; name: string }
interface RailCollection { id: string; name: string; count: number; source: string }
interface JobDetail { job?: { id: string; title: string; status: string | null }; people: SpacePerson[]; emails: SpaceEmail[]; jobs?: Array<{ id: string; title: string; status: string | null }> }
interface HomeThread { contact_id: string; display_name: string; bucket: string | null; numbers?: number; occurred_at: string | null; role?: string; customer_id?: string | null; company?: string | null }

const BUCKETS: Array<{ k: string; label: string; key: string; color: string }> = [
  { k: "customer", label: "Customers", key: "customers", color: "var(--sc-bucket-customer)" },
  { k: "vendor", label: "Vendors", key: "vendors", color: "var(--sc-bucket-vendor)" },
  { k: "personal", label: "Personal", key: "personal", color: "var(--sc-bucket-personal)" },
  { k: "unsorted", label: "Unsorted", key: "unsorted", color: "var(--sc-bucket-unsorted)" },
];
const PER_BUCKET = 6;

/** The app's pages this person may open, for the + Add pickers deep in a drawer. */
const PagesCtx = React.createContext<string[]>([]);

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

function Group({ title, children, count, id, closed, onToggle, gear, icon, line }: {
  title: string; children: React.ReactNode; count?: number;
  id?: string; closed?: Set<string>; onToggle?: (k: string) => void; gear?: React.ReactNode; icon?: string;
  /** The line under the shelf's name, a colour role (Coy, 2026-10-22: "a line under the name of the shelf and an editable color"). */
  line?: string;
}) {
  const [own, setOwn] = useState(true);
  const open = id && closed ? !closed.has(id) : own;
  const flip = () => (id && onToggle ? onToggle(id) : setOwn(!own));
  return (
    <div className="sc-space-group">
      <div className="sc-space-group-h" style={{ cursor: "default", borderBottomColor: iconVar((line ?? SHELF_LINE_DEFAULT) as IconRole) }}>
        <button type="button" onClick={flip} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "inherit", letterSpacing: "inherit", textTransform: "inherit", textAlign: "left" }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>›</span>
          {icon && <span className="sc-shelf-ico" aria-hidden="true"><ShelfGlyph k={icon} /></span>}
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

/** A shelf's icon: one of the page icons, or a folder, star or pin of its own. */
function ShelfGlyph({ k }: { k: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "folder") return <svg width="19" height="19" viewBox="0 0 19 19"><path {...p} d="M2.5 5.5v9h14v-7.5H9L7.5 4.5h-5z" /></svg>;
  if (k === "star") return <svg width="19" height="19" viewBox="0 0 19 19"><path {...p} d="M9.5 2.8l2 4.3 4.6.5-3.4 3.1 1 4.6-4.2-2.4-4.2 2.4 1-4.6-3.4-3.1 4.6-.5z" /></svg>;
  if (k === "pin") return <svg width="19" height="19" viewBox="0 0 19 19"><path {...p} d="M9.5 16.5s-5-4.6-5-8.5a5 5 0 0110 0c0 3.9-5 8.5-5 8.5z" /><circle {...p} cx="9.5" cy="8" r="1.8" /></svg>;
  return <NavIcon k={k} on={false} color="currentColor" />;
}

/**
 * Picking a shelf's icon (Coy, 2026-10-22: "Maybe I could select the icon for a custom shelf. But
 * the standard shelves would use standard icons"): a standard shelf shows its own, fixed.
 */
function ShelfIconPick({ shelf, onPick }: { shelf: { id: string; icon?: string }; onPick: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = shelfIcon(shelf);
  if (isStandardShelf(shelf.id)) return <span className="sc-shelf-ico-btn" title="A standard shelf keeps its own icon" style={{ cursor: "default" }}><ShelfGlyph k={cur} /></span>;
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" className="sc-shelf-ico-btn" aria-expanded={open} aria-label="Pick this shelf's icon" title="Pick an icon" onClick={() => setOpen(!open)}><ShelfGlyph k={cur} /></button>
      {open && (
        <span className="sc-shelf-ico-grid" role="listbox" aria-label="Shelf icons">
          {SHELF_ICONS.map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === cur} className="sc-shelf-ico-btn" aria-label={k}
              onClick={() => { onPick(k); setOpen(false); }}><ShelfGlyph k={k} /></button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Picking the colour of a shelf's line, from the menu's colour book, so it follows the theme. */
function ShelfColorPick({ shelf, onPick }: { shelf: { color?: string }; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = shelfLine(shelf);
  const swatch = (k: string) => <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: iconVar(k as IconRole) }} />;
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" className="sc-shelf-ico-btn" aria-expanded={open} aria-label="Pick the colour of this shelf's line" title="Line colour" onClick={() => setOpen(!open)}>{swatch(cur)}</button>
      {open && (
        <span className="sc-shelf-ico-grid" role="listbox" aria-label="Line colours" style={{ gridTemplateColumns: "repeat(5, 28px)", width: 166 }}>
          {SHELF_LINES.map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === cur} className="sc-shelf-ico-btn" aria-label={BOOK_LABEL[k as IconRole] ?? k} title={BOOK_LABEL[k as IconRole] ?? k}
              onClick={() => { onPick(k); setOpen(false); }}>{swatch(k)}</button>
          ))}
        </span>
      )}
    </span>
  );
}

function GearIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="10" cy="10" r="2.4" />
      <path d="M15.96 7.96L18.3 8.72L18.3 11.28L15.96 12.04A6.3 6.3 0 0 1 15.66 12.77L16.78 14.96L14.96 16.78L12.77 15.66A6.3 6.3 0 0 1 12.04 15.96L11.28 18.3L8.72 18.3L7.96 15.96A6.3 6.3 0 0 1 7.23 15.66L5.04 16.78L3.22 14.96L4.34 12.77A6.3 6.3 0 0 1 4.04 12.04L1.7 11.28L1.7 8.72L4.04 7.96A6.3 6.3 0 0 1 4.34 7.23L3.22 5.04L5.04 3.22L7.23 4.34A6.3 6.3 0 0 1 7.96 4.04L8.72 1.7L11.28 1.7L12.04 4.04A6.3 6.3 0 0 1 12.77 4.34L14.96 3.22L16.78 5.04L15.66 7.23A6.3 6.3 0 0 1 15.96 7.96Z" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ href, label, sub, on, icon, avatar, color, indent, onPick, when, count }: {
  href: string; label: string; sub?: string; on?: boolean; icon?: React.ReactNode; avatar?: string; color?: string; indent?: boolean; onPick?: () => void; when?: string | null;
  count?: React.ReactNode;
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
      {count != null && <span className="sc-space-row-s" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{count}</span>}
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
function ShelfArranger({ shelves, pages, onChange, onReset }: { shelves: Shelf[]; pages: string[]; onChange: (v: Shelf[]) => void; onReset: () => void }) {
  const [adding, setAdding] = useState("");
  const label = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? PAGE.get(k)?.label ?? k;
  const where = (k: string) => shelves.find((x) => x.pages.includes(k))?.name ?? null;
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
            <ShelfIconPick shelf={sh} onPick={(icon) => set(i, { icon })} />
            <ShelfColorPick shelf={sh} onPick={(color) => set(i, { color })} />
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
          {sh.pages.length === 0 && <div className="sc-space-empty" style={{ paddingLeft: 4 }}>Empty.</div>}
          {sh.pages.map((k, pi) => {
            if (!PAGE.has(k) && !isChannel(k)) return null;
            const l = label(k);
            return (
              <div key={k} className="sc-shelf-page">
                {!isChannel(k) && <span className="sc-space-ico"><NavIcon k={k} on={false} color="currentColor" /></span>}
                <span className="sc-shelf-page-l">{l}</span>
                <button type="button" className="sc-shelf-btn" onClick={() => set(i, { pages: nudge(sh.pages, pi, -1) })} disabled={pi === 0} aria-label={`Move ${l} up`}>↑</button>
                <button type="button" className="sc-shelf-btn" onClick={() => set(i, { pages: nudge(sh.pages, pi, 1) })} disabled={pi === sh.pages.length - 1} aria-label={`Move ${l} down`}>↓</button>
                <select className="sc-shelf-move" value={sh.id} aria-label={`Shelf for ${l}`} onChange={(e) => onChange(moveToShelf(shelves, k, e.target.value))}>
                  {shelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {/* Take it off this shelf (Coy, 2026-10-22: "I still can't add or subtract things from a
                    shelf"): a thread list goes back under the shelves, a page to More. */}
                {(isChannel(k) || sh.id !== "more") && (
                  <button type="button" className="sc-shelf-btn sc-shelf-x" aria-label={`Take ${l} off ${sh.name}`} title={`Take it off ${sh.name}`}
                    onClick={() => onChange(offShelf(shelves, k))}>×</button>
                )}
              </div>
            );
          })}
          <AddPicker to={sh.name} sections={pickSections(pages).map((x) => ({
            title: x.title,
            items: x.keys.filter((k) => !sh.pages.includes(k)).map((k) => ({ k, label: label(k), note: where(k) ? `on ${where(k)}` : undefined })),
          }))} onAdd={(k) => onChange(moveToShelf(shelves, k, sh.id))} />
        </div>
      ))}
      {shelves.length < MAX_SHELVES && (
        <form className="sc-shelf-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="sc-shelf-name" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="New shelf name" maxLength={MAX_SHELF_NAME} aria-label="New shelf name" />
          <button type="submit" className="sc-shelf-arrange" disabled={!adding.trim()}>+ Shelf</button>
        </form>
      )}
      <button type="button" className="sc-space-more" onClick={onReset}>Restore defaults</button>
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
        <ShelfIconPick shelf={shelf} onPick={(icon) => set({ icon })} />
        <ShelfColorPick shelf={shelf} onPick={(color) => set({ color })} />
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
function useChannels(onPick: () => void, on = true) {
  const threads = useHomeThreads(on);
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
function SpaceHead({ name, kind, color, icon, tags, sub, back, editing, onGear, gearLabel }: {
  name: string; kind?: string; color: string; icon?: React.ReactNode; tags?: React.ReactNode; sub?: React.ReactNode; back?: React.ReactNode;
  editing?: boolean; onGear?: () => void; gearLabel?: string;
}) {
  return (
    <div className="sc-space-head" style={{ "--sc-head-c": color } as React.CSSProperties}>
      {back}
      <div className="sc-space-top">
        {/* The Space's own icon before its name (Coy, 2026-10-22: "the job icon in front of the job name"). */}
        {icon && <span className="sc-space-head-ico" style={{ color }}>{icon}</span>}
        <span className="sc-space-name" title={name}>{name}</span>
        {onGear && (
          <button type="button" className="sc-space-gear" onClick={onGear} aria-pressed={!!editing}
            aria-label={gearLabel ?? "Edit this drawer"} title={editing ? "Done" : (gearLabel ?? "Edit this drawer")}>
            {editing ? <span style={{ fontSize: 12, fontWeight: 600 }}>Done</span> : <GearIcon size={16} />}
          </button>
        )}
      </div>
      <span className="sc-space-sub" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {kind && <span className="sc-space-tag" style={{ color, borderColor: color }}>{kind}</span>}
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
  const pages = React.useContext(PagesCtx);
  const label = (k: string) => (isToolRow(k) ? PAGE.get(k.slice(2))?.label : rows.find((r) => r.k === k)?.label) ?? k;
  const setShelf = (i: number, patch: Partial<KindLayout["shelves"][number]>) =>
    onChange({ ...layout, shelves: layout.shelves.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)) });
  const pageShelves = layout.shelves.filter((sh) => !isSpecialShelf(sh.id));
  const listName = (id: string) => specialShelves(kind).find((x) => x.id === id)?.name ?? id;
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
          <span className="sc-shelf-page-l">{rail.on ? "Pinned to the rail" : "Not on the rail"}</span>
          <button type="button" className="sc-shelf-arrange" onClick={() => rail.set(!rail.on)}>{rail.on ? "Unpin from Rail" : "Pin to Rail"}</button>
        </div>
      )}
      {layout.shelves.map((sh, i) => (
        <div key={sh.id} className="sc-shelf-box">
          <div className="sc-shelf-row">
            <ShelfIconPick shelf={sh} onPick={(icon) => setShelf(i, { icon })} />
            <ShelfColorPick shelf={sh} onPick={(color) => setShelf(i, { color })} />
            <input className="sc-shelf-name" value={sh.name} maxLength={MAX_SHELF_NAME} aria-label="Shelf name"
              onChange={(e) => setShelf(i, { name: e.target.value })}
              onBlur={(e) => { if (!e.target.value.trim()) setShelf(i, { name: "Shelf" }); }} />
            <button type="button" className="sc-shelf-btn" onClick={() => onChange({ ...layout, shelves: nudge(layout.shelves, i, -1) })} disabled={i === 0} aria-label="Move shelf up">↑</button>
            <button type="button" className="sc-shelf-btn" onClick={() => onChange({ ...layout, shelves: nudge(layout.shelves, i, 1) })} disabled={i === layout.shelves.length - 1} aria-label="Move shelf down">↓</button>
            <button type="button" className="sc-shelf-btn" aria-label={`Remove ${sh.name}`} title="Remove this shelf — its pages leave the drawer"
              onClick={() => onChange(removeKindShelf(layout, sh.id))}>×</button>
          </div>
          {isSpecialShelf(sh.id)
            ? <div className="sc-space-empty">{sh.id === JOBS_SHELF ? `Every job of this ${KIND_WORD[kind]}` : "The people on it, each opening their thread"}</div>
            : <AddToShelf shelf={sh} layout={layout} rows={rows} pages={pages} label={label} onChange={onChange} />}
          {sh.rows.map((k, ri) => (
            <div key={k} className="sc-shelf-page">
              <span className="sc-shelf-page-l">{label(k)}</span>
              <button type="button" className="sc-shelf-btn" onClick={() => setShelf(i, { rows: nudge(sh.rows, ri, -1) })} disabled={ri === 0} aria-label={`Move ${label(k)} up`}>↑</button>
              <button type="button" className="sc-shelf-btn" onClick={() => setShelf(i, { rows: nudge(sh.rows, ri, 1) })} disabled={ri === sh.rows.length - 1} aria-label={`Move ${label(k)} down`}>↓</button>
              <select className="sc-shelf-move" value={sh.id} aria-label={`Shelf for ${label(k)}`} onChange={(e) => onChange(placeRow(layout, k, e.target.value || null))}>
                {pageShelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="">Not in the drawer</option>
              </select>
              <button type="button" className="sc-shelf-btn sc-shelf-x" aria-label={`Take ${label(k)} off ${sh.name}`} title={`Take it off ${sh.name}`}
                onClick={() => onChange(placeRow(layout, k, null))}>×</button>
            </div>
          ))}
        </div>
      ))}
      {layout.hidden.length > 0 && (
        <div className="sc-shelf-box">
          <span className="sc-shelf-edit-h">Not in the drawer</span>
          {layout.hidden.map((k) => (
            <div key={k} className="sc-shelf-page">
              <span className="sc-shelf-page-l">{isSpecialShelf(k) ? listName(k) : label(k)}</span>
              {isSpecialShelf(k)
                ? <button type="button" className="sc-shelf-arrange" onClick={() => onChange({ shelves: [...layout.shelves, { id: k, name: listName(k), rows: [] }], hidden: layout.hidden.filter((x) => x !== k) })}>Put back</button>
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
        <button type="button" className="sc-space-more" style={{ padding: "4px 0" }} onClick={onReset}>Restore defaults</button>
        <button type="button" className="sc-shelf-arrange" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/**
 * "+ Add" on a shelf of a job's, customer's or vendor's drawer: any of its pages not on this shelf
 * (from another shelf or out of the drawer), a list or tool from Home, or its Channels back.
 */
function AddToShelf({ shelf, layout, rows, pages, label, onChange }: {
  shelf: KindLayout["shelves"][number]; layout: KindLayout; rows: TreeRow[]; pages: string[]; label: (k: string) => string; onChange: (l: KindLayout) => void;
}) {
  const on = new Set(layout.shelves.flatMap((x) => x.rows));
  const where = (k: string) => layout.shelves.find((x) => x.rows.includes(k))?.name;
  const own = rows.filter((r) => !shelf.rows.includes(r.k));
  const secs = pickSections(pages.filter((k) => PAGE.has(k)))
    .map((x) => ({ title: x.title, items: x.keys.map((k) => `p:${k}`).filter((k) => !on.has(k)).map((k) => ({ k, label: label(k) })) }));
  const gone = layout.hidden.filter(isSpecialShelf);
  const listName = (id: string) => (id === JOBS_SHELF ? "Jobs" : "Contacts");
  return (
    <AddPicker to={shelf.name} sections={[
      { title: "This Space's pages", items: own.map((r) => ({ k: r.k, label: r.label, note: where(r.k) ? `on ${where(r.k)}` : "not in the drawer" })) },
      ...secs,
      { title: "Lists", items: gone.map((k) => ({ k, label: listName(k) })) },
    ]} onAdd={(k) => {
      if (isSpecialShelf(k)) onChange({ shelves: [...layout.shelves, { id: k, name: listName(k), rows: [] }], hidden: layout.hidden.filter((x) => x !== k) });
      else onChange(placeRow(layout, k, shelf.id));
    }} />
  );
}

/**
 * "+ Add to <shelf>" (Coy, 2026-10-22: "I still can't add or subtract things from a shelf:
 * contacts, customers, jobs, vendors"): a button that opens what can go on the shelf as plain
 * rows by section — Collections first — each one tap.
 */
function AddPicker({ to, sections, onAdd }: {
  to: string; sections: Array<{ title: string; items: Array<{ k: string; label: string; note?: string }> }>; onAdd: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = sections.filter((x) => x.items.length);
  if (!shown.length) return null;
  return (
    <div className="sc-add-pick">
      <button type="button" className="sc-add-pick-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : `+ Add to ${to}`}</button>
      {open && shown.map((x) => (
        <div key={x.title}>
          <span className="sc-shelf-edit-h" style={{ display: "block", padding: "6px 2px 2px" }}>{x.title}</span>
          {x.items.map((it) => (
            <button key={it.k} type="button" className="sc-add-pick-row" onClick={() => onAdd(it.k)}>
              <span aria-hidden="true" style={{ color: "var(--sc-hiviz-text)", fontWeight: 700 }}>+</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              {it.note && <span className="sc-space-row-s">{it.note}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of a kind's drawer: one of its own pages, or a tool from Home ("p:map"). */
function LayoutRow({ k, byK, here, pick }: { k: string; byK: Map<string, TreeRow>; here: string; pick: () => void }) {
  if (isToolRow(k)) {
    const key = k.slice(2);
    const p = PAGE.get(key);
    if (!p) return null;
    return <Row href={SPACES_HREF[key] ?? p.href} label={p.label} onPick={pick} count={<CollCount k={key} />} icon={<span className="sc-space-ico"><NavIcon k={key} on={false} color="currentColor" /></span>} />;
  }
  const r = byK.get(k);
  return r ? <Row href={r.href} label={r.label} indent={r.sub} on={here === k} onPick={pick} /> : null;
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
  // The people are in the Collections' list pages, not repeated under them (Coy, 2026-10-22); only
  // Spam and Archived stay loose, and a bucket put on a shelf with its gear still lists its people.
  // Spam and Archived go under the More shelf when there is one, so there is one More, not two.
  const moreShelf = shelves.some((sh) => sh.id === "more");
  const loose = homeLooseGroups(shelves).filter((ch) => !(moreShelf && ch === "ch:more"));
  const { channelRows, chCount } = useChannels(onPick, shelves.some((sh) => sh.pages.some((k) => isChannel(k) && k !== "ch:more")));
  const groupKeys = [
    ...shelves.map((sh) => `home:${sh.id}`),
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
          ? <ShelfArranger shelves={shelves} pages={pages} onChange={saveShelves} onReset={() => saveShelves(null)} />
          : shelves.map((sh) => (

            <Group key={sh.id} id={`home:${sh.id}`} closed={closed} onToggle={toggle} title={sh.name} icon={shelfIcon(sh)} line={shelfLine(sh)}
              gear={(
                <button type="button" className="sc-shelf-gear" aria-label={`Edit the ${sh.name} shelf`} title="Edit this shelf"
                  aria-pressed={editing === sh.id} onClick={() => setEditing(editing === sh.id ? null : sh.id)}
                  style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }}><GearIcon /></button>
              )}>
              {editing === sh.id && <ShelfEditor shelves={shelves} shelf={sh} pages={pages} onChange={saveShelves} onDone={() => setEditing(null)} />}
              {sh.pages.length === 0 && editing !== sh.id && sh.id !== "more" && <div className="sc-space-empty">Empty — the gear puts tools and channels here.</div>}
              {sh.pages.map((k) => {
                if (isChannel(k)) return <React.Fragment key={k}>{channelRows(k, true)}</React.Fragment>;
                const p = PAGE.get(k);
                if (!p) return null;
                return (
                  <React.Fragment key={k}>
                    <Row href={SPACES_HREF[k] ?? p.href} label={p.label} on={isOn(active, k)} onPick={onPick} count={<CollCount k={k} />}
                      icon={<span className="sc-space-ico"><NavIcon k={k} on={isOn(active, k)} color="currentColor" /></span>} />
                    {k === "vendors" && <VendorTrades onPick={onPick} />}
                  </React.Fragment>
                );
              })}
              {sh.id === "more" && channelRows("ch:more", true)}
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
      <SpaceHead name={title} kind="Job" color="var(--sc-hiviz)" icon={<NavIcon k="scope" on={false} color="currentColor" />} editing={editing} onGear={() => setEditing(!editing)} gearLabel="Edit every job's drawer"
        tags={<span className="sc-space-tag" style={{ color: stageColor(status), borderColor: stageColor(status) }}>{stageLabel(status)}</span>}
        sub={customer ?? undefined} />
      <LayoutDrawer kind="job" id={id} here={here} pick={pick} editing={editing} setEditing={setEditing}
        rail={{ on: rail.on, set: (on) => rail.set(on, title) }}
        d={d} />
    </>
  );
}

/**
 * A job's, customer's or vendor's shelves, laid out as Coy set them for that kind of Space
 * (`space_layouts`), or the editor while the head's gear is on.
 */
function LayoutDrawer({ kind, id, here, pick, editing, setEditing, rail, d, nested }: {
  kind: LayoutKind; id: string; here: string; pick: () => void; editing: boolean; setEditing: (v: boolean) => void;
  rail: { on: boolean; set: (on: boolean) => void };
  d: JobDetail | null;
  /** Opened under its row in a collection's list, not a drawer of its own. */
  nested?: boolean;
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
  const keys = layout.shelves.map((sh) => `${kind}:${sh.id}`);
  return (
    <div className={nested ? "sc-space-nest" : "sc-space-scroll"}>
      {!nested && <div style={{ display: "flex" }}><FoldAll keys={keys} closed={closed} setAll={setAll} /></div>}
      {layout.shelves.map((sh) => isSpecialShelf(sh.id)
        ? (
          <Group key={sh.id} title={sh.name} id={`${kind}:${sh.id}`} icon={shelfIcon(sh)} line={shelfLine(sh)} count={sh.id === JOBS_SHELF ? d?.jobs?.length : d?.people.length} {...g}>
            {sh.id === JOBS_SHELF ? <JobRows d={d} onPick={pick} />
              : <ContactRows d={d} onPick={pick} add={addContactHref(kind, id)} empty={kind === "job" ? "No one on this job yet." : undefined} />}
          </Group>
        )
        : (
          <Group key={sh.id} title={sh.name} id={`${kind}:${sh.id}`} icon={shelfIcon(sh)} line={shelfLine(sh)} {...g}>
            {sh.rows.length === 0 && <div className="sc-space-empty">Empty — the gear adds pages and tools here.</div>}
            {sh.rows.map((k) => <LayoutRow key={k} k={k} byK={byK} here={here} pick={pick} />)}
          </Group>
        ))}
    </div>
  );
}

/**
 * The Contacts shelf (Coy, 2026-10-22: "Any contact will have one single thread page … nested
 * under it"): the people on this job, customer or vendor, each opening their one thread —
 * phone, email and notes together — with their newest call or text under the name.
 */
function ContactRows({ d, onPick, empty, add }: { d: JobDetail | null; onPick: () => void; empty?: React.ReactNode; add?: string }) {
  const path = usePathname() ?? "";
  const rows = d ? contactThreads(d.people) : [];
  return (
    <>
      {!d && <div className="sc-space-empty">Loading…</div>}
      {d && rows.length === 0 && <div className="sc-space-empty">{empty ?? "No one here yet."}</div>}
      {rows.map((t) => (
        <Row key={t.key} href={t.href} label={t.title} sub={t.sub} when={t.when} on={path.startsWith(t.href)} onPick={onPick} avatar={t.avatar} />
      ))}
      {d && add && <Link className="sc-space-more" href={add} onClick={onPick} style={{ paddingLeft: 14 }}>+ Add contact</Link>}
    </>
  );
}

/**
 * A customer's or vendor's Jobs shelf: each of their jobs, open ones first, opening in place to its
 * pages and its contacts (Coy, 2026-10-22: "all the pages for that job … listed and expandable
 * underneath the job list for that customer in the customer drawer … so I can easily navigate back
 * to the drawer I was in"). The drawer stays the customer's on those pages; the job's own tile on
 * the rail still opens the job's drawer.
 */
function JobRows({ d, onPick }: { d: JobDetail | null; onPick: () => void }) {
  const path = usePathname() ?? "";
  const jobs = d?.jobs ?? [];
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const flip = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      {!d && <div className="sc-space-empty">Loading…</div>}
      {d && jobs.length === 0 && <div className="sc-space-empty">No jobs yet.</div>}
      {jobs.map((j) => {
        const onJob = path.startsWith(`/dashboard/scope/${j.id}`);
        // The job open is opened; a tap on its row folds it like any other.
        const isOpen = open.has(j.id) !== onJob;
        return <JobNest key={j.id} job={j} open={isOpen} onJob={onJob} onToggle={() => flip(j.id)} onPick={onPick} />;
      })}
    </>
  );
}

/** One job under a customer's or vendor's Jobs shelf: its name, then (open) its pages and contacts. */
function JobNest({ job, open, onJob, onToggle, onPick }: {
  job: { id: string; title: string; status: string | null }; open: boolean; onJob: boolean; onToggle: () => void; onPick: () => void;
}) {
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const { layout } = useKindLayout("job");
  const d = useSpaceDetail("job", open ? job.id : null);
  const rows = useMemo(() => kindRows("job", job.id), [job.id]);
  const byK = new Map(rows.map((r) => [r.k, r]));
  const order = layout.shelves.flatMap((sh) => sh.rows).filter((k) => byK.has(k) || isToolRow(k));
  const here = onJob ? activeTreeRow(path, search) : "";
  return (
    <div>
      <button type="button" className="sc-space-row" onClick={onToggle} aria-expanded={open}
        style={{ width: "calc(100% - 16px)", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: "pointer" }}>
        <span className="sc-space-ico" style={{ color: stageColor(job.status) }}><NavIcon k="scope" on={false} color="currentColor" /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="sc-space-row-l">{job.title}</span>
          <span className="sc-space-row-s">{stageLabel(job.status)}</span>
        </span>
        <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s", color: "var(--sc-ink3)" }}>›</span>
      </button>
      {open && (
        <div className="sc-space-nest" style={{ paddingLeft: 18 }}>
          {order.map((k) => <LayoutRow key={k} k={k} byK={byK} here={here} pick={pick} />)}
          <div className="sc-space-sub-h" style={{ cursor: "default" }}>Contacts</div>
          <ContactRows d={d} onPick={pick} add={addContactHref("job", job.id)} empty="No one on this job yet." />
        </div>
      )}
    </div>
  );
}

/** Where "+ Add contact" goes for each kind of Space. */
function addContactHref(kind: LayoutKind, id: string) {
  return kind === "job" ? `/dashboard/scope/${id}/summary` : kind === "customer" ? `/dashboard/customers/${id}?tab=contacts` : `/dashboard/vendors/${id}?tab=people`;
}

/**
 * A job, customer or vendor in a Work Space of your own, as a shelf of its pages (Coy,
 * 2026-10-22: "adding a customer to a space should not be attaching a link to the customer
 * space, but referencing that customer (with all the pages and contacts and vendors associated
 * with the customer) … Perhaps the job needs to be a shelf inside a custom space that brings all
 * the pages to the space"). Its pages in the order its kind's drawer has them, then its jobs and
 * its contacts, each opening their one thread; nothing is copied, and the drawer stays this Work Space.
 */
function MemberShelf({ colId, m, closed, onToggle, onPick }: {
  colId: string; m: SpacePin; closed: Set<string>; onToggle: (k: string) => void; onPick: () => void;
}) {
  const key = `col:${colId}:m:${m.kind}:${m.id}`;
  const open = !closed.has(key);
  const { layout } = useKindLayout(m.kind);
  const d = useSpaceDetail(m.kind, open ? m.id : null);
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const rows = useMemo(() => kindRows(m.kind, m.id), [m.kind, m.id]);
  const byK = new Map(rows.map((r) => [r.k, r]));
  const order = layout.shelves.flatMap((sh) => sh.rows).filter((k) => byK.has(k) || isToolRow(k));
  const onPage = m.kind === "job" ? path.startsWith(`/dashboard/scope/${m.id}`)
    : path.startsWith(m.kind === "customer" ? `/dashboard/customers/${m.id}` : `/dashboard/vendors/${m.id}`);
  const here = !onPage ? "" : m.kind === "job" ? activeTreeRow(path, search) : activeTab(search);
  const word = m.kind === "job" ? "Job" : m.kind === "customer" ? "Customer" : "Vendor";
  const color = m.kind === "job" ? "var(--sc-hiviz)" : m.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)";
  return (
    <Group id={key} closed={closed} onToggle={onToggle} title={m.name}
      gear={<span className="sc-space-tag" style={{ color, borderColor: color, flexShrink: 0 }}>{word}</span>}>
      {order.map((k) => <LayoutRow key={k} k={k} byK={byK} here={here} pick={pick} />)}
      {m.kind !== "job" && <>
        <div className="sc-space-sub-h" style={{ cursor: "default" }}>Jobs</div>
        <JobRows d={d} onPick={pick} />
      </>}
      <div className="sc-space-sub-h" style={{ cursor: "default" }}>Contacts</div>
      <ContactRows d={d} onPick={pick} />
    </Group>
  );
}


/* ------------------------------------------------------------ a collection's list */

const LIST_API: Record<CollectionList, string> = { customers: "/api/customers", vendors: "/api/vendors", contacts: "/api/contacts", scope: "/api/jobs" };
const listCache = new Map<CollectionList, { at: number; rows: ListRow[] }>();
/** A collection's records, kept a minute between drawers. */
function useCollectionList(list: CollectionList) {
  const [rows, setRows] = useState<ListRow[] | null>(listCache.get(list)?.rows ?? null);
  useEffect(() => {
    let off = false;
    const hit = listCache.get(list);
    if (hit) Promise.resolve().then(() => { if (!off) setRows(hit.rows); });
    if (hit && Date.now() - hit.at < FRESH) return () => { off = true; };
    fetch(LIST_API[list]).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (off || !j) return;
      const next = collectionListRows(list, j);
      listCache.set(list, { at: Date.now(), rows: next });
      setRows(next);
    }).catch(() => { if (!off && !hit) setRows([]); });
    return () => { off = true; };
  }, [list]);
  return rows;
}

const LIST_SHOWN = 150;

/**
 * How many are in a collection, to the right of its row (Coy, 2026-10-22: "Show the count of
 * customers, contacts, jobs and vendors to the right of each of those collections"). Jobs leave
 * out lost ones, as the Scope Builder's list does. Nothing for a tool.
 */
function CollCount({ k }: { k: string }) {
  return COLLECTION_PAGES.includes(k) ? <CollCountOf list={k as CollectionList} /> : null;
}
function CollCountOf({ list }: { list: CollectionList }) {
  const rows = useCollectionList(list);
  if (!rows) return null;
  return <>{(list === "scope" ? rows.filter((r) => r.status !== "lost") : rows).length}</>;
}

/**
 * A collection's list in the drawer (Coy, 2026-10-22: "if I'm looking at a Customer list page after
 * clicking it in the 'Collections' shelf … and THEN click into a customer, the drawer would change
 * into an expanded list of customers with a back button on the top left … to bring me back to the
 * home drawer"). Every record, found by a word; the one open lit and opened to its shelves.
 */
function CollectionListDrawer({ list, current, onPick, onBack }: {
  list: CollectionList; current: string; onPick: () => void; onBack: () => void;
}) {
  const rows = useCollectionList(list);
  const [q, setQ] = useState("");
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const kind: LayoutKind | null = list === "customers" ? "customer" : list === "vendors" ? "vendor" : list === "scope" ? "job" : null;
  const detail = useSpaceDetail(kind ?? "customer", kind ? current : null);
  const here = kind === "job" ? activeTreeRow(path, search) : activeTab(search);
  const label = COLLECTION_LIST_LABEL[list];
  const found = filterListRows(rows ?? [], q);
  // Long lists show their first rows, and the one open wherever it sits.
  const at = found.findIndex((r) => r.id === current);
  const show = found.length > LIST_SHOWN ? [...found.slice(0, LIST_SHOWN), ...(at >= LIST_SHOWN ? [found[at]] : [])] : found;
  const curRef = useRef<HTMLDivElement>(null);
  const loaded = rows !== null;
  useEffect(() => { if (loaded) curRef.current?.scrollIntoView({ block: "nearest" }); }, [current, loaded]);
  const color = list === "customers" ? "var(--sc-chalk)" : list === "vendors" ? "var(--sc-bucket-vendor)" : list === "contacts" ? "var(--sc-bucket-customer)" : "var(--sc-hiviz)";
  const listHref = SPACES_HREF[list] ?? PAGE.get(list)?.href ?? "/dashboard";
  return (
    <>
      <SpaceHead name={label} kind="Collection" color={color} icon={<NavIcon k={list} on={false} color="currentColor" />}
        sub={rows ? `${rows.length} ${rows.length === 1 ? "record" : "records"}` : undefined}
        back={<button type="button" className="sc-space-back" onClick={onBack}>‹ Home</button>} />
      <div className="sc-space-find">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find in ${label.toLowerCase()}`} aria-label={`Find in ${label}`} />
      </div>
      <div className="sc-space-scroll">
        <Row href={listHref} label={`All ${label.toLowerCase()} — the list page`} onPick={onPick}
          icon={<span className="sc-space-ico"><NavIcon k={list} on={false} color="currentColor" /></span>} />
        {rows === null && <div className="sc-space-empty">Loading…</div>}
        {rows !== null && found.length === 0 && <div className="sc-space-empty">{q ? "Nothing by that name." : "None yet."}</div>}
        {show.map((r) => {
          const on = r.id === current;
          const row = (
            <Row href={r.href} label={r.name} sub={r.status != null ? [stageLabel(r.status), r.sub].filter(Boolean).join(" · ") : r.sub ?? undefined} on={on} onPick={pick}
              {...(list === "scope"
                ? { icon: <span className="sc-space-ico" style={{ color: stageColor(r.status ?? null) }}><NavIcon k="scope" on={false} color="currentColor" /></span> }
                : { avatar: monogram(r.name), color })} />
          );
          if (!on) return <React.Fragment key={r.id}>{row}</React.Fragment>;
          return (
            <div key={r.id} ref={curRef} className="sc-space-open-rec">
              {row}
              {kind && <LayoutDrawer nested kind={kind} id={current} here={here} pick={pick} editing={false} setEditing={() => {}}
                rail={{ on: true, set: () => {} }} d={detail} />}
            </div>
          );
        })}
        {found.length > show.length && <div className="sc-space-empty">{found.length - show.length} more — type a name to find them.</div>}
      </div>
    </>
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
      <SpaceHead name={name ?? word} kind={word} color={color} icon={<NavIcon k={kind === "customer" ? "customers" : "vendors"} on={false} color="currentColor" />} editing={editing} onGear={() => setEditing(!editing)}
        gearLabel={`Edit every ${kind}'s drawer`} sub={rail.on ? undefined : "Not on the rail"}
        back={/* Back to Home (Coy, 2026-10-19: "I need a back button here once I click into a customer or vendor"). */
          <button type="button" className="sc-space-back" onClick={onBack}>‹ {kind === "customer" ? "Customers" : "Vendors"}</button>} />
      <LayoutDrawer kind={kind} id={id} here={here} pick={pick} editing={editing} setEditing={setEditing}
        rail={{ on: rail.on, set: (on) => name && rail.set(on, name) }}
        d={detail} />
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

function CollectionDrawer({ col, id, pages, active, onPick, onDeleted }: {
  col: RailCollection | null; id: string; pages: string[]; active: string; onPick: () => void;
  /** After Delete this Work Space: the drawer goes back to Home. */
  onDeleted: () => void;
}) {
  const [raw, setRaw] = usePref<unknown>("spaces_collections", {});
  const all = useMemo(() => cleanCollectionPicks(raw), [raw]);
  const picks = all[id] ?? [];
  const [memRaw, setMemRaw] = usePref<unknown>("spaces_col_members", {});
  const allMembers = useMemo(() => cleanMembers(memRaw), [memRaw]);
  const members = allMembers[id] ?? [];
  const [shRaw, setShRaw] = usePref<unknown>("spaces_col_shelves", {});
  const allShelves = useMemo(() => cleanColShelves(shRaw), [shRaw]);
  const shelves: ColShelf[] = allShelves[id] ?? [];
  const byShelf = membersByShelf(members, shelves);
  const [editing, setEditing] = useState(false);
  // "+ Add" open: "" adds at the top, a shelf's id adds onto that shelf.
  const [adding, setAdding] = useState<string | null>(null);
  const [newShelf, setNewShelf] = useState("");
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
  const sections = BUCKETS.map((b) => ({ k: b.k, title: b.label, color: b.color, people: loose.filter((t) => kindOf(t) === b.k) }))
    .filter((g) => g.people.length > 0);
  const keys = [...shelves.map((x) => `col:${id}:s:${x.id}`), ...members.map((m) => `col:${id}:m:${m.kind}:${m.id}`), ...sections.map((g) => `col:${id}:m:${g.k}`),
    ...(tools.length ? [`col:${id}:collections`, `col:${id}:tools`] : []), ...chans.map((c) => `col:${id}:${c}`)];
  // Jobs, customers and vendors added while editing put their people on its thread.
  const changeMembers = (v: SpacePin[], shelf?: string | null) => {
    const added = v.filter((m) => !members.some((x) => x.kind === m.kind && x.id === m.id));
    const placed = shelf ? v.map((m) => (added.includes(m) ? { ...m, shelf } : m)) : v;
    setMemRaw(setMembers(allMembers, id, placed));
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
  const name = col?.name ?? "Work Space";
  const isEmpty = members.length === 0 && picks.length === 0 && folk !== null && folk.length === 0;
  const addingTo = adding ?? (isEmpty && !editing ? "" : null);
  const makeShelf = () => {
    const v = newShelf.trim();
    if (!v) return;
    setShRaw(addColShelf(allShelves, id, v, `s${Date.now().toString(36)}`));
    setNewShelf("");
  };
  // Deleting it from its own gear (Coy, 2026-10-22: "How do I easily delete a work space?") — the
  // same delete as Rail settings: the thread is retired, its people and their threads stay.
  const [deleting, setDeleting] = useState(false);
  const deleteSpace = async () => {
    if (!window.confirm(`Delete the Work Space "${name}"? The people and their threads stay.`)) return;
    setDeleting(true);
    const r = await fetch(`/api/threads/custom/${id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    if (!r?.ok) { window.alert("Couldn't delete that Work Space — try again."); return; }
    setEditing(false);
    onDeleted();
    window.dispatchEvent(new Event("sc:spaces-reload"));
  };
  const dropShelf = (sid: string) => {
    const r = removeColShelf(allShelves, allMembers, id, sid);
    setShRaw(r.shelves);
    setMemRaw(r.members);
  };
  const askDusty = () => {
    window.dispatchEvent(new Event("sc:dusty-open"));
    const q = `Help me build out my Work Space “${name}”. Ask me what it is for, then suggest which jobs, customers and vendors to put in it and how to group them on shelves (by area or phase), as a work_space plan for this Work Space.`;
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: q } })), 250);
  };
  // The add panel: jobs, customers and vendors (onto a shelf when one was picked), and at the top
  // also the lists, tools and threads to keep beside them.
  const addPanel = (to: string) => (
    <div className="sc-shelf-edit" style={{ borderTop: `1px solid ${T.hair}` }}>
      <div className="sc-shelf-row" style={{ justifyContent: "space-between" }}>
        <span className="sc-shelf-edit-h" style={{ margin: 0 }}>
          {to ? `Add to ${shelves.find((x) => x.id === to)?.name ?? "this shelf"}` : `Add to ${name}`}
        </span>
        {(adding !== null) && <button type="button" className="sc-shelf-arrange" onClick={() => setAdding(null)}>Done</button>}
      </div>
      {/* One place to add (Coy, 2026-10-22: "why is there an + add button AND an add shelf button.
          There should just be one place to add and name at the top"): a new shelf is named here. */}
      {!to && (
        <form className="sc-shelf-row" onSubmit={(e) => { e.preventDefault(); makeShelf(); }}>
          <input className="sc-shelf-name" value={newShelf} onChange={(e) => setNewShelf(e.target.value)} placeholder="New shelf, like North Baton Rouge" maxLength={40} aria-label="New shelf name" />
          <button type="submit" className="sc-shelf-arrange" disabled={!newShelf.trim()}>+ Shelf</button>
        </form>
      )}
      {!to && <span className="sc-shelf-edit-h">Jobs, customers and vendors</span>}
      <ItemPicker kinds={["job", "customer", "vendor"]} picked={members} onChange={(v) => changeMembers(v, to || null)} />
      {!to && <>
        {/* A person on their own, say a vendor being vetted (Coy, 2026-10-22: "add a contact
            directly to a new workspace individually"): picked from the contact book onto its thread. */}
        <span className="sc-shelf-edit-h">Contacts</span>
        <ContactPicker autoFocus={false} exclude={(folk ?? []).map((t) => t.contact_id)} onPick={(c) => {
          void fetch(`/api/threads/custom/${id}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_ids: [c.id] }) })
            .then(() => window.dispatchEvent(new Event("sc:spaces-reload"))).catch(() => {});
        }} />
        <span className="sc-shelf-edit-h">Lists and tools</span>
        <PickList pages={pages} picks={picks} onChange={(v) => setRaw(setPicks(all, id, v))} />
      </>}
      {!to && (
        <button type="button" className="sc-space-more" style={{ padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }} onClick={askDusty}>
          <DustyAvatar state="idle" size={18} hidden /> Or build it with Dusty
        </button>
      )}
    </div>
  );
  const memberShelf = (m: SpacePin) => <MemberShelf key={`${m.kind}:${m.id}`} colId={id} m={m} closed={closed} onToggle={toggle} onPick={onPick} />;
  const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "");
  const holds = [
    count(members.filter((m) => m.kind === "job").length, "job", "jobs"),
    count(members.filter((m) => m.kind === "customer").length, "customer", "customers"),
    count(members.filter((m) => m.kind === "vendor").length, "vendor", "vendors"),
    count(loose.length, "person", "people"),
  ].filter(Boolean).join(" · ");
  return (
    <>
      {/* No kind tag (Coy, 2026-10-22: "there will be only 1 kind of a space moving forward: a
          custom one") — what it holds says enough. */}
      <SpaceHead name={name} color="var(--sc-violet)" editing={editing} onGear={() => setEditing(!editing)}
        gearLabel="Rename it, take things out, arrange its shelves, or delete it"
        sub={holds || "Empty — + Add puts jobs, customers, vendors and tools in it"} />
      <div className="sc-space-scroll">
        {editing ? (
          <div className="sc-shelf-edit">
            <div className="sc-shelf-row">
              <input className="sc-shelf-name" value={nameDraft ?? name} maxLength={80} aria-label="Work Space name"
                onChange={(e) => setNameDraft(e.target.value)} onBlur={() => void rename()}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </div>
            {shelves.length > 0 && <span className="sc-shelf-edit-h">Shelves</span>}
            {shelves.map((x, i) => (
              <div key={x.id} className="sc-shelf-row">
                <ShelfIconPick shelf={x} onPick={(icon) => setShRaw(iconColShelf(allShelves, id, x.id, icon))} />
                <ShelfColorPick shelf={x} onPick={(color) => setShRaw(colorColShelf(allShelves, id, x.id, color))} />
                <input className="sc-shelf-name" defaultValue={x.name} maxLength={40} aria-label="Shelf name"
                  onBlur={(e) => setShRaw(renameColShelf(allShelves, id, x.id, e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <button type="button" className="sc-shelf-btn" onClick={() => setShRaw(moveColShelf(allShelves, id, x.id, -1))} disabled={i === 0} aria-label={`Move ${x.name} up`}>↑</button>
                <button type="button" className="sc-shelf-btn" onClick={() => setShRaw(moveColShelf(allShelves, id, x.id, 1))} disabled={i === shelves.length - 1} aria-label={`Move ${x.name} down`}>↓</button>
                <button type="button" className="sc-shelf-btn" onClick={() => dropShelf(x.id)} aria-label={`Remove ${x.name}`} title="Remove this shelf — what is on it goes to the top">×</button>
              </div>
            ))}
            <span className="sc-shelf-edit-h">In it now · × takes it out</span>
            {members.length === 0 && (folk ?? []).length === 0 && <div className="sc-space-empty">Nothing yet.</div>}
            {members.map((m) => (
              <div key={`${m.kind}:${m.id}`} className="sc-shelf-page">
                <span className="sc-shelf-page-l">{m.name} <small style={{ color: "var(--sc-ink3)" }}>{m.kind === "job" ? "Job" : m.kind === "customer" ? "Customer" : "Vendor"}</small></span>
                {shelves.length > 0 && (
                  <select className="sc-shelf-move" value={shelves.some((x) => x.id === m.shelf) ? m.shelf : ""} aria-label={`Shelf for ${m.name}`}
                    onChange={(e) => setMemRaw(setMembers(allMembers, id, setMemberShelf(members, m.kind, m.id, e.target.value || null)))}>
                    <option value="">At the top</option>
                    {shelves.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
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
            <div className="sc-shelf-row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="sc-shelf-arrange" onClick={() => void deleteSpace()} disabled={deleting}
                style={{ color: "var(--sc-red)", borderColor: "var(--sc-red)" }}>{deleting ? "Deleting…" : "Delete this Work Space"}</button>
              <button type="button" className="sc-shelf-arrange" onClick={() => setEditing(false)}>Done</button>
            </div>
          </div>
        ) : <>
          {/* + Add is always in sight (Coy, 2026-10-22: "There is no + button to add a tool, or
              channel or page or collection"). */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {addingTo === null && <button type="button" className="sc-space-more" style={{ paddingLeft: 14, fontWeight: 600 }} onClick={() => setAdding("")}>+ Add</button>}
            {!isEmpty && <FoldAll keys={keys} closed={closed} setAll={setAll} />}
          </div>
          {addingTo === "" && addPanel("")}
          {folk === null && members.length === 0 && <div className="sc-space-empty">Loading…</div>}
          {byShelf.loose.map(memberShelf)}
          {byShelf.shelves.map((x) => (
            <Group key={x.id} id={`col:${id}:s:${x.id}`} closed={closed} onToggle={toggle} title={x.name} icon={shelfIcon(x)} line={shelfLine(x)} count={x.items.length}
              gear={<button type="button" className="sc-shelf-gear" aria-label={`Add to ${x.name}`} title={`Add to ${x.name}`}
                onClick={() => setAdding(adding === x.id ? null : x.id)} style={{ border: 0, background: "none", cursor: "pointer", padding: "0 2px", fontSize: 15, lineHeight: 1, color: "inherit" }}>+</button>}>
              {addingTo === x.id && addPanel(x.id)}
              {x.items.length === 0 && addingTo !== x.id && <div className="sc-space-empty">Empty — + puts jobs, customers and vendors here.</div>}
              <div style={{ paddingLeft: 8 }}>{x.items.map(memberShelf)}</div>
            </Group>
          ))}
          {sections.map((g) => (
            <Group key={g.k} id={`col:${id}:m:${g.k}`} closed={closed} onToggle={toggle} count={g.people.length} title={g.title}>
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
                return <Row key={k} href={SPACES_HREF[k] ?? p.href} label={p.label} on={isOn(active, k)} onPick={onPick} count={<CollCount k={k} />}
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
  const [memRaw] = usePref<unknown>("spaces_col_members", {});
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
    <button key={`${ab}:${label}`} type="button" className="sc-strip-chip" style={{ color, borderColor: color }} onClick={onOpen} title={label} aria-label={`${label} — open the drawer`}>{ab}</button>
  );
  let icons: React.ReactNode[];
  let chips: React.ReactNode[];
  if (shown.kind === "home") {
    const order = shelves.flatMap((sh) => sh.pages);
    icons = order.map((k) => {
      const p = PAGE.get(k);
      return p ? icon(k, p.label, SPACES_HREF[k] ?? p.href, isOn(active, k), <NavIcon k={k} on={isOn(active, k)} color="currentColor" />) : null;
    });
    chips = [];
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
    // Each job, customer and vendor in it is a shelf of its own in the open drawer.
    const members = cleanMembers(memRaw)[shown.id] ?? [];
    chips = [chip("WS", "Work Space", "var(--sc-violet)"),
      ...members.map((m) => chip(monogram(m.name), m.name, m.kind === "job" ? "var(--sc-hiviz)" : m.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)"))];
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
// The collection list page you came from, so a record opened from it shows that list in the drawer.
let listStayed: CollectionList | null = null;

// Where the open tile's tab meets the drawer, so the drawer's coloured edge can leave that stretch
// out and the tab reads as part of the drawer (Coy, 2026-10-22). Set on the nav as --sc-tab-a /
// --sc-tab-b, the gap's top and bottom in px; re-measured as the rail scrolls or its tiles change.
function useTabGap() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const rail = el.querySelector<HTMLElement>(".sc-spaces-rail");
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slot = el.querySelector<HTMLElement>(".sc-spaces-rail .sc-space-slot[data-on]");
        const nav = el.getBoundingClientRect();
        let a = 0, b = 0;
        if (slot && rail) {
          const r = slot.getBoundingClientRect(), rr = rail.getBoundingClientRect();
          // The tab is the slot plus 4px each way with a 2px border: the gap is its inside.
          const top = Math.max(r.top - 2, rr.top), bottom = Math.min(r.bottom + 2, rr.bottom);
          if (bottom > top) { a = top - nav.top; b = bottom - nav.top; }
        }
        el.style.setProperty("--sc-tab-a", `${Math.round(a)}px`);
        el.style.setProperty("--sc-tab-b", `${Math.round(b)}px`);
      });
    };
    measure();
    rail?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const mo = new MutationObserver(measure);
    if (rail) mo.observe(rail, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-on"] });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); rail?.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); mo.disconnect(); ro.disconnect(); };
  }, [el]);
  return setEl;
}

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
  // A Work Space of your own keeps its drawer on its jobs', customers' and vendors' own pages
  // (Coy, 2026-10-22: "click on that customer in the drawer, it takes me to a different space").
  const [colMemRaw, setColMemRaw] = usePref<unknown>("spaces_col_members", {});
  const colMembers = useMemo(() => cleanMembers(colMemRaw), [colMemRaw]);
  // A Work Space Dusty's plan made (apply-plan.ts made its thread): its shelves, members and tools.
  const [colPickRaw, setColPickRaw] = usePref<unknown>("spaces_collections", {});
  const [colShRaw, setColShRaw] = usePref<unknown>("spaces_col_shelves", {});
  const built = useRef({ colMemRaw, colPickRaw, colShRaw });
  useEffect(() => { built.current = { colMemRaw, colPickRaw, colShRaw }; }, [colMemRaw, colPickRaw, colShRaw]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { id?: string; shelves?: string[]; members?: Array<{ kind: SpacePin["kind"]; id: string; name: string; shelf: string | null }>; tools?: string[] } | undefined;
      if (!d?.id) return;
      const id = d.id;
      let sh = cleanColShelves(built.current.colShRaw);
      const ids = new Map<string, string>();
      (d.shelves ?? []).forEach((n, i) => {
        const sid = `s${Date.now().toString(36)}${i}`;
        const next = addColShelf(sh, id, n, sid);
        if (next !== sh) { sh = next; ids.set(n.toLowerCase(), sid); }
      });
      if (ids.size) setColShRaw(sh);
      const pins: SpacePin[] = (d.members ?? []).map((m) => {
        const shelf = m.shelf ? ids.get(m.shelf.toLowerCase()) : undefined;
        return { kind: m.kind, id: m.id, name: m.name || m.kind, ...(shelf ? { shelf } : {}) };
      });
      if (pins.length) setColMemRaw(setMembers(cleanMembers(built.current.colMemRaw), id, pins));
      const tools = (d.tools ?? []).filter((k) => pages.includes(k));
      if (tools.length) setColPickRaw(setPicks(cleanCollectionPicks(built.current.colPickRaw), id, tools));
      window.dispatchEvent(new Event("sc:spaces-reload"));
    };
    window.addEventListener("sc:space-build", on);
    return () => window.removeEventListener("sc:space-build", on);
  }, [pages, setColMemRaw, setColPickRaw, setColShRaw]);
  const recJobs = (k: string, id: string) => jobCache.get(`${k}:${id}`)?.d.jobs ?? [];
  const keepCol = stay?.kind === "collection" && (holdsSpace(colMembers[stay.id] ?? [], here)
    || (here.kind === "job" && (colMembers[stay.id] ?? []).some((m) => m.kind !== "job" && recJobs(m.kind, m.id).some((j) => j.id === here.id))));
  // A customer's or vendor's drawer stays on its own jobs' pages, opened from its Jobs shelf
  // (Coy, 2026-10-22); the job's own tile on the rail makes the job the Space you are in.
  const keepRec = (stay?.kind === "customer" || stay?.kind === "vendor") && here.kind === "job"
    && recJobs(stay.kind, stay.id).some((j) => j.id === here.id);
  const keep = keepCol || keepRec;
  // A record opened from a collection's list page shows that list in the drawer, with ‹ Home back
  // (Coy, 2026-10-22: "click into a customer, the drawer would change into an expanded list of
  // customers with a back button on the top left of the drawer to bring me back to the home drawer").
  const [list, setList] = useState<CollectionList | null>(() => listStayed ?? collectionListAt(path));
  if (pathSeen !== path) {
    setPathSeen(path); setPeek(null);
    if (here.kind !== "home" && !keep) setStayState(here);
    const at = collectionListAt(path);
    if (at) setList(at); else if (list && !collectionRecordAt(list, path)) setList(null);
  }
  useEffect(() => { stayed = stay; }, [stay]);
  useEffect(() => { listStayed = list; }, [list]);
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
  const listRec = !peek && list ? collectionRecordAt(list, path) : null;
  const shown: SpaceRef = listRec ? { kind: "home" } : peek ?? colHere ?? (keep && stay ? stay : here.kind !== "home" ? here : stay ?? here);
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
            onPick={desktop ? () => setStay({ kind: "job", id: j.id }) : () => setPeek({ kind: "job", id: j.id })}>
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
            href={desktop ? `/dashboard/scope/${p.id}/summary` : undefined} onPick={desktop ? () => setStay({ kind: "job", id: p.id }) : () => setPeek({ kind: "job", id: p.id })}>
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
            href={desktop ? `/dashboard/customers/${c.id}` : undefined} onPick={desktop ? () => setStay({ kind: "customer", id: c.id }) : () => setPeek({ kind: "customer", id: c.id })}>
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
            href={desktop ? href : undefined} onPick={desktop ? () => setStay({ kind: p.kind, id: p.id }) : () => setPeek({ kind: p.kind, id: p.id })}>
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
      setRail(ungroupTile(showTile(railPrefs, t.key), t.key));
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
  // Drag a tile up or down the rail, or onto another to group them (Coy, 2026-10-22: "just the
  // same way Discord does it"), with a mouse or a held finger; right-click or a hold opens Arrange,
  // or on a group its menu (rail-groups.tsx).
  const allKeys = all.map((t) => t.info.key);
  const items = railItems(order, railPrefs.groups);
  const [openGroups, setGroupOpen] = useOpenGroups();
  const [gmenu, setGmenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const onRailDrop = (load: DragLoad, at: DropAt) => {
    const grp = (id: string) => railPrefs.groups.find((g) => g.id === id);
    const edge = (g: RailGroup | undefined, last: boolean) => {
      const m = g ? order.filter((k) => g.keys.includes(k)) : [];
      return last ? m[m.length - 1] : m[0];
    };
    let p = railPrefs;
    if (at.id === "end") {
      const last = order.filter((k) => !load.keys.includes(k)).pop();
      if (!load.group) p = ungroupTile(p, load.keys[0]);
      if (last) p = placeKeys(p, order, load.keys, last, true);
      setRail(p);
      return;
    }
    const kind = at.id.slice(0, at.id.indexOf(":")), ref = at.id.slice(at.id.indexOf(":") + 1);
    const after = at.zone === "after";
    if (load.group) {
      // A whole group moves before or after what it is dropped by (beside an open group, not into it).
      const anchor = kind === "t" && !at.inGroup ? ref : edge(grp(kind === "t" ? at.inGroup! : ref), after);
      if (anchor) setRail(placeKeys(p, order, load.keys, anchor, after));
      return;
    }
    const key = load.keys[0];
    if (at.zone === "into") {
      setRail(groupTiles(p, order, key, kind === "t" ? ref : `group:${ref}`, newGroupId()));
      return;
    }
    if (kind === "t" && at.inGroup) {
      // Between the tiles of an open group: it joins that group there.
      if (!grp(at.inGroup)?.keys.includes(key)) p = groupTiles(p, order, key, `group:${at.inGroup}`, "");
      setRail(placeKeys(p, orderTiles(allKeys, p), [key], ref, after));
      return;
    }
    const anchor = kind === "t" ? ref : edge(grp(ref), after);
    p = ungroupTile(p, key);
    if (anchor) setRail(placeKeys(p, orderTiles(allKeys, p), [key], anchor, after));
  };
  const { drag, over, start } = useRailDrag({
    onDrop: onRailDrop,
    onHold: (load, el) => (load.group ? setGmenu({ id: load.group, at: el.getBoundingClientRect() }) : setArranging(true)),
  });
  const slotProps = (dropId: string, load: DragLoad | null, inGroup?: string): DragProps => ({
    "data-rail-drop": dropId,
    "data-rail-in": inGroup,
    "data-drop": over?.id === dropId ? over.zone : undefined,
    "data-dragging": drag && load && drag.load.keys.join() === load.keys.join() ? "" : undefined,
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    ...(load ? {
      onPointerDown: start(load),
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (load.group) setGmenu({ id: load.group, at: (e.currentTarget as HTMLElement).getBoundingClientRect() });
        else setArranging(true);
      },
    } : {}),
  }) as DragProps;
  const shownKey = shown.kind === "home" ? "" : `${shown.kind === "collection" ? "col" : shown.kind}:${shown.id}`;

  const railEl = (
    <div className="sc-spaces-rail" role="navigation" aria-label="Work Spaces" onClickCapture={() => setList(null)}>
      <Tile label="Home" title="Home — Dusty" on={shown.kind === "home"} home href={desktop ? "/dashboard/dusty" : undefined} onPick={() => { setPeek({ kind: "home" }); setStay(null); }}>
        <span className="sc-space-home"><DustyAvatar state={dustyState} size={40} hidden /></span>
      </Tile>
      <span className="sc-spaces-sep" aria-hidden="true" />
      {rail === null && <span className="sc-spaces-note">…</span>}
      {/* One line only, under Home (Coy, 2026-10-22: "keep the line under home and drop the others"). */}
      {items.map((it) => {
        if (it.kind === "tile") return <React.Fragment key={it.key}>{byKey.get(it.key)!.render(slotProps(`t:${it.key}`, { keys: [it.key] }))}</React.Fragment>;
        const g = it.group;
        const open = openGroups.has(g.id);
        const infos = it.keys.map((k) => byKey.get(k)!.info);
        const holds = it.keys.includes(shownKey);
        const label = `${g.name} · ${it.keys.length} Work Spaces`;
        const load = { keys: it.keys, group: g.id };
        if (!open) {
          return (
            <div key={`g:${g.id}`} className="sc-space-slot" data-on={holds ? "" : undefined} {...slotProps(`g:${g.id}`, load)}>
              <button type="button" className="sc-space-tile sc-rail-folder" onClick={() => setGroupOpen(g.id, true)} aria-label={label} aria-expanded={false} title={label}>
                <MiniGrid infos={infos} />
              </button>
            </div>
          );
        }
        return (
          <div key={`g:${g.id}`} className="sc-rail-group" role="group" aria-label={g.name}>
            <div className="sc-space-slot" {...slotProps(`gh:${g.id}`, load)}>
              <button type="button" className="sc-space-tile sc-rail-folder-head" onClick={() => setGroupOpen(g.id, false)} aria-label={`${g.name} — close the group`} aria-expanded title={`${g.name} — close the group`}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
                  <path d="M2.5 5.5a1 1 0 011-1h4l1.6 1.8h7.4a1 1 0 011 1v8.2a1 1 0 01-1 1h-13a1 1 0 01-1-1z" />
                </svg>
              </button>
            </div>
            {it.keys.map((k) => <React.Fragment key={k}>{byKey.get(k)!.render(slotProps(`t:${k}`, { keys: [k] }, g.id))}</React.Fragment>)}
          </div>
        );
      })}
      <Tile label="New job" title="New job" href="/dashboard/jobs/new" dashed>
        <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3.5h6v2H7zM5.5 4.5H4.5v13h11v-13h-1M10 9v6M7 12h6" />
        </svg>
      </Tile>
      <Tile label="+" title="New Work Space" onPick={() => setMaking(true)} dashed drag={drag ? slotProps("end", null) : undefined}>
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
          <circle cx="10" cy="10" r="2.4" />
          <path d="M15.96 7.96L18.3 8.72L18.3 11.28L15.96 12.04A6.3 6.3 0 0 1 15.66 12.77L16.78 14.96L14.96 16.78L12.77 15.66A6.3 6.3 0 0 1 12.04 15.96L11.28 18.3L8.72 18.3L7.96 15.96A6.3 6.3 0 0 1 7.23 15.66L5.04 16.78L3.22 14.96L4.34 12.77A6.3 6.3 0 0 1 4.04 12.04L1.7 11.28L1.7 8.72L4.04 7.96A6.3 6.3 0 0 1 4.34 7.23L3.22 5.04L5.04 3.22L7.23 4.34A6.3 6.3 0 0 1 7.96 4.04L8.72 1.7L11.28 1.7L12.04 4.04A6.3 6.3 0 0 1 12.77 4.34L14.96 3.22L16.78 5.04L15.66 7.23A6.3 6.3 0 0 1 15.96 7.96Z" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );

  // The open Space's colour, for the tab that joins its tile to the drawer (Coy, 2026-10-22: "make
  // it clear that a workspace is connected to the drawer under it").
  const spaceColor = shown.kind === "job" ? stageColor(jobOf(shown.id)?.status ?? "")
    : shown.kind === "customer" ? "var(--sc-chalk)" : shown.kind === "vendor" ? "var(--sc-bucket-vendor)"
      : shown.kind === "collection" ? "var(--sc-violet)" : "var(--sc-hiviz)";
  const navStyle = { "--sc-space-c": spaceColor } as React.CSSProperties;
  const navRef = useTabGap();
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
      <PagesCtx.Provider value={pages}>
      {listRec && list
        ? <CollectionListDrawer list={list} current={listRec} onPick={close}
            onBack={() => { setList(null); setPeek({ kind: "home" }); setStay(null); }} />
        : shown.kind === "home"
        ? <HomeDrawer pages={pages} active={active} onPick={picked(shown)} />
        : shown.kind === "job"
          ? <JobDrawer id={shown.id} fallback={jobOf(shown.id)} onPick={picked(shown)} rail={railFor("job", shown.id)} />
          : shown.kind === "collection"
            ? <CollectionDrawer id={shown.id} col={(rail?.collections ?? []).find((c) => c.id === shown.id) ?? null} pages={pages} active={active}
                onPick={picked(shown)} onDeleted={() => { setPeek({ kind: "home" }); setStay(null); }} />
            : <RecordDrawer kind={shown.kind} id={shown.id} rail={railFor(shown.kind, shown.id)} onPick={picked(shown)}
                pinnedName={pins.find((p) => p.kind === shown.kind && p.id === shown.id)?.name ?? (rail?.customers ?? []).find((c) => shown.kind === "customer" && c.id === shown.id)?.name ?? null}
                onBack={() => { setPeek({ kind: "home" }); setStay(null); }} />}
      </PagesCtx.Provider>
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
      {drag && <DragGhost x={drag.x} y={drag.y} infos={drag.load.keys.map((k) => byKey.get(k)?.info).filter((x): x is RailTileInfo => !!x)} />}
      {gmenu && (() => {
        const g = railPrefs.groups.find((x) => x.id === gmenu.id);
        if (!g) return null;
        return <GroupMenu name={g.name} at={gmenu.at} open={openGroups.has(g.id)} onClose={() => setGmenu(null)}
          onRename={(n) => setRail(renameGroup(railPrefs, g.id, n))} onToggle={() => setGroupOpen(g.id, !openGroups.has(g.id))}
          onUngroup={() => setRail(dissolveGroup(railPrefs, g.id))} />;
      })()}
      {making && <NewSpaceDialog pages={pages} openJobs={jobs.map((j) => j.id)} onClose={() => setMaking(false)} onMade={() => window.dispatchEvent(new Event("sc:spaces-reload"))} />}
      {arranging && <ArrangeRail shown={tiles.map((t) => t.info)} hidden={hiddenTiles} onMove={moveTo} onRemove={removeTile}
        onShow={(k) => setRail(showTile(railPrefs, k))} onReset={() => setRail({ ...railPrefs, order: [] })} onClose={() => setArranging(false)}
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
    return <><nav ref={navRef} aria-label="Main" className="sc-spaces" style={navStyle} data-folded={folded ? "" : undefined}>{railEl}{drawerEl}</nav>{dialog}</>;
  }
  return (
    <>
      <nav ref={navRef} aria-label="Main" className="sc-spaces sc-spaces-under" style={navStyle} aria-hidden={phoneOpen ? undefined : true} inert={!phoneOpen}>
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
      // A Work Space being dragged on the rail (rail-groups.tsx) is not a slide.
      if (!drag && "railDrag" in document.documentElement.dataset) { s = null; return; }
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
