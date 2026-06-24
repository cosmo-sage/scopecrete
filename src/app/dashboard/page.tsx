"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Clock, CurrencyDollar, Target, ChartLineUp } from "@phosphor-icons/react";
import { DA, STAGE_CONFIG } from "@/lib/design-tokens";
import { formatCurrency, timeAgo } from "@/lib/utils";
import DustyDrawer from "@/components/dashboard/DustyDrawer";

// ─── Types ────────────────────────────────────────────────────
interface Lead {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  project_type?: string;
  address?: string;
  status: string;
  estimate_range_min?: number;
  estimate_range_max?: number;
  created_at: string;
  updated_at: string;
  contact?: { first_name?: string; last_name?: string; phone?: string };
}

// ─── Helpers ───────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || "")
    .join("");
}

function formatCurrencyShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Skeleton ──────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-3 animate-pulse"
      style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full" style={{ background: DA.elevated }} />
        <div className="flex-1">
          <div className="h-4 w-3/4 rounded mb-1" style={{ background: DA.elevated }} />
          <div className="h-3 w-1/2 rounded" style={{ background: DA.elevated }} />
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon size={13} color={accent ? DA.accent : DA.textMuted} />
      </div>
      <div
        className="text-lg font-bold"
        style={{ color: accent ? DA.accent : DA.textPrimary }}
      >
        {value}
      </div>
      <div className="text-[10px]" style={{ color: DA.textMuted }}>
        {label}
      </div>
    </div>
  );
}

// ─── Recent Lead Mini Card ──────────────────────────────────────
function RecentLeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const name =
    lead.customer_name ||
    [lead.contact?.first_name, lead.contact?.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";
  const phone = lead.customer_phone || lead.contact?.phone || "";
  const statusCfg = STAGE_CONFIG[lead.status] || { color: DA.textMuted };
  const label =
    lead.status === "new"
      ? "New"
      : lead.status === "won"
      ? "Won"
      : lead.status === "lost"
      ? "Lost"
      : lead.status;
  const projectType = lead.project_type || "";
  const address = lead.address || "";
  const initials = getInitials(name);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 transition-all active:scale-[0.98]"
      style={{
        background: DA.surface,
        border: `1px solid ${DA.border}`,
        borderLeft: `3px solid ${statusCfg.color}`,
        boxShadow: DA.shadow,
        cursor: "pointer",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ background: DA.accent }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm truncate" style={{ color: DA.textPrimary }}>
              {name}
            </div>
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2"
              style={{ background: statusCfg.color, color: "#fff" }}
            >
              {label}
            </span>
          </div>
          <div className="text-xs truncate" style={{ color: DA.textSecondary }}>
            {projectType}
            {address ? ` · ${address}` : ""}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dustyOpen, setDustyOpen] = useState(false);

  const ORG_ID = "61e26b09-da88-4c9f-bd0c-a47054b86234"; // Sacco Builders

  useEffect(() => {
    fetch(`/api/dashboard/pipeline?org_id=${ORG_ID}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          // Flatten all leads from stages
          const all: Lead[] = [];
          for (const stage of Object.values<any>(data.stages || {})) {
            if (stage.leads) all.push(...stage.leads);
          }
          setLeads(all);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const activeLeads = leads.filter((l) => l.status !== "lost");
    const pipelineValue = activeLeads.reduce(
      (s, l) => s + (l.estimate_range_max || l.estimate_range_min || 0),
      0
    );
    const needsAction = leads.filter(
      (l) => l.status === "new" || (l.status === "contacted" && l.updated_at
        ? Date.now() - new Date(l.updated_at).getTime() > 72 * 60 * 60 * 1000
        : false)
    ).length;
    const won = leads.filter((l) => l.status === "won").length;
    const closed = leads.filter((l) => l.status === "won" || l.status === "lost").length;
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
    return { pipelineValue, needsAction, winRate };
  }, [leads]);

  const recentLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [leads]
  );

  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
      {/* Status bar area */}
      <div className="h-11 px-6 flex items-end pb-1 justify-between">
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
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: DA.accent }}
          >
            S
          </div>
          <div>
            <div className="font-bold text-sm leading-tight" style={{ color: DA.textPrimary }}>
              ScopeCrete
            </div>
            <div className="text-xs" style={{ color: DA.textMuted }}>
              Sacco Builders
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
          >
            <Bell size={15} />
          </button>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ background: DA.accent }}
          >
            CL
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4 flex-1">
        {/* Greeting */}
        <div>
          <div className="text-2xl font-bold" style={{ color: DA.textPrimary }}>
            {getGreeting()}, Clay
          </div>
          <div className="text-sm mt-0.5" style={{ color: DA.textSecondary }}>
            Here&apos;s what&apos;s happening today.
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="Pipeline"
            value={formatCurrencyShort(stats.pipelineValue)}
            icon={CurrencyDollar}
          />
          <StatCard
            label="Needs Action"
            value={String(stats.needsAction)}
            icon={Target}
            accent={stats.needsAction > 0}
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate}%`}
            icon={ChartLineUp}
          />
        </div>

        {/* Recent Leads */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold" style={{ color: DA.textPrimary }}>
              Recent Leads
            </div>
            <button
              onClick={() => router.push("/dashboard/leads")}
              className="text-xs font-medium"
              style={{ color: DA.accent, background: "none", border: "none", cursor: "pointer" }}
            >
              View all →
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center"
              style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
            >
              <div className="text-sm" style={{ color: DA.textMuted }}>
                No leads yet
              </div>
              <div className="text-xs mt-1" style={{ color: DA.textMuted }}>
                Incoming leads will appear here
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((lead) => (
                <RecentLeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <DustyDrawer
        open={dustyOpen}
        onClose={() => setDustyOpen(false)}
      />
    </div>
  );
}
