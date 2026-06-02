"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CaretRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
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

const PLAN_BADGE: Record<string, { bg: string; color: string }> = {
  solo: { bg: "rgba(113,113,122,0.15)", color: "#71717a" },
  growth: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  pro: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6" },
  enterprise: { bg: "rgba(232,93,4,0.15)", color: "#e85d04" },
};

export default function ContractorsPage() {
  const [contractors, setContractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    supabase
      .from("orgs")
      .select("*, org_members(count), leads(count)")
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        setContractors(data || []);
        setLoading(false);
      });
  }, []);

  const filtered = contractors.filter((c: any) =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.slug?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: T.textPrimary }}>Contractors</h1>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>{filtered.length} organization{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: T.accent, color: "white", border: "none", cursor: "pointer" }}
        >
          <Plus size={14} weight="bold" />
          Add Contractor
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or slug..."
          className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none"
          style={{ background: T.surface, color: T.textPrimary, border: `1px solid ${T.border}` }}
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        {/* Table header */}
        <div className="flex items-center px-5 py-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.elevated }}>
          {["Company", "Slug", "Plan", "Members", "Leads", "Created", ""].map((col) => (
            <div key={col} className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.textMuted }}>
              {col}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="p-5 text-sm" style={{ color: T.textMuted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: T.textMuted }}>No contractors found</p>
          </div>
        ) : (
          filtered.map((org: any, i: number) => (
            <div key={org.id} className="flex items-center px-5 py-4 transition-all cursor-pointer"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: T.textPrimary }}>{org.name}</div>
              </div>
              <div className="flex-1">
                <span className="text-xs" style={{ color: T.textMuted }}>{org.slug}</span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: PLAN_BADGE[org.plan_tier]?.bg || T.accentMuted, color: PLAN_BADGE[org.plan_tier]?.color || T.accent }}>
                  {org.plan_tier || "solo"}
                </span>
              </div>
              <div className="flex-1 text-sm" style={{ color: T.textSecondary }}>{org.org_members?.[0]?.count ?? 0}</div>
              <div className="flex-1 text-sm" style={{ color: T.textSecondary }}>{org.leads?.[0]?.count ?? 0}</div>
              <div className="flex-1 text-xs" style={{ color: T.textMuted }}>
                {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
              </div>
              <div className="shrink-0">
                <Link href={`/admin/contractors/${org.id}`}>
                  <CaretRight size={14} style={{ color: T.textMuted }} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}