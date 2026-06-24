"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Phone,
  ChatCircle,
  MapPin,
  Clock,
  Envelope,
  ArrowLeft,
  FileText,
  DotsThree,
} from "@phosphor-icons/react";
import { DA, STAGE_CONFIG } from "@/lib/design-tokens";
import { formatCurrency } from "@/lib/utils";
import DustyDrawer from "@/components/dashboard/DustyDrawer";
import ToolboxDrawer from "@/components/dashboard/ToolboxDrawer";

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
  sqft?: number;
  depth_in?: number;
  psi?: number;
  scope_of_work?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
}

interface ConversationMessage {
  role: "customer" | "dusty" | "system";
  text: string;
  timestamp: string;
}

// ─── Mock conversation ─────────────────────────────────────────
const MOCK_CONVERSATION: ConversationMessage[] = [
  {
    role: "dusty",
    text: "Hi there! Saw your request come in. Can you tell me about the project?",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    role: "customer",
    text: "Hey yeah I need a new driveway. About 2,400 sq ft.",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3 * 60 * 1000).toISOString(),
  },
  {
    role: "dusty",
    text: "Got it. For a driveway that size I'd recommend 4\" depth with rebar grid. Want me to put together a quote?",
    timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
  },
  {
    role: "customer",
    text: "Yes please! Also can you send photos of the materials you'd use?",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Helpers ───────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ─── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse p-4 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl" style={{ background: DA.elevated }} />
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "calls" | "emails" | "notes">("chat");
  const [dustyOpen, setDustyOpen] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setLead(data);
        setLoading(false);
      })
      .catch(() => {
        // Use mock data as fallback
        setLead({
          id: leadId,
          customer_name: "Marcus Thibodaux",
          customer_phone: "(225) 555-0177",
          project_type: "Driveway",
          address: "4412 Government St, Baton Rouge, LA",
          status: "new",
          estimate_range_min: 4200,
          estimate_range_max: 5200,
          sqft: 2400,
          depth_in: 4,
          psi: 3000,
          scope_of_work: "Driveway repair - partial, 4\" depth with rebar",
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        });
        setLoading(false);
      });
  }, [leadId]);

  if (loading) {
    return (
      <div style={{ background: DA.bg, minHeight: "100%" }}>
        <Skeleton />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ background: DA.bg, minHeight: "100%" }}>
        <FileText size={40} color={DA.textMuted} />
        <p className="text-sm font-medium mt-4" style={{ color: DA.textMuted }}>
          Lead not found
        </p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm font-semibold"
          style={{ color: DA.accent, background: "none", border: "none", cursor: "pointer" }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  const name =
    lead.customer_name ||
    [lead.contact?.first_name, lead.contact?.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";
  const phone = lead.customer_phone || lead.contact?.phone || "";
  const email = lead.contact?.email || "";
  const address = lead.address || lead.contact?.address || "";
  const cfg = STAGE_CONFIG[lead.status] || { label: lead.status, color: DA.textMuted };
  const estimate = lead.estimate_range_max || lead.estimate_range_min || 0;
  const midEstimate = lead.estimate_range_min && lead.estimate_range_max
    ? Math.round((lead.estimate_range_min + lead.estimate_range_max) / 2)
    : estimate;
  const overdue =
    lead.status === "new" &&
    Date.now() - new Date(lead.created_at).getTime() > 24 * 60 * 60 * 1000;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const TABS = [
    { key: "chat", label: "Chat" },
    { key: "calls", label: "Calls" },
    { key: "emails", label: "Emails" },
    { key: "notes", label: "Notes" },
  ] as const;

  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
      {/* Status bar */}
      <div className="h-11 px-6 flex items-end pb-1 justify-between flex-shrink-0">
        <span className="text-xs font-semibold" style={{ color: "rgba(0,0,0,0.4)" }}>
          {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">📶</span>
          <span className="text-xs">🔋</span>
        </div>
      </div>

      {/* Header with back */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: DA.accent }}
          >
            S
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setToolboxOpen(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
          >
            🧰
          </button>
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
          >
            <DotsThree size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Customer header card */}
        <div
          className="rounded-xl p-4"
          style={{ background: DA.surface, border: `1px solid ${DA.border}`, boxShadow: DA.shadow }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ background: DA.accent }}
            >
              {getInitials(name)}
            </div>
            <div className="flex-1">
              <div className="font-bold text-base" style={{ color: DA.textPrimary }}>
                {name}
              </div>
              <div className="text-sm" style={{ color: DA.textSecondary }}>
                {phone}
              </div>
              <div className="text-sm" style={{ color: DA.textSecondary }}>
                {lead.project_type}
                {address ? ` · ${address}` : ""}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: cfg.color, color: "#fff" }}
                >
                  {cfg.label}
                </span>
                {overdue && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: DA.error, color: "#fff" }}
                  >
                    ⚠️ Overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats grid */}
          <div
            className="grid grid-cols-3 gap-2 mt-4 pt-3"
            style={{ borderTop: `1px solid ${DA.border}` }}
          >
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: DA.textPrimary }}>
                {midEstimate > 0 ? formatCurrency(midEstimate) : "—"}
              </div>
              <div className="text-[10px]" style={{ color: DA.textMuted }}>
                Est. Value
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: DA.textPrimary }}>
                {lead.sqft?.toLocaleString() || "—"}
              </div>
              <div className="text-[10px]" style={{ color: DA.textMuted }}>
                Sq Ft
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: DA.textPrimary }}>
                {lead.depth_in ? `${lead.depth_in}"` : "—"}
              </div>
              <div className="text-[10px]" style={{ color: DA.textMuted }}>
                Depth
              </div>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => router.push(`/scope-builder/${lead.id}`)}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: DA.accent, border: "none", cursor: "pointer" }}
          >
            📐 Build Scope
          </button>
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
            style={{ background: DA.elevated, color: DA.textPrimary, border: `1px solid ${DA.border}`, cursor: "pointer" }}
          >
            📞 Call
          </a>
        </div>

        {/* Scope summary pill */}
        {lead.scope_of_work && (
          <div
            className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: DA.textMuted }}>
                Scope
              </div>
              <div className="text-sm font-medium mt-0.5" style={{ color: DA.textPrimary }}>
                {lead.scope_of_work}
              </div>
            </div>
            {estimate > 0 && (
              <div className="text-right">
                <div className="text-sm font-bold" style={{ color: DA.accent }}>
                  {formatCurrency(estimate)}
                </div>
                <div className="text-[10px]" style={{ color: DA.textMuted }}>
                  Total
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact quick actions */}
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: DA.elevated, border: `1px solid ${DA.border}`, color: DA.accent }}
            >
              <Phone size={12} /> {phone}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: DA.elevated, border: `1px solid ${DA.border}`, color: DA.accent }}
            >
              <Envelope size={12} /> Email
            </a>
          )}
          {address && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: DA.elevated, border: `1px solid ${DA.border}`, color: DA.accent }}
            >
              <MapPin size={12} /> Maps
            </a>
          )}
        </div>

        {/* History tabs */}
        <div>
          <div
            className="flex items-center gap-4 pb-2 mb-3"
            style={{ borderBottom: `1px solid ${DA.border}` }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="text-xs font-semibold pb-1 transition-all"
                style={{
                  color: activeTab === tab.key ? DA.accent : DA.textMuted,
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab.key ? `2px solid ${DA.accent}` : "2px solid transparent",
                  cursor: "pointer",
                  paddingBottom: 2,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          {activeTab === "chat" && (
            <div className="space-y-3">
              {MOCK_CONVERSATION.map((msg, i) => (
                <div
                  key={i}
                  className="flex items-end gap-2"
                  style={{ flexDirection: msg.role === "customer" ? "row-reverse" : "row" }}
                >
                  {msg.role !== "customer" && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ background: DA.accent }}
                    >
                      S
                    </div>
                  )}
                  <div
                    className="max-w-[78%] rounded-2xl px-3 py-2 text-xs"
                    style={{
                      background: msg.role === "customer" ? DA.accent : "#2D2D2D",
                      color: "white",
                      borderRadius:
                        msg.role === "customer"
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                    }}
                  >
                    {msg.text}
                    <div
                      className="text-[10px] mt-1 text-right"
                      style={{
                        color: msg.role === "customer" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {timeAgo(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "calls" && (
            <div className="text-center py-8">
              <Phone size={28} color={DA.textMuted} className="mx-auto" />
              <p className="text-sm mt-2" style={{ color: DA.textMuted }}>
                No call history
              </p>
            </div>
          )}

          {activeTab === "emails" && (
            <div className="text-center py-8">
              <Envelope size={28} color={DA.textMuted} className="mx-auto" />
              <p className="text-sm mt-2" style={{ color: DA.textMuted }}>
                No emails yet
              </p>
            </div>
          )}

          {activeTab === "notes" && (
            <div
              className="rounded-xl p-4"
              style={{ background: DA.surface, border: `1px solid ${DA.border}` }}
            >
              <div className="text-sm" style={{ color: DA.textSecondary }}>
                {lead.notes || "No notes yet. Tap to add a note..."}
              </div>
            </div>
          )}
        </div>
      </div>

      <ToolboxDrawer
        open={toolboxOpen}
        onClose={() => setToolboxOpen(false)}
        leadId={lead.id}
      />
      <DustyDrawer
        open={dustyOpen}
        onClose={() => setDustyOpen(false)}
        context={{ leadId: lead.id, leadName: name }}
      />
    </div>
  );
}
