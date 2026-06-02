"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MagnifyingGlass, CaretRight } from "@phosphor-icons/react";
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

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  owner: { bg: "rgba(232,93,4,0.15)", color: "#e85d04" },
  admin: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6" },
  member: { bg: "rgba(113,113,122,0.15)", color: "#71717a" },
  billing: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  field: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
};

function Skeleton({ className }: { className: string }) {
  return <div className={className} style={{ background: "linear-gradient(90deg, #18181b 25%, #27272a 50%, #18181b 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 8 }} />;
}

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("org_members")
      .select("*, orgs(name, slug), profiles(full_name, email)")
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
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: T.textPrimary }}>All Members</h1>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>{filtered.length} member{filtered.length !== 1 ? "s" : ""} across all orgs</p>
        </div>
      </div>

      <div className="relative mb-5">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or org..."
          className="w-full text-sm pl-9 pr-4 py-2.5 rounded-xl outline-none"
          style={{ background: T.surface, color: T.textPrimary, border: `1px solid ${T.border}` }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center px-5 py-3" style={{ borderBottom: `1px solid ${T.border}`, background: T.elevated }}>
          {["Name", "Email", "Organization", "Role", "Joined", ""].map((col) => (
            <div key={col} className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.textMuted }}>{col}</div>
          ))}
        </div>
        {loading ? (
          <div className="p-5 text-sm" style={{ color: T.textMuted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm" style={{ color: T.textMuted }}>No members found</p></div>
        ) : (
          filtered.map((m: any, i: number) => (
            <div key={m.id} className="flex items-center px-5 py-4 transition-all cursor-pointer"
              style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: T.textPrimary }}>{m.profiles?.full_name || "—"}</div>
              </div>
              <div className="flex-1 text-xs truncate" style={{ color: T.textMuted }}>{m.profiles?.email || "—"}</div>
              <div className="flex-1">
                <Link href={`/admin/contractors/${m.org_id}`} className="text-sm hover:underline" style={{ color: T.accent, textDecoration: "none" }}>
                  {m.orgs?.name || "—"}
                </Link>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: ROLE_BADGE[m.role]?.bg || T.accentMuted, color: ROLE_BADGE[m.role]?.color || T.accent }}>
                  {m.role || "member"}
                </span>
              </div>
              <div className="flex-1 text-xs" style={{ color: T.textMuted }}>
                {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
              </div>
              <div className="shrink-0">
                <Link href={`/admin/contractors/${m.org_id}`}>
                  <CaretRight size={14} style={{ color: T.textMuted }} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}