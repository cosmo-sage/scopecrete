"use client";

/**
 * The v34 shell: sticky header, four-tab footer.
 *
 * HOME_TABS is Threads / Scope / Cash / More, ported from v34. This replaces
 * the five-tab dark layout (Home / Leads / Cash / Messages / Profile) the old
 * app used.
 *
 * The header is sticky on every page — DECISIONS.md §6.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { Emblem, NavIcon, Sheet } from "@/components/v34/primitives";
import { signOut } from "@/lib/auth";

const HOME_TABS: [string, string, string][] = [
  ["threads", "Threads", "/dashboard/messages"],
  ["scope", "Scope", "/dashboard/scope"],
  ["cash", "Cash", "/dashboard/cash"],
  ["more", "More", "/dashboard/more"],
];

interface Me {
  email: string | null;
  name: string | null;
  org_name: string | null;
  role: string | null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  // USER comes from the session, never a constant. v34 hardcoded it.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && !d.error) setMe(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeKey = (() => {
    if (pathname.startsWith("/dashboard/messages")) return "threads";
    if (pathname.startsWith("/dashboard/scope")) return "scope";
    if (pathname.startsWith("/dashboard/cash")) return "cash";
    if (pathname.startsWith("/dashboard/more")) return "more";
    return "";
  })();

  // Falls back to the email, then to nothing. Never to an invented name.
  const displayName = me?.name ?? me?.email ?? null;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: T.slab, color: T.ink }}>
      <header className="sticky top-0 z-40 flex items-center gap-2 px-3"
        style={{ minHeight: 52, background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <Emblem size={22} />
        <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, letterSpacing: ".015em", lineHeight: 1 }}>
          SCOPE<span style={{ color: T.hiviz }}>CRETE</span>
        </span>
        <span className="flex-1" />
        <button onClick={() => setMenuOpen(true)} aria-label="Menu"
          className="shrink-0 rounded-lg flex items-center justify-center"
          style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card }}>
          <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
            <path d="M0 1h14M0 6h14M0 11h14" stroke={T.ink} strokeWidth="1.6" />
          </svg>
        </button>
      </header>

      <main className="flex-1" style={{ paddingBottom: 68 }}>{children}</main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{
          background: T.card, borderTop: `1px solid ${T.hair}`,
          paddingBottom: "max(2px, env(safe-area-inset-bottom))",
        }}>
        {HOME_TABS.map(([k, label, href]) => {
          const on = activeKey === k;
          return (
            <Link key={k} href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 no-underline"
              style={{ minHeight: 54, color: on ? T.ink : T.ink3 }}>
              <NavIcon k={k} on={on} />
              <span style={{
                fontFamily: disp, fontSize: F.micro, letterSpacing: ".12em",
                textTransform: "uppercase", color: on ? T.ink : T.ink3,
              }}>{label}</span>
            </Link>
          );
        })}
      </footer>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}
        title="Account" sub={me?.org_name ?? undefined}>
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

          <button onClick={() => { void signOut(); }}
            className="w-full rounded mt-5"
            style={{
              height: 44, border: `1px solid ${T.hair}`, background: T.card,
              fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase",
            }}>
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}
