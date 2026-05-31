"use client";

import { useState, useEffect } from "react";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
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
  LogOut,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";

type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

interface Lead {
  id: string;
  source_channel: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  project_type: string;
  length_ft: number | null;
  width_ft: number | null;
  sqft: number | null;
  depth_in: number | null;
  psi: number | null;
  zip: string | null;
  estimate_range_min: number | null;
  estimate_range_max: number | null;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

const STATUS_BG: Record<string, string> = {
  new: "rgba(59,130,246,0.12)",
  contacted: "rgba(245,158,11,0.12)",
  qualified: "rgba(139,92,246,0.12)",
  won: "rgba(34,197,94,0.12)",
  lost: "rgba(239,68,68,0.12)",
};

const STATUS_TEXT: Record<string, string> = {
  new: "#3B82F6",
  contacted: "#F59E0B",
  qualified: "#8B5CF6",
  won: "#22C55E",
  lost: "#EF4444",
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
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(36,87,245,0.08)" }}
        >
          <Icon size={17} style={{ color: "#2457F5" }} />
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
        <div className="text-2xl font-bold" style={{ color: "#1F2937" }}>{value}</div>
        <div className="text-sm mt-0.5" style={{ color: "#6B7280" }}>{label}</div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else setUser(data.user);
    });
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetchLeads();
  }, [user]);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setLeads(data as any);
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
    <div className="min-h-full p-6 lg:p-8" style={{ background: "#F6F7FB" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1F2937", fontFamily: "Inter, sans-serif" }}>
            Leads
          </h1>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {leads.length} total · {newCount} new · {contactedCount} contacted · {wonCount} won
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLeads()}
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}
          >
            Refresh
          </button>
          <button
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg"
            style={{ background: "#2457F5", color: "white" }}
          >
            <Plus size={15} />
            New Lead
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total leads" value={leads.length} icon={Users} />
        <StatCard label="New today" value={newCount} icon={Target} trend={newCount > 0 ? "up" : undefined} sub={`${newCount}`} />
        <StatCard label="Contacted" value={contactedCount} icon={TrendingUp} />
        <StatCard label="Won" value={wonCount} icon={DollarSign} trend={wonCount > 0 ? "up" : undefined} />
      </div>

      {/* Lead list */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
        {loading ? (
          <div className="p-12 text-center" style={{ color: "#6B7280" }}>
            Loading leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "#1F2937" }}>No leads yet</h3>
            <p className="text-sm" style={{ color: "#6B7280" }}>
              Leads from /calculator and /dusty will appear here once traffic starts flowing.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#6B7280" }}>Customer</th>
                <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#6B7280" }}>Source</th>
                <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#6B7280" }}>Project</th>
                <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#6B7280" }}>Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "#6B7280" }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer transition-colors hover:brightness-98"
                  style={{ borderBottom: "1px solid #F3F4F6" }}
                >
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold" style={{ color: "#1F2937" }}>
                      {lead.customer_name || lead.customer_phone}
                    </div>
                    {lead.customer_email && (
                      <div className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{lead.customer_email}</div>
                    )}}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: "rgba(36,87,245,0.08)", color: "#2457F5" }}>
                      {lead.source_channel}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm" style={{ color: "#374151" }}>{lead.project_type}</div>
                    {lead.sqft && (
                      <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                        {lead.sqft} sqft
                        {lead.depth_in ? ` · ${lead.depth_in}" depth` : null}
                        {lead.psi ? ` · ${lead.psi} PSI` : null}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: STATUS_BG[lead.status] || "rgba(107,114,128,0.1)", color: STATUS_TEXT[lead.status] || "#6B7280" }}
                    >
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 text-xs" style={{ color: "#6B7280" }}>
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