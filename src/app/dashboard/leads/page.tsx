"use client";

import { useState, useEffect } from "react";
import {
  ChartLineUp,
  Users,
  CurrencyDollar,
  Target,
  Plus,
  ArrowsClockwise,
  Clock,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

const T = {
  bg: "#09090b",
  surface: "#18181b",
  surfaceHover: "#27272a",
  elevated: "#3f3f46",
  accent: "#e85d04",
  accentMuted: "rgba(232,93,4,0.10)",
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
        borderRadius: 6,
      }}
    />
  );
}

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

  const fetchLeads = () => {
    setLoading(true);
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }: any) => {
        if (data) setLeads(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  };

  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;
  const wonCount = leads.filter((l) => l.status === "won").length;

  return (
    <div className="p-5 md:p-8" style={{ background: T.bg }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight leading-none" style={{ color: T.textPrimary }}>
            Leads
          </h1>
          <p className="text-sm mt-1.5" style={{ color: T.textMuted }}>
            {leads.length} total · {newCount} new · {contactedCount} contacted · {wonCount} won
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeads}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              color: T.textMuted,
              cursor: "pointer",
            }}
          >
            <ArrowsClockwise size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: T.accent, color: "#09090b", cursor: "pointer", border: "none" }}
          >
            <Plus size={14} weight="bold" />
            <span className="hidden sm:inline">New Lead</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total", value: leads.length, icon: Users },
          { label: "New", value: newCount, icon: Target },
          { label: "Contacted", value: contactedCount, icon: ChartLineUp },
          { label: "Won", value: wonCount, icon: CurrencyDollar },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl p-5 transition-all active:scale-[0.98]"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-4" style={{ background: T.accentMuted }}>
              <Icon size={15} color={T.accent} />
            </div>
            <div className="text-[28px] font-bold leading-none" style={{ color: label === "New" ? T.accent : T.textPrimary }}>
              {value}
            </div>
            <div className="text-xs mt-1.5" style={{ color: T.textMuted }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-x-auto"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}
      >
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <ClipboardIcon size={40} />
            <p className="text-sm font-medium mt-5" style={{ color: T.textMuted }}>
              No leads yet
            </p>
            <p className="text-xs mt-1.5 text-center max-w-[220px]" style={{ color: T.textMuted, opacity: 0.7 }}>
              Leads from /calculator and /dusty will appear here once traffic starts flowing.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[520px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.elevated }}>
                {["Customer", "Source", "Project", "Status", "Date"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: T.textMuted }}
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
                  style={{
                    borderBottom: i < leads.length - 1 ? `1px solid ${T.border}` : "none",
                    borderLeft: `2px solid transparent`,
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLTableRowElement;
                    el.style.borderLeftColor = T.accent;
                    el.style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLTableRowElement;
                    el.style.borderLeftColor = "transparent";
                    el.style.background = "transparent";
                  }}
                >
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                      {lead.customer_name || lead.customer_phone || "—"}
                    </div>
                    {lead.customer_email && (
                      <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                        {lead.customer_email}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: T.accentMuted, color: T.accent }}
                    >
                      {lead.source_channel}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm" style={{ color: T.textSecondary }}>
                      {lead.project_type || "—"}
                    </div>
                    {lead.sqft && (
                      <div className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                        {lead.sqft} sqft{lead.depth_in ? ` · ${lead.depth_in}"` : ""}{lead.psi ? ` · ${lead.psi} PSI` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
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
                  <td className="px-5 py-4">
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

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}