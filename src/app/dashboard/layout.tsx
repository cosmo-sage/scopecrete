"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Users, ChatCircle, User } from "@phosphor-icons/react";
import { DA } from "@/lib/design-tokens";
import DustyDrawer from "@/components/dashboard/DustyDrawer";

const NAV_ITEMS = [
  { href: "/dashboard",         label: "Home",     icon: House },
  { href: "/dashboard/leads",  label: "Leads",    icon: Users },
  { href: "/dashboard/messages", label: "Messages", icon: ChatCircle },
  { href: "/dashboard/profile", label: "Profile",  icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [dustyOpen, setDustyOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: DA.bg }}
    >
      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      {/* Mobile footer nav */}
      <footer
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around py-3 z-40"
        style={{
          background: "#1A1A1A",
          borderTop: "1px solid #333",
          paddingBottom: "max(3px, env(safe-area-inset-bottom))",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-0.5 no-underline"
          >
            <item.icon
              size={22}
              weight={isActive(item.href) ? "fill" : "regular"}
              color={isActive(item.href) ? DA.accent : "rgba(255,255,255,0.4)"}
            />
            <span
              className="text-[9px] font-medium"
              style={{ color: isActive(item.href) ? DA.accent : "rgba(255,255,255,0.4)" }}
            >
              {item.label}
            </span>
          </Link>
        ))}

        {/* Dusty FAB — center */}
        <button
          onClick={() => setDustyOpen(true)}
          className="flex flex-col items-center gap-0.5 -mt-5"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: DA.accent,
              boxShadow: "0 4px 12px rgba(232,93,4,0.4)",
            }}
          >
            <span className="text-lg">✨</span>
          </div>
        </button>

        {/* Spacer for FAB */}
        <div className="w-12" />
      </footer>

      <DustyDrawer open={dustyOpen} onClose={() => setDustyOpen(false)} />
    </div>
  );
}
