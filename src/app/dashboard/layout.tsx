"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartBar,
  Users,
  Bell,
  SignOut,
  X,
  Sparkle,
  List,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";

// Taste-skill design tokens — Zinc base, single accent, no pure black
const SC = {
  bg: "#09090b",        // Zinc-950 (no pure black)
  surface: "#18181b",   // Zinc-900
  surfaceHover: "#27272a",
  elevated: "#3f3f46", // Zinc-700
  accent: "#e85d04",    // Safety Orange (brand-locked)
  accentMuted: "rgba(232,93,4,0.10)",
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  border: "#27272a",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: ChartBar },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div
      className="flex"
      style={{ background: SC.bg, minHeight: "100dvh" }}
    >
      {/* Grain texture — pointer-events-none fixed overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-56 flex flex-col
          transition-transform duration-200 ease-out
          md:relative md:translate-x-0 md:shrink-0 md:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          background: SC.surface,
          borderRight: `1px solid ${SC.border}`,
          zIndex: 40,
          position: "relative",
        }}
      >
        {/* Mobile close */}
        <div
          className="flex items-center justify-between p-4 md:hidden"
          style={{ borderBottom: `1px solid ${SC.border}` }}
        >
          <span className="text-sm font-medium" style={{ color: SC.textMuted }}>
            Menu
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: SC.textMuted,
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Logo — desktop only */}
        <div
          className="px-4 py-4 hidden md:block"
          style={{ borderBottom: `1px solid ${SC.border}` }}
        >
          <Link
            href="/dashboard"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}
          >
            {/* SC block mark */}
            <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
              <rect width="36" height="28" rx="5" fill="#27272a" />
              <text
                x="7"
                y="21"
                fontFamily="Inter, system-ui, sans-serif"
                fontSize="17"
                fontWeight="900"
                fill="#e85d04"
                style={{ filter: "drop-shadow(0 0 8px rgba(232,93,4,0.6))" }}
              >
                S
              </text>
              <text
                x="21"
                y="21"
                fontFamily="Inter, system-ui, sans-serif"
                fontSize="17"
                fontWeight="900"
                fill="#e85d04"
                style={{ filter: "drop-shadow(0 0 8px rgba(232,93,4,0.6))" }}
              >
                C
              </text>
            </svg>
            <span
              className="font-bold text-sm tracking-tight"
              style={{ color: SC.textPrimary }}
            >
              Crete
            </span>
            <span
              className="text-xs"
              style={{ color: SC.textMuted }}
            >
              .ai
            </span>
          </Link>
        </div>

        {/* Contractor badge — desktop only */}
        <div
          className="px-4 py-3 hidden md:block"
          style={{ borderBottom: `1px solid ${SC.border}` }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
            style={{ color: SC.textMuted }}
          >
            Contractor
          </div>
          <div
            className="text-sm font-semibold"
            style={{ color: SC.textPrimary }}
          >
            Sacco Builders
          </div>
        </div>

        {/* AI Copilot shortcut — desktop only */}
        <div
          className="px-3 py-3 hidden md:block"
          style={{ borderBottom: `1px solid ${SC.border}` }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
            style={{
              background: SC.accentMuted,
              border: `1px solid rgba(232,93,4,0.20)`,
              color: SC.accent,
              cursor: "pointer",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: SC.accent }}
            >
              <Sparkle size={13} weight="fill" color="white" />
            </div>
            <div className="text-left">
              <div style={{ fontSize: 13 }}>AI Copilot</div>
              <div
                className="text-[10px] font-normal"
                style={{ color: SC.textSecondary }}
              >
                Edit quotes by chat
              </div>
            </div>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-all active:scale-[0.98] no-underline"
                style={{
                  background: isActive ? SC.accentMuted : "transparent",
                  color: isActive ? SC.accent : SC.textSecondary,
                  borderLeft: isActive ? `2px solid ${SC.accent}` : "2px solid transparent",
                  paddingLeft: isActive ? 10 : 12,
                }}
              >
                <item.icon size={16} weight={isActive ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3" style={{ borderTop: `1px solid ${SC.border}` }}>
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: SC.textSecondary }}
          >
            <Bell size={15} />
            <span className="text-sm">Notifications</span>
          </div>
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: SC.textMuted }}
          >
            <SignOut size={15} />
            <span className="text-sm">Sign out</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0" style={{ position: "relative", zIndex: 1 }}>
        {/* Mobile header */}
        <header
          className="flex items-center justify-between px-4 py-3 md:hidden"
          style={{
            background: SC.surface,
            borderBottom: `1px solid ${SC.border}`,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Link
            href="/dashboard"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="26" height="20" viewBox="0 0 36 28" fill="none">
              <rect width="36" height="28" rx="5" fill="#27272a" />
              <text x="7" y="21" fontFamily="Inter, system-ui, sans-serif" fontSize="17" fontWeight="900" fill="#e85d04">S</text>
              <text x="21" y="21" fontFamily="Inter, system-ui, sans-serif" fontSize="17" fontWeight="900" fill="#e85d04">C</text>
            </svg>
            <span className="font-bold text-sm" style={{ color: SC.textPrimary }}>
              Crete
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors active:scale-[0.98]"
            style={{
              background: SC.elevated,
              color: SC.textPrimary,
              border: "none",
              cursor: "pointer",
            }}
          >
            <List size={20} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}