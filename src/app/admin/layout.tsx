"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House, Users, CurrencyDollar, ChartLineUp, Gear,
  SignOut, X, Bell, List, Sparkle, FirstAid,
} from "@phosphor-icons/react";
import { SC } from "@/lib/theme";
import AIChatDrawer from "@/components/admin/AIChatDrawer";

const NAV_ITEMS = [
  { href: "/admin/dashboard",     label: "Overview",      icon: House },
  { href: "/admin/contractors",    label: "Contractors",   icon: Users },
  { href: "/admin/members",        label: "Members",       icon: Users },
  { href: "/admin/market-pricing",  label: "Market Pricing", icon: CurrencyDollar },
  { href: "/admin/feedback",        label: "Feedback",      icon: ChartLineUp },
  { href: "/admin/settings",        label: "Settings",      icon: Gear },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<"dusty" | "doctor">("dusty");

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="flex" style={{ background: SC.bg, minHeight: "100dvh", width: "100%", maxWidth: "100vw", overflowX: "hidden", position: "relative" }}>
      {/* Grain */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
        zIndex: 0,
      }} />

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 flex flex-col transition-transform duration-200 ease-out md:relative md:translate-x-0 md:shrink-0 md:z-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: SC.surface, borderRight: `1px solid ${SC.border}` }}>

        {/* Mobile close */}
        <div className="flex items-center justify-between p-4 md:hidden" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <span className="text-sm font-medium" style={{ color: SC.textMuted }}>Menu</span>
          <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: SC.textMuted, padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Logo */}
        <div className="px-4 py-4" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <Link href="/admin/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo-34.png" alt="ScopeCrete" width={36} height={36} style={{ borderRadius: 6 }} />
            <span className="font-bold text-sm tracking-tight" style={{ color: SC.textPrimary }}>Crete</span>
            <span className="text-xs" style={{ color: SC.textMuted }}>.ai</span>
          </Link>
        </div>

        {/* Admin badge */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SC.border}` }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: SC.accent }}>Super Admin</div>
          <div className="text-sm font-semibold" style={{ color: SC.textPrimary }}>admin@scopecrete.ai</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-all active:scale-[0.98] no-underline"
                style={{
                  background: isActive ? SC.accentMuted : "transparent",
                  color: isActive ? SC.accent : SC.textSecondary,
                  borderLeft: isActive ? `2px solid ${SC.accent}` : "2px solid transparent",
                  paddingLeft: isActive ? 10 : 12,
                }}>
                <item.icon size={16} weight={isActive ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3" style={{ borderTop: `1px solid ${SC.border}` }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer" style={{ color: SC.textMuted }}>
            <Bell size={15} />
            <span className="text-sm">Alerts</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors no-underline" style={{ color: SC.textMuted }}>
            <SignOut size={15} />
            <span className="text-sm">Exit Admin</span>
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0" style={{ position: "relative", zIndex: 1, overflowX: "hidden", maxWidth: "100%" }}>
        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 py-3 md:hidden"
          style={{ background: SC.surface, borderBottom: `1px solid ${SC.border}`, position: "sticky", top: 0, zIndex: 10 }}>
          <Link href="/admin/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <img src="/logo-34.png" alt="ScopeCrete" width={28} height={28} style={{ borderRadius: 5 }} />
            <span className="font-bold text-sm" style={{ color: SC.textPrimary }}>Admin</span>
          </Link>
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg" style={{ background: SC.elevated, color: SC.textPrimary, border: "none", cursor: "pointer" }}>
            <List size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* AI Chat buttons — fixed bottom right */}
      <div className="fixed bottom-6 right-6 z-50 flex gap-2">
        <button
          onClick={() => { setChatTab("doctor"); setChatOpen(true); }}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: SC.surface, border: `1px solid ${SC.border}`, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
          title="Doctor — VPS Agent"
        >
          <FirstAid size={20} color={SC.textMuted} />
        </button>
        <button
          onClick={() => { setChatTab("dusty"); setChatOpen(true); }}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: SC.accent, cursor: "pointer", border: "none", boxShadow: `0 0 20px rgba(232,93,4,0.5)` }}
          title="Dusty — AI Assistant"
        >
          <Sparkle size={22} weight="fill" color="white" />
        </button>
      </div>

      <AIChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} defaultTab={chatTab} />
    </div>
  );
}