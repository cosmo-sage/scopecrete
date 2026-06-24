"use client";

import React from "react";
import { DA } from "@/lib/design-tokens";

const MENU_ITEMS = [
  { icon: "📊", label: "Performance", action: "performance" },
  { icon: "🔔", label: "Notifications", action: "notifications" },
  { icon: "🔐", label: "Security", action: "security" },
  { icon: "📱", label: "App Settings", action: "settings" },
];

export default function ProfilePage() {
  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
      {/* Status bar */}
      <div className="h-11 px-6 flex items-end pb-1 justify-between flex-shrink-0">
        <span className="text-xs font-semibold" style={{ color: "rgba(0,0,0,0.4)" }}>
          {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">📶</span>
          <span className="text-xs">🔋</span>
        </div>
      </div>

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ background: DA.accent }}
        >
          S
        </div>
        <div className="font-bold text-sm" style={{ color: DA.textPrimary }}>
          Profile
        </div>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
        >
          ⚙️
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4 flex-1">
        {/* User card */}
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold mx-auto mb-3"
            style={{ background: DA.accent }}
          >
            CL
          </div>
          <div className="font-bold text-base" style={{ color: DA.textPrimary }}>
            Clay Jensen
          </div>
          <div className="text-sm" style={{ color: DA.textSecondary }}>
            Admin · Sacco Builders
          </div>
          <div className="text-sm" style={{ color: DA.textMuted }}>
            clay@saccobuilt.com
          </div>
        </div>

        {/* Org info */}
        <div
          className="rounded-xl p-4"
          style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: DA.textMuted }}>
            Organization
          </div>
          <div className="space-y-3">
            {[
              { label: "Company", value: "Sacco Builders & Co" },
              { label: "Plan", value: "Pro", accent: true },
              { label: "Location", value: "Baton Rouge, LA" },
              { label: "Pipeline Value", value: "$36.6k" },
              { label: "Win Rate", value: "50%" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="text-sm" style={{ color: DA.textPrimary }}>
                  {row.label}
                </div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: row.accent ? DA.accent : DA.textSecondary }}
                >
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Menu items */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
        >
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.action}
              className="w-full flex items-center justify-between px-4 py-3.5 text-sm transition-colors"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: DA.textPrimary,
                borderBottom: i < MENU_ITEMS.length - 1 ? `1px solid ${DA.border}` : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = DA.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              <span style={{ color: DA.textMuted }}>→</span>
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm rounded-xl"
          style={{
            background: DA.surface,
            border: `1px solid ${DA.border}`,
            cursor: "pointer",
            color: DA.error,
          }}
        >
          <span>Sign Out</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
