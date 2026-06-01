"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Plus,
  RefreshCw,
} from "lucide-react";

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setLeads(data);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            Leads
          </h1>
          <p className="text-sm mt-0.5" style={{ color: T.textMuted }}>
            {leads.length} total · {newCount} new · {contactedCount} contacted · {wonCount} won
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLeads()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg transition-all hover:brightness-110"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              color: T.textMuted,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg transition-all hover:brightness-110"
            style={{ background: T.accent, color: "#0a0a0a", cursor: "pointer", border: "none" }}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New Lead</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
            <Users size={14} style={{ color: T.accent }} />
          </div>
          <div className="text-xl font-bold" style={{ color: T.textPrimary }}>{leads.length}</div>
          <div className="text-[11px]" style={{ color: T.textMuted }}>Total leads</div>
        </div>
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
            <Target size={14} style={{ color: T.accent }} />
          </div>
          <div className="text-xl font-bold" style={{ color: T.accent }}>{newCount}</div>
          <div className="text-[11px]" style={{ color: T.textMuted }}>New</div>
        </div>
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
            <TrendingUp size={14} style={{ color: T.accent }} />
          </div>
          <div className="text-xl font-bold" style={{ color: T.textPrimary }}>{contactedCount}</div>
          <div className="text-[11px]" style={{ color: T.textMuted }}>Contacted</div>
        </div>
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.accentMuted }}>
            <DollarSign size={14} style={{ color: T.accent }} />
          </div>
          <div className="text-xl font-bold" style={{ color: T.textPrimary }}>{wonCount}</div>
          <div className="text-[11px]" style={{ color: T.textMuted }}>Won</div>
        </div>
      </div>

      {/* Lead table */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}
      >
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <RefreshCw size={20} style={{ color: T.textMuted }} className="animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
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
              Leads from /calculator and /dusty will appear here once traffic starts flowing.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[500px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.elevated }}>
                {["Customer", "Source", "Project", "Status", "Date"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-semibold"
                    style={{ color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <tr
                  key={lead.id}
                  className="transition-all cursor-pointer"
                  style={{ borderBottom: i < leads.length - 1 ? `1px solid ${T.border}` : "none", borderLeft: `2px solid transparent` }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = T.accent;
                    (e.currentTarget as HTMLTableRowElement).style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = "transparent";
                    (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                      {lead.customer_name || lead.customer_phone || "—"}
                    </div>
                    {lead.customer_email && (
                      <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>{lead.customer_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: T.accentMuted, color: T.accent }}
                    >
                      {lead.source_channel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm" style={{ color: T.textSecondary }}>{lead.project_type || "—"}</div>
                    {lead.sqft && (
                      <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                        {lead.sqft} sqft{lead.depth_in ? ` · ${lead.depth_in}"` : ""}{lead.psi ? ` · ${lead.psi} PSI` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: STATUS_BG[lead.status] || T.accentMuted,
                        color: STATUS_TEXT[lead.status] || T.accent,
                      }}
                    >
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-[11px]" style={{ color: T.textMuted }}>
                      <Clock size={9} />
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