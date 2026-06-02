"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChartLineUp,
  Users,
  CurrencyDollar,
  Target,
  ArrowUp,
  CaretRight,
  Clock,
  Plus,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

const T = {
  bg: "#09090b",
  surface: "#18181b",
  surfaceHover: "#27272a",
  elevated: "#3f3f46",
  accent: "#e85d04",
  accentMuted: "rgba(232,93,4,0.10)",
  accentGlow: "rgba(232,93,4,0.18)",
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  border: "#27272a",
};

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={className}
      style={{
        background: "linear-gradient(90deg, #18181b 25%, #27272a 50%, #18181b 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        borderRadius: 8,
      }}
    />
  );
}

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

function ClipboardIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="3" rx="1" />
      <rect x="6" y="5" width="12" height="17" rx="2" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="13" y2="14" />
    </svg>
  );
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      });
  }, [user]);

  const newCount = leads.filter((l: any) => l.status === "new").length;
  const wonCount = leads.filter((l: any) => l.status === "won").length;
  const totalLeads = leads.length;
  const convPct = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  };

  return (
    <div className="p-5 md:p-8" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight leading-none" style={{ color: T.textPrimary }}>
            Overview
          </h1>
          <p className="text-sm mt-1.5" style={{ color: T.textMuted }}>
            {user?.email
              ? `Signed in as ${user.email}`
              : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="text-xs" style={{ color: T.textMuted }}>Tap the ⚡ Dusty button below to chat</div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {/* Conversion — accent border + glow */}
        <div
          className="rounded-2xl p-5 transition-all active:scale-[0.98]"
          style={{
            background: T.surface,
            border: `1px solid ${T.accent}`,
            boxShadow: `0 0 24px ${T.accentGlow}`,
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentMuted }}>
              <ChartLineUp size={17} color={T.accent} />
            </div>
            {convPct > 0 && <ArrowUp size={12} color="#22c55e" weight="bold" />}
          </div>
          <div className="text-[32px] font-bold leading-none" style={{ color: T.accent }}>
            {totalLeads > 0 ? `${convPct}%` : "—"}
          </div>
          <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>Conversion</div>
        </div>

        {/* Total leads */}
        <div className="rounded-2xl p-5 transition-all active:scale-[0.98]" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-start mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentMuted }}>
              <Users size={17} color={T.accent} />
            </div>
          </div>
          <div className="text-[32px] font-bold leading-none" style={{ color: T.textPrimary }}>{totalLeads}</div>
          <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>Total leads</div>
        </div>

        {/* New */}
        <div className="rounded-2xl p-5 transition-all active:scale-[0.98]" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentMuted }}>
              <Target size={17} color={T.accent} />
            </div>
            {newCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: T.accent, color: "#09090b" }}>{newCount}</span>
            )}
          </div>
          <div className="text-[32px] font-bold leading-none" style={{ color: T.textPrimary }}>{newCount}</div>
          <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>New today</div>
        </div>

        {/* Won */}
        <div className="rounded-2xl p-5 transition-all active:scale-[0.98]" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-start mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentMuted }}>
              <CurrencyDollar size={17} color={T.accent} />
            </div>
          </div>
          <div className="text-[32px] font-bold leading-none" style={{ color: T.textPrimary }}>{wonCount}</div>
          <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>Won</div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Leads */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>Recent Leads</h2>
            <Link href="/dashboard/leads" style={{ color: T.accent, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>View all →</Link>
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <ClipboardIcon size={40} />
              <p className="text-sm font-medium mt-5" style={{ color: T.textMuted }}>No leads yet</p>
              <p className="text-xs mt-1.5 text-center max-w-[220px]" style={{ color: T.textMuted, opacity: 0.7 }}>
                Share your calculator or chat link to start capturing leads.
              </p>
            </div>
          ) : (
            <div>
              {leads.map((lead: any, i: number) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-all active:scale-[0.99]"
                  style={{
                    borderBottom: i < leads.length - 1 ? `1px solid ${T.border}` : "none",
                    borderLeft: `2px solid transparent`,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderLeftColor = T.accent;
                    el.style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderLeftColor = "transparent";
                    el.style.background = "transparent";
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: T.accentMuted, color: T.accent }}
                  >
                    {(lead.customer_name || lead.customer_phone || "?") .slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate" style={{ color: T.textPrimary, maxWidth: 110 }}>
                        {lead.customer_name || lead.customer_phone}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: STATUS_BG[lead.status] || T.accentMuted, color: STATUS_TEXT[lead.status] || T.accent }}>
                        {STATUS_LABELS[lead.status] || "New"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] truncate max-w-[80px]" style={{ color: T.textMuted }}>{lead.project_type}</span>
                      {lead.sqft && <span className="text-[11px] shrink-0" style={{ color: T.textMuted }}>· {lead.sqft} sqft</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-[11px] font-medium" style={{ color: T.textSecondary }}>{lead.source_detail || lead.source_channel}</div>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <Clock size={9} style={{ color: T.textMuted }} />
                      <span className="text-[10px]" style={{ color: T.textMuted }}>{timeAgo(lead.created_at)}</span>
                    </div>
                  </div>

                  <CaretRight size={13} style={{ color: T.textMuted, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <div className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: T.textMuted }}>Quick Actions</h2>
            <div className="space-y-1.5">
              {[
                { label: "Estimate calculator", href: "/calculator", icon: CurrencyDollar },
                { label: "View all leads", href: "/dashboard/leads", icon: Users },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] no-underline"
                  style={{ background: T.elevated, color: T.textSecondary }}
                >
                  <action.icon size={13} color={T.accent} />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Source breakdown */}
          <div className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <h2 className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: T.textMuted }}>Lead Sources</h2>
            <div className="space-y-2">
              {[
                { label: "Calculator", pct: 62 },
                { label: "Chat widget", pct: 28 },
                { label: "Direct", pct: 10 },
              ].map((src) => (
                <div key={src.label} className="flex items-center gap-3">
                  <div className="text-[10px] font-medium w-20 shrink-0" style={{ color: T.textSecondary }}>{src.label}</div>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: T.elevated }}>
                    <div className="h-full rounded-full" style={{ width: `${src.pct}%`, background: T.accent }} />
                  </div>
                  <div className="text-[10px] font-mono font-medium" style={{ color: T.textMuted }}>{src.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}