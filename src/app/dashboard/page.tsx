"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Clock,
  Sparkles,
  LogOut,
  Clipboard,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import AIPanel from "@/components/dashboard/AIPanel";

const T = {
  bg: "#0a0a0a",
  surface: "#1a1a1a",
  surfaceHover: "#222222",
  elevated: "#2d3748",
  accent: "#e85d04",
  accentMuted: "rgba(232,93,4,0.12)",
  accentGlow: "rgba(232,93,4,0.20)",
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  border: "#2d3748",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

const STATUS_BG: Record<string, string> = {
  new: "rgba(232,93,4,0.15)",
  contacted: "rgba(245,158,11,0.15)",
  qualified: "rgba(139,92,246,0.15)",
  won: "rgba(34,197,94,0.15)",
  lost: "rgba(239,68,68,0.15)",
};

const STATUS_TEXT: Record<string, string> = {
  new: "#e85d04",
  contacted: "#f59e0b",
  qualified: "#8b5cf6",
  won: "#22c55e",
  lost: "#ef4444",
};

export default function DashboardPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      if (data.user) setUser(data.user);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }: any) => {
        if (data) setLeads(data);
      });
  }, [user]);

  const newCount = leads.filter((l: any) => l.status === "new").length;
  const wonCount = leads.filter((l: any) => l.status === "won").length;
  const totalLeads = leads.length;
  const convPct = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: T.textMuted }}>
            {user?.email
              ? `Signed in as ${user.email}`
              : new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all hover:brightness-110"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            color: T.textMuted,
            cursor: "pointer",
          }}
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Stats — Conversion gets accent treatment */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Conversion — hero stat */}
        <div
          className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:brightness-110"
          style={{
            background: T.surface,
            border: `1px solid ${T.accent}`,
            boxShadow: `0 0 20px ${T.accentGlow}`,
          }}
        >
          <div className="flex items-start justify-between">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
              <TrendingUp size={17} style={{ color: T.accent }} />
            </div>
            {convPct > 0 && (
              <ArrowUpRight size={12} style={{ color: "#22c55e" }} />
            )}
          </div>
          <div>
            <div className="text-3xl font-bold" style={{ color: T.accent }}>{totalLeads > 0 ? `${convPct}%` : "—"}</div>
            <div className="text-sm mt-0.5" style={{ color: T.textMuted }}>Conversion</div>
          </div>
        </div>

        {/* Total leads */}
        <div
          className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:brightness-110"
          style={{ background: T.surface, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-start justify-between">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
              <Users size={17} style={{ color: T.accent }} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: T.textPrimary }}>{totalLeads}</div>
            <div className="text-sm mt-0.5" style={{ color: T.textMuted }}>Total leads</div>
          </div>
        </div>

        {/* New */}
        <div
          className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:brightness-110"
          style={{ background: T.surface, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-start justify-between">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
              <Target size={17} style={{ color: T.accent }} />
            </div>
            {newCount > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: T.accent, color: "#0a0a0a" }}>{newCount}</span>
            )}
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: T.textPrimary }}>{newCount}</div>
            <div className="text-sm mt-0.5" style={{ color: T.textMuted }}>New today</div>
          </div>
        </div>

        {/* Won */}
        <div
          className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:brightness-110"
          style={{ background: T.surface, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-start justify-between">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
              <DollarSign size={17} style={{ color: T.accent }} />
            </div>
            {wonCount > 0 && (
              <ArrowUpRight size={12} style={{ color: "#22c55e" }} />
            )}
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: T.textPrimary }}>{wonCount}</div>
            <div className="text-sm mt-0.5" style={{ color: T.textMuted }}>Won</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent Leads */}
        <div
          className="lg:col-span-2 rounded-xl overflow-hidden"
          style={{ background: T.surface, border: `1px solid ${T.border}` }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Recent Leads
            </h2>
            <Link
              href="/dashboard/leads"
              className="text-xs font-semibold transition-colors"
              style={{ color: T.accent, textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              {/* Minimal clipboard SVG — no emoji */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2d3748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="2" width="8" height="3" rx="1"/>
                <rect x="6" y="5" width="12" height="17" rx="2"/>
                <line x1="9" y1="10" x2="15" y2="10"/>
                <line x1="9" y1="14" x2="13" y2="14"/>
              </svg>
              <p className="text-sm font-medium mt-4" style={{ color: T.textMuted }}>
                No leads yet
              </p>
              <p className="text-xs mt-1 max-w-[200px]" style={{ color: T.textMuted, opacity: 0.7 }}>
                Share your calculator or chat link to start capturing leads.
              </p>
            </div>
          ) : (
            leads.map((lead: any, i: number) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 px-5 py-4 cursor-pointer transition-all"
                style={{
                  borderBottom: i < leads.length - 1 ? `1px solid ${T.border}` : "none",
                  borderLeft: `2px solid transparent`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = T.accent;
                  (e.currentTarget as HTMLDivElement).style.background = T.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = "transparent";
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: T.accentMuted, color: T.accent }}
                >
                  {(lead.customer_name || lead.customer_phone || "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: T.textPrimary, maxWidth: "120px" }}
                    >
                      {lead.customer_name || lead.customer_phone}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: STATUS_BG[lead.status] || T.accentMuted,
                        color: STATUS_TEXT[lead.status] || T.accent,
                      }}
                    >
                      {STATUS_LABELS[lead.status] || "New"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] truncate max-w-[80px]" style={{ color: T.textMuted }}>
                      {lead.project_type}
                    </span>
                    {lead.sqft && (
                      <span className="text-[11px] shrink-0" style={{ color: T.textMuted }}>
                        · {lead.sqft} sqft
                      </span>
                    )}
                  </div>
                </div>

                {/* Source + time */}
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[11px] font-medium" style={{ color: T.textSecondary }}>
                    {lead.source_detail || lead.source_channel}
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <Clock size={9} style={{ color: T.textMuted }} />
                    <span className="text-[10pxpx]" style={{ color: T.textMuted }}>
                      {timeAgo(lead.created_at)}
                    </span>
                  </div>
                </div>

                <ChevronRight size={14} style={{ color: T.textMuted, flexShrink: 0 }} />
              </div>
            ))
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* AI Copilot — demoted to quiet card */}
          <div
            className="rounded-xl p-4 transition-all hover:brightness-105"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: T.elevated }}
              >
                <Sparkles size={12} style={{ color: T.accent }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: T.textSecondary }}>
                AI Copilot
              </span>
            </div>
            <p className="text-[11px] leading-relaxed mb-3" style={{ color: T.textMuted }}>
              Adjust labor rates, PSI, or margins by chatting.
            </p>
            <button
              onClick={() => setCopilotOpen(true)}
              className="w-full py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
              style={{ background: T.elevated, color: T.textSecondary, border: `1px solid ${T.border}`, cursor: "pointer" }}
            >
              Open Copilot
            </button>
          </div>

          {/* Quick actions */}
          <div
            className="rounded-xl p-4"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <h2 className="text-xs font-semibold mb-3" style={{ color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Quick Actions
            </h2>
            <div className="space-y-1.5">
              {[
                { label: "Test estimate calculator", href: "/calculator", icon: DollarSign },
                { label: "View all leads", href: "/dashboard/leads", icon: Users },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all"
                  style={{
                    background: T.elevated,
                    color: T.textSecondary,
                    textDecoration: "none",
                  }}
                >
                  <action.icon size={13} style={{ color: T.accent }} />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

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