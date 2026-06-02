"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Database, ChartLineUp, CurrencyDollar, CaretRight, Clock } from "@phosphor-icons/react";
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
    <div className={className} style={{
      background: "linear-gradient(90deg, #18181b 25%, #27272a 50%, #18181b 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      borderRadius: 8,
    }} />
  );
}

const PLAN_BADGE: Record<string, { bg: string; color: string }> = {
  solo: { bg: "rgba(113,113,122,0.15)", color: "#71717a" },
  growth: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  pro: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6" },
  enterprise: { bg: "rgba(232,93,4,0.15)", color: "#e85d04" },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalOrgs: 0, totalMembers: 0, totalLeads: 0, monthlyRevenue: 0 });
  const [recentOrgs, setRecentOrgs] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ count: orgs }, { count: members }, { count: leads }, { data: orgData }] = await Promise.all([
        supabase.from("orgs").select("*", { count: "exact", head: true }),
        supabase.from("org_members").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("orgs").select("name, created_at, plan_tier").order("created_at", { ascending: false }).limit(5),
      ]);

      // Monthly revenue = sum of won estimates
      const { data: wonLeads } = await supabase.from("leads").select("estimate_total").eq("status", "won");
      const monthlyRevenue = wonLeads?.reduce((acc: number, l: any) => acc + (l.estimate_total || 0), 0) ?? 0;

      setStats({
        totalOrgs: orgs ?? 0,
        totalMembers: members ?? 0,
        totalLeads: leads ?? 0,
        monthlyRevenue,
      });

      setRecentOrgs(orgData ?? []);

      const { data: leadData } = await supabase
        .from("leads")
        .select("customer_name, status, source_channel, created_at, orgs(name)")
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentLeads(leadData ?? []);
      setLoading(false);
    }
    load();
  }, []);

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
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight leading-none" style={{ color: T.textPrimary }}>Platform Overview</h1>
          <p className="text-sm mt-1.5" style={{ color: T.textMuted }}>admin@scopecrete.ai</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Contractors", value: stats.totalOrgs, icon: Users, accent: false },
          { label: "Total Users", value: stats.totalMembers, icon: Database, accent: false },
          { label: "Total Leads", value: stats.totalLeads, icon: ChartLineUp, accent: false },
          { label: "Monthly Revenue", value: stats.monthlyRevenue > 0 ? `$${stats.monthlyRevenue.toLocaleString()}` : "—", icon: CurrencyDollar, accent: true },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl p-5 transition-all active:scale-[0.98]"
            style={{
              background: T.surface,
              border: `1px solid ${stat.accent ? T.accent : T.border}`,
              boxShadow: stat.accent ? `0 0 24px ${T.accentGlow}` : "none",
            }}>
            <div className="flex items-start mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentMuted }}>
                <stat.icon size={17} color={T.accent} />
              </div>
            </div>
            <div className="text-[28px] font-bold leading-none" style={{ color: stat.accent ? T.accent : T.textPrimary }}>{loading ? "—" : stat.value}</div>
            <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent orgs */}
        <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>Recent Contractors</h2>
            <Link href="/admin/contractors" style={{ color: T.accent, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>View all →</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="flex items-center gap-3"><Skeleton className="w-8 h-8 rounded-full" /><Skeleton className="h-3 flex-1" /></div>)}
            </div>
          ) : recentOrgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <p className="text-sm" style={{ color: T.textMuted }}>No contractors yet</p>
            </div>
          ) : (
            <div>
              {recentOrgs.map((org: any, i: number) => (
                <div key={org.id || i} className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: i < recentOrgs.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: T.accentMuted, color: T.accent }}>
                    {(org.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: T.textPrimary }}>{org.name}</div>
                    <div className="text-[11px] mt-0.5 flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: PLAN_BADGE[org.plan_tier]?.bg || T.accentMuted, color: PLAN_BADGE[org.plan_tier]?.color || T.accent }}>
                        {org.plan_tier || "solo"}
                      </span>
                      <span style={{ color: T.textMuted }}>{timeAgo(org.created_at)} ago</span>
                    </div>
                  </div>
                  <Link href={`/admin/contractors/${org.id}`}>
                    <CaretRight size={13} style={{ color: T.textMuted }} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>Recent Leads</h2>
            <Link href="/admin/contractors" style={{ color: T.accent, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>View all →</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="flex items-center gap-3"><Skeleton className="w-8 h-8 rounded-full" /><Skeleton className="h-3 flex-1" /></div>)}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <p className="text-sm" style={{ color: T.textMuted }}>No leads yet</p>
            </div>
          ) : (
            <div>
              {recentLeads.map((lead: any, i: number) => (
                <div key={lead.id || i} className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: i < recentLeads.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: T.accentMuted, color: T.accent }}>
                    {(lead.customer_name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: T.textPrimary }}>{lead.customer_name || "Unknown"}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                      {lead.orgs?.name || "—"} · {lead.source_channel || "direct"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock size={9} style={{ color: T.textMuted }} />
                    <span className="text-[10px]" style={{ color: T.textMuted }}>{timeAgo(lead.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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