"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Tag,
  Check,
} from "lucide-react";
import { AK, MOCK_LEADS, type LeadStatus } from "@/lib/contractor-data";

const STATUS_CONFIG: Record<LeadStatus, { label: string; bg: string; color: string }> = {
  new: { label: "New", bg: "rgba(59,130,246,0.15)", color: "#3B82F6" },
  contacted: { label: "Contacted", bg: "rgba(245,158,11,0.15)", color: "#F59E0B" },
  qualified: { label: "Qualified", bg: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
  won: { label: "Won", bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
  lost: { label: "Lost", bg: "rgba(239,68,68,0.15)", color: "#EF4444" },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const lead = MOCK_LEADS.find((l) => l.id === params.id);

  const [status, setStatus] = useState<LeadStatus>(lead?.status || "new");
  const [statusOpen, setStatusOpen] = useState(false);
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: AK.bg }}>
        <p style={{ color: AK.textMuted }}>Lead not found.</p>
        <Link href="/dashboard/leads" className="text-sm font-semibold" style={{ color: AK.accent }}>
          ← Back to leads
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[status];

  const handleStatusChange = (s: LeadStatus) => {
    setStatus(s);
    setStatusOpen(false);
  };

  const handleFeedbackSubmit = () => {
    if (feedbackVote) setFeedbackSubmitted(true);
  };

  return (
    <div className="min-h-full p-6 lg:p-8" style={{ background: AK.bg }}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="mt-1 p-2 rounded-lg transition-colors hover:brightness-110 shrink-0"
          style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
        >
          <ArrowLeft size={16} style={{ color: AK.textSecondary }} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: AK.textPrimary }}>
                {lead.customerName}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: AK.textSecondary }}
                >
                  <Phone size={13} />
                  {lead.phone}
                </a>
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: AK.textSecondary }}
                >
                  <Mail size={13} />
                  {lead.email}
                </a>
                <span className="flex items-center gap-1.5 text-sm" style={{ color: AK.textMuted }}>
                  <Clock size={13} />
                  {timeAgo(lead.createdAt)}
                </span>
              </div>
            </div>

            {/* Status dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusOpen(!statusOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.color}40` }}
              >
                {statusCfg.label}
                {statusOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {statusOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-10 shadow-xl min-w-[140px]"
                  style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
                >
                  {(["new", "contacted", "qualified", "won", "lost"] as LeadStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:brightness-110"
                      style={{ color: STATUS_CONFIG[s].color, background: status === s ? STATUS_CONFIG[s].bg : "transparent" }}
                    >
                      {status === s && <Check size={12} />}
                      {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — conversation + estimate */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Conversation */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
          >
            <div
              className="flex items-center gap-2 px-5 py-4"
              style={{ borderBottom: `1px solid ${AK.border}` }}
            >
              <MessageSquare size={15} style={{ color: AK.accent }} />
              <h2 className="text-sm font-semibold" style={{ color: AK.textPrimary }}>
                Conversation
              </h2>
            </div>
            <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
              {lead.conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={
                      msg.role === "customer"
                        ? { background: AK.accent, color: "#0B0F1A", fontWeight: 600, borderRadius: "16px 16px 4px 16px" }
                        : { background: AK.elevated, color: AK.textPrimary, border: `1px solid ${AK.border}`, borderRadius: "16px 16px 16px 4px" }
                    }
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estimate details */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
          >
            <button
              className="w-full flex items-center justify-between px-5 py-4"
              onClick={() => setShowEstimate(!showEstimate)}
              style={{ borderBottom: showEstimate ? `1px solid ${AK.border}` : "none" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: AK.accentMuted }}
                >
                  <span style={{ fontSize: 11, color: AK.accent, fontWeight: 800 }}>$</span>
                </div>
                <h2 className="text-sm font-semibold" style={{ color: AK.textPrimary }}>
                  Estimate Breakdown
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-bold"
                  style={{ color: AK.accent }}
                >
                  ${lead.estimateMin.toLocaleString()}–${lead.estimateMax.toLocaleString()}
                </span>
                {showEstimate ? (
                  <ChevronUp size={15} style={{ color: AK.textMuted }} />
                ) : (
                  <ChevronDown size={15} style={{ color: AK.textMuted }} />
                )}
              </div>
            </button>

            {showEstimate && (
              <div className="p-5 space-y-3">
                {[
                  { label: "Project type", value: lead.projectType },
                  { label: "Area", value: `${lead.estimateDetails.sqft} sq ft` },
                  { label: "Depth", value: `${lead.estimateDetails.depthIn}"` },
                  { label: "PSI grade", value: `${lead.estimateDetails.psi} PSI` },
                  { label: "Conditions", value: lead.estimateDetails.conditions },
                  { label: "Volume", value: `${lead.estimateDetails.cy} CY` },
                  { label: "Estimate type", value: lead.estimateDetails.isBallpark ? "Ballpark" : "Firm" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: AK.textMuted }}>
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold capitalize" style={{ color: AK.textPrimary }}>
                      {row.value}
                    </span>
                  </div>
                ))}
                <div
                  className="pt-3 mt-2 flex justify-end"
                  style={{ borderTop: `1px solid ${AK.border}` }}
                >
                  <button
                    className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                    style={{ background: AK.elevated, color: AK.textSecondary }}
                  >
                    <Edit size={12} />
                    Edit estimate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right — info + feedback */}
        <div className="flex flex-col gap-4">
          {/* Customer info */}
          <div
            className="rounded-xl p-5"
            style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: AK.textPrimary }}>
              Details
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: AK.textMuted }} />
                <div>
                  <div className="text-sm" style={{ color: AK.textPrimary }}>
                    {lead.address}
                  </div>
                  <div className="text-xs" style={{ color: AK.textMuted }}>
                    {lead.zip}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="shrink-0" style={{ color: AK.textMuted }} />
                <a href={`tel:${lead.phone}`} className="text-sm" style={{ color: AK.accent }}>
                  {lead.phone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="shrink-0" style={{ color: AK.textMuted }} />
                <a href={`mailto:${lead.email}`} className="text-sm truncate" style={{ color: AK.accent }}>
                  {lead.email}
                </a>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-5">
              <a
                href={`tel:${lead.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: AK.accent, color: "#0B0F1A" }}
              >
                <Phone size={14} />
                Call
              </a>
              <a
                href={`mailto:${lead.email}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: AK.elevated, color: AK.textSecondary, border: `1px solid ${AK.border}` }}
              >
                <Mail size={14} />
                Email
              </a>
            </div>
          </div>

          {/* Feedback widget */}
          <div
            className="rounded-xl p-5"
            style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
          >
            <h2 className="text-sm font-semibold mb-1" style={{ color: AK.textPrimary }}>
              Was this estimate accurate?
            </h2>
            <p className="text-xs mb-4" style={{ color: AK.textMuted }}>
              Your feedback improves the model
            </p>

            {!feedbackSubmitted ? (
              <>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setFeedbackVote("up")}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      background: feedbackVote === "up" ? "rgba(34,197,94,0.15)" : AK.elevated,
                      color: feedbackVote === "up" ? AK.success : AK.textMuted,
                      border: `1px solid ${feedbackVote === "up" ? AK.success : AK.border}`,
                    }}
                  >
                    <ThumbsUp size={15} />
                    Accurate
                  </button>
                  <button
                    onClick={() => setFeedbackVote("down")}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    style={{
                      background: feedbackVote === "down" ? "rgba(239,68,68,0.15)" : AK.elevated,
                      color: feedbackVote === "down" ? AK.error : AK.textMuted,
                      border: `1px solid ${feedbackVote === "down" ? AK.error : AK.border}`,
                    }}
                  >
                    <ThumbsDown size={15} />
                    Off
                  </button>
                </div>
                <textarea
                  placeholder="What was wrong? (optional)"
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none mb-3"
                  style={{
                    background: AK.elevated,
                    border: `1px solid ${AK.border}`,
                    color: AK.textPrimary,
                    fontFamily: "Inter, sans-serif",
                  }}
                />
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackVote}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                  style={{ background: feedbackVote ? AK.accent : AK.elevated, color: feedbackVote ? "#0B0F1A" : AK.textMuted }}
                >
                  Submit feedback
                </button>
              </>
            ) : (
              <div
                className="flex items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold"
                style={{ background: "rgba(34,197,94,0.15)", color: AK.success }}
              >
                <Check size={16} />
                Feedback submitted — thanks!
              </div>
            )}
          </div>

          {/* Notes */}
          <div
            className="rounded-xl p-5"
            style={{ background: AK.surface, border: `1px solid ${AK.border}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: AK.textPrimary }}>
                Notes
              </h2>
              <Tag size={13} style={{ color: AK.textMuted }} />
            </div>
            {lead.notes ? (
              <p className="text-sm leading-relaxed" style={{ color: AK.textSecondary }}>
                {lead.notes}
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: AK.textMuted }}>
                No notes yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}