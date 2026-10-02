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

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { setDustyLive } from "@/lib/v34/dusty-live";
import { usePathname } from "next/navigation";
import { T, F, disp, body, eyebrow, nums } from "@/lib/v34/tokens";
import { NavIcon, Sheet } from "@/components/v34/primitives";
import { DustyPanel } from "@/components/v34/dusty-panel";
import { DustyAvatar } from "@/components/v34/dusty-avatar";
import { ActivityLine } from "@/components/v34/activity-line";
import { SearchPanel } from "@/components/v34/search-panel";
import { OrgLockup } from "@/components/v34/org-lockup";
import { YouSection, OrgSection } from "@/components/v34/org-settings";
import { ThemePicker, useTheme } from "@/components/v34/theme-picker";
import { Toolbox, MenuEditor } from "@/components/v34/toolbox";
import { PAGE, DEFAULT_MENUS, cleanMenus, activePage, type Menus } from "@/lib/v34/pages";
import { usePref } from "@/lib/v34/prefs";
import { signOut } from "@/lib/auth";
import "@/styles/v34-shell.css";

interface Me {
  email: string | null; name: string | null; org_name: string | null; role: string | null; line: string | null;
  logo_light?: boolean; logo_dark?: boolean; logo_stamp?: string | null;
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

  // Replies owed (the Threads badge) and the drift alarm (a red dot on Logs).
  // Null until known — never 0 as a placeholder.
  useEffect(() => {
    let off = false;
    fetch("/api/threads/counts").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && typeof d?.counts?.needs === "number") setNeeds(d.counts.needs); }).catch(() => {});
    fetch("/api/dashboard/drift").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && typeof d?.count === "number") setDrift(d.count); }).catch(() => {});
    Promise.resolve().then(() => { if (!off) setSearch(window.location.search); });
    return () => { off = true; };
  }, [pathname]);
  // Close the Toolbox when the page changes (a pick navigates).
  const [pathSeen, setPathSeen] = useState(pathname);
  if (pathSeen !== pathname) { setPathSeen(pathname); setToolOpen(false); }

  const active = activePage(pathname, search);
  const toolKeys = menus.rail.filter((k) => k !== "dusty" && !menus.footer.includes(k));
  const toolActive = toolKeys.includes(active);
  const badge = { logs: (drift ?? 0) > 0 };
  const working = dustyBusy || readerWorking;
  const glassBtn = { width: 32, height: 32 } as const;
  const closeDrops = () => { setSearchOpen(false); };

  // Footer: page · page · Dusty · page · Toolbox.
  const f = menus.footer;
  const footerSlots = [f[0], f[1], "dusty", f[2], "toolbox"].filter(Boolean) as string[];
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
          {desktop ? (
            <>
              <span aria-hidden="true" className="sc-paper-divider" />
              {/* All the room up to the buttons (Coy, 2026-10-02: "there is enough room … don't cut it off"). */}
              <div className="flex-1 min-w-0 flex">
                <ActivityLine inline busy={dustyBusy} onWorking={setReaderWorking} />
              </div>
            </>
          ) : <span className="flex-1" />}

          <div className="flex items-center gap-1.5 shrink-0 relative">
            <button onClick={() => { const o = !searchOpen; closeDrops(); setSearchOpen(o); }}
              aria-label="Search" aria-expanded={searchOpen}
              className="flex items-center justify-center sc-paper-btn"
              style={glassBtn}>
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <circle cx="6.4" cy="6.4" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9.8 9.8 L13.4 13.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {/* Dusty (Coy, 2026-09-30): on a desktop he opens down from the
                header on the right, so his button lives here, where the
                pipeline button was (the Dashboard carries the pipeline now).
                On a phone he rises from the centre of the footer. */}
            {desktop && (
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
        {!desktop && <ActivityLine busy={dustyBusy} onWorking={setReaderWorking} />}
      </div>

      {/* ---- desktop left rail: every page, in Coy's order ---- */}
      <nav aria-label="Main" className="hidden lg:flex fixed left-0 bottom-0 z-30 flex-col items-stretch overflow-y-auto sc-rail"
        style={{ top: "var(--sc-head)", width: 84 }}>
        {menus.rail.map((k) => {
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

      <main className={["flex-1 min-w-0 overflow-x-clip pb-[var(--sc-foot)] lg:pb-0 lg:pl-[84px]", dustyOpen ? "sc-with-dusty" : ""].join(" ")}>{children}</main>

      <Toolbox open={toolOpen} onClose={() => setToolOpen(false)} keys={toolKeys} active={active} badge={badge} />

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch lg:hidden"
        style={{ background: T.card, borderTop: `1px solid ${T.hair}`, height: 58, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {markIdx >= 0 && <span className="sc-tab-mark" style={{ left: `${markIdx * 20}%`, width: "20%" }} aria-hidden="true" />}
        {footerSlots.map((k) => {
          if (k === "dusty") {
            // Dusty carries it — no word underneath. 24px: static (the pack's rule);
            // the mixer frame while he works.
            return (
              <button key={k} onClick={() => { setToolOpen(false); setDustyOpen((o) => !o); }}
                aria-label="Dusty" className="sc-tab flex-1 flex items-center justify-center">
                <span className="sc-tab-ico"><DustyAvatar state={working ? "calculating" : "idle"} size={24} hidden /></span>
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
      <DustyPanel open={dustyOpen} onClose={() => setDustyOpen(false)} onBusy={setDustyBusy} onStream={setDustyLive} />

      {/* Settings: starts under the header (--sc-head) so the ☰ stays tappable to close it. */}
      <Sheet open={menuOpen} onClose={() => { setMenuOpen(false); setMenusOpen(false); }} title="Settings" sub={me?.org_name ?? undefined} below>
        <div className="px-4 py-3">
          {me ? (
            <>
              <YouSection key={me.name ?? ""} name={me.name} email={me.email} orgName={me.org_name} role={me.role} onSaved={reloadMe} />
              <div className="mt-3" style={{ borderTop: `1px solid ${T.hair}` }}>
                <OrgSection key={me.name ?? ""} onChanged={reloadMe} />
              </div>
            </>
          ) : <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading your account…</div>}

          <div className="flex flex-col" style={{ borderTop: `1px solid ${T.hair}` }}>
            {[
              { href: "/dashboard/more/lines", label: "Phone lines", note: "Your numbers, their provider, and the lead source each one means" },
            ].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block py-2.5 no-underline" style={{ borderBottom: `1px solid ${T.hairSoft}`, color: T.ink }}>
                <div style={{ fontSize: F.md, fontWeight: 600 }}>{l.label}</div>
                <div style={{ fontSize: F.xs, color: T.ink3 }}>{l.note}</div>
              </Link>
            ))}
            <button onClick={() => setLooksOpen((o) => !o)} aria-expanded={looksOpen} className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <div style={{ fontSize: F.md, fontWeight: 600 }}>Appearance {looksOpen ? "−" : "+"}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>Eight colour schemes, one dark — some change the typeface too</div>
            </button>
            {looksOpen && <div className="py-2"><ThemePicker /></div>}
            <button onClick={() => setMenusOpen((o) => !o)} aria-expanded={menusOpen} className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <div style={{ fontSize: F.md, fontWeight: 600 }}>Menus {menusOpen ? "−" : "+"}</div>
              <div style={{ fontSize: F.xs, color: T.ink3 }}>The order of your pages, and which ones sit in the phone footer</div>
            </button>
            {menusOpen && (
              <div className="py-2">
                <MenuEditor menus={menus} onChange={(m) => setSavedMenus(m)} />
                <button onClick={() => setSavedMenus(DEFAULT_MENUS)} className="mt-2" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Back to the default</button>
              </div>
            )}
          </div>

          <button onClick={() => { void signOut(); }} className="w-full rounded mt-5"
            style={{ height: 44, border: `1px solid ${T.hair}`, background: T.card, fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}

