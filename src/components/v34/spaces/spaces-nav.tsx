"use client";

/**
 * The Spaces navigation, step 1 (Claude Design "Dusty Home", 2026-10-16; Coy,
 * 2026-10-17: "map the new design to the live feedback site"). Behind Settings →
 * Appearance → New navigation (`new_nav`); the old rail stays the default.
 *
 * A 72px rail of Spaces — Dusty (Home) first, then every open job as a tile in its
 * stage's colour (look 1b), then the threads Coy made — beside a 280px drawer: on
 * Home the app's pages and every thread by bucket; in a job its Scope Builder tree
 * and its Phone · Email · Internal threads (one thread per number). Settings is the
 * gear at the rail's foot. On a desktop it is fixed at the left (`--sc-rail-w` is
 * 352px, 136px with the drawer folded by « to a strip of icons, › opening it again — frame 11; tiles drawn as silhouettes by kind, Rail Silhouettes 1a); on a phone it slides over the page from ☰
 * or a swipe from the left edge. No migration: src/lib/v34/spaces.ts, /api/spaces.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, disp } from "@/lib/v34/tokens";
import { NavIcon } from "@/components/v34/primitives";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { SpaceSilhouette } from "@/components/v34/spaces/space-silhouette";
import { NewSpaceDialog } from "@/components/v34/spaces/new-space";
import { ArrangeRail, type RailTileInfo } from "@/components/v34/spaces/arrange-rail";
import { PAGE } from "@/lib/v34/pages";
import { SETTINGS_HOME } from "@/lib/v34/settings-sections";
import { usePref } from "@/lib/v34/prefs";
import {
  activeTreeRow, internalThreads, jobTree, monogram, phoneThreads, spaceOf, stageColor, stageLabel,
  homeShelves, moveToShelf, nudge, MAX_SHELVES, MAX_SHELF_NAME, CHANNELS, isChannel, looseChannels, offShelf,
  customerShelves, vendorShelves, activeTab, cleanPins, addPin, removePin,
  type Shelf, type SpaceRef, type SpacePerson, type ThreadRow, type SpacePin, type SpaceShelf,
  cleanRail, orderTiles, moveTile, hideTile, showTile,
} from "@/lib/v34/spaces";

interface RailJob { id: string; title: string; status: string | null; customer: string | null }
interface RailCollection { id: string; name: string; count: number; source: string }
interface JobDetail { job: { id: string; title: string; status: string | null }; people: SpacePerson[]; emails: Array<{ key: string; subject: string; at: string | null }> }
interface HomeThread { contact_id: string; display_name: string; bucket: string | null; numbers?: number; occurred_at: string | null }

const BUCKETS: Array<{ k: string; label: string; key: string; color: string }> = [
  { k: "customer", label: "Customers", key: "customers", color: "var(--sc-bucket-customer)" },
  { k: "vendor", label: "Vendors", key: "vendors", color: "var(--sc-bucket-vendor)" },
  { k: "personal", label: "Personal", key: "personal", color: "var(--sc-bucket-personal)" },
  { k: "unsorted", label: "Unsorted", key: "unsorted", color: "var(--sc-bucket-unsorted)" },
];
const PER_BUCKET = 6;

/* ------------------------------------------------------------ data */

// Read once per tab and kept between page changes; the rail refreshes on its own every few minutes.
let railCache: { at: number; jobs: RailJob[]; collections: RailCollection[] } | null = null;
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
        railCache = { at: Date.now(), jobs: j.jobs ?? [], collections: j.collections ?? [] };
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

function useJob(id: string | null) {
  const [d, setD] = useState<JobDetail | null>(id ? jobCache.get(id)?.d ?? null : null);
  useEffect(() => {
    if (!id) return;
    let off = false;
    const hit = jobCache.get(id);
    Promise.resolve().then(() => { if (!off) setD(hit?.d ?? null); });
    if (hit && Date.now() - hit.at < FRESH) return () => { off = true; };
    fetch(`/api/spaces?job=${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (off || !j?.job) return;
      jobCache.set(id, { at: Date.now(), d: j });
      setD(j);
    }).catch(() => {});
    return () => { off = true; };
  }, [id]);
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

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

function Row({ href, label, sub, on, icon, avatar, color, indent, onPick }: {
  href: string; label: string; sub?: string; on?: boolean; icon?: React.ReactNode; avatar?: string; color?: string; indent?: boolean; onPick?: () => void;
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
    </Link>
  );
}

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
      <span className="sc-shelf-edit-h">Tools</span>
      {pages.filter((k) => PAGE.has(k)).map(box)}
      <span className="sc-shelf-edit-h">Channels</span>
      {CHANNELS.map((c) => box(c.key))}
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

function HomeDrawer({ pages, active, onPick }: { pages: string[]; active: string; onPick: () => void }) {
  const threads = useHomeThreads(true);
  const [saved, setSaved] = usePref<Shelf[] | null>("shelves", null);
  const shelves = useMemo(() => homeShelves(saved, pages), [saved, pages]);
  const [arranging, setArranging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { closed, toggle, setAll } = useClosed();
  const saveShelves = (v: Shelf[] | null) => setSaved(v);
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
  const loose = looseChannels(shelves);

  // A channel's rows: a bucket's people, or Spam and Archived.
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
  const groupKeys = [
    ...shelves.filter((sh) => sh.pages.length > 0 || sh.id !== "more").map((sh) => `home:${sh.id}`),
    ...loose.map((ch) => `home:${ch}`),
  ];

  return (
    <>
      <div className="sc-space-head">
        <span className="sc-space-name">Home</span>
        <span className="sc-space-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>Dusty · your shelves and threads</span>
          <button type="button" className="sc-shelf-arrange" onClick={() => { setArranging(!arranging); setEditing(null); }} aria-pressed={arranging}>
            {arranging ? "Done" : "Arrange"}
          </button>
        </span>
      </div>
      <div className="sc-space-scroll">
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
                return <Row key={k} href={p.href} label={p.label} on={active === k} onPick={onPick}
                  icon={<span className="sc-space-ico"><NavIcon k={k} on={active === k} color="currentColor" /></span>} />;
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

function JobDrawer({ id, fallback, onPick }: { id: string; fallback: RailJob | null; onPick: () => void }) {
  const d = useJob(id);
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  // A link inside the same page (Budget's ?tab=) doesn't change the path; read it after the tap.
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const status = d?.job.status ?? fallback?.status ?? null;
  const title = d?.job.title ?? fallback?.title ?? "Job";
  const here = activeTreeRow(path, search);
  const tree = jobTree(id);
  const phones: ThreadRow[] = d ? phoneThreads(d.people) : [];
  const notes: ThreadRow[] = d ? internalThreads(d.people) : [];
  const { closed, toggle, setAll } = useClosed();
  const g = { closed, onToggle: toggle };
  return (
    <>
      <div className="sc-space-head">
        <span className="sc-space-name" title={title}>{title}</span>
        <span className="sc-space-tag" style={{ color: stageColor(status), borderColor: stageColor(status) }}>{stageLabel(status)}</span>
      </div>
      <div className="sc-space-scroll">
        <div style={{ display: "flex" }}><FoldAll keys={["job:scope", "job:phone", "job:email", "job:internal"]} closed={closed} setAll={setAll} /></div>
        <Group title="Scope Builder" id="job:scope" {...g}>
          {tree.map((r) => (
            <Row key={r.k} href={r.href} label={r.label} indent={r.sub} on={here === r.k} onPick={pick} />
          ))}
        </Group>
        <Group title="Phone" id="job:phone" {...g} count={d ? phones.length : undefined}>
          {!d && <div className="sc-space-empty">Loading…</div>}
          {d && phones.length === 0 && <div className="sc-space-empty">No numbers on this job yet. <Link href={`/dashboard/scope/${id}/summary`} onClick={pick}>+ Add a contact</Link></div>}
          {phones.map((t) => <Row key={t.key} href={t.href} label={t.title} sub={t.sub} avatar={t.avatar} onPick={pick} />)}
        </Group>
        <Group title="Email" id="job:email" {...g} count={d ? d.emails.length : undefined}>
          {d && d.emails.length === 0 && <div className="sc-space-empty">No email filed on this job.</div>}
          {d?.emails.map((e) => (
            <Row key={e.key} href={`/dashboard/messages/email/${encodeURIComponent(e.key)}`} label={e.subject} onPick={pick}
              icon={<span className="sc-space-ico" aria-hidden="true">✉</span>} />
          ))}
        </Group>
        <Group title="Internal" id="job:internal" {...g} count={d ? notes.length : undefined}>
          {d && notes.length === 0 && <div className="sc-space-empty">No one on this job yet.</div>}
          {notes.map((t) => <Row key={t.key} href={t.href} label={t.title} sub={t.sub} avatar={t.avatar} onPick={pick} />)}
        </Group>
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
function RecordDrawer({ kind, id, pins, setPins, onPick }: {
  kind: "customer" | "vendor"; id: string; pins: SpacePin[]; setPins: (v: SpacePin[]) => void; onPick: () => void;
}) {
  const path = usePathname() ?? "";
  const [search, setSearch] = useState("");
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [path]);
  const pick = useCallback(() => { onPick(); window.setTimeout(() => setSearch(window.location.search), 50); }, [onPick]);
  const pin = pins.find((p) => p.kind === kind && p.id === id) ?? null;
  const name = useRecordName(kind, id, pin?.name ?? null);
  const onPage = path.startsWith(kind === "customer" ? `/dashboard/customers/${id}` : `/dashboard/vendors/${id}`);
  const here = onPage ? activeTab(search) : "";
  const shelves: SpaceShelf[] = kind === "customer" ? customerShelves(id) : vendorShelves(id);
  const { closed, toggle, setAll } = useClosed();
  const color = kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)";
  return (
    <>
      <div className="sc-space-head">
        <span className="sc-space-name" title={name ?? undefined}>{name ?? (kind === "customer" ? "Customer" : "Vendor")}</span>
        <span className="sc-space-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="sc-space-tag" style={{ color, borderColor: color }}>{kind === "customer" ? "Customer" : "Vendor"}</span>
          <span style={{ flex: 1 }} />
          {pin
            ? <button type="button" className="sc-shelf-arrange" onClick={() => setPins(removePin(pins, kind, id))} title="Take this Space off the rail">Off the rail</button>
            : <button type="button" className="sc-shelf-arrange" disabled={!name} onClick={() => name && setPins(addPin(pins, { kind, id, name }))}>Add to the rail</button>}
        </span>
      </div>
      <div className="sc-space-scroll">
        <div style={{ display: "flex" }}><FoldAll keys={shelves.map((sh) => `${kind}:${sh.id}`)} closed={closed} setAll={setAll} /></div>
        {shelves.map((sh) => (
          <Group key={sh.id} id={`${kind}:${sh.id}`} closed={closed} onToggle={toggle} title={sh.name}>
            {sh.rows.map((r) => <Row key={r.k} href={r.href} label={r.label} on={here === r.k} onPick={pick} />)}
          </Group>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ the folded drawer */

// Claude Design "Dusty Home" frame 11 (Coy, 2026-10-18: "when I collapse the drawer it
// disappears"): folded, the drawer is a 64px strip — › to open it, the pages as icons, then
// the Space's groups as small chips in their colour, each opening the drawer.
const TREE_ICON: Record<string, string> = { summary: "dashboard", plans: "scopebuilder", market: "cash", proposed: "pricebook", tracker: "logs", files: "files" };
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
      return p ? icon(k, p.label, p.href, active === k, <NavIcon k={k} on={active === k} color="currentColor" />) : null;
    });
    chips = BUCKETS.map((b) => chip(b.label.slice(0, 2).toUpperCase(), b.label, b.color));
  } else if (shown.kind === "customer" || shown.kind === "vendor") {
    const onPage = path.startsWith(shown.kind === "customer" ? `/dashboard/customers/${shown.id}` : `/dashboard/vendors/${shown.id}`);
    const here = onPage ? activeTab(search) : "";
    const sh = shown.kind === "customer" ? customerShelves(shown.id) : vendorShelves(shown.id);
    icons = sh.flatMap((x) => x.rows).map((r) => icon(r.k, r.label, r.href, here === r.k, <NavIcon k={TAB_ICON[r.k] ?? "files"} on={here === r.k} color="currentColor" />));
    chips = sh.map((x) => chip(x.name.slice(0, 2).toUpperCase(), x.name, shown.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)"));
  } else {
    const here = activeTreeRow(path, search);
    icons = jobTree(shown.id).filter((r) => !r.sub).map((r) => {
      const on = here === r.k;
      const glyph = r.k === "proposal" ? <ProposalIcon /> : <NavIcon k={TREE_ICON[r.k] ?? "files"} on={on} color="currentColor" />;
      return icon(r.k, r.label, r.href, on, glyph);
    });
    chips = [chip("PH", "Phone", "var(--sc-bucket-customer)"), chip("EM", "Email", "var(--sc-chalk)"), chip("IN", "Internal", "var(--sc-violet)")];
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
  if (pathSeen !== path) { setPathSeen(path); setPeek(null); }
  const shown = peek ?? here;
  const jobs = rail?.jobs ?? [];
  const jobOf = (id: string) => jobs.find((j) => j.id === id) ?? null;
  const close = desktop ? () => {} : onPhoneClose;
  const [threadParam, setThreadParam] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setThreadParam(new URLSearchParams(window.location.search).get("t")); });
    return () => { off = true; };
  }, [path]);

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
            <SpaceSilhouette kind="job" color={color} initials={monogram(j.title)} on={on} />
          </Tile>
        ),
      };
    }),
    ...(rail?.collections ?? []).map((c): RailTile => {
      // A thread made from a customer is that customer's address book; any other is a folder.
      const customer = c.source === "customer";
      const color = customer ? "var(--sc-chalk)" : "var(--sc-violet)";
      const on = /^\/dashboard\/messages$/.test(path) && threadParam === c.id;
      const people = `${c.count} ${c.count === 1 ? "person" : "people"}`;
      return {
        info: { key: `col:${c.id}`, name: c.name, sub: `Collection · ${people}`, shape: customer ? "contact" : "collection", color, initials: monogram(c.name), pinned: false },
        render: (drag) => (
          <Tile key={c.id} label={monogram(c.name)} title={`${c.name} · ${people}`} drag={drag}
            href={`/dashboard/messages?t=${c.id}`} onPick={close} color={color} on={on} bare>
            <SpaceSilhouette kind={customer ? "contact" : "collection"} color={color} initials={monogram(c.name)} on={on} />
          </Tile>
        ),
      };
    }),
    ...pins.map((p): RailTile => {
      const on = (shown.kind === "customer" || shown.kind === "vendor") && shown.kind === p.kind && shown.id === p.id;
      const color = p.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)";
      const href = p.kind === "customer" ? `/dashboard/customers/${p.id}` : `/dashboard/vendors/${p.id}`;
      const kindName = p.kind === "customer" ? "Customer" : "Vendor";
      return {
        info: { key: `${p.kind}:${p.id}`, name: p.name, sub: kindName, shape: p.kind === "customer" ? "contact" : "vendor", color, initials: monogram(p.name), pinned: true },
        render: (drag) => (
          <Tile key={`${p.kind}:${p.id}`} label={monogram(p.name)} title={`${p.name} · ${kindName}`} color={color} on={on} bare drag={drag}
            href={desktop ? href : undefined} onPick={desktop ? undefined : () => setPeek({ kind: p.kind, id: p.id })}>
            <SpaceSilhouette kind={p.kind === "customer" ? "contact" : "vendor"} color={color} initials={monogram(p.name)} on={on} />
          </Tile>
        ),
      };
    }),
  ];
  const byKey = new Map(all.map((t) => [t.info.key, t]));
  const order = orderTiles(all.map((t) => t.info.key), railPrefs);
  const tiles = order.map((k) => byKey.get(k)!);
  const hiddenTiles = railPrefs.hidden.map((k) => byKey.get(k)?.info).filter((x): x is RailTileInfo => !!x);
  const moveTo = (key: string, to: number) => setRail(moveTile(railPrefs, order, key, to));
  const removeTile = (t: RailTileInfo) => {
    if (t.pinned) {
      const [kind, id] = t.key.split(":") as ["customer" | "vendor", string];
      setPins(removePin(pins, kind, id));
      setRail(showTile(railPrefs, t.key));
    } else setRail(hideTile(railPrefs, t.key));
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
    <div className="sc-spaces-rail" role="navigation" aria-label="Spaces">
      <Tile label="Home" title="Home — Dusty" on={shown.kind === "home"} home onPick={() => setPeek({ kind: "home" })}>
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
      <Tile label="+" title="New Space — a job, customer, vendor or collection" onPick={() => setMaking(true)} dashed>
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      </Tile>
      <span style={{ flex: 1 }} />
      {(tiles.length > 0 || railPrefs.hidden.length > 0) && (
        <button type="button" className="sc-spaces-foot" onClick={() => setArranging(true)} aria-label="Arrange the rail" title="Arrange the rail — move or take off Spaces">
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
        ? <HomeDrawer pages={pages} active={active} onPick={close} />
        : shown.kind === "job"
          ? <JobDrawer id={shown.id} fallback={jobOf(shown.id)} onPick={close} />
          : <RecordDrawer kind={shown.kind} id={shown.id} pins={pins} setPins={setPins} onPick={close} />}
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
      {making && <NewSpaceDialog onClose={() => setMaking(false)} onMade={() => window.dispatchEvent(new Event("sc:spaces-reload"))} />}
      {arranging && <ArrangeRail shown={tiles.map((t) => t.info)} hidden={hiddenTiles} onMove={moveTo} onRemove={removeTile}
        onShow={(k) => setRail(showTile(railPrefs, k))} onReset={() => setRail({ order: [], hidden: railPrefs.hidden })} onClose={() => setArranging(false)} />}
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
