"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Phone, ChatCircle, Clock, Plus, ArrowsClockwise, Users } from "@phosphor-icons/react";
import { DA, STAGE_CONFIG, STAGE_ORDER } from "@/lib/design-tokens";
import { formatCurrency } from "@/lib/utils";
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
}

interface PipelineData {
  stages: Record<string, { count: number; totalValue: number; leads: Lead[] }>;
  summary: { totalPipelineValue: number; needsAction: number; winRate: number };
}

// ─── Helpers ───────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function getOverdue(lead: Lead): boolean {
  if (lead.status === "new") {
    const age = Date.now() - new Date(lead.created_at).getTime();
    return age > 24 * 60 * 60 * 1000;
  }
  if (lead.status === "contacted") {
    const since = Date.now() - new Date(lead.updated_at).getTime();
    return since > 72 * 60 * 60 * 1000;
  }
  return false;
}

// ─── Skeleton ──────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse" style={{ background: DA.surface, border: `1px solid ${DA.border}`, borderLeft: `3px solid ${DA.elevated}` }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full" style={{ background: DA.elevated }} />
        <div className="flex-1">
          <div className="h-4 w-2/3 rounded mb-2" style={{ background: DA.elevated }} />
          <div className="h-3 w-1/2 rounded mb-2" style={{ background: DA.elevated }} />
          <div className="h-3 w-1/3 rounded" style={{ background: DA.elevated }} />
        </div>
      </div>
    </div>
  );
}

// ─── Stage Tab ─────────────────────────────────────────────────
function StageTab({
  stage,
  count,
  active,
  onClick,
}: {
  stage: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = STAGE_CONFIG[stage] || { label: stage, color: DA.textMuted };
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
      style={{
        background: active ? DA.accent : "transparent",
        color: active ? "#fff" : DA.textSecondary,
        border: `1px solid ${active ? DA.accent : DA.border}`,
      }}
    >
      {cfg.label} ({count})
    </button>
  );
}

// ─── Lead Card ─────────────────────────────────────────────────
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const cfg = STAGE_CONFIG[lead.status] || { label: lead.status, color: DA.textMuted };
  const name =
    lead.customer_name || lead.customer_phone || "Unknown Lead";
  const phone = lead.customer_phone || "";
  const overdue = getOverdue(lead);
  const estimate = lead.estimate_range_max || lead.estimate_range_min || 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 transition-all active:scale-[0.99]"
      style={{
        background: DA.surface,
        border: `1px solid ${DA.border}`,
        borderLeft: `3px solid ${cfg.color}`,
        cursor: "pointer",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
          style={{ background: DA.accent }}
        >
          {getInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="font-semibold text-sm truncate" style={{ color: DA.textPrimary }}>
              {name}
            </div>
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2"
              style={{ background: cfg.color, color: "#fff" }}
            >
              {cfg.label}
            </span>
          </div>
          <div className="text-xs" style={{ color: DA.textSecondary }}>
            {phone}
          </div>
          {lead.project_type && (
            <div className="text-sm font-medium mt-1" style={{ color: DA.textPrimary }}>
              {lead.project_type}
            </div>
          )}
          {lead.address && (
            <div className="text-xs" style={{ color: DA.textMuted }}>
              {lead.address}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <div>
              {estimate > 0 && (
                <div className="text-sm font-bold" style={{ color: DA.accent }}>
                  {formatCurrency(estimate)}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock size={9} color={overdue ? DA.error : DA.textMuted} />
                <span className="text-[10px]" style={{ color: overdue ? DA.error : DA.textMuted }}>
                  {overdue ? "Overdue · " : ""}{timeAgo(lead.created_at)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {phone && (
                <>
                  <a
                    href={`tel:${phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: DA.elevated, border: `1px solid ${DA.border}`, color: DA.textMuted }}
                  >
                    <Phone size={14} />
                  </a>
                  <a
                    href={`sms:${phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ background: DA.accent, border: "none" }}
                  >
                    <ChatCircle size={14} />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function LeadsPage() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [dustyOpen, setDustyOpen] = useState(false);

  const ORG_ID = "61e26b09-da88-4c9f-bd0c-a47054b86234";

  useEffect(() => {
    fetch(`/api/dashboard/pipeline?org_id=${ORG_ID}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPipeline(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalLeads = useMemo(() => {
    if (!pipeline) return 0;
    return Object.values(pipeline.stages).reduce((s, st) => s + (st.count || 0), 0);
  }, [pipeline]);

  const filteredLeads = useMemo(() => {
    if (!pipeline) return [];
    let leads = pipeline.stages[activeStage]?.leads || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      leads = leads.filter(
        (l) =>
          (l.customer_name?.toLowerCase().includes(q)) ||
          (l.customer_phone?.includes(q)) ||
          (l.project_type?.toLowerCase().includes(q)) ||
          (l.address?.toLowerCase().includes(q))
      );
    }
    return leads;
  }, [pipeline, activeStage, searchQuery]);

  const stats = useMemo(() => {
    if (!pipeline) return { totalPipelineValue: 0, needsAction: 0, winRate: 0 };
    return pipeline.summary;
  }, [pipeline]);

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
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: DA.accent }}
          >
            S
          </div>
        </div>
        <button
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
          style={{ background: DA.accent, border: "none", cursor: "pointer" }}
        >
          + New
        </button>
      </div>

      {/* Page title */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-lg font-bold" style={{ color: DA.textPrimary }}>
          Lead Pipeline
        </h1>
        <p className="text-xs" style={{ color: DA.textMuted }}>
          {totalLeads} total leads
        </p>
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2 flex-shrink-0">
        <div className="rounded-xl p-3 text-center" style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}>
          <div className="text-lg font-bold" style={{ color: DA.textPrimary }}>
            {formatCurrency(stats.totalPipelineValue)}
          </div>
          <div className="text-xs" style={{ color: DA.textMuted }}>Pipeline</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}>
          <div className="text-lg font-bold" style={{ color: stats.needsAction > 0 ? DA.accent : DA.textPrimary }}>
            {stats.needsAction}
          </div>
          <div className="text-xs" style={{ color: DA.textMuted }}>Needs Action</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}>
          <div className="text-lg font-bold" style={{ color: DA.textPrimary }}>
            {stats.winRate}%
          </div>
          <div className="text-xs" style={{ color: DA.textMuted }}>Win Rate</div>
        </div>
      </div>

      {/* Stage tabs */}
      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {STAGE_ORDER.map((stage) => {
          const count = pipeline?.stages[stage]?.count || 0;
          return (
            <StageTab
              key={stage}
              stage={stage}
              count={count}
              active={activeStage === stage}
              onClick={() => setActiveStage(stage)}
            />
          );
        })}
      </div>

      {/* Search */}
      <div className="px-4 pb-3 flex-shrink-0">
        <input
          type="text"
          placeholder="Search leads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{
            background: DA.surface,
            border: `1px solid ${DA.border}`,
            color: DA.textPrimary,
          }}
        />
      </div>

      {/* Leads list */}
      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {loading ? (
          [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users size={32} color={DA.textMuted} />
            <p className="text-sm mt-3" style={{ color: DA.textMuted }}>
              No leads in {STAGE_CONFIG[activeStage]?.label || activeStage}
            </p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
            />
          ))
        )}
      </div>

      <DustyDrawer open={dustyOpen} onClose={() => setDustyOpen(false)} />
    </div>
  );
}
