"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Phone,
  ChatCircle,
  MapTrifold,
  X,
  CaretDown,
  CaretUp,
  EnvelopeSimple,
  MapPin,
} from "@phosphor-icons/react";

// ----------------------------------------------------------------------------
// Design tokens — Direction A: Light Field-Ready
// ----------------------------------------------------------------------------
const T = {
  bg: "#F5F0E8",
  surface: "#FFFFFF",
  surfaceHover: "#F0EBE3",
  elevated: "#E8E2D9",
  accent: "#E85D04",
  accentMuted: "rgba(232,93,4,0.12)",
  textPrimary: "#1A1A1A",
  textSecondary: "#5C5C5C",
  textMuted: "#9CA3AF",
  border: "#D4CEC6",
  borderLight: "#E8E2D9",
  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2563EB",
  shadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const STAGE_COLORS: Record<LeadStatus, string> = {
  new: "#2563EB",
  contacted: "#D97706",
  qualified: "#7C3AED",
  quoted: "#E85D04",
  won: "#16A34A",
  lost: "#DC2626",
};

const STAGE_ORDER: { key: LeadStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "quoted", label: "Quoted" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
type LeadStatus = "new" | "contacted" | "qualified" | "quoted" | "won" | "lost";

interface Lead {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  projectType: string;
  address: string;
  zip: string;
  estimateMin: number;
  estimateMax: number;
  status: LeadStatus;
  createdAt: string;
  lastActivity: string;
  notes: string;
  conversation: { role: "customer" | "dusty" | "system"; text: string; timestamp: string }[];
  estimateDetails: {
    sqft: number;
    depthIn: number;
    psi: number;
    conditions: string;
    cy: number;
    breakdown: Record<string, { desc: string; amount: number }>;
    isBallpark: boolean;
  };
}

// ----------------------------------------------------------------------------
// Mock data (matches real API shape)
// ----------------------------------------------------------------------------
const MOCK_LEADS: Lead[] = [
  {
    id: "lead-001", customerName: "Marcus Thibodaux", phone: "(225) 555-0147",
    email: "marcus.t@example.com", projectType: "driveway", address: "4412 Government St", zip: "70802",
    estimateMin: 7200, estimateMax: 8900, status: "new",
    createdAt: "2026-06-21T08:00:00Z", lastActivity: "2026-06-21T08:30:00Z",
    notes: "Wants stamped concrete, broom finish as backup option.",
    conversation: [
      { role: "dusty", text: "Hey, I'm Dusty. Tell me about your concrete project.", timestamp: "2026-06-21T08:00:00Z" },
      { role: "customer", text: "I need a new driveway, about 600 square feet", timestamp: "2026-06-21T08:00:00Z" },
    ],
    estimateDetails: { sqft: 600, depthIn: 4, psi: 3000, conditions: "flat grade, easy access", cy: 7.4, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-002", customerName: "Sophia Broussard", phone: "(225) 555-0293",
    email: "sophia.b@example.com", projectType: "patio", address: "8813 Highland Rd", zip: "70810",
    estimateMin: 4800, estimateMax: 6100, status: "contacted",
    createdAt: "2026-06-19T14:00:00Z", lastActivity: "2026-06-20T09:00:00Z",
    notes: "Called twice, left voicemail. Interested in 4000psi upgrade for durability.",
    conversation: [],
    estimateDetails: { sqft: 400, depthIn: 4, psi: 3000, conditions: "sloped grade, standard access", cy: 4.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-003", customerName: "Derek Sonnier", phone: "(225) 555-0384",
    email: "d.sonnier@example.com", projectType: "foundation", address: "2201 Chippewa St", zip: "70805",
    estimateMin: 11200, estimateMax: 13800, status: "qualified",
    createdAt: "2026-06-18T11:00:00Z", lastActivity: "2026-06-20T16:30:00Z",
    notes: "Building a detached garage. Needs permit-ready breakdown with engineering specs.",
    conversation: [],
    estimateDetails: { sqft: 900, depthIn: 6, psi: 4000, conditions: "requires permit, engineered", cy: 16.7, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-004", customerName: "Amara Diallo", phone: "(225) 555-0512",
    email: "amara.d@example.com", projectType: "driveway", address: "7722 Mickens Rd", zip: "70791",
    estimateMin: 6800, estimateMax: 8400, status: "quoted",
    createdAt: "2026-06-17T09:00:00Z", lastActivity: "2026-06-21T11:00:00Z",
    notes: "Proposal sent. Decision expected by end of week.",
    conversation: [],
    estimateDetails: { sqft: 560, depthIn: 4, psi: 3000, conditions: "flat, standard access", cy: 6.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-005", customerName: "Rena Traweek", phone: "(225) 555-0638",
    email: "rena.t@example.com", projectType: "pool deck", address: "554 Bluebonnet Rd", zip: "70810",
    estimateMin: 8400, estimateMax: 10200, status: "quoted",
    createdAt: "2026-06-16T15:00:00Z", lastActivity: "2026-06-21T14:00:00Z",
    notes: "Wants stained concrete with channel drains. HOA approval needed.",
    conversation: [],
    estimateDetails: { sqft: 720, depthIn: 4, psi: 3000, conditions: "sloped, needs drainage", cy: 8.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-006", customerName: "Leon Cravins", phone: "(225) 555-0627",
    email: "leon.cravins@example.com", projectType: "slab", address: "1401 Florida Blvd", zip: "70802",
    estimateMin: 3200, estimateMax: 4100, status: "won",
    createdAt: "2026-06-10T09:00:00Z", lastActivity: "2026-06-20T10:00:00Z",
    notes: "Signed contract for $3,800. Scheduled for June 28.",
    conversation: [],
    estimateDetails: { sqft: 280, depthIn: 4, psi: 3000, conditions: "flat", cy: 3.5, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-007", customerName: "Pierre Landry", phone: "(225) 555-0741",
    email: "p.landry@example.com", projectType: "parking lot", address: "8834 Airline Hwy", zip: "70791",
    estimateMin: 22000, estimateMax: 28000, status: "won",
    createdAt: "2026-06-08T11:00:00Z", lastActivity: "2026-06-18T16:00:00Z",
    notes: "Commercial project. 60-day payment terms negotiated.",
    conversation: [],
    estimateDetails: { sqft: 2200, depthIn: 6, psi: 4000, conditions: "commercial, heavy traffic", cy: 40.7, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-008", customerName: "Denise Bui", phone: "(225) 555-0852",
    email: "denise.bui@example.com", projectType: "patio", address: "112 Chenault Dr", zip: "70807",
    estimateMin: 5400, estimateMax: 6800, status: "lost",
    createdAt: "2026-06-05T10:00:00Z", lastActivity: "2026-06-15T09:00:00Z",
    notes: "Went with competitor. Budget was main concern. Keep in nurture sequence.",
    conversation: [],
    estimateDetails: { sqft: 450, depthIn: 4, psi: 3000, conditions: "standard", cy: 5.6, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-009", customerName: "Fatima Osei", phone: "(225) 555-0734",
    email: "fatima.o@example.com", projectType: "pool deck", address: "3304 Victoria Dr", zip: "70811",
    estimateMin: 9400, estimateMax: 11800, status: "new",
    createdAt: "2026-06-21T10:00:00Z", lastActivity: "2026-06-21T10:15:00Z",
    notes: "Interested in stained concrete with acrylic sealer. Has dogs, wants non-slip finish.",
    conversation: [],
    estimateDetails: { sqft: 800, depthIn: 4, psi: 3000, conditions: "sloped, needs non-slip", cy: 9.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-010", customerName: "Carlos Mercado", phone: "(225) 555-0963",
    email: "c.mercado@example.com", projectType: "driveway", address: "6677 Java St", zip: "70805",
    estimateMin: 5600, estimateMax: 7000, status: "qualified",
    createdAt: "2026-06-19T13:00:00Z", lastActivity: "2026-06-21T09:00:00Z",
    notes: "Site visit completed. Needs 5-inch depth for heavy truck parking.",
    conversation: [],
    estimateDetails: { sqft: 480, depthIn: 5, psi: 4000, conditions: "heavy load, reinforced", cy: 7.4, breakdown: {}, isBallpark: false },
  },
];

const groupByStatus = (leads: Lead[]) => {
  const stages: Record<string, Lead[]> = { new: [], contacted: [], qualified: [], quoted: [], won: [], lost: [] };
  leads.forEach((l) => { if (stages[l.status]) stages[l.status].push(l); });
  return stages;
};

const mockPipelineData = {
  stages: Object.fromEntries(
    Object.entries(groupByStatus(MOCK_LEADS)).map(([stage, stageLeads]) => [
      stage,
      {
        count: stageLeads.length,
        totalValue: stageLeads.reduce((s, l) => s + (l.estimateMin + l.estimateMax) / 2, 0),
        avgDaysInStage: 1.4,
        leads: stageLeads,
      },
    ]),
  ),
  summary: {
    totalPipelineValue: 89400,
    needsAction: 3,
    winRate: 40,
  },
};

interface PipelineData {
  stages: Record<string, { count: number; totalValue: number; avgDaysInStage: number; leads: Lead[] }>;
  summary: { totalPipelineValue: number; needsAction: number; winRate: number };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function formatK(value: number) {
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}

function relativeTime(lead: Lead) {
  const base = lead.lastActivity || lead.createdAt;
  const then = new Date(base).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));

  // Overdue: contacted AND >3 days since lastActivity
  const days = Math.floor(diffMin / 1440);
  if (lead.status === "contacted" && days > 3) {
    return { label: `Overdue ${days}d`, overdue: true };
  }

  let label: string;
  if (diffMin < 60) label = `New ${diffMin}m ago`;
  else if (diffMin < 1440) label = `New ${Math.floor(diffMin / 60)}h ago`;
  else label = `New ${days}d ago`;
  return { label, overdue: false };
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ----------------------------------------------------------------------------
// Status chip
// ----------------------------------------------------------------------------
function StatusChip({ status }: { status: LeadStatus }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize text-white"
      style={{ background: STAGE_COLORS[status] }}
    >
      {status}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Stats row
// ----------------------------------------------------------------------------
function StatsRow({ summary }: { summary: PipelineData["summary"] }) {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar">
      <div
        className="min-w-[120px] flex-1 rounded-xl px-4 py-3"
        style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow }}
      >
        <p className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Pipeline Value</p>
        <p className="mt-1 text-xl font-bold" style={{ color: T.textPrimary }}>{formatK(summary.totalPipelineValue)}</p>
      </div>

      <div
        className="min-w-[120px] flex-1 rounded-xl px-4 py-3"
        style={{
          background: summary.needsAction > 0 ? T.accentMuted : T.surface,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadow,
        }}
      >
        <p className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Needs Action</p>
        <p
          className="mt-1 text-xl font-bold"
          style={{ color: summary.needsAction > 0 ? T.accent : T.textPrimary }}
        >
          {summary.needsAction}
        </p>
      </div>

      <div
        className="min-w-[120px] flex-1 rounded-xl px-4 py-3"
        style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow }}
      >
        <p className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Win Rate</p>
        <p className="mt-1 text-xl font-bold" style={{ color: T.textPrimary }}>
          {summary.winRate}% <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>/ Won</span>
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stage tabs
// ----------------------------------------------------------------------------
function StageTabs({
  stages,
  activeTab,
  onTabChange,
}: {
  stages: PipelineData["stages"];
  activeTab: LeadStatus;
  onTabChange: (tab: LeadStatus) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
      {STAGE_ORDER.map(({ key, label }) => {
        const count = stages[key]?.count ?? 0;
        const active = key === activeTab;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? T.accent : T.elevated,
              color: active ? "#FFFFFF" : T.textSecondary,
            }}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lead card
// ----------------------------------------------------------------------------
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { label, overdue } = relativeTime(lead);

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer overflow-hidden rounded-xl p-4 transition-colors"
      style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow }}
    >
      {/* Stage left border */}
      <div className="absolute inset-y-0 left-0" style={{ width: 3, background: STAGE_COLORS[lead.status] }} />

      {/* Row 1 */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>{lead.customerName}</h3>
        <StatusChip status={lead.status} />
      </div>

      {/* Row 2 */}
      <p className="mt-1 text-sm capitalize" style={{ color: T.textSecondary }}>
        {lead.projectType} · {lead.address}
      </p>

      {/* Row 3 */}
      <p className="mt-1 text-xs" style={{ color: overdue ? T.warning : T.textMuted }}>
        {label}
      </p>

      {/* Row 4 */}
      <div className="mt-3 flex gap-2">
        <button
          aria-label={`Call ${lead.customerName}`}
          onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${lead.phone}`; }}
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: T.elevated, color: T.textPrimary }}
        >
          <Phone size={20} />
        </button>
        <button
          aria-label={`Text ${lead.customerName}`}
          onClick={(e) => { e.stopPropagation(); window.location.href = `sms:${lead.phone}`; }}
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: T.elevated, color: T.textPrimary }}
        >
          <ChatCircle size={20} />
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lead card list
// ----------------------------------------------------------------------------
function LeadCardList({
  leads,
  stageLabel,
  onSelect,
}: {
  leads: Lead[];
  stageLabel: string;
  onSelect: (lead: Lead) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: T.textMuted }}>
        No leads in {stageLabel} yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} onClick={() => onSelect(lead)} />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lead detail sheet
// ----------------------------------------------------------------------------
function LeadDetailSheet({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  const [convoExpanded, setConvoExpanded] = useState(false);

  useEffect(() => {
    if (!open) setConvoExpanded(false);
  }, [open]);

  if (!open || !lead) return null;

  const lastMessages = lead.conversation.slice(-2);

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div
        className="relative w-full max-h-[75vh] overflow-y-auto rounded-t-2xl"
        style={{
          background: T.surface,
          boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3">
          <div className="mb-2 h-1 w-10 rounded-full" style={{ background: T.border }} />
        </div>

        {/* Close */}
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4"
          style={{ color: T.textMuted }}
        >
          <X size={22} />
        </button>

        <div className="px-5">
          {/* Header */}
          <h2 className="pr-8 text-base font-semibold" style={{ color: T.textPrimary }}>{lead.customerName}</h2>
          <p className="mt-1 text-sm capitalize" style={{ color: T.textSecondary }}>
            {lead.projectType} · {lead.address}
          </p>
          <div className="mt-2">
            <StatusChip status={lead.status} />
          </div>

          {/* Action row */}
          <div className="mt-4 flex gap-3">
            <a
              href={`tel:${lead.phone}`}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white no-underline"
              style={{ background: T.accent }}
            >
              <Phone size={20} weight="fill" /> Call
            </a>
            <a
              href={`sms:${lead.phone}`}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white no-underline"
              style={{ background: T.accent }}
            >
              <ChatCircle size={20} weight="fill" /> Text
            </a>
          </div>

          {/* Contact section */}
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>Contact</p>
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 py-1 text-sm no-underline" style={{ color: T.textPrimary }}>
              <Phone size={16} style={{ color: T.textSecondary }} /> {lead.phone}
            </a>
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 py-1 text-sm no-underline" style={{ color: T.textPrimary }}>
              <EnvelopeSimple size={16} style={{ color: T.textSecondary }} /> {lead.email}
            </a>
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="flex items-center gap-2 text-sm" style={{ color: T.textPrimary }}>
                <MapPin size={16} style={{ color: T.textSecondary }} /> {lead.address}
              </span>
              <a
                href={mapsUrl(lead.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium no-underline"
                style={{ color: T.accent }}
              >
                <MapTrifold size={16} /> Maps
              </a>
            </div>
          </div>

          {/* Job details */}
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>Job Details</p>
            <p className="py-0.5 text-sm capitalize" style={{ color: T.textPrimary }}>
              <span style={{ color: T.textSecondary }}>Project: </span>{lead.projectType}
            </p>
            <p className="py-0.5 text-sm" style={{ color: T.textPrimary }}>
              <span style={{ color: T.textSecondary }}>Zip: </span>{lead.zip}
            </p>
            <p className="py-0.5 text-sm" style={{ color: T.textPrimary }}>
              <span style={{ color: T.textSecondary }}>Notes: </span>{lead.notes}
            </p>

            {/* Conversation */}
            {lead.conversation.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setConvoExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: T.accent }}
                >
                  {convoExpanded ? "Hide conversation" : "Show last messages"}
                  {convoExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                </button>
                {convoExpanded && (
                  <div className="mt-2 flex flex-col gap-2">
                    {lastMessages.map((m, i) => (
                      <div key={i} className="rounded-lg p-2" style={{ background: T.surfaceHover }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>{m.role}</p>
                        <p className="mt-0.5 text-sm" style={{ color: T.textPrimary }}>{m.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="sticky bottom-0 mt-4 px-5 pt-2" style={{ background: T.surface }}>
          <button
            onClick={() => { /* integration point: start quote */ }}
            className="flex h-14 w-full items-center justify-center rounded-xl text-sm font-semibold text-white"
            style={{ background: T.accent }}
          >
            Start Quote
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------
export default function DashboardPage() {
  const [data, setData] = useState<PipelineData>(mockPipelineData as PipelineData);
  const [activeTab, setActiveTab] = useState<LeadStatus>("new");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Integration point — fetch real pipeline data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/pipeline");
        if (!res.ok) return; // keep mock data on failure
        const json = await res.json();
        if (!cancelled && json?.stages && json?.summary) {
          setData(json as PipelineData);
        }
      } catch {
        // keep mock data
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeStage = data.stages[activeTab];
  const activeLeads = useMemo(() => activeStage?.leads ?? [], [activeStage]);
  const activeLabel = STAGE_ORDER.find((s) => s.key === activeTab)?.label ?? "";

  const openLead = (lead: Lead) => {
    setSelectedLead(lead);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-full px-4 pb-6 pt-3" style={{ background: T.bg }}>
      {/* [1] Page header */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: T.textPrimary }}>Lead Pipeline</h1>
          <p className="text-xs" style={{ color: T.textSecondary }}>Sacco Builders</p>
        </div>
        <button className="text-xs" style={{ color: T.textMuted }}>View All</button>
      </header>

      {/* [2] Stats row */}
      <div className="mt-4">
        <StatsRow summary={data.summary} />
      </div>

      {/* [3] Stage tabs */}
      <div className="mt-4">
        <StageTabs stages={data.stages} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* [4] Lead card list */}
      <LeadCardList leads={activeLeads} stageLabel={activeLabel} onSelect={openLead} />

      {/* [5] Lead detail sheet */}
      <LeadDetailSheet lead={selectedLead} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
