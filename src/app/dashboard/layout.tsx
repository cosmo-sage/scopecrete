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
 *   - Settings (☰): You, Organisation (name, logo, people — design/org-branding),
 *     Phone lines, Appearance, Menus. (Markups & overhead is gone entirely —
 *     margin, O.H. and tax are Price book → Defaults; overhead is on Cash.)
 *   - The header shows the org's logo with "powered by scopecrete.ai"
 *     (OrgLockup); with no logo, the scopecrete.ai wordmark as before.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { setDustyLive } from "@/lib/v34/dusty-live";
import { usePathname } from "next/navigation";
import { T, F, disp, body, eyebrow, nums } from "@/lib/v34/tokens";
import { NavIcon, Sheet } from "@/components/v34/primitives";
import { DustyPanel } from "@/components/v34/dusty-panel";
import { DustyAvatar } from "@/components/v34/dusty-avatar";
import { ActivityLine } from "@/components/v34/activity-line";
import { ArchiveToast } from "@/components/v34/archive-actions";
import { AlertsBell, AlertPopups } from "@/components/v34/incoming-alerts";
import { useAlertsWatcher } from "@/lib/v34/alerts-live";
import dynamic from "next/dynamic";
// Only drawn once 🔍 is tapped — kept out of the first load.
const SearchPanel = dynamic(() => import("@/components/v34/search-panel").then((m) => m.SearchPanel));
import { OrgLockup } from "@/components/v34/org-lockup";
import { InstallApp } from "@/components/v34/install-app";
import { YouSection, OrgSection } from "@/components/v34/org-settings";
import { ThemePicker, useTheme } from "@/components/v34/theme-picker";
import { Toolbox, MenuEditor } from "@/components/v34/toolbox";
import { PAGE, DEFAULT_MENUS, cleanMenus, activePage, type Menus } from "@/lib/v34/pages";
import { usePref } from "@/lib/v34/prefs";
import { useHideHeadOnScroll } from "@/lib/v34/use-hide-head";
import { AccessContext } from "@/lib/v34/access-ctx";
import { accessFrom, menuPages, redirectFor, FULL_ACCESS, type Access } from "@/lib/access";
import { useRouter } from "next/navigation";
import "@/styles/v34-shell.css";

interface Me {
  email: string | null; name: string | null; phone?: string | null; org_name: string | null; role: string | null; line: string | null;
  logo_light?: boolean; logo_dark?: boolean; logo_stamp?: string | null;
  access?: Access;
}

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [menusOpen, setMenusOpen] = useState(false);
  const [looksOpen, setLooksOpen] = useState(false);
  // The colour theme follows the account (Settings → Appearance).
  const [theme] = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);
  const [dustyOpen, setDustyOpen] = useState(false);
  useEffect(() => {
    const open = () => setDustyOpen(true);
    window.addEventListener("sc:dusty-open", open);
    return () => window.removeEventListener("sc:dusty-open", open);
  }, []);
  // A vendor's "App access" (081) opens Settings → People with them picked.
  useEffect(() => {
    const open = () => setMenuOpen(true);
    window.addEventListener("sc:open-settings", open);
    return () => window.removeEventListener("sc:open-settings", open);
  }, []);
  // Pages that change shape while Dusty is docked (the job page moves its
  // totals into his panel) read this from <html data-dusty>.
  useEffect(() => {
    document.documentElement.dataset.dusty = dustyOpen ? "open" : "";
    window.dispatchEvent(new Event("sc:dusty-state"));
  }, [dustyOpen]);
  // True only while a Dusty reply is actually streaming.
  const [dustyBusy, setDustyBusy] = useState(false);
  // The background reader has a read running.
  const [readerWorking, setReaderWorking] = useState(false);

  const [me, setMe] = useState<Me | null>(null);
  const [needs, setNeeds] = useState<number | null>(null);
  const [drift, setDrift] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [savedMenus, setSavedMenus] = usePref<Menus>("menus", DEFAULT_MENUS);
  // Dusty's thought line can be switched off (Settings → Dusty (AI), Coy 2026-10-05).
  // <html data-activity-phone="off"> makes --sc-head the 54px bar alone; app/layout.tsx
  // sets it before first paint from the browser's copy of this setting.
  // A phone and a desktop are set apart (Coy, 2026-10-05: "off on mobile and on on desktop");
  // the phone's follows the desktop's until it is set itself.
  const [showLine, setShowLine] = usePref<boolean>("activity_line", true);
  const [showLinePhone, setShowLinePhone] = usePref<boolean | null>("activity_line_phone", null);
  const deskLineOn = showLine !== false;
  const phoneLineOn = (showLinePhone ?? showLine) !== false;
  useEffect(() => {
    if (phoneLineOn) delete document.documentElement.dataset.activityPhone;
    else document.documentElement.dataset.activityPhone = "off";
  }, [phoneLineOn]);
  const menus = cleanMenus(savedMenus);

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
      return r.ok ? d : null;
    }).then((d) => { if (!off && d && !d.error) setMe(d); }).catch(() => {});
    return () => { off = true; };
  }, [meRev]);
  const reloadMe = () => setMeRev((n) => n + 1);

  // An onsite estimator (081) sees Jobs (and Files when given) and nothing else; any other
  // page sends them to the board. The database keeps them out regardless — this keeps them
  // from landing on pages that would come back empty.
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
  const working = dustyBusy || readerWorking;
  const glassBtn = { width: 32, height: 32 } as const;
  const closeDrops = () => { setSearchOpen(false); };

  // Footer: page · page · Dusty · page · Toolbox.
  const f = menus.footer;
  const footerSlots = allowed ?? [f[0], f[1], "dusty", f[2], "toolbox"].filter(Boolean) as string[];
  const slotPct = 100 / Math.max(1, footerSlots.length);
  const markIdx = footerSlots.findIndex((k) => k === active || (k === "toolbox" && toolActive));

  const Badge = ({ n, style }: { n: number; style: React.CSSProperties }) => (
    <span className="absolute rounded-full flex items-center justify-center"
      style={{ minWidth: 15, height: 15, padding: "0 3px", background: T.hiviz, color: T.onHiviz, fontFamily: disp,
               fontSize: 9.5, fontWeight: 700, lineHeight: 1, ...nums, ...style }}>{n}</span>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: T.slab, color: T.ink, fontFamily: body }}>
      <div className="sc-head-wrap" style={{ position: "sticky", top: 0, zIndex: menuOpen ? 60 : 40 }}>
        <header className="px-2.5 lg:px-4 flex items-center gap-3 sc-paper" style={{ height: 54 }}>
          <Link href="/dashboard" className="no-underline shrink-0" aria-label="Dashboard">
            <OrgLockup name={me?.org_name ?? null} hasLight={!!me?.logo_light} hasDark={!!me?.logo_dark} stamp={me?.logo_stamp ?? null}
              dark={theme.dark} phone={!desktop} />
          </Link>

          {/* Desktop: the activity line in the header row, after a divider. */}
          {desktop && deskLineOn ? (
            <>
              <span aria-hidden="true" className="sc-paper-divider" />
              {/* All the room up to the buttons (Coy, 2026-10-02: "there is enough room … don't cut it off"). */}
              <div className="flex-1 min-w-0 flex">
                <ActivityLine inline busy={dustyBusy} onWorking={setReaderWorking} />
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
            {desktop && !limited && (
              <button onClick={() => { closeDrops(); setDustyOpen((o) => !o); }} aria-label="Dusty" aria-pressed={dustyOpen}
                className="flex items-center justify-center sc-paper-btn"
                style={{ ...glassBtn, background: dustyOpen ? "var(--sc-hiviz-dim)" : undefined, borderColor: dustyOpen ? "var(--sc-hiviz-soft)" : undefined }}>
                <DustyAvatar state={working ? "calculating" : "idle"} size={24} hidden />
              </button>
            )}

            {/* The header's + is gone (Coy, 2026-10-01): its menu opened under
                Dusty. New customer / job / receipt live in Dusty's own + menu. */}

            <button onClick={() => setMenuOpen((o) => !o)} className="sc-burger sc-paper-btn"
              data-status={menuOpen ? "open" : "closed"} aria-expanded={menuOpen} aria-label={menuOpen ? "Close settings" : "Settings"}
              style={{ ...glassBtn, position: "relative" }}>
              <span className="sc-burger-bar" aria-hidden="true" />
            </button>

            {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
          </div>
        </header>

        {/* Phone: what Dusty is doing, a row under the header. */}
        {!desktop && phoneLineOn && <ActivityLine busy={dustyBusy} onWorking={setReaderWorking} />}
      </div>

      {/* ---- desktop left rail: every page, in Coy's order ---- */}
      <nav aria-label="Main" className="hidden lg:flex fixed left-0 bottom-0 z-30 flex-col items-stretch overflow-y-auto sc-rail"
        style={{ top: "var(--sc-head)", width: 84 }}>
        {(allowed ?? menus.rail).map((k) => {
          // Dusty's desktop door is the header button (Coy, 2026-09-30).
          if (k === "dusty") return null;
          const p = PAGE.get(k);
          if (!p) return null;
          const on = active === k;
          return (
            <Link key={k} href={p.href} aria-current={on ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-1 no-underline shrink-0"
              style={{ height: 60, borderLeft: "3px solid transparent", position: "relative" }}>
              <span style={{ opacity: on ? 1 : 0.8, display: "flex" }}><NavIcon k={k} on={on} color="currentColor" /></span>
              <span className="sc-rail-label">{p.label}</span>
              {k === "threads" && needs !== null && needs > 0 && <Badge n={needs} style={{ top: 8, right: 16 }} />}
              {k === "logs" && badge.logs && <span className="absolute rounded-full" style={{ top: 12, right: 24, width: 8, height: 8, background: T.red }} />}
            </Link>
          );
        })}
      </nav>

      <main className={["flex-1 min-w-0 overflow-x-clip pb-[var(--sc-foot)] lg:pb-0 lg:pl-[84px]", dustyOpen ? "sc-with-dusty" : ""].join(" ")}>
        <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
      </main>
      <ArchiveToast />
      {me && !limited && <AlertPopups />}

      <Toolbox open={toolOpen} onClose={() => setToolOpen(false)} keys={toolKeys} active={active} badge={badge} />

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch lg:hidden"
        style={{ background: T.card, borderTop: `1px solid ${T.hair}`, height: 58, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {markIdx >= 0 && <span className="sc-tab-mark" style={{ left: `${markIdx * slotPct}%`, width: `${slotPct}%` }} aria-hidden="true" />}
        {footerSlots.map((k) => {
          if (k === "dusty") {
            // Dusty carries it — no word underneath; the sorting ring while he works.
            return (
              <button key={k} onClick={() => { setToolOpen(false); setDustyOpen((o) => !o); }}
                aria-label="Dusty" className="sc-tab sc-tab-dusty flex-1 flex items-center justify-center">
                {/* Bigger than the page icons, in a disc rising above the bar (Coy, 2026-10-05). */}
                <span className="sc-tab-ico"><DustyAvatar state={working ? "calculating" : "idle"} size={40} hidden /></span>
              </button>
            );
          }
          if (k === "toolbox") {
            const on = toolOpen || toolActive;
            return (
              <button key={k} onClick={() => setToolOpen((o) => !o)} aria-expanded={toolOpen} aria-label="Toolbox"
                className="sc-tab flex-1 flex flex-col items-center justify-center gap-1" style={{ position: "relative" }}>
                <span className="sc-tab-ico" style={{ position: "relative" }}>
                  <NavIcon k="toolbox" on={on} />
                  {badge.logs && <span className="absolute rounded-full" style={{ top: -2, right: -4, width: 7, height: 7, background: T.red }} />}
                </span>
                <span className="sc-tab-lbl" style={{ ...eyebrow, fontSize: 9, color: on ? T.ink : T.ink3 }}>Toolbox</span>
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
                <NavIcon k={k} on={on} />
                {k === "threads" && needs !== null && needs > 0 && <Badge n={needs} style={{ top: -4, left: "calc(50% + 4px)", minWidth: 14, height: 14 }} />}
              </span>
              <span className="sc-tab-lbl" style={{ ...eyebrow, fontSize: 9, color: on ? T.ink : T.ink3 }}>{p.label}</span>
            </Link>
          );
        })}
      </footer>

      {/* Dusty — full screen on a phone, docked right on a desktop; read-only toward the business. */}
      {!limited && <DustyPanel open={dustyOpen} onClose={() => setDustyOpen(false)} onBusy={setDustyBusy} onStream={setDustyLive} />}

      {/* Settings: starts under the header (--sc-head) so the ☰ stays tappable to close it. */}
      <Sheet open={menuOpen} onClose={() => { setMenuOpen(false); setMenusOpen(false); }} title="Settings" sub={me?.org_name ?? undefined} below>
        <div className="px-4 py-3">
          {me ? (
            <>
              <YouSection key={`${me.name ?? ""}|${me.phone ?? ""}`} name={me.name} phone={me.phone ?? null} email={me.email} orgName={me.org_name} role={me.role} onSaved={reloadMe} />
              {!limited && <div className="mt-3" style={{ borderTop: `1px solid ${T.hair}` }}>
                <OrgSection key={me.name ?? ""} onChanged={reloadMe} />
              </div>}
            </>
          ) : <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading your account…</div>}

          <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hair}` }}>
            {(limited ? [] : [
              { href: "/dashboard/more/lines", label: "Lines", note: "Your numbers, what runs them, and whether each is talking to the app" },
            ]).map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block py-2.5 no-underline" style={{ borderBottom: `1px solid ${T.hairSoft}`, color: T.ink }}>
                <div style={{ fontSize: F.md, fontWeight: 600 }}>{l.label}</div>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>{l.note}</div>
              </Link>
            ))}
            {/* Feedback and the Roadmap (084) — every signed-in user, estimators too. */}
            <Link href={`/dashboard/roadmap?feedback=1&from=${encodeURIComponent(pathname ?? "")}`} onClick={() => setMenuOpen(false)}
              className="block py-2.5 no-underline" style={{ borderBottom: `1px solid ${T.hairSoft}`, color: T.ink }}>
              <div style={{ fontSize: F.md, fontWeight: 600 }}>Give feedback</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>An idea or something wrong — and the Roadmap, to vote on what comes next</div>
            </Link>
            <InstallApp />
            <button onClick={() => setLooksOpen((o) => !o)} aria-expanded={looksOpen} className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <div style={{ fontSize: F.md, fontWeight: 600 }}>Appearance {looksOpen ? "−" : "+"}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>Eight colour schemes, one dark — some change the typeface too</div>
            </button>
            {looksOpen && <div className="py-2"><ThemePicker /></div>}
            {/* Dusty (AI) — Coy, 2026-10-05: "if I want to declutter my visual space I can make it disappear entirely". */}
            {!limited && (
              <div className="py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}` }}>
                <div style={{ fontSize: F.md, fontWeight: 600 }}>Dusty (AI)</div>
                <div style={{ fontSize: F.sm, color: T.ink, marginTop: 6 }}>Show Dusty&apos;s thought line</div>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>
                  The line beside the logo (under it on a phone): what he&apos;s reading, reminders due, people who came back. A phone and a desktop are set apart.
                </div>
                {([["On a phone", phoneLineOn, (v: boolean) => setShowLinePhone(v)], ["On a desktop", deskLineOn, (v: boolean) => {
                  // The phone keeps what it showed: it followed the desktop's switch until now.
                  if (showLinePhone === null) setShowLinePhone(deskLineOn);
                  setShowLine(v);
                }]] as Array<[string, boolean, (v: boolean) => void]>).map(([label, on, set]) => (
                  <div key={label} className="flex items-center gap-3 mt-1.5">
                    <div className="flex-1 min-w-0" style={{ fontSize: F.sm, color: T.ink2 }}>{label}</div>
                    <button type="button" role="switch" aria-checked={on} aria-label={`Show Dusty's thought line ${label.toLowerCase()}`} onClick={() => set(!on)}
                      style={{ width: 38, height: 22, borderRadius: 999, background: on ? T.green : T.hairStrong, position: "relative", cursor: "pointer", flex: "0 0 auto" }}>
                      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!limited && <button onClick={() => setMenusOpen((o) => !o)} aria-expanded={menusOpen} className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <div style={{ fontSize: F.md, fontWeight: 600 }}>Menus {menusOpen ? "−" : "+"}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>The order of your pages, and which ones sit in the phone footer</div>
            </button>}
            {menusOpen && !limited && (
              <div className="py-2">
                <MenuEditor menus={menus} onChange={(m) => setSavedMenus(m)} />
                <button onClick={() => setSavedMenus(DEFAULT_MENUS)} className="mt-2" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Back to the default</button>
              </div>
            )}
          </div>

          <button onClick={() => { void import("@/lib/auth").then((m) => m.signOut()); }} className="w-full rounded mt-5"
            style={{ height: 44, border: `1px solid ${T.hair}`, background: T.card, fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}

