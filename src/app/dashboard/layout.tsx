"use client";

/**
 * The v34 shell — glass header, five-slot footer.
 *
 * Ported from scopecrete-v34.jsx: header L5321-5392, footer L5640-5692, CSS
 * L5155-5320 (now src/styles/v34-shell.css). The previous shell was a white bar
 * carrying a wordmark and a burger, which is where most of "the site looks
 * nothing like the mockup" came from.
 *
 * THE FOOTER IS FIVE SLOTS, NOT FIVE TABS. Threads · Scope · Dusty · Cash ·
 * More, with Dusty as the centre emblem and no word underneath it. v34's own
 * comment at L3410 is "the four footer destinations — Dusty is a conversation,
 * not a landing", which is also DECISIONS.md §6: Dusty is reached COLD from the
 * footer emblem, not navigated to like a page.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * StreamBar. v34 hangs it under the header and feeds it DREAM_LINES — ten
 * hardcoded sentences carrying dollar figures. See src/components/v34/shell.tsx.
 *
 * The emblem's "asking" state. v34 quickens the mark when Dusty has questions,
 * counted off mock data. Nothing computes a real question count, so the
 * animation would be asserting something untrue. `sc-em-breathe` and
 * `sc-em-asking` are left out of the stylesheet entirely rather than left
 * unused, so nothing can reach for them by accident.
 *
 * `thinking` is honest: it is on only while a request this shell issued is
 * actually in flight.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { T, F, disp, eyebrow, nums, clip } from "@/lib/v34/tokens";
import { Emblem, NavIcon, Sheet } from "@/components/v34/primitives";
import { PipelineDrop, CreateDrop } from "@/components/v34/shell";
import { signOut } from "@/lib/auth";
import "@/styles/v34-shell.css";

/** Five slots. `dusty` carries no label — the emblem is the control. */
const SLOTS: Array<{ k: string; label?: string; href?: string }> = [
  { k: "threads", label: "Threads", href: "/dashboard/messages" },
  { k: "scope", label: "Scope", href: "/dashboard/scope" },
  { k: "dusty" },
  { k: "cash", label: "Cash", href: "/dashboard/cash" },
  { k: "more", label: "More", href: "/dashboard/more" },
];

interface Me { email: string | null; name: string | null; org_name: string | null; role: string | null }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pipeOpen, setPipeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dustyOpen, setDustyOpen] = useState(false);

  const [me, setMe] = useState<Me | null>(null);
  const [needs, setNeeds] = useState<number | null>(null);

  // The emblem's working state. One flag per request rather than a shared
  // counter, so the first response cannot still the mark while the second is
  // still running. Both start true — the fetches are issued on mount — and are
  // only ever cleared, which keeps every setState out of an effect body.
  const [meLoading, setMeLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [emTap, setEmTap] = useState(0);
  const [emTapping, setEmTapping] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seeded from the URL when the box opens, rather than through
  // useSearchParams(), which in a client layout forces a Suspense boundary
  // around the whole shell and opts every dashboard page out of static
  // rendering. Seeding happens in the open handler, not an effect.
  const [query, setQuery] = useState("");
  const openSearch = useCallback(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    setSearchOpen(true);
    setPipeOpen(false);
    setCreateOpen(false);
  }, []);

  const tapEmblem = useCallback(() => {
    setEmTap((n) => n + 1);
    setEmTapping(true);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setEmTapping(false), 640);
  }, []);

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  useEffect(() => {
    let off = false;
    fetch("/api/session/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d && !d.error) setMe(d); })
      .catch(() => {})
      .finally(() => { if (!off) setMeLoading(false); });
    return () => { off = true; };
  }, []);

  // The Threads badge counts replies owed. Null until it is known — never 0 as
  // a placeholder, because 0 means "you are caught up" and that is a claim.
  //
  // Refetched on navigation so the badge does not go stale, but the emblem is
  // NOT put back into its working state for that: a spin on every tab change
  // would make the animation mean "you tapped something" rather than "real
  // work is happening", which is the distinction the two states exist to draw.
  useEffect(() => {
    let off = false;
    fetch("/api/threads/counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && typeof d?.counts?.needs === "number") setNeeds(d.counts.needs); })
      .catch(() => {})
      .finally(() => { if (!off) setCountsLoading(false); });
    return () => { off = true; };
  }, [pathname]);

  const activeKey =
    pathname.startsWith("/dashboard/messages") ? "threads"
    : pathname.startsWith("/dashboard/scope") ? "scope"
    : pathname.startsWith("/dashboard/cash") ? "cash"
    : pathname.startsWith("/dashboard/more") ? "more"
    : "";
  const markIdx = SLOTS.findIndex((s) => s.k === activeKey);

  const thinking = meLoading || countsLoading;
  const displayName = me?.name ?? me?.email ?? null;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/dashboard/messages?q=${encodeURIComponent(q)}` : "/dashboard/messages");
    setSearchOpen(false);
  }

  const glassBtn = { width: 32, height: 32 } as const;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: T.slab, color: T.ink }}>
      <div style={{ position: "sticky", top: 0, zIndex: menuOpen ? 60 : 40 }}>
        <header className="px-2.5 flex items-center justify-between gap-2 sc-glass" style={{ height: 54 }}>
          <Link href="/dashboard/messages" onClick={tapEmblem}
            className="flex items-center gap-2 shrink-0 no-underline" style={{ height: 44 }}>
            {/* One mark. tap > working > dreaming — never two at once. */}
            <Emblem key={`h${emTap}`} size={24} stroke={3}
              className={emTapping ? "sc-em-tap" : thinking ? "sc-em-think" : "sc-em-dream"} />
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, color: "#fff",
                           letterSpacing: ".08em", textTransform: "lowercase" }}>
              scopecrete<span style={{ color: T.hiviz }}>.ai</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => (searchOpen ? setSearchOpen(false) : openSearch())}
              aria-label="Search" aria-expanded={searchOpen}
              className="rounded-lg flex items-center justify-center sc-glass-btn"
              style={{ ...glassBtn, background: searchOpen ? "rgba(255,255,255,.22)" : undefined }}>
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <circle cx="6.4" cy="6.4" r="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
                <path d="M9.8 9.8 L13.4 13.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {/* pipeline — ascending bars, like signal strength */}
            <button onClick={() => { setPipeOpen((o) => !o); setSearchOpen(false); setCreateOpen(false); }}
              aria-label="Pipeline" aria-expanded={pipeOpen}
              className="rounded-lg flex items-end justify-center gap-[2.5px] sc-glass-btn"
              style={{ ...glassBtn, paddingBottom: 9,
                       background: pipeOpen ? "rgba(255,255,255,.22)" : undefined }}>
              {[5, 8, 11, 14].map((h, i) => (
                <span key={i} style={{ width: 3, height: h, borderRadius: 0.5,
                                       background: i === 3 ? T.hiviz : "#fff" }} />
              ))}
            </button>

            <button onClick={() => { setCreateOpen((o) => !o); setSearchOpen(false); setPipeOpen(false); }}
              aria-label={createOpen ? "Close" : "Create"} aria-expanded={createOpen}
              className="sc-plus sc-glass-btn rounded-lg flex items-center justify-center"
              data-status={createOpen ? "open" : "closed"}
              style={{ ...glassBtn, position: "relative" }}>
              <span className="sc-plus-bar" aria-hidden="true" />
            </button>

            {/* after Andy Bell: one centred bar, two pseudo-elements, folding to an X */}
            <button onClick={() => setMenuOpen((o) => !o)}
              className="sc-burger sc-glass-btn rounded-lg"
              data-status={menuOpen ? "open" : "closed"}
              aria-expanded={menuOpen} aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{ ...glassBtn, position: "relative" }}>
              <span className="sc-burger-bar" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Search lives under the glass, same place on every page — it never
            becomes a row on the page itself. */}
        {searchOpen && (
          <form onSubmit={submitSearch} className="px-2.5 py-2 sc-glass">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="A number, a name, a word they said"
              className="w-full px-2.5 rounded outline-none sc-search"
              style={{ height: 34, fontSize: F.sm, color: "#fff",
                       background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)" }} />
            {/* Says what it actually does. The desktop design promises full text
                over every message; this filters the thread list on names,
                numbers and the latest message only. */}
            <div style={{ ...eyebrow, color: "rgba(255,255,255,.42)", marginTop: 5 }}>
              Names, numbers and the latest message — full text over all messages isn&apos;t wired yet
            </div>
          </form>
        )}
      </div>

      {pipeOpen && <PipelineDrop onClose={() => setPipeOpen(false)} />}
      {createOpen && <CreateDrop onClose={() => setCreateOpen(false)} />}

      <main className="flex-1" style={{ paddingBottom: 72 }}>{children}</main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{ background: T.card, borderTop: `1px solid ${T.hair}`, height: 58,
                 paddingBottom: "env(safe-area-inset-bottom)" }}>
        {markIdx >= 0 && (
          <span className="sc-tab-mark" style={{ left: `${markIdx * 20}%`, width: "20%" }} aria-hidden="true" />
        )}
        {SLOTS.map((s) => {
          if (s.k === "dusty") {
            // The emblem carries it — no word underneath.
            return (
              <button key={s.k} onClick={() => { tapEmblem(); setDustyOpen(true); }}
                aria-label="Dusty" className="sc-tab flex-1 flex items-center justify-center">
                <span className="sc-tab-ico">
                  <Emblem key={`f${emTap}`} size={30} stroke={2.8}
                    className={emTapping ? "sc-em-tap" : thinking ? "sc-em-think" : "sc-em-dream"} />
                </span>
              </button>
            );
          }
          const on = activeKey === s.k;
          return (
            <Link key={s.k} href={s.href as string} aria-current={on ? "page" : undefined}
              className="sc-tab flex-1 flex flex-col items-center justify-center gap-1 no-underline">
              <span className={`sc-tab-ico${on ? " sc-tab-pop" : ""}`} key={`${s.k}-${on}`}
                style={{ position: "relative" }}>
                <NavIcon k={s.k} on={on} />
                {/* Replies owed, not unread — a number you can actually clear. */}
                {s.k === "threads" && needs !== null && needs > 0 && (
                  <span className="absolute rounded-full flex items-center justify-center"
                    style={{ top: -4, left: "calc(50% + 4px)", minWidth: 14, height: 14, padding: "0 3px",
                             background: T.hiviz, color: "#fff", fontFamily: disp, fontSize: 9.5,
                             fontWeight: 700, lineHeight: 1, ...nums }}>{needs}</span>
                )}
              </span>
              <span className="sc-tab-lbl" style={{ ...eyebrow, fontSize: 9, color: on ? T.ink : T.ink3 }}>
                {s.label}
              </span>
            </Link>
          );
        })}
      </footer>

      {/* Dusty: the shell, and nothing that implies it is answering.
          Handoff §6.9 — "design the shell; do not design a conversation that
          implies it is answering". There is no input box here on purpose. */}
      <Sheet open={dustyOpen} onClose={() => setDustyOpen(false)} title="Dusty" sub="Not wired yet">
        <div className="px-4 py-3" style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
          <p>
            Dusty reads threads, calls and scopes, and opens either cold from here or
            hot from a job with that job already loaded.
          </p>
          <p className="mt-2">
            It is not connected. There is no channels list to show yet and no send path,
            so rather than an input box that goes nowhere, this says so.
          </p>
          <p className="mt-2" style={{ color: T.ink3 }}>
            It also has no cost settings — <span style={nums}>org_cost_settings</span> is
            empty — so it could not answer a money question even once it is wired.
          </p>
        </div>
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Account" sub={me?.org_name ?? undefined}>
        <div className="px-4 py-3">
          {displayName ? (
            <>
              <div style={eyebrow}>Signed in as</div>
              <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...clip }}>{displayName}</div>
              {me?.email && me.email !== displayName && (
                <div style={{ fontSize: F.sm, color: T.ink3, ...clip }}>{me.email}</div>
              )}
              {me?.org_name && (
                <div className="mt-2">
                  <div style={eyebrow}>Organisation</div>
                  <div style={{ fontSize: F.sm, color: T.ink2 }}>
                    {me.org_name}{me.role ? ` · ${me.role}` : ""}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading your account…</div>
          )}

          <button onClick={() => { void signOut(); }} className="w-full rounded mt-5"
            style={{ height: 44, border: `1px solid ${T.hair}`, background: T.card,
                     fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}
