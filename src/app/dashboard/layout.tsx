"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Settings,
  Bell,
  LogOut,
  X,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import AIPanel from "@/components/dashboard/AIPanel";

type Theme = "dark" | "light";

// Coy's palette: vivid trust blue + warm amber + airy off-white
const DARK = {
  bg: "#0B0F1A",
  surface: "#131929",
  surfaceHover: "#1a2435",
  elevated: "#1e293b",
  accent: "#2457F5",       // vivid trust blue
  accentMuted: "rgba(36,87,245,0.15)",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  border: "#1e293b",
  borderLight: "#2d3a4f",
  highlight: "#F59E0B",    // warm amber for key moments
  highlightMuted: "rgba(245,158,11,0.12)",
};

const LIGHT = {
  bg: "#F6F7FB",
  surface: "#FFFFFF",
  surfaceHover: "#F1F5F9",
  elevated: "#EEF2F8",
  accent: "#2457F5",       // vivid trust blue for primary actions
  accentMuted: "rgba(36,87,245,0.08)",
  textPrimary: "#1F2937",
  textSecondary: "#475569",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  borderLight: "#CBD5E1",
  highlight: "#F59E0B",    // warm amber for accents
  highlightMuted: "rgba(245,158,11,0.10)",
};

function Sidebar({
  theme,
  onThemeToggle,
  onCopilotOpen,
  AK,
}: {
  theme: Theme;
  onThemeToggle: () => void;
  onCopilotOpen: () => void;
  AK: typeof DARK;
}) {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/leads", label: "Leads", icon: Users },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-full"
      style={{ background: AK.surface, borderRight: `1px solid ${AK.border}` }}
    >
      {/* Logo + theme toggle */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-1">
          {/* iMessage bubble logo */}
          <div className="relative flex items-end" style={{ paddingBottom: 1 }}>
            <svg width="54" height="22" viewBox="0 0 54 22" fill="none">
              <rect x="0" y="0" width="52" height="18" rx="9" fill="#007AFF" />
              <path d="M1 14 L-3 20 L8 14 Z" fill="#007AFF" />
              <text
                x="26" y="13"
                textAnchor="middle"
                fill="white"
                fontSize="11"
                fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
                fontWeight="400"
              >Scope</text>
            </svg>
          </div>
          <span className="font-extrabold text-sm tracking-tight" style={{ color: AK.textPrimary }}>
            Crete
          </span>
          <span className="text-xs font-normal" style={{ color: AK.textMuted }}>.ai</span>
        </Link>
        <button
          onClick={onThemeToggle}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:brightness-110"
          style={{ background: AK.elevated, color: AK.textSecondary }}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* Contractor name */}
      <div className="px-4 py-2.5 mb-1" style={{ borderBottom: `1px solid ${AK.border}` }}>
        <div
          className="text-[10px] font-semibold"
          style={{ color: AK.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Contractor
        </div>
        <div className="text-sm font-semibold mt-0.5" style={{ color: AK.textPrimary }}>
          Sacco Builders
        </div>
      </div>

      {/* AI Copilot — prominent button */}
      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${AK.border}` }}>
        <button
          onClick={onCopilotOpen}
          className="w-full flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: theme === "dark"
              ? "linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(245,158,11,0.08) 100%)"
              : "linear-gradient(135deg, rgba(51,65,85,0.12) 0%, rgba(51,65,85,0.05) 100%)",
            border: `1px solid ${theme === "dark" ? "rgba(245,158,11,0.30)" : "rgba(51,65,85,0.20)"}`,
            color: theme === "dark" ? "#F59E0B" : "#334155",
          }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: theme === "dark" ? "#F59E0B" : "#334155" }}
          >
            <Sparkles size={13} color="white" />
          </div>
          <div className="text-left">
            <div>AI Copilot</div>
            <div
              className="text-[10px] font-normal"
              style={{ color: theme === "dark" ? "rgba(245,158,11,0.7)" : "#64748B" }}
            >
              Edit quotes by chat
            </div>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: isActive ? AK.accentMuted : "transparent",
                color: isActive ? AK.accent : AK.textSecondary,
              }}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Notifications + logout */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${AK.border}` }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ color: AK.textSecondary }}
        >
          <div className="relative">
            <Bell size={15} />
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{ background: AK.accent }}
            />
          </div>
          <span className="text-sm">Notifications</span>
        </div>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-0.5"
          style={{ color: AK.textMuted }}
        >
          <LogOut size={15} />
          <span className="text-sm">Sign out</span>
        </div>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const AK = theme === "dark" ? DARK : LIGHT;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: AK.bg }}
      data-theme={theme}
    >
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          background: AK.surface,
          border: `1px solid ${AK.border}`,
          borderRadius: 8,
          padding: "8px",
          color: AK.textPrimary,
        }}
      >
        {mobileOpen ? <X size={18} /> : <span style={{ fontSize: 11, fontWeight: 700 }}>☰</span>}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 md:static ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 transition-transform md:shrink-0`}
      >
        <Sidebar
          theme={theme}
          onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onCopilotOpen={() => setCopilotOpen(true)}
          AK={AK}
        />
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* AI Copilot Panel */}
      <AIPanel
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        theme={theme}
        quoteData={{
          sqft: 720,
          depth: 4,
          psi: 3000,
          zip: "70802",
          estimate: { low: 7500, high: 9500 },
          concretePerCY: 175,
          laborPerSqft: 9,
        }}
      />
    </div>
  );
}