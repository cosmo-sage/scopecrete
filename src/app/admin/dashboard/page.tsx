"use client";

import Link from "next/link";
import { ChartLineUp, Users, Target, CurrencyDollar, CaretRight, Clock, Warning, Check } from "@phosphor-icons/react";
import { SC, PLAN_BADGE, timeAgo, formatCurrency } from "@/lib/theme";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { useState, useEffect, useMemo } from "react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalOrgs: 0, totalMembers: 0, totalLeads: 0, monthlyRevenue: 0 });
  const [recentOrgs, setRecentOrgs] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [orphanedLeads, setOrphanedLeads] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [assignModal, setAssignModal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [orgsResult, membersResult, leadsResult, orgData, recentLeadsData, orphanedData, allOrgs] = await Promise.all([
        supabaseAdmin.from("orgs").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("org_members").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("leads").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("orgs").select("id, name, slug, plan_tier, created_at").order("created_at", { ascending: false }).limit(5),
        supabaseAdmin.from("leads").select("id, customer_name, status, source_channel, estimate_total, created_at").not("org_id", "is", null).order("created_at", { ascending: false }).limit(10),
        supabaseAdmin.from("leads").select("id, customer_name, customer_phone, project_description, status, estimate_total, created_at, source_channel").is("org_id", null).order("created_at", { ascending: false }),
        supabaseAdmin.from("orgs").select("id, name, slug").order("name"),
      ]);

      const [wonLeadsResult] = await Promise.all([
        supabaseAdmin.from("leads").select("estimate_total").eq("status", "won"),
      ]);

      const monthlyRevenue = (wonLeadsResult?.data ?? []).reduce((acc: number, l: any) => acc + (l.estimate_total || 0), 0);

      setStats({ totalOrgs: orgsResult?.count ?? 0, totalMembers: membersResult?.count ?? 0, totalLeads: leadsResult?.count ?? 0, monthlyRevenue });
      setRecentOrgs((orgData as any)?.data ?? (orgData as any) ?? []);
      setRecentLeads((recentLeadsData as any)?.data ?? (recentLeadsData as any) ?? []);
      setOrphanedLeads((orphanedData as any)?.data ?? (orphanedData as any) ?? []);
      setOrgs((allOrgs as any)?.data ?? (allOrgs as any) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const statsData = useMemo(() => [
    { label: "Total Contractors", value: stats.totalOrgs, icon: Users,        accent: false },
    { label: "Total Users",       value: stats.totalMembers, icon: ChartLineUp, accent: false },
    { label: "Total Leads",       value: stats.totalLeads,  icon: Target,      accent: false },
    { label: "Monthly Revenue",   value: stats.monthlyRevenue > 0 ? formatCurrency(stats.monthlyRevenue) : "—", icon: CurrencyDollar, accent: true },
  ], [stats.totalOrgs, stats.totalMembers, stats.totalLeads, stats.monthlyRevenue]);

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo-34.png" alt="ScopeCrete" width={36} height={36} style={{ borderRadius: 8 }} />
          <div>
          <h1 className="text-[28px] font-bold tracking-tight leading-none" style={{ color: SC.textPrimary }}>Platform Overview</h1>
          <p className="text-sm mt-1.5" style={{ color: SC.textMuted }}>admin@scopecrete.ai</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {statsData.map((stat, i) => (
          <div key={i} className="rounded-2xl p-5 active:scale-[0.98] transition-all"
            style={{
              background: SC.surface,
              border: `1px solid ${stat.accent ? SC.accent : SC.border}`,
              boxShadow: stat.accent ? `0 0 24px ${SC.accentGlow}` : "none",
            }}>
            <div className="flex items-start mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: SC.accentMuted }}>
                <stat.icon size={17} color={SC.accent} />
              </div>
            </div>
            <div className="text-[28px] font-bold leading-none" style={{ color: stat.accent ? SC.accent : SC.textPrimary }}>
              {loading ? "—" : stat.value}
            </div>
            <div className="text-xs mt-1.5" style={{ color: SC.textMuted }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Orphaned leads alert */}
      {orphanedLeads.length > 0 && (
        <div className="mb-6 rounded-2xl p-5" style={{ background: "rgba(232,93,4,0.08)", border: "1px solid rgba(232,93,4,0.25)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Warning size={18} color={SC.accent} />
            <h2 className="text-sm font-semibold" style={{ color: SC.accent }}>
              {orphanedLeads.length} Orphaned Lead{orphanedLeads.length !== 1 ? "s" : ""} — No Contractor Assigned
            </h2>
          </div>
          <div className="space-y-2">
            {orphanedLeads.map((lead: any) => (
              <div key={lead.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: SC.elevated, border: `1px solid ${SC.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: SC.textPrimary }}>
                    {lead.customer_name || lead.customer_phone || "Unknown contact"}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: SC.textMuted }}>
                    {lead.project_description?.slice(0, 40) || "No project description"} · {lead.source_channel || "direct"} · {timeAgo(lead.created_at)} ago
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const targetOrgId = e.target.value;
                      if (!targetOrgId) return;
                      const res = await fetch("/api/admin/orphaned-leads", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lead_id: lead.id, org_id: targetOrgId }),
                      });
                      if (res.ok) {
                        setOrphanedLeads(prev => prev.filter(l => l.id !== lead.id));
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                    style={{ background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }}
                  >
                    <option value="">Assign to...</option>
                    {orgs.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(232,93,4,0.2)" }}>
                    <Warning size={12} color={SC.accent} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Recent Contractors" action={{ label: "View all", href: "/admin/contractors" }}>
          {loading ? (
            <SkeletonRows count={3} />
          ) : recentOrgs.length === 0 ? (
            <EmptyState message="No contractors yet" />
          ) : (
            recentOrgs.map((org: any, i: number) => (
              <TableRow key={org.id} borderBottom={i < recentOrgs.length - 1}>
                <div className="flex items-center gap-3">
                  <Avatar name={org.name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: SC.textPrimary }}>{org.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: PLAN_BADGE[org.plan_tier]?.bg, color: PLAN_BADGE[org.plan_tier]?.color }}>
                        {PLAN_BADGE[org.plan_tier]?.label ?? org.plan_tier}
                      </span>
                      <span style={{ color: SC.textMuted }}>{timeAgo(org.created_at)} ago</span>
                    </div>
                  </div>
                </div>
                <Link href={`/admin/contractors/${org.id}`}><CaretRight size={13} style={{ color: SC.textMuted }} /></Link>
              </TableRow>
            ))
          )}
        </Card>

        <Card title="Recent Leads" action={{ label: "View all", href: "/admin/contractors" }}>
          {loading ? (
            <SkeletonRows count={3} />
          ) : recentLeads.length === 0 ? (
            <EmptyState message="No leads yet" />
          ) : (
            recentLeads.map((lead: any, i: number) => (
              <TableRow key={lead.id} borderBottom={i < recentLeads.length - 1}>
                <div className="flex items-center gap-3">
                  <Avatar name={lead.customer_name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: SC.textPrimary }}>{lead.customer_name || "Unknown"}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: SC.textMuted }}>
                      {lead.orgs?.name || "—"} · {lead.source_channel || "direct"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Clock size={9} style={{ color: SC.textMuted }} />
                  <span className="text-[10px]" style={{ color: SC.textMuted }}>{timeAgo(lead.created_at)}</span>
                </div>
              </TableRow>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────────

function Card({ title, action, children }: { title: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${SC.border}` }}>
        <h2 className="text-sm font-semibold" style={{ color: SC.textPrimary }}>{title}</h2>
        {action && (
          <Link href={action.href} style={{ color: SC.accent, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
            {action.label} →
          </Link>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function TableRow({ children, borderBottom }: { children: React.ReactNode; borderBottom: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 transition-all cursor-pointer"
      style={{ borderBottom: borderBottom ? `1px solid ${SC.border}` : "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = SC.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {children}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
      style={{ background: SC.accentMuted, color: SC.accent }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full animate-shimmer" />
          <div className="flex-1 h-3 rounded animate-shimmer" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-5">
      <p className="text-sm" style={{ color: SC.textMuted }}>{message}</p>
    </div>
  );
}