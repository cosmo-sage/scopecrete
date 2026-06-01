"use client";

import { useState, useEffect } from "react";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Clock,
  Plus,
} from "lucide-react";

// Dark industrial theme
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

function StatCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down";
  icon: React.ElementType;
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

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setLeads(data);
    }
    setLoading(false);
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;
  const wonCount = leads.filter((l) => l.status === "won").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8" style={{ background: T.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Leads
          </h1>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>
            {leads.length} total · {newCount} new · {contactedCount} contacted ·{" "}
            {wonCount} won
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLeads()}
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              color: T.textMuted,
            }}
          >
            Refresh
          </button>
          <button
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg"
            style={{ background: T.accent, color: "#0a0a0a" }}
          >
            <Plus size={15} />
            New Lead
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total leads" value={leads.length} icon={Users} />
        <StatCard
          label="New today"
          value={newCount}
          icon={Target}
          trend={newCount > 0 ? "up" : undefined}
          sub={`${newCount}`}
        />
        <StatCard label="Contacted" value={contactedCount} icon={TrendingUp} />
        <StatCard
          label="Won"
          value={wonCount}
          icon={DollarSign}
          trend={wonCount > 0 ? "up" : undefined}
        />
      </div>

      {/* Lead list */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}
      >
        {loading ? (
          <div className="p-12 text-center" style={{ color: T.textMuted }}>
            Loading leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h3
              className="text-lg font-semibold mb-1"
              style={{ color: T.textPrimary }}
            >
              No leads yet
            </h3>
            <p className="text-sm" style={{ color: T.textMuted }}>
              Leads from /calculator and /dusty will appear here once traffic
              starts flowing.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: T.elevated,
                }}
              >
                {["Customer", "Source", "Project", "Status", "Date"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold"
                      style={{ color: T.textMuted }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: `1px solid ${T.border}` }}
                >
                  <td className="px-5 py-4">
                    <div
                      className="text-sm font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {lead.customer_name || lead.customer_phone}
                    </div>
                    {lead.customer_email && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: T.textMuted }}
                      >
                        {lead.customer_email}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{
                        background: T.accentMuted,
                        color: T.accent,
                      }}
                    >
                      {lead.source_channel}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm" style={{ color: T.textSecondary }}>
                      {lead.project_type}
                    </div>
                    {lead.sqft && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: T.textMuted }}
                      >
                        {lead.sqft} sqft
                        {lead.depth_in ? ` · ${lead.depth_in}" depth` : null}
                        {lead.psi ? ` · ${lead.psi} PSI` : null}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          STATUS_BG[lead.status] || T.accentMuted,
                        color: STATUS_TEXT[lead.status] || T.accent,
                      }}
                    >
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div
                      className="flex items-center gap-1 text-xs"
                      style={{ color: T.textMuted }}
                    >
                      <Clock size={10} />
                      {timeAgo(lead.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}