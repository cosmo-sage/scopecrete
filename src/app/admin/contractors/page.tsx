"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MagnifyingGlass, Plus, CaretRight, Users } from "@phosphor-icons/react";
import { SC, PLAN_BADGE } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/theme";

export default function ContractorsPage() {
  const [contractors, setContractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("orgs")
      .select("id, name, slug, plan_tier, created_at, org_members(count), leads(count)")
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
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: SC.textPrimary }}>Contractors</h1>
          <p className="text-sm mt-1" style={{ color: SC.textMuted }}>{filtered.length} organization{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: SC.accent, color: "white", border: "none", cursor: "pointer" }}>
          <Plus size={14} weight="bold" />
          Add Contractor
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SC.textMuted }} />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or slug..."
          className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none"
          style={{ background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }} />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
        {/* Header */}
        <div className="flex items-center px-5 py-3" style={{ borderBottom: `1px solid ${SC.border}`, background: SC.elevated }}>
          {[
            { label: "Company", flex: "flex-1 min-w-0" },
            { label: "Slug", flex: "flex-1" },
            { label: "Plan", flex: "flex-1" },
            { label: "Members", flex: "flex-1" },
            { label: "Leads", flex: "flex-1" },
            { label: "Created", flex: "flex-1" },
            { label: "", flex: "shrink-0" },
          ].map((col) => (
            <div key={col.label} className={cn(col.flex, "text-[10px] font-semibold uppercase tracking-widest")} style={{ color: SC.textMuted }}>
              {col.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div className="p-5 text-sm" style={{ color: SC.textMuted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: SC.textMuted }}>No contractors found</p>
          </div>
        ) : (
          filtered.map((org: any, i: number) => (
            <div key={org.id}
              className="flex items-center px-5 py-4 transition-all cursor-pointer"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${SC.border}` : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = SC.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: SC.textPrimary }}>{org.name}</div>
              </div>
              <div className="flex-1">
                <span className="text-xs" style={{ color: SC.textMuted }}>{org.slug}</span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: PLAN_BADGE[org.plan_tier]?.bg, color: PLAN_BADGE[org.plan_tier]?.color }}>
                  {PLAN_BADGE[org.plan_tier]?.label ?? org.plan_tier}
                </span>
              </div>
              <div className="flex-1 text-sm" style={{ color: SC.textSecondary }}>
                {org.org_members?.[0]?.count ?? 0}
              </div>
              <div className="flex-1 text-sm" style={{ color: SC.textSecondary }}>
                {org.leads?.[0]?.count ?? 0}
              </div>
              <div className="flex-1 text-xs" style={{ color: SC.textMuted }}>
                {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
              </div>
              <div className="shrink-0">
                <Link href={`/admin/contractors/${org.id}`}>
                  <CaretRight size={14} style={{ color: SC.textMuted }} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}