"use client";

/**
 * The shell — glass header, phone footer, desktop rail (v34 look).
 *
 * Coy, 2026-09-30:
 *   - The app opens on the Dashboard. Phone footer: three pages Coy picks
 *     (default Dashboard · Threads · Jobs) around Dusty in the centre, and the
 *     Toolbox last — a drawer of every other page, lined up on the footer's
 *     columns. Pages open between the header and the footer, so Dusty is
 *     always one tap away.
 *   - The desktop rail lists every page, Dusty among them; Settings → Menus
 *     sets the order and the phone footer (saved to his account, migration 053).
 *   - Dusty is the pixel foreman (design/dusty) and appears ONLY in the phone
 *     footer's centre and in the chat window. The old diamond emblem is gone,
 *     and the header carries no Dusty at all.
 *   - Desktop header: the logo, a divider, then the activity line on the same
 *     row — a dot whose colour and rhythm say what kind of work is running,
 *     the latest thought beside it. Search is a magnifying glass. No phone
 *     number, no "unnamed", no "drift" (drift is on Logs). Phone keeps the
 *     activity row under the header.
 *   - Settings (☰) is its own page since 2026-10-10, /dashboard/settings:
 *     Account · Organization · Lines · Appearance · AI · Menus
 *     (src/components/v34/settings/). (Markups & overhead is gone entirely —
 *     margin, O.H. and tax are Price book → Defaults; overhead is on Cash.)
 *   - The header shows the org's logo with "powered by scopecrete.ai"
 *     (OrgLockup); with no logo, the scopecrete.ai wordmark as before.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { setDustyLive } from "@/lib/v34/dusty-live";
import { usePathname } from "next/navigation";
import { T, disp, body, eyebrow, nums } from "@/lib/v34/tokens";
import { NavIcon, OrgNameContext } from "@/components/v34/primitives";
import { DustyPanel } from "@/components/v34/dusty-panel";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { ActivityLine } from "@/components/v34/activity-line";
import { ArchiveToast } from "@/components/v34/archive-actions";
import { InstallPrompt } from "@/components/v34/install-app";
import { ThreadColorVars } from "@/components/v34/thread-colors";
import { AlertsBell, AlertPopups } from "@/components/v34/incoming-alerts";
import { useAlertsWatcher } from "@/lib/v34/alerts-live";
import dynamic from "next/dynamic";
// Only drawn once 🔍 is tapped — kept out of the first load.
const SearchPanel = dynamic(() => import("@/components/v34/search-panel").then((m) => m.SearchPanel));
import { OrgLockup } from "@/components/v34/org-lockup";
import { useTheme } from "@/components/v34/theme-picker";
import { Toolbox, tabLabel } from "@/components/v34/toolbox";
import { PAGE, DEFAULT_MENUS, cleanMenus, activePage, type Menus } from "@/lib/v34/pages";
import { MeContext, type Me } from "@/lib/v34/me-ctx";
import { SETTINGS_HOME, settingsSectionOf } from "@/lib/v34/settings-sections";
import { MenuPanel } from "@/components/v34/settings/menus-settings";
import { cleanMenuColors, iconVar, type MenuColors } from "@/lib/v34/menu-colors";
import { usePref } from "@/lib/v34/prefs";
import { useHideHeadOnScroll } from "@/lib/v34/use-hide-head";
import { AccessContext } from "@/lib/v34/access-ctx";
import { accessFrom, menuPages, redirectFor, roleLabel, FULL_ACCESS, type Access } from "@/lib/access";
import { viewAsLine } from "@/lib/view-as";
import { useRouter } from "next/navigation";
import "@/styles/v34-shell.css";

/** Desktop or not — decided after mount; the phone layout is the first paint. */
function useDesktop(): boolean {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // On a phone the header slides away as any page scrolls down (Coy, 2026-10-06).
  useHideHeadOnScroll(pathname);
  const router = useRouter();
  const desktop = useDesktop();

  // Settings is a page (2026-10-10). The ☰ opens it, and on it goes back to
  // the page it was opened from (else the Dashboard).
  const inSettings = settingsSectionOf(pathname ?? "") !== null;
  const lastPage = React.useRef<string>("/dashboard");
  useEffect(() => {
    if (!inSettings && pathname) lastPage.current = `${pathname}${window.location.search}`;
  }, [inSettings, pathname]);
  // The colour theme follows the account (Settings → Appearance).
  const [theme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);
  const [dustyOpen, setDustyOpen] = useState(false);
  useEffect(() => {
    const open = () => setDustyOpen(true);
    // The emblem on a page's header toggles him (Coy, 2026-10-10).
    const toggle = () => setDustyOpen((o) => !o);
    window.addEventListener("sc:dusty-open", open);
    // A plan's result opened on a phone (an email draft) closes him so the page shows (2026-10-14).
    const close = () => setDustyOpen(false);
    window.addEventListener("sc:dusty-toggle", toggle);
    window.addEventListener("sc:dusty-close", close);
    return () => { window.removeEventListener("sc:dusty-open", open); window.removeEventListener("sc:dusty-toggle", toggle); window.removeEventListener("sc:dusty-close", close); };
  }, []);
  // A vendor's "App access" (081) opens Settings → Organization → People with them picked
  // (the vendor waits in sessionStorage, PENDING_VENDOR_KEY). `detail` may name a section.
  useEffect(() => {
    const open = (e: Event) => {
      const k = (e as CustomEvent<string | undefined>).detail;
      router.push(typeof k === "string" && k ? `${SETTINGS_HOME}/${k}` : `${SETTINGS_HOME}/organization`);
    };
    window.addEventListener("sc:open-settings", open);
    return () => window.removeEventListener("sc:open-settings", open);
  }, [router]);
  // Pages that change shape while Dusty is docked (the job page moves its
  // totals into his panel) read this from <html data-dusty>.
  useEffect(() => {
    document.documentElement.dataset.dusty = dustyOpen ? "open" : "";
    window.dispatchEvent(new Event("sc:dusty-state"));
  }, [dustyOpen]);
  // True only while a Dusty reply is actually streaming.
  const [dustyBusy, setDustyBusy] = useState(false);
  // The background reader has a read running.
  const [readerState, setReaderState] = useState<"reading" | "warn" | "idle">("idle");
  const [panelState, setPanelState] = useState<EmblemState>("idle");

  const [me, setMe] = useState<Me | null>(null);
  const [needs, setNeeds] = useState<number | null>(null);
  const [drift, setDrift] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [savedMenus] = usePref<Menus>("menus", DEFAULT_MENUS);
  // Dusty's thought line can be switched off (Settings → AI, Coy 2026-10-05).
  // <html data-activity-phone="off"> makes --sc-head the 54px bar alone; app/layout.tsx
  // sets it before first paint from the browser's copy of this setting.
  // A phone and a desktop are set apart (Coy, 2026-10-05: "off on mobile and on on desktop");
  // the phone's follows the desktop's until it is set itself.
  const [showLine] = usePref<boolean>("activity_line", true);
  const [headerLogo] = usePref<boolean>("header_logo", true);
  const [showLinePhone] = usePref<boolean | null>("activity_line_phone", null);
  const deskLineOn = showLine !== false;
  const phoneLineOn = (showLinePhone ?? showLine) !== false;
  useEffect(() => {
    if (phoneLineOn) delete document.documentElement.dataset.activityPhone;
    else document.documentElement.dataset.activityPhone = "off";
  }, [phoneLineOn]);
  // The desktop rail folds to its icons (Coy, 2026-10-10: "reduce the menu panel to just the
  // icons … if i hover over the icons it will show the word"). <html data-rail="icons"> makes
  // --sc-rail-w 64px (232px open, Claude Design's sidebar); app/layout.tsx sets it before first paint from the browser's copy.
  const [railIcons, setRailIcons] = usePref<boolean>("rail_icons", false);
  const [railTip, setRailTip] = useState<{ label: string; top: number } | null>(null);
  useEffect(() => {
    if (railIcons) document.documentElement.dataset.rail = "icons";
    else delete document.documentElement.dataset.rail;
  }, [railIcons]);
  // Each icon's colour from the book (Claude Design, 2026-10-10); a role, so it follows the theme.
  const [savedColors] = usePref<MenuColors | null>("menu_colors", null);
  const menuColors = cleanMenuColors(savedColors);
  // The phone keeps the icons' colours too (Coy, 2026-10-10); a page with none stays ink.
  const phoneIcon = (k: string, on: boolean) => (menuColors[k] ? iconVar(menuColors[k]) : on ? T.ink : T.ink3);
  const [menuPanel, setMenuPanel] = useState(false);
  const closeMenuPanel = useCallback(() => setMenuPanel(false), []);

  // Who is signed in, the org's name and logos. Reloaded after Settings
  // changes a name or a logo, so the header follows without a page reload.
  const [meRev, setMeRev] = useState(0);
  useEffect(() => {
    let off = false;
    fetch("/api/session/me").then(async (r) => {
      const d = await r.json().catch(() => null);
      // Signed in from an invite link but landed here with no org yet: back to the invite (062).
      if (d?.code === "no_org") {
        let pending: string | null = null;
        try { pending = localStorage.getItem("sc:pending-invite"); } catch { /* private mode */ }
        if (pending && /^[0-9a-f]{48}$/.test(pending)) { window.location.href = `/invite/${pending}`; return null; }
      }
      // In an org: any invite remembered on this device is not theirs to be sent back to.
      if (r.ok) { try { localStorage.removeItem("sc:pending-invite"); } catch { /* private mode */ } }
      return r.ok ? d : null;
    }).then((d) => { if (!off && d && !d.error) setMe(d); }).catch(() => {});
    return () => { off = true; };
  }, [meRev]);
  const meCtx = useMemo(() => ({ me, reload: () => setMeRev((n) => n + 1) }), [me]);

  // Viewing as a teammate (src/lib/view-as.ts, Coy 2026-10-12): the purple strip across the top.
  const viewingAs = me?.viewing_as ?? null;
  useEffect(() => {
    if (viewingAs) document.documentElement.dataset.viewAs = "1";
    else delete document.documentElement.dataset.viewAs;
  }, [viewingAs]);
  const [leaving, setLeaving] = useState(false);
  const stopViewing = useCallback(async () => {
    setLeaving(true);
    await fetch("/api/view-as", { method: "DELETE" }).catch(() => null);
    // A full load, so every page and list reads as the owner again; back where the button was.
    window.location.assign("/dashboard/settings/organization#people");
  }, []);

  // An onsite estimator (081) sees Jobs (and Files when given) and nothing else; any other
  // page sends them to the board. The database keeps them out regardless — this keeps them
  // from landing on pages that would come back empty.
  // Admin is on the menu only for a platform admin (Coy, 2026-10-10).
  const menus = cleanMenus(savedMenus, { admin: !!me?.admin });
  const meAccess = me?.access;
  const access: Access = useMemo(() => (meAccess?.limited ? accessFrom({ role: "field", ...meAccess }) : FULL_ACCESS), [meAccess]);
  const limited = access.limited;
  const allowed = menuPages(access);
  // Incoming texts, calls and emails (2026-10-06): one watcher for the bell,
  // the pop-ups and the live-call marker on threads. Not for an onsite
  // estimator, who reads no messages.
  useAlertsWatcher(!!me && !limited);
  useEffect(() => {
    const to = redirectFor(access, pathname);
    if (to) router.replace(to);
  }, [access, pathname, router]);

  // Replies owed (the Threads badge) and the drift alarm (a red dot on Logs).
  // Null until known — never 0 as a placeholder.
  // Read at most every 30 s, not on every page change (2026-10-05: each tap
  // to another page fired both again — the counts read all messages).
  const badgesAt = React.useRef(0);
  useEffect(() => {
    if (!me || limited) return;
    if (Date.now() - badgesAt.current < 30_000) return;
    badgesAt.current = Date.now();
    // Not cancelled by the next page change: that change won't fetch again.
    fetch("/api/threads/counts").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (typeof d?.counts?.needs === "number") setNeeds(d.counts.needs); }).catch(() => {});
    fetch("/api/dashboard/drift").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (typeof d?.count === "number") setDrift(d.count); }).catch(() => {});
  }, [pathname, me, limited]);
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [pathname]);
  // Close the Toolbox when the page changes (a pick navigates).
  const [pathSeen, setPathSeen] = useState(pathname);
  if (pathSeen !== pathname) { setPathSeen(pathname); setToolOpen(false); }

  const active = activePage(pathname, search);
  const toolKeys = allowed ? [] : menus.rail.filter((k) => k !== "dusty" && !menus.footer.includes(k));
  const toolActive = toolKeys.includes(active);
  const badge = { logs: (drift ?? 0) > 0 };
  // Dusty in the footer and header: his chat's state while it is open, else the reader's
  // (reading, broken, at rest — the activity line's); an answer streaming either way.
  const dustyNow: EmblemState = dustyOpen ? panelState : dustyBusy ? "answering" : readerState;
  const glassBtn = { width: 32, height: 32 } as const;
  const closeDrops = () => { setSearchOpen(false); };

  // Footer: page · page · Dusty · page · Toolbox.
  const f = menus.footer;
  const footerSlots = allowed ?? [f[0], f[1], "dusty", f[2], "toolbox"].filter(Boolean) as string[];
  const slotPct = 100 / Math.max(1, footerSlots.length);
  const markIdx = footerSlots.findIndex((k) => k === active || (k === "toolbox" && toolActive));

  const Badge = ({ n, style, className }: { n: number; style?: React.CSSProperties; className?: string }) => (
    <span className={`absolute rounded-full flex items-center justify-center${className ? ` ${className}` : ""}`}
      style={{ minWidth: 15, height: 15, padding: "0 3px", background: T.hiviz, color: T.onHiviz, fontFamily: disp,
               fontSize: 9.5, fontWeight: 700, lineHeight: 1, ...nums, ...style }}>{n}</span>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: T.slab, color: T.ink, fontFamily: body }}>
      <div className="sc-head-wrap" style={{ position: "sticky", top: 0, zIndex: 40 }}>
        {viewingAs && (
          <div className="sc-view-as" role="status">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>👁 {viewAsLine(viewingAs.name, roleLabel(viewingAs.role))} · changes are off</span>
            <button type="button" onClick={() => void stopViewing()} disabled={leaving}>{leaving ? "Switching…" : "Switch back"}</button>
          </div>
        )}
        <header className="px-2.5 lg:px-4 flex items-center gap-3 sc-paper" style={{ height: 54 }}>
          <Link href="/dashboard" className="no-underline shrink-0" aria-label="Dashboard">
            <OrgLockup name={me?.org_name ?? null} hasLight={!!me?.logo_light} hasDark={!!me?.logo_dark} stamp={me?.logo_stamp ?? null}
              dark={theme.dark} phone={!desktop} showLogo={headerLogo !== false} />
          </Link>

          {/* Desktop: the activity line in the header row, after a divider. */}
          {desktop && deskLineOn ? (
            <>
              <span aria-hidden="true" className="sc-paper-divider" />
              {/* All the room up to the buttons (Coy, 2026-10-02: "there is enough room … don't cut it off"). */}
              <div className="flex-1 min-w-0 flex">
                <ActivityLine inline busy={dustyBusy} onReader={setReaderState} />
              </div>
            </>
          ) : <span className="flex-1" />}

          <div className="flex items-center gap-1.5 shrink-0 relative">
            {!limited && <button onClick={() => { const o = !searchOpen; closeDrops(); setSearchOpen(o); }}
              aria-label="Search" aria-expanded={searchOpen}
              className="flex items-center justify-center sc-paper-btn"
              style={glassBtn}>
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <circle cx="6.4" cy="6.4" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9.8 9.8 L13.4 13.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>}

            {/* Incoming texts, calls and emails, and a call happening now (Coy, 2026-10-06). */}
            {me && !limited && <AlertsBell glassBtn={glassBtn} />}

            {/* Dusty (Coy, 2026-09-30): on a desktop he opens down from the
                header on the right, so his button lives here, where the
                pipeline button was (the Dashboard carries the pipeline now).
                On a phone he rises from the centre of the footer. */}
            {/* Since 2026-10-10 (Coy) he is on each page's own header instead
                (PageHeader's emblem); the desktop header has no Dusty button. */}

            {/* The header's + is gone (Coy, 2026-10-01): its menu opened under
                Dusty. New customer / job / receipt live in Dusty's own + menu. */}

            <button onClick={() => { closeDrops(); router.push(inSettings ? lastPage.current : SETTINGS_HOME); }} className="sc-burger sc-paper-btn"
              data-status={inSettings ? "open" : "closed"} aria-label={inSettings ? "Close settings" : "Settings"}
              style={{ ...glassBtn, position: "relative" }}>
              <span className="sc-burger-bar" aria-hidden="true" />
            </button>

            {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
          </div>
        </header>

        {/* Phone: what Dusty is doing, a row under the header. */}
        {!desktop && phoneLineOn && <ActivityLine busy={dustyBusy} onReader={setReaderState} />}
      </div>

      {/* ---- desktop left rail: every page, in Coy's order ----
          A sidebar since 2026-10-10 (Claude Design "Rail Icon Colors"): icon and label on
          one row, each icon in its colour from the book; folds to icons at the foot. */}
      <nav aria-label="Main" className="hidden lg:flex fixed left-0 bottom-0 z-30 flex-col items-stretch overflow-y-auto sc-rail"
        style={{ top: "var(--sc-head)" }} onMouseLeave={() => setRailTip(null)}>
        {(allowed ?? menus.rail).map((k) => {
          // Dusty's desktop door is the header button (Coy, 2026-09-30).
          if (k === "dusty") return null;
          const p = PAGE.get(k);
          if (!p) return null;
          const on = active === k;
          const role = menuColors[k];
          const tip = (e: React.SyntheticEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setRailTip({ label: p.label, top: r.top + r.height / 2 }); };
          return (
            <Link key={k} href={p.href} aria-current={on ? "page" : undefined}
              aria-label={railIcons ? p.label : undefined}
              onMouseEnter={railIcons ? tip : undefined} onMouseLeave={railIcons ? () => setRailTip(null) : undefined}
              onFocus={railIcons ? tip : undefined} onBlur={railIcons ? () => setRailTip(null) : undefined}
              className="sc-rail-item no-underline" data-plain={role ? undefined : ""}
              style={role ? ({ "--sc-icon": iconVar(role) } as React.CSSProperties) : undefined}>
              <NavIcon k={k} on={on} color="currentColor" />
              <span className="sc-rail-label">{p.label}</span>
              {k === "threads" && needs !== null && needs > 0 && <Badge n={needs} className="sc-rail-badge" />}
              {k === "logs" && badge.logs && <span className="sc-rail-badge rounded-full" style={{ width: 8, height: 8, marginTop: 4, marginRight: 4, background: T.red }} />}
            </Link>
          );
        })}
        {!limited && (
          // Coy, 2026-10-10: a settings button on the rail; since the same day it slides
          // a Menu settings panel out beside the rail instead of opening Settings.
          <button type="button" onClick={() => { setRailTip(null); setMenuPanel((o) => !o); }} aria-expanded={menuPanel}
            aria-label="Menu settings: order and icon colors" data-on={menuPanel ? "" : undefined}
            onMouseEnter={railIcons ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setRailTip({ label: "Menu settings", top: r.top + r.height / 2 }); } : undefined}
            onMouseLeave={railIcons ? () => setRailTip(null) : undefined}
            className="sc-rail-fold sc-rail-set">
            <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h13M3 9.5h13M3 14h13" /><circle cx="7" cy="5" r="1.6" fill="var(--sc-rail)" /><circle cx="12" cy="9.5" r="1.6" fill="var(--sc-rail)" /><circle cx="6" cy="14" r="1.6" fill="var(--sc-rail)" />
            </svg>
            <span className="sc-rail-label">Menu settings</span>
          </button>
        )}
        <button type="button" onClick={() => { setRailTip(null); setRailIcons(!railIcons); }}
          aria-expanded={!railIcons} aria-label={railIcons ? "Show the menu's words" : "Fold the menu to icons"}
          title={railIcons ? "Expand" : undefined} className="sc-rail-fold">
          <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3.5h13v12H3zM7 3.5v12M12.5 7.5l-2 2 2 2" />
          </svg>
          <span className="sc-rail-label">Collapse</span>
        </button>
      </nav>
      {railIcons && railTip && (
        <div role="tooltip" className="hidden lg:block fixed pointer-events-none"
          style={{ left: "calc(var(--sc-rail-w) + 6px)", top: railTip.top, transform: "translateY(-50%)", zIndex: 70,
            background: T.dark, color: "#fff", padding: "5px 9px", borderRadius: 6, fontSize: 12, fontFamily: body, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}>
          {railTip.label}
        </div>
      )}

      <main className={["flex-1 min-w-0 overflow-x-clip pb-[var(--sc-foot)] lg:pb-0 lg:pl-[var(--sc-rail-w)]", dustyOpen ? "sc-with-dusty" : ""].join(" ")}>
        <AccessContext.Provider value={access}><OrgNameContext.Provider value={me?.org_name ?? null}><MeContext.Provider value={meCtx}>{children}</MeContext.Provider></OrgNameContext.Provider></AccessContext.Provider>
      </main>
      <ArchiveToast />
      {me && <InstallPrompt />}
      <ThreadColorVars />
      {me && !limited && <AlertPopups />}

      <Toolbox open={toolOpen} onClose={() => setToolOpen(false)} keys={toolKeys} active={active} badge={badge} colors={menuColors} />
      {!limited && <MenuPanel open={menuPanel} onClose={closeMenuPanel} />}

      {/* Above the open Toolbox (z 47) so Dusty's disc rising out of the bar stays whole. */}
      <footer className="fixed bottom-0 left-0 right-0 flex items-stretch lg:hidden"
        style={{ zIndex: toolOpen ? 48 : 40, background: T.card, borderTop: `1px solid ${T.hair}`, height: 58, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {markIdx >= 0 && <span className="sc-tab-mark" style={{ left: `${markIdx * slotPct}%`, width: `${slotPct}%` }} aria-hidden="true" />}
        {footerSlots.map((k) => {
          if (k === "dusty") {
            // Dusty carries it — no word underneath; the sorting ring while he works.
            return (
              <button key={k} onClick={() => { setToolOpen(false); setDustyOpen((o) => !o); }}
                aria-label="Dusty" className="sc-tab sc-tab-dusty flex-1 flex items-center justify-center">
                {/* Bigger than the page icons, in a disc rising above the bar (Coy, 2026-10-05). */}
                <span className="sc-tab-ico"><DustyAvatar state={dustyNow} size={40} hidden /></span>
              </button>
            );
          }
          if (k === "toolbox") {
            const on = toolOpen || toolActive;
            return (
              <button key={k} onClick={() => setToolOpen((o) => !o)} aria-expanded={toolOpen} aria-label="Toolbox" data-on={on ? "" : undefined}
                className="sc-tab flex-1 flex flex-col items-center justify-center gap-1" style={{ position: "relative" }}>
                <span className="sc-tab-ico" style={{ position: "relative" }}>
                  <NavIcon k="toolbox" on={on} color={phoneIcon("toolbox", on)} />
                  {badge.logs && <span className="absolute rounded-full" style={{ top: -2, right: -4, width: 7, height: 7, background: T.red }} />}
                </span>
                <span className="sc-tab-lbl" style={{ ...eyebrow, ...tabLabel("Toolbox"), color: on ? T.hiviz : T.ink3, fontWeight: on ? 700 : undefined }}>Toolbox</span>
              </button>
            );
          }
          const p = PAGE.get(k);
          if (!p) return null;
          const on = active === k;
          return (
            <Link key={k} href={p.href} aria-current={on ? "page" : undefined} onClick={() => setToolOpen(false)}
              className="sc-tab flex-1 flex flex-col items-center justify-center gap-1 no-underline">
              <span className={`sc-tab-ico${on ? " sc-tab-pop" : ""}`} key={`${k}-${on}`} style={{ position: "relative" }}>
                <NavIcon k={k} on={on} color={phoneIcon(k, on)} />
                {k === "threads" && needs !== null && needs > 0 && <Badge n={needs} style={{ top: -4, left: "calc(50% + 4px)", minWidth: 14, height: 14 }} />}
              </span>
              <span className="sc-tab-lbl" style={{ ...eyebrow, ...tabLabel(p.label), color: on ? T.hiviz : T.ink3, fontWeight: on ? 700 : undefined }}>{p.label}</span>
            </Link>
          );
        })}
      </footer>

      {/* Dusty — full screen on a phone, docked right on a desktop; read-only toward the business. */}
      {!limited && <DustyPanel open={dustyOpen} onClose={() => setDustyOpen(false)} onBusy={setDustyBusy} onStream={setDustyLive} onState={setPanelState} />}

    </div>
  );
}

