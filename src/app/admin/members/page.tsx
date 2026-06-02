"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
import { SC, ROLE_BADGE, timeAgo } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/theme";

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("org_members")
      .select("id, org_id, role, created_at, orgs(name, slug), profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }: any) => {
        setMembers(data || []);
        setLoading(false);
      });
  }, []);

  const filtered = members.filter((m: any) =>
    m.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.profiles?.email?.toLowerCase().includes(search.toLowerCase()) ||
    m.orgs?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: SC.textPrimary }}>All Members</h1>
          <p className="text-sm mt-1" style={{ color: SC.textMuted }}>{filtered.length} member{filtered.length !== 1 ? "s" : ""} across all orgs</p>
        </div>
      </div>

      <div className="relative mb-5">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: SC.textMuted }} />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or org..."
          className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none"
          style={{ background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
        {/* Header */}
        <div className="flex items-center px-5 py-3" style={{ borderBottom: `1px solid ${SC.border}`, background: SC.elevated }}>
          {["Name", "Email", "Organization", "Role", "Joined", ""].map((col) => (
            <div key={col} className={cn(
              col === "Name" ? "flex-1 min-w-0" :
              col === "Email" ? "flex-1" :
              col === "Organization" ? "flex-1" :
              col === "Role" ? "flex-1" :
              col === "Joined" ? "flex-1" :
              "shrink-0",
              "text-[10px] font-semibold uppercase tracking-widest"
            )} style={{ color: SC.textMuted }}>{col}</div>
          ))}
        </div>

        {loading ? (
          <div className="p-5 text-sm" style={{ color: SC.textMuted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm" style={{ color: SC.textMuted }}>No members found</p></div>
        ) : (
          filtered.map((m: any, i: number) => (
            <div key={m.id} className="flex items-center px-5 py-4 transition-all cursor-pointer"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${SC.border}` : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = SC.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: SC.textPrimary }}>
                  {m.profiles?.full_name || "—"}
                </div>
              </div>
              <div className="flex-1 text-xs truncate" style={{ color: SC.textMuted }}>
                {m.profiles?.email || "—"}
              </div>
              <div className="flex-1">
                <span className="text-sm hover:underline" style={{ color: SC.accent, textDecoration: "none" }}>
                  {m.orgs?.name || "—"}
                </span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: ROLE_BADGE[m.role]?.bg, color: ROLE_BADGE[m.role]?.color }}>
                  {m.role || "member"}
                </span>
              </div>
              <div className="flex-1 text-xs" style={{ color: SC.textMuted }}>
                {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
              </div>
              <div className="shrink-0">
                <Link href={`/admin/contractors/${m.org_id}`}>
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