"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Settings,
  Bell,
  LogOut,
  X,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import AIPanel from "@/components/dashboard/AIPanel";

// Brand tokens — single source of truth for dark industrial theme
// Concrete Gray #6b7280 + Safety Orange #e85d04
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
  borderLight: "#3d4a5c",
  highlight: "#e85d04",
};

function Sidebar({
  onCopilotOpen,
}: {
  onCopilotOpen: () => void;
}) {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/leads", label: "Leads", icon: Users },
  ];

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-full"
      style={{ background: SC.surface, borderRight: `1px solid ${SC.border}` }}
    >
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-1">
          {/* SC block brand mark */}
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
            <rect x="0" y="0" width="36" height="28" rx="5" fill="#2d3748"/>
            <text
              x="7"
              y="22"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="18"
              fontWeight="900"
              fill="#e85d04"
              style={{ filter: "drop-shadow(0 0 6px #e85d04)" }}
            >S</text>
            <text
              x="21"
              y="22"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="18"
              fontWeight="900"
              fill="#e85d04"
              style={{ filter: "drop-shadow(0 0 6px #e85d04)" }}
            >C</text>
          </svg>
          <span className="font-extrabold text-sm tracking-tight" style={{ color: SC.textPrimary }}>
            Crete
          </span>
          <span className="text-xs font-normal" style={{ color: SC.textMuted }}>.ai</span>
        </Link>
      </div>

      {/* Contractor name */}
      <div className="px-4 py-2.5 mb-1" style={{ borderBottom: `1px solid ${SC.border}` }}>
        <div
          className="text-[10px] font-semibold"
          style={{ color: SC.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Contractor
        </div>
        <div className="text-sm font-semibold mt-0.5" style={{ color: SC.textPrimary }}>
          Sacco Builders
        </div>
      </div>

      {/* AI Copilot */}
      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${SC.border}` }}>
        <button
          onClick={onCopilotOpen}
          className="w-full flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: SC.accentMuted,
            border: `1px solid rgba(232,93,4,0.30)`,
            color: SC.accent,
          }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: SC.accent }}
          >
            <Sparkles size={13} color="white" />
          </div>
          <div className="text-left">
            <div>AI Copilot</div>
            <div className="text-[10px] font-normal" style={{ color: SC.textSecondary }}>
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
                background: isActive ? SC.accentMuted : "transparent",
                color: isActive ? SC.accent : SC.textSecondary,
              }}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${SC.border}` }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ color: SC.textSecondary }}
        >
          <Bell size={15} />
          <span className="text-sm">Notifications</span>
        </div>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-0.5"
          style={{ color: SC.textMuted }}
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
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: SC.bg }}
    >
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          background: SC.surface,
          border: `1px solid ${SC.border}`,
          borderRadius: 8,
          padding: "8px",
          color: SC.textPrimary,
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
        <Sidebar onCopilotOpen={() => setCopilotOpen(true)} />
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
        theme="dark"
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