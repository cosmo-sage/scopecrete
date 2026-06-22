"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Phone,
  ChatCircle,
  MapPin,
  Clock,
  X,
  CaretRight,
  Envelope,
  CurrencyDollar,
  ChartLineUp,
  Target,
  User,
} from "@phosphor-icons/react";

// ─── Design Tokens ──────────────────────────────────────────────
const D = {
  bg: "#F5F0E8",       // Warm bone — field-ready
  surface: "#FFFFFF",   // Clean white cards
  surfaceHover: "#F0EBE3",
  elevated: "#E8E2D9",
  accent: "#E85D04",    // Construction orange
  accentMuted: "rgba(232,93,4,0.12)",
  textPrimary: "#1A1A1A",   // Near-black charcoal
  textSecondary: "#5C5C5C",
  textMuted: "#9CA3AF",
  border: "#D4CEC6",    // Warm light gray
  borderLight: "#E8E2D9",
  success: "#16A34A",   // Deep green
  warning: "#D97706",   // Amber
  error: "#DC2626",     // Brick red
  info: "#2563EB",      // Blue
} as const;

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: "New",       color: "#2563EB", bg: "#2563EB" },
  contacted: { label: "Contacted", color: "#D97706", bg: "#D97706" },
  qualified: { label: "Qualified", color: "#7C3AED", bg: "#7C3AED" },
  won:       { label: "Won",       color: "#16A34A", bg: "#16A34A" },
  lost:      { label: "Lost",      color: "#DC2626", bg: "#DC2626" },
};

const STAGE_ORDER = ["new", "contacted", "qualified", "won", "lost"];

// quoted stage reserved for future API support

// ─── Types ──────────────────────────────────────────────────────
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
  status: string;
  createdAt: string;
  lastActivity: string;
  notes: string;
  conversation: Array<{ role: string; text: string; timestamp: string }>;
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

interface StageData {
  count: number;
  totalValue: number;
  avgDaysInStage: number;
  leads: Lead[];
}

interface PipelineData {
  stages: Record<string, StageData>;
  summary: {
    totalPipelineValue: number;
    needsAction: number;
    winRate: number;
  };
}

// ─── Mock Data ──────────────────────────────────────────────────
const MOCK_LEADS: Lead[] = [
  {
    id: "lead-001", customerName: "Marcus Thibodaux", phone: "(225) 555-0147", email: "marcus.t@example.com",
    projectType: "driveway", address: "4412 Government St", zip: "70802",
    estimateMin: 7200, estimateMax: 8900, status: "new",
    createdAt: "2026-06-21T08:00:00Z", lastActivity: "2026-06-21T08:30:00Z",
    notes: "Wants stamped concrete, broom finish backup.",
    conversation: [
      { role: "dusty", text: "Hey, I'm Dusty. Tell me about your concrete project.", timestamp: "2026-06-21T08:00:00Z" },
      { role: "customer", text: "I need a new driveway, about 600 square feet", timestamp: "2026-06-21T08:00:00Z" },
    ],
    estimateDetails: { sqft: 600, depthIn: 4, psi: 3000, conditions: "flat grade, easy access", cy: 7.4, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-002", customerName: "Sophia Broussard", phone: "(225) 555-0293", email: "sophia.b@example.com",
    projectType: "patio", address: "8813 Highland Rd", zip: "70810",
    estimateMin: 4800, estimateMax: 6100, status: "contacted",
    createdAt: "2026-06-19T14:00:00Z", lastActivity: "2026-06-20T09:00:00Z",
    notes: "Called twice, left voicemail. Interested in 4000psi upgrade.",
    conversation: [],
    estimateDetails: { sqft: 400, depthIn: 4, psi: 3000, conditions: "sloped grade", cy: 4.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-003", customerName: "Derek Sonnier", phone: "(225) 555-0384", email: "d.sonnier@example.com",
    projectType: "foundation", address: "2201 Chippewa St", zip: "70805",
    estimateMin: 11200, estimateMax: 13800, status: "qualified",
    createdAt: "2026-06-18T11:00:00Z", lastActivity: "2026-06-20T16:30:00Z",
    notes: "Building a detached garage. Needs permit-ready breakdown.",
    conversation: [],
    estimateDetails: { sqft: 900, depthIn: 6, psi: 4000, conditions: "requires permit", cy: 16.7, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-004", customerName: "Amara Diallo", phone: "(225) 555-0512", email: "amara.d@example.com",
    projectType: "driveway", address: "7722 Mickens Rd", zip: "70791",
    estimateMin: 6800, estimateMax: 8400, status: "won",
    createdAt: "2026-06-15T09:00:00Z", lastActivity: "2026-06-20T14:00:00Z",
    notes: "Signed contract for $8,100. Scheduled June 3.",
    conversation: [],
    estimateDetails: { sqft: 560, depthIn: 4, psi: 3000, conditions: "flat", cy: 6.9, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-005", customerName: "Leon Cravins", phone: "(225) 555-0627", email: "leon.cravins@example.com",
    projectType: "slab", address: "1401 Florida Blvd", zip: "70802",
    estimateMin: 3200, estimateMax: 4100, status: "lost",
    createdAt: "2026-06-10T15:30:00Z", lastActivity: "2026-06-12T10:00:00Z",
    notes: "Went with lower bid. Keep in nurture list.",
    conversation: [],
    estimateDetails: { sqft: 280, depthIn: 4, psi: 3000, conditions: "standard", cy: 3.5, breakdown: {}, isBallpark: false },
  },
  {
    id: "lead-006", customerName: "Fatima Osei", phone: "(225) 555-0734", email: "fatima.o@example.com",
    projectType: "pool deck", address: "3304 Victoria Dr", zip: "70811",
    estimateMin: 9400, estimateMax: 11800, status: "new",
    createdAt: "2026-06-21T10:00:00Z", lastActivity: "2026-06-21T10:15:00Z",
    notes: "Interested in stained concrete and channel drains.",
    conversation: [],
    estimateDetails: { sqft: 800, depthIn: 4, psi: 3000, conditions: "sloped", cy: 9.9, breakdown: {}, isBallpark: false },
  },
];

// ─── Helpers ────────────────────────────────────────────────────
function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toLocaleString()}`;
}

function getOverdue(lead: Lead): boolean {
  if (lead.status === "new") {
    const age = Date.now() - new Date(lead.createdAt).getTime();
    return age > 24 * 60 * 60 * 1000;
  }
  if (lead.status === "contacted") {
    const sinceActivity = Date.now() - new Date(lead.lastActivity).getTime();
    return sinceActivity > 72 * 60 * 60 * 1000;
  }
  return false;
}

// ─── Loading Skeleton ──────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse" style={{ background: D.surface, border: `1px solid ${D.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div className="h-4 w-3/4 rounded mb-3" style={{ background: D.elevated }} />
      <div className="h-3 w-1/2 rounded mb-2" style={{ background: D.elevated }} />
      <div className="h-3 w-1/3 rounded" style={{ background: D.elevated }} />
    </div>
  );
}

// ─── Stats Row ─────────────────────────────────────────────────
function StatsRow({ summary, stages }: { summary: PipelineData["summary"]; stages: Record<string, StageData> }) {
  const stats = [
    {
      label: "Pipeline Value",
      value: formatCurrency(summary.totalPipelineValue),
      icon: CurrencyDollar,
      accent: false,
    },
    {
      label: "Needs Action",
      value: String(summary.needsAction),
      icon: Target,
      accent: summary.needsAction > 0,
    },
    {
      label: "Win Rate",
      value: `${summary.winRate}%`,
      sublabel: "Won",
      icon: ChartLineUp,
      accent: false,
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex-1 min-w-[100px] rounded-xl p-3"
          style={{ background: D.surface, border: `1px solid ${D.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <stat.icon size={14} color={stat.accent ? D.accent : D.textMuted} />
            <span className="text-[10px] font-medium" style={{ color: D.textMuted }}>
              {stat.label}
            </span>
          </div>
          <div className="text-xl font-bold" style={{ color: stat.accent ? D.accent : D.textPrimary }}>
            {stat.value}
          </div>
          {stat.sublabel && (
            <div className="text-[10px] mt-0.5" style={{ color: D.textMuted }}>
              {stat.sublabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Stage Tabs ─────────────────────────────────────────────────
function StageTabs({
  stages,
  activeStage,
  onStageChange,
}: {
  stages: Record<string, StageData>;
  activeStage: string;
  onStageChange: (s: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {STAGE_ORDER.map((stage) => {
        const cfg = STAGE_CONFIG[stage] || { label: stage, color: D.textMuted, bg: "transparent" };
        const count = stages[stage]?.count || MOCK_LEADS.filter((l) => l.status === stage).length;
        const isActive = activeStage === stage;
        return (
          <button
            key={stage}
            onClick={() => onStageChange(stage)}
            className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95"
            style={{
              background: isActive ? D.accent : "transparent",
              color: isActive ? "#FFFFFF" : D.textSecondary,
              border: `1px solid ${isActive ? D.accent : D.border}`,
            }}
          >
            {cfg.label} ({count})
          </button>
        );
      })}
    </div>
  );
}

// ─── Lead Card ──────────────────────────────────────────────────
function LeadCard({
  lead,
  onClick,
}: {
  lead: Lead;
  onClick: () => void;
}) {
  const cfg = STAGE_CONFIG[lead.status] || { color: D.textMuted, bg: "transparent" };
  const overdue = getOverdue(lead);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 transition-all active:scale-[0.99]"
      style={{
        background: D.surface,
        border: `1px solid ${D.border}`,
        borderLeft: `3px solid ${cfg.color}`,
        cursor: "pointer",
      }}
    >
      {/* Row 1: Name + status chip */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold truncate mr-2" style={{ color: D.textPrimary }}>
          {lead.customerName}
        </span>
        <span
          className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: cfg.color, color: "#FFFFFF" }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Row 2: Project type · address */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs truncate" style={{ color: D.textSecondary }}>
          {lead.projectType} · {lead.address}
        </span>
      </div>

      {/* Row 3: Time */}
      <div className="flex items-center gap-1 mb-3">
        <Clock size={10} color={overdue ? D.error : D.textMuted} />
        <span className="text-[10px]" style={{ color: overdue ? D.error : D.textMuted }}>
          {overdue ? "Overdue" : "New"} {timeAgo(lead.createdAt)}
        </span>
      </div>

      {/* Row 4: Action icons */}
      <div className="flex gap-2">
        <a
          href={`tel:${lead.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center rounded-lg transition-colors active:scale-95"
          style={{
            width: 40,
            height: 40,
            background: D.elevated,
            border: `1px solid ${D.border}`,
            color: D.textSecondary,
          }}
        >
          <Phone size={15} />
        </a>
        <a
          href={`sms:${lead.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center rounded-lg transition-colors active:scale-95"
          style={{
            width: 40,
            height: 40,
            background: D.elevated,
            border: `1px solid ${D.border}`,
            color: D.textSecondary,
          }}
        >
          <ChatCircle size={15} />
        </a>
      </div>
    </button>
  );
}

// ─── Lead Detail Sheet ─────────────────────────────────────────
function LeadDetailSheet({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !lead) return null;

  const cfg = STAGE_CONFIG[lead.status] || { label: lead.status, color: D.textMuted };
  const midEstimate = Math.round((lead.estimateMin + lead.estimateMax) / 2);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative rounded-t-2xl max-h-[75vh] overflow-y-auto"
        style={{ background: D.surface, zIndex: 1 }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0" style={{ background: D.surface }}>
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: D.textMuted }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: D.elevated, border: "none", cursor: "pointer", color: D.textMuted }}
        >
          <X size={16} />
        </button>

        <div className="px-5 pb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: D.textPrimary }}>
                {lead.customerName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs" style={{ color: D.textSecondary }}>
                  {lead.projectType}
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: cfg.color, color: "#FFFFFF" }}
                >
                  {cfg.label}
                </span>
              </div>
            </div>
          </div>

          {/* Action row — full width buttons */}
          <div className="flex gap-3 mb-6">
            <a
              href={`tel:${lead.phone}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ background: D.accent, color: "#FFFFFF" }}
            >
              <Phone size={16} weight="fill" />
              Call
            </a>
            <a
              href={`sms:${lead.phone}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ background: D.accent, color: "#FFFFFF" }}
            >
              <ChatCircle size={16} weight="fill" />
              Text
            </a>
          </div>

          {/* Contact info */}
          <div className="space-y-3 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: D.textMuted }}>
              Contact
            </h3>
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: D.elevated, border: `1px solid ${D.border}` }}
            >
              <Phone size={14} color={D.accent} />
              <span className="text-sm" style={{ color: D.textPrimary }}>{lead.phone}</span>
            </a>
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: D.elevated, border: `1px solid ${D.border}` }}
            >
              <Envelope size={14} color={D.accent} />
              <span className="text-sm truncate" style={{ color: D.textPrimary }}>{lead.email}</span>
            </a>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: D.elevated, border: `1px solid ${D.border}` }}
            >
              <MapPin size={14} color={D.accent} />
              <span className="text-sm truncate flex-1" style={{ color: D.textPrimary }}>{lead.address}</span>
              <CaretRight size={12} color={D.textMuted} />
            </a>
          </div>

          {/* Job details */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: D.textMuted }}>
              Job Details
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg px-3 py-2" style={{ background: D.elevated }}>
                <div className="text-[10px]" style={{ color: D.textMuted }}>Estimate</div>
                <div className="text-sm font-bold" style={{ color: D.accent }}>
                  ${midEstimate.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: D.elevated }}>
                <div className="text-[10px]" style={{ color: D.textMuted }}>Area</div>
                <div className="text-sm font-bold" style={{ color: D.textPrimary }}>
                  {lead.estimateDetails.sqft} sqft
                </div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: D.elevated }}>
                <div className="text-[10px]" style={{ color: D.textMuted }}>Depth</div>
                <div className="text-sm font-bold" style={{ color: D.textPrimary }}>
                  {lead.estimateDetails.depthIn}"
                </div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: D.elevated }}>
                <div className="text-[10px]" style={{ color: D.textMuted }}>PSI</div>
                <div className="text-sm font-bold" style={{ color: D.textPrimary }}>
                  {lead.estimateDetails.psi}
                </div>
              </div>
            </div>
            {lead.notes && (
              <div className="rounded-lg px-3 py-2.5" style={{ background: D.elevated, border: `1px solid ${D.border}` }}>
                <div className="text-[10px] mb-1" style={{ color: D.textMuted }}>Notes</div>
                <p className="text-sm leading-relaxed" style={{ color: D.textSecondary }}>{lead.notes}</p>
              </div>
            )}
          </div>

          {/* Conversation */}
          {lead.conversation.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: D.textMuted }}>
                Conversation
              </h3>
              <div className="space-y-2">
                {lead.conversation.slice(-2).map((msg, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                    style={{
                      background: msg.role === "customer" ? D.accentMuted : D.elevated,
                      border: `1px solid ${D.border}`,
                      color: msg.role === "customer" ? D.textPrimary : D.textSecondary,
                    }}
                  >
                    <span className="font-semibold text-[10px]" style={{ color: msg.role === "customer" ? D.accent : D.textMuted }}>
                      {msg.role === "customer" ? lead.customerName : "Dusty"}:
                    </span>{" "}
                    {msg.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sticky CTA */}
          <div className="sticky bottom-0 pt-2" style={{ background: D.surface }}>
            <button
              className="w-full rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.98]"
              style={{ background: D.accent, color: "#FFFFFF", border: "none", cursor: "pointer" }}
              onClick={() => {
                // Integration point: Start Quote
                // Navigate to /scope-builder/${lead.id}
                window.location.href = `/scope-builder/${lead.id}`;
              }}
            >
              Start Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function MobileDashboardPage() {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState("new");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    // Try the real API first
    fetch("/api/dashboard/pipeline?org_id=61e26b09-da88-4c9f-bd0c-a47054b86234")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setPipeline(data);
          setLoading(false);
        } else {
          // Fallback to computed mock data
          fallbackToMock();
        }
      })
      .catch(() => fallbackToMock());
  }, []);

  function fallbackToMock() {
    const grouped: Record<string, Lead[]> = {};
    for (const s of STAGE_ORDER) grouped[s] = [];
    for (const lead of MOCK_LEADS) {
      if (!grouped[lead.status]) grouped[lead.status] = [];
      grouped[lead.status].push(lead);
    }
    const stages: Record<string, StageData> = {};
    let totalPipelineValue = 0;
    let needsAction = 0;
    let wonCount = 0;
    let lostCount = 0;

    for (const stage of STAGE_ORDER) {
      const leads = grouped[stage] || [];
      const totalValue = leads.reduce((s, l) => s + (l.estimateMin + l.estimateMax) / 2, 0);
      const avgDays = leads.length > 0
        ? leads.reduce((s, l) => s + (Date.now() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24), 0) / leads.length
        : 0;
      stages[stage] = { count: leads.length, totalValue, avgDaysInStage: avgDays, leads };

      if (stage !== "won" && stage !== "lost") totalPipelineValue += totalValue;
      if (stage === "won") wonCount = leads.length;
      if (stage === "lost") lostCount = leads.length;

      for (const lead of leads) {
        if (getOverdue(lead)) needsAction++;
      }
    }

    const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

    setPipeline({
      stages,
      summary: { totalPipelineValue, needsAction, winRate },
    });
    setLoading(false);
  }

  const openSheet = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setSheetOpen(true);
  }, []);

  const filteredLeads = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.stages[activeStage]?.leads || [];
  }, [pipeline, activeStage]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4" style={{ background: D.bg, minHeight: "100%" }}>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-3 animate-pulse" style={{ background: D.surface, border: `1px solid ${D.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div className="h-3 w-2/3 rounded mb-2" style={{ background: D.elevated }} />
              <div className="h-5 w-1/2 rounded" style={{ background: D.elevated }} />
            </div>
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ background: D.bg, minHeight: "100%" }}>
      {/* Page Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: D.textPrimary }}>
            Lead Pipeline
          </h1>
          <p className="text-xs mt-0.5" style={{ color: D.textMuted }}>
            Sacco Builders
          </p>
        </div>
        <button
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: D.textMuted, border: `1px solid ${D.border}`, background: D.surface, cursor: "pointer" }}
        >
          View All
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 pb-4">
        <StatsRow summary={pipeline?.summary || { totalPipelineValue: 0, needsAction: 0, winRate: 0 }} stages={pipeline?.stages || {}} />
      </div>

      {/* Stage Tabs */}
      <div className="px-4 pb-3">
        <StageTabs
          stages={pipeline?.stages || {}}
          activeStage={activeStage}
          onStageChange={setActiveStage}
        />
      </div>

      {/* Lead Cards */}
      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <User size={32} color={D.textMuted} />
            <p className="text-sm mt-3" style={{ color: D.textMuted }}>
              No leads in {STAGE_CONFIG[activeStage]?.label || activeStage} yet
            </p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => openSheet(lead)} />
          ))
        )}
      </div>

      {/* Detail Sheet */}
      <LeadDetailSheet
        lead={selectedLead}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}