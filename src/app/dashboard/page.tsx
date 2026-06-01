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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import AIPanel from "@/components/dashboard/AIPanel";

// Dark industrial theme — matches sidebar and brand
const T = {
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

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  return (
    <div className="min-h-full p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>
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
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            color: T.textMuted,
          }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total leads" value={totalLeads} icon={Users} T={T} />
        <StatCard
          label="New today"
          value={newCount}
          trend={newCount > 0 ? "up" : undefined}
          sub={`${newCount}`}
          icon={Target}
          T={T}
        />
        <StatCard
          label="Won"
          value={wonCount}
          trend={wonCount > 0 ? "up" : undefined}
          icon={DollarSign}
          T={T}
        />
        <StatCard
          label="Conversion"
          value={
            totalLeads > 0
              ? `${Math.round((wonCount / totalLeads) * 100)}%`
              : "—"
          }
          icon={TrendingUp}
          T={T}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent leads */}
        <div
          className="lg:col-span-2 rounded-xl overflow-hidden"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
          }}
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
              className="text-xs font-semibold"
              style={{ color: T.accent }}
            >
              View all →
            </Link>
          </div>
          {leads.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <h3
                className="text-base font-semibold mb-1"
                style={{ color: T.textPrimary }}
              >
                No leads yet
              </h3>
              <p className="text-sm" style={{ color: T.textMuted }}>
                Share your calculator or chat link to start capturing leads.
              </p>
            </div>
          ) : (
            leads.map((lead: any) => (
              <div
                key={lead.id}
                className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors"
                style={{ borderBottom: `1px solid ${T.border}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: T.accentMuted,
                    color: T.accent,
                  }}
                >
                  {(lead.customer_name || lead.customer_phone || "?")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {lead.customer_name || lead.customer_phone}
                    </span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: STATUS_BG[lead.status] || T.accentMuted,
                        color: STATUS_TEXT[lead.status] || T.accent,
                      }}
                    >
                      {STATUS_LABELS[lead.status] || "New"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs" style={{ color: T.textMuted }}>
                      {lead.project_type}
                    </span>
                    {lead.sqft && (
                      <>
                        <span className="text-xs" style={{ color: T.textMuted }}>
                          ·
                        </span>
                        <span className="text-xs" style={{ color: T.textMuted }}>
                          {lead.sqft} sqft
                          {lead.depth_in
                            ? ` · ${lead.depth_in}" depth`
                            : ""}
                          {lead.psi ? ` · ${lead.psi} PSI` : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-sm font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    {lead.source_detail || lead.source_channel}
                  </div>
                  <div
                    className="flex items-center justify-end gap-1 mt-0.5"
                  >
                    <Clock size={10} style={{ color: T.textMuted }} />
                    <span className="text-xs" style={{ color: T.textMuted }}>
                      {timeAgo(lead.created_at)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: T.textMuted, flexShrink: 0 }} />
              </div>
            ))
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* AI Copilot shortcut */}
          <div
            className="rounded-xl p-5"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: T.accent }}
              >
                <Sparkles size={14} color="white" />
              </div>
              <span
                className="text-sm font-semibold"
                style={{ color: T.textPrimary }}
              >
                AI Copilot
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: T.textMuted }}>
              Adjust labor rates, change PSI, update margins — all by chatting.
            </p>
            <button
              onClick={() => setCopilotOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:brightness-110"
              style={{ background: T.accent, color: "#0a0a0a" }}
            >
              Open Copilot
            </button>
          </div>

          {/* Quick actions */}
          <div
            className="rounded-xl p-5"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
            }}
          >
            <h2
              className="text-sm font-semibold mb-4"
              style={{ color: T.textPrimary }}
            >
              Quick Actions
            </h2>
            <div className="space-y-2">
              {[
                { label: "Test estimate calculator", href: "/calculator", icon: DollarSign },
                { label: "View all leads", href: "/dashboard/leads", icon: Target },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                  style={{
                    background: T.elevated,
                    color: T.textSecondary,
                  }}
                >
                  <action.icon size={15} style={{ color: T.accent }} />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Market rates */}
          <div
            className="rounded-xl p-5"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
            }}
          >
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: T.textPrimary }}
            >
              Baton Rouge Rates
            </h2>
            <div className="space-y-2">
              {[
                { label: "3000 PSI concrete", value: "$165–$185/yd" },
                { label: "4000 PSI concrete", value: "$185–$210/yd" },
                { label: "Labor rate", value: "$8–$10/sqft" },
                { label: "Rebar #4", value: "$3.50/piece" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between items-center"
                >
                  <span className="text-xs" style={{ color: T.textMuted }}>
                    {row.label}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: T.textSecondary }}
                  >
                    {row.value}
                  </span>
                </div>
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

function StatCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
  T,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down";
  icon: React.ElementType;
  T: {
    surface: string;
    border: string;
    accentMuted: string;
    accent: string;
    textPrimary: string;
    textMuted: string;
  };
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: T.surface, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: T.accentMuted }}
        >
          <Icon size={17} style={{ color: T.accent }} />
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: trend === "up" ? "#22C55E" : "#EF4444" }}
          >
            {trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {sub}
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: T.textPrimary }}>
          {value}
        </div>
        <div className="text-sm mt-0.5" style={{ color: T.textMuted }}>
          {label}
        </div>
      </div>
    </div>
  );
}