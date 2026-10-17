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
 * 352px, 136px with the drawer folded); on a phone it slides over the page from ☰
 * or a swipe from the left edge. No migration: src/lib/v34/spaces.ts, /api/spaces.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, disp } from "@/lib/v34/tokens";
import { NavIcon } from "@/components/v34/primitives";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { PAGE } from "@/lib/v34/pages";
import { SETTINGS_HOME } from "@/lib/v34/settings-sections";
import {
  activeTreeRow, internalThreads, jobTree, monogram, phoneThreads, spaceOf, stageColor, stageLabel,
  type SpacePerson, type ThreadRow,
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
    return () => { off = true; window.clearInterval(t); };
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

function Tile({ label, title, color, on, href, onPick, children, dashed }: {
  label: string; title: string; color?: string; on?: boolean; href?: string; onPick?: () => void; children?: React.ReactNode; dashed?: boolean;
}) {
  const inner = children ?? <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 15, letterSpacing: ".02em" }}>{label}</span>;
  const style: React.CSSProperties = {
    "--sc-tile": color ?? "var(--sc-rail-ink)",
  } as React.CSSProperties;
  const cls = `sc-space-tile${dashed ? " sc-space-tile-new" : ""}`;
  return (
    <div className="sc-space-slot" data-on={on ? "" : undefined}>
      {href
        ? <Link href={href} onClick={onPick} className={`${cls} no-underline`} style={style} aria-label={title} title={title} aria-current={on ? "page" : undefined}>{inner}</Link>
        : <button type="button" onClick={onPick} className={cls} style={style} aria-label={title} title={title}>{inner}</button>}
    </div>
  );
}

function Group({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sc-space-group">
      <button type="button" className="sc-space-group-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden="true" style={{ display: "inline-block", width: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>›</span>
        <span>{title}</span>
        {count != null && <span style={{ marginLeft: "auto", opacity: .7 }}>{count}</span>}
      </button>
      {open && children}
    </div>
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

function HomeDrawer({ pages, active, onPick }: { pages: string[]; active: string; onPick: () => void }) {
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
  return (
    <>
      <div className="sc-space-head">
        <span className="sc-space-name">Home</span>
        <span className="sc-space-sub">Dusty · every page and thread</span>
      </div>
      <div className="sc-space-scroll">
        <Group title="Pages">
          {pages.map((k) => {
            const p = PAGE.get(k);
            if (!p) return null;
            return <Row key={k} href={p.href} label={p.label} on={active === k} onPick={onPick}
              icon={<span className="sc-space-ico"><NavIcon k={k} on={active === k} color="currentColor" /></span>} />;
          })}
        </Group>
        {threads === null && <div className="sc-space-empty">Loading threads…</div>}
        {threads && BUCKETS.map((b) => {
          const list = byBucket.get(b.k) ?? [];
          return (
            <Group key={b.k} title={b.label} count={list.length}>
              {list.length === 0 && <div className="sc-space-empty">No one here yet.</div>}
              {list.slice(0, PER_BUCKET).map((t) => (
                <Row key={t.contact_id} href={`/dashboard/messages/${t.contact_id}?t=${b.key}`} onPick={onPick}
                  label={t.display_name} sub={(t.numbers ?? 0) > 1 ? `${t.numbers} numbers` : undefined}
                  on={openContact === t.contact_id} avatar={monogram(t.display_name)} color={b.color} />
              ))}
              {list.length > PER_BUCKET && (
                <Link href={`/dashboard/messages?t=${b.key}`} onClick={onPick} className="sc-space-more no-underline">All {list.length} ›</Link>
              )}
            </Group>
          );
        })}
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
  const tree = jobTree(id, status);
  const phones: ThreadRow[] = d ? phoneThreads(d.people) : [];
  const notes: ThreadRow[] = d ? internalThreads(d.people) : [];
  return (
    <>
      <div className="sc-space-head">
        <span className="sc-space-name" title={title}>{title}</span>
        <span className="sc-space-tag" style={{ color: stageColor(status), borderColor: stageColor(status) }}>{stageLabel(status)}</span>
      </div>
      <div className="sc-space-scroll">
        <Group title="Scope Builder">
          {tree.map((r) => (
            <Row key={r.k} href={r.href} label={r.label} indent={r.sub} on={here === r.k} onPick={pick} />
          ))}
        </Group>
        <Group title="Phone" count={d ? phones.length : undefined}>
          {!d && <div className="sc-space-empty">Loading…</div>}
          {d && phones.length === 0 && <div className="sc-space-empty">No numbers on this job yet. <Link href={`/dashboard/scope/${id}/summary`} onClick={pick}>+ Add a contact</Link></div>}
          {phones.map((t) => <Row key={t.key} href={t.href} label={t.title} sub={t.sub} avatar={t.avatar} onPick={pick} />)}
        </Group>
        <Group title="Email" count={d ? d.emails.length : undefined}>
          {d && d.emails.length === 0 && <div className="sc-space-empty">No email filed on this job.</div>}
          {d?.emails.map((e) => (
            <Row key={e.key} href={`/dashboard/messages/email/${encodeURIComponent(e.key)}`} label={e.subject} onPick={pick}
              icon={<span className="sc-space-ico" aria-hidden="true">✉</span>} />
          ))}
        </Group>
        <Group title="Internal" count={d ? notes.length : undefined}>
          {d && notes.length === 0 && <div className="sc-space-empty">No one on this job yet.</div>}
          {notes.map((t) => <Row key={t.key} href={t.href} label={t.title} sub={t.sub} avatar={t.avatar} onPick={pick} />)}
        </Group>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ the nav */

export function SpacesNav({ desktop, pages, active, dustyState, phoneOpen, onPhoneClose, folded, onFold }: {
  desktop: boolean; pages: string[]; active: string; dustyState: EmblemState;
  phoneOpen: boolean; onPhoneClose: () => void; folded: boolean; onFold: () => void;
}) {
  const path = usePathname() ?? "";
  const rail = useRail(true);
  const here = spaceOf(path);
  // The Space whose drawer shows: the page's own, unless a tile was tapped to look into another.
  const [peek, setPeek] = useState<{ kind: "home" } | { kind: "job"; id: string } | null>(null);
  const [pathSeen, setPathSeen] = useState(path);
  if (pathSeen !== path) { setPathSeen(path); setPeek(null); }
  const shown = peek ?? here;
  const jobs = rail?.jobs ?? [];
  const jobOf = (id: string) => jobs.find((j) => j.id === id) ?? null;
  const close = desktop ? () => {} : onPhoneClose;

  const railEl = (
    <div className="sc-spaces-rail" role="navigation" aria-label="Spaces">
      <Tile label="Home" title="Home — Dusty" on={shown.kind === "home"} onPick={() => setPeek({ kind: "home" })}>
        <span className="sc-space-home"><DustyAvatar state={dustyState} size={40} hidden /></span>
      </Tile>
      <span className="sc-spaces-sep" aria-hidden="true" />
      {rail === null && <span className="sc-spaces-note">…</span>}
      {jobs.map((j) => {
        const on = shown.kind === "job" && shown.id === j.id;
        const title = `${j.title}${j.customer ? ` · ${j.customer}` : ""} · ${stageLabel(j.status)}`;
        return (
          // A desktop opens the job (its Summary) as Discord opens a server; a phone looks into
          // its drawer first, so the tree is there to pick from before the panel closes.
          <Tile key={j.id} label={monogram(j.title)} title={title} color={stageColor(j.status)} on={on}
            href={desktop ? `/dashboard/scope/${j.id}/summary` : undefined}
            onPick={desktop ? undefined : () => setPeek({ kind: "job", id: j.id })} />
        );
      })}
      {rail && rail.collections.length > 0 && <span className="sc-spaces-sep" aria-hidden="true" />}
      {rail?.collections.map((c) => (
        <Tile key={c.id} label={monogram(c.name)} title={`${c.name} · ${c.count} ${c.count === 1 ? "person" : "people"}`}
          href={`/dashboard/messages?t=${c.id}`} onPick={close} color="var(--sc-bucket-vendor)" />
      ))}
      <Tile label="+" title="New Space — start a job" href="/dashboard/scope?new=1" onPick={close} dashed>
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      </Tile>
      <span style={{ flex: 1 }} />
      {desktop && (
        <button type="button" className="sc-spaces-foot" onClick={onFold} aria-label={folded ? "Open the drawer" : "Fold the drawer"} title={folded ? "Open the drawer" : "Fold the drawer"}>
          <svg width="18" height="18" viewBox="0 0 19 19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3.5h13v12H3zM7 3.5v12" /><path d={folded ? "M10.5 7.5l2 2-2 2" : "M12.5 7.5l-2 2 2 2"} />
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

  const drawerEl = (!desktop || !folded) && (
    <div className="sc-spaces-drawer">
      {shown.kind === "home"
        ? <HomeDrawer pages={pages} active={active} onPick={close} />
        : <JobDrawer id={shown.id} fallback={jobOf(shown.id)} onPick={close} />}
    </div>
  );

  // Phone: the rail and drawer slide over the page; a swipe left or the scrim closes them.
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dx, setDx] = useState(0);
  useEffect(() => {
    if (desktop || !phoneOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onPhoneClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [desktop, phoneOpen, onPhoneClose]);

  if (desktop) {
    return <nav aria-label="Main" className="sc-spaces" data-folded={folded ? "" : undefined}>{railEl}{drawerEl}</nav>;
  }
  return (
    <>
      {phoneOpen && <div className="sc-spaces-scrim" onClick={onPhoneClose} aria-hidden="true" />}
      <nav aria-label="Main" className="sc-spaces sc-spaces-phone" data-open={phoneOpen ? "" : undefined}
        style={phoneOpen && dx < 0 ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}
        onTouchStart={(e) => { drag.current = { x: e.touches[0].clientX, dx: 0 }; }}
        onTouchMove={(e) => { if (!drag.current) return; const d = e.touches[0].clientX - drag.current.x; drag.current.dx = d; setDx(Math.min(0, d)); }}
        onTouchEnd={() => { const g = drag.current; drag.current = null; setDx(0); if (g && g.dx < -80) onPhoneClose(); }}>
        {railEl}{drawerEl}
      </nav>
    </>
  );
}

/**
 * A swipe right from the left edge of a phone's screen opens the Spaces (the design's
 * left-edge gesture). A pane that scrolls sideways (the plans, a budget grid) still
 * gets its own swipes: only a touch that starts within EDGE_PX of the edge counts.
 * That strip belongs to the rail: the touch is caught on the window before React
 * sees it, so a row that swipes (Threads, a customer's jobs, the Price book, email)
 * never starts its own swipe from there (Coy, 2026-10-17: "the row swipe right is
 * conflicting … I can't swipe the screen to reveal the drawer"). A tap still clicks.
 * Anything marked data-edge-own (a drawer's own pull tab) keeps its edge.
 */
export const EDGE_PX = 24;
export function useEdgeSwipe(on: boolean, open: () => void) {
  useEffect(() => {
    if (!on) return;
    let start: { x: number; y: number } | null = null;
    const own = (e: TouchEvent) => e.target instanceof Element && !!e.target.closest("[data-edge-own], [role=dialog]");
    const ts = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE_PX && !own(e) ? { x: t.clientX, y: t.clientY } : null;
      if (start) e.stopPropagation();
    };
    const tm = (e: TouchEvent) => {
      if (!start) return;
      e.stopPropagation();
      const t = e.touches[0];
      if (t.clientX - start.x > 50 && Math.abs(t.clientY - start.y) < 50) { start = null; open(); }
    };
    const te = (e: TouchEvent) => { if (start) { start = null; e.stopPropagation(); } };
    const opt = { capture: true, passive: true } as const;
    window.addEventListener("touchstart", ts, opt);
    window.addEventListener("touchmove", tm, opt);
    window.addEventListener("touchend", te, opt);
    window.addEventListener("touchcancel", te, opt);
    return () => {
      window.removeEventListener("touchstart", ts, opt);
      window.removeEventListener("touchmove", tm, opt);
      window.removeEventListener("touchend", te, opt);
      window.removeEventListener("touchcancel", te, opt);
    };
  }, [on, open]);
}

