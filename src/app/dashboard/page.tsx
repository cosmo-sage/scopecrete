"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "@phosphor-icons/react";
import { DA, STAGE_CONFIG } from "@/lib/design-tokens";
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

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}>
      <div className="text-lg font-bold" style={{ color: accent ? DA.accent : DA.textPrimary }}>{value}</div>
      <div className="text-[10px]" style={{ color: DA.textMuted }}>{label}</div>
    </div>
  );
}

/**
 * Spine drift — the alarm that did not exist on 21 August.
 *
 * On 2026-08-21 SMS projection stopped in application code and 48 texts landed
 * in the database without ever reaching the app. Nobody noticed for a week
 * because nothing was watching. This is the thing that watches.
 *
 * Three states, and the third one matters as much as the other two: zero (all
 * clear), non-zero (something arrived and did not reach the app), and UNKNOWN
 * (the check itself failed). An alarm that cannot read its source must never
 * render as "all clear" — that is the original failure with a green light on
 * top — so the error state is shown in the same warning colour as a real drift.
 *
 * Visible without clicking, per the work order.
 */
function DriftIndicator() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/drift")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok || typeof body?.count !== "number") throw new Error(body?.error || `HTTP ${r.status}`);
        return body.count as number;
      })
      .then((n) => { if (!cancelled) setCount(n); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (count === null && !failed) return null; // stay quiet until it resolves

  const clear = !failed && count === 0;
  const tone = clear ? DA.textMuted : DA.error;
  const label = failed
    ? "Spine drift: check failed — status unknown"
    : count === 0
      ? "Spine drift 0 — everything that arrived reached the app"
      : `Spine drift ${count} — ${count === 1 ? "an event" : "events"} arrived that did not reach the app`;

  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center gap-2"
      style={{
        background: clear ? DA.surface : DA.elevated,
        border: `1px solid ${clear ? DA.border : DA.error}`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: tone }}
        aria-hidden
      />
      <span className="text-[11px]" style={{ color: clear ? DA.textMuted : DA.textPrimary }}>
        {label}
      </span>
    </div>
  );
}

function RecentLeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const name = lead.customer_name || lead.customer_phone || "Unknown Lead";
  const cfg = STAGE_CONFIG[lead.status] || { color: DA.textMuted };
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl p-3 transition-all active:scale-[0.98]" style={{ background: DA.surface, border: `1px solid ${DA.border}`, borderLeft: `3px solid ${cfg.color}`, boxShadow: DA.shadow, cursor: "pointer" }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ background: DA.accent }}>{getInitials(name)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm truncate" style={{ color: DA.textPrimary }}>{name}</div>
            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2" style={{ background: cfg.color, color: "#fff" }}>{cfg.label}</span>
          </div>
          <div className="text-xs truncate" style={{ color: DA.textSecondary }}>{lead.project_type}{lead.address ? ` · ${lead.address}` : ""}</div>
        </div>
      </div>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dustyOpen, setDustyOpen] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Get orgId from session API (dev: falls back to env)
  useEffect(() => {
    fetch("/api/session/org")
      .then((r) => r.json())
      .then((d) => setOrgId(d.orgId))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/dashboard/pipeline?org_id=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const all: Lead[] = [];
          for (const stage of Object.values<any>(data.stages || {})) {
            if (stage.leads) all.push(...stage.leads);
          }
          setLeads(all);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orgId]);

  const stats = useMemo(() => {
    const activeLeads = leads.filter((l) => l.status !== "lost");
    const pipelineValue = activeLeads.reduce((s, l) => s + (l.estimate_range_max || l.estimate_range_min || 0), 0);
    const needsAction = leads.filter((l) => l.status === "new" || (l.status === "contacted" && l.updated_at ? Date.now() - new Date(l.updated_at).getTime() > 72 * 60 * 60 * 1000 : false)).length;
    const won = leads.filter((l) => l.status === "won").length;
    const closed = leads.filter((l) => l.status === "won" || l.status === "lost").length;
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
    return { pipelineValue, needsAction, winRate };
  }, [leads]);

  const recentLeads = useMemo(
    () => [...leads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3),
    [leads]
  );

  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
      <div className="h-11 px-6 flex items-end pb-1 justify-between">
        <span className="text-xs font-semibold" style={{ color: "rgba(0,0,0,0.4)" }}>{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        <div className="flex items-center gap-1"><span className="text-xs">📶</span><span className="text-xs">🔋</span></div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: DA.accent }}>S</div>
          <div><div className="font-bold text-sm leading-tight" style={{ color: DA.textPrimary }}>ScopeCrete</div><div className="text-xs" style={{ color: DA.textMuted }}>Sacco Builders</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}><Bell size={15} /></button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ background: DA.accent }}>CL</div>
        </div>
      </div>
      <div className="px-4 py-4 space-y-4 flex-1">
        <div>
          <div className="text-2xl font-bold" style={{ color: DA.textPrimary }}>{getGreeting()}, Clay</div>
          <div className="text-sm mt-0.5" style={{ color: DA.textSecondary }}>Here&apos;s what&apos;s happening today.</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Pipeline" value={formatCurrencyShort(stats.pipelineValue)} />
          <StatCard label="Needs Action" value={String(stats.needsAction)} accent={stats.needsAction > 0} />
          <StatCard label="Win Rate" value={`${stats.winRate}%`} />
        </div>
        <DriftIndicator />
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold" style={{ color: DA.textPrimary }}>Recent Leads</div>
            <button onClick={() => router.push("/dashboard/leads")} className="text-xs font-medium" style={{ color: DA.accent, background: "none", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: DA.surface, border: `1px solid ${DA.border}` }} />)}</div>
          ) : recentLeads.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: DA.surface, border: `1px solid ${DA.border}` }}><div className="text-sm" style={{ color: DA.textMuted }}>No leads yet</div></div>
          ) : (
            <div className="space-y-2">{recentLeads.map((lead) => <RecentLeadCard key={lead.id} lead={lead} onClick={() => router.push(`/dashboard/leads/${lead.id}`)} />)}</div>
          )}
        </div>
      </div>
      <DustyDrawer open={dustyOpen} onClose={() => setDustyOpen(false)} />
    </div>
  );
}
