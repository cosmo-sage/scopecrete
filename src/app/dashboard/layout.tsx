"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Bell,
  LogOut,
  X,
  Sparkles,
  Menu,
} from "lucide-react";
import { useState, useEffect } from "react";

const SC = {
  bg: "#0a0a0a",
  surface: "#1a1a1a",
  surfaceHover: "#222222",
  elevated: "#2d3748",
  accent: "#e85d04",
  accentMuted: "rgba(232,93,4,0.12)",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  border: "#2d3748",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
      style={{ background: SC.bg, minHeight: "100dvh", position: "relative" }}
    >
      {/* Grain texture overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-56 flex flex-col
          transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:shrink-0 md:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ background: SC.surface, borderRight: `1px solid ${SC.border}`, zIndex: 40, position: "relative" }}
      >
        {/* Mobile close */}
        <div className="flex items-center justify-between p-4 md:hidden" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <span className="text-sm font-semibold" style={{ color: SC.textMuted }}>Menu</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded"
            style={{ color: SC.textMuted, background: "none", border: "none", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Logo — desktop only */}
        <div className="px-4 py-4 hidden md:block" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <Link href="/dashboard" className="flex items-center gap-1 no-underline">
            <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
              <rect x="0" y="0" width="36" height="28" rx="5" fill="#2d3748"/>
              <text x="7" y="22" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 6px #e85d04)" }}>S</text>
              <text x="21" y="22" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 6px #e85d04)" }}>C</text>
            </svg>
            <span className="font-extrabold text-sm tracking-tight" style={{ color: SC.textPrimary }}>Crete</span>
            <span className="text-xs font-normal" style={{ color: SC.textMuted }}>.ai</span>
          </Link>
        </div>

        {/* Contractor name — desktop only */}
        <div className="px-4 py-2.5 hidden md:block" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <div className="text-[10px] font-semibold" style={{ color: SC.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Contractor</div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: SC.textPrimary }}>Sacco Builders</div>
        </div>

        {/* AI Copilot — desktop only */}
        <div className="px-3 py-3 hidden md:block" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <button
            className="w-full flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
            style={{ background: SC.accentMuted, border: `1px solid rgba(232,93,4,0.30)`, color: SC.accent, cursor: "pointer" }}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: SC.accent }}>
              <Sparkles size={13} color="white" />
            </div>
            <div className="text-left">
              <div>AI Copilot</div>
              <div className="text-[10px] font-normal" style={{ color: SC.textSecondary }}>Edit quotes by chat</div>
            </div>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 no-underline transition-all"
                style={{
                  background: isActive ? SC.accentMuted : "transparent",
                  color: isActive ? SC.accent : SC.textSecondary,
                  borderLeft: isActive ? `2px solid ${SC.accent}` : "2px solid transparent",
                  paddingLeft: isActive ? "10px" : "12px",
                }}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
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
            <LogOut size={15} />
            <span className="text-sm">Sign out</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ position: "relative", zIndex: 1 }}>
        {/* Mobile header */}
        <header
          className="flex items-center justify-between px-4 py-3 md:hidden"
          style={{ background: SC.surface, borderBottom: `1px solid ${SC.border}`, position: "sticky", top: 0, zIndex: 10 }}
        >
          <Link href="/dashboard" className="flex items-center gap-1 no-underline">
            <svg width="28" height="22" viewBox="0 0 36 28" fill="none">
              <rect x="0" y="0" width="36" height="28" rx="5" fill="#2d3748"/>
              <text x="7" y="22" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="900" fill="#e85d04">S</text>
              <text x="21" y="22" fontFamily="Inter, system-ui, sans-serif" fontSize="18" fontWeight="900" fill="#e85d04">C</text>
            </svg>
            <span className="font-extrabold text-sm" style={{ color: SC.textPrimary }}>Crete</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ background: SC.elevated, color: SC.textPrimary, border: "none", cursor: "pointer" }}
          >
            <Menu size={20} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}