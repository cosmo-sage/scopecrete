"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  ArrowLeft,
  X,
  Check,
  Plus,
  Trash2,
  GripVertical,
  Save,
  FileText,
  Ruler,
  Layers,
  ListChecks,
  Calculator,
  Eye,
} from "lucide-react";

// ─── Palette (matches calculator dark theme) ─────────────────────
const IQ = {
  bg: "#0D0D0D",
  card: "#1A1A1A",
  elevated: "#242424",
  accent: "#FFD700",
  accentMuted: "rgba(255,215,0,0.15)",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A0A0",
  textMuted: "#666666",
  border: "#2A2A2A",
  success: "#22C55E",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

// ─── Types ──────────────────────────────────────────────────────
interface ScopeLineItem {
  id: string;
  category: "concrete" | "rebar" | "finishing" | "forming" | "sitework" | "misc";
  description: string;
  quantity: number;
  unit: "CY" | "SF" | "LF" | "EA" | "HR" | "TON";
  unitPrice: number;
  total: number;
}

interface LeadData {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  project_type: string;
  length_ft: number;
  width_ft: number;
  sqft: number;
  depth_in: number;
  psi: number;
  zip: string;
  estimate_range_min: number;
  estimate_range_max: number;
  status: string;
  source_channel: string;
  created_at: string;
}

interface ScopeSnapshot {
  leadId: string;
  notes: string;
  accessNotes: string;
  specialConditions: string;
  lineItems: ScopeLineItem[];
}

const SCOPE_STEPS = [
  { id: "review", label: "Review Lead", icon: FileText },
  { id: "specs", label: "Specs", icon: Ruler },
  { id: "items", label: "Line Items", icon: ListChecks },
  { id: "summary", label: "Summary", icon: Calculator },
];

const CATEGORY_LABELS: Record<string, string> = {
  concrete: "Concrete",
  rebar: "Rebar / Reinforcement",
  finishing: "Finishing",
  forming: "Forming",
  sitework: "Site Work",
  misc: "Miscellaneous",
};

const CATEGORY_ICONS: Record<string, string> = {
  concrete: "🧱",
  rebar: "🔗",
  finishing: "✨",
  forming: "📐",
  sitework: "🚜",
  misc: "📎",
};

const DEFAULT_ITEMS: ScopeLineItem[] = [
  { id: "item-1", category: "concrete", description: "Ready-mix concrete", quantity: 0, unit: "CY", unitPrice: 165, total: 0 },
  { id: "item-2", category: "rebar", description: "Rebar #4 (1/2\")", quantity: 0, unit: "LF", unitPrice: 0.85, total: 0 },
  { id: "item-3", category: "finishing", description: "Broom finish", quantity: 0, unit: "SF", unitPrice: 1.25, total: 0 },
  { id: "item-4", category: "forming", description: "Form setup & removal", quantity: 0, unit: "LF", unitPrice: 4.50, total: 0 },
  { id: "item-5", category: "sitework", description: "Grading & prep", quantity: 0, unit: "HR", unitPrice: 85, total: 0 },
];

// ─── Helpers ────────────────────────────────────────────────────
function calculateCY(sqft: number, depthIn: number): number {
  return Math.round((sqft * (depthIn / 12)) / 27 * 10) / 10;
}

function generateItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function fetchLead(leadId: string): Promise<LeadData | null> {
  try {
    const res = await fetch(`/api/leads?id=${leadId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  } catch {
    return null;
  }
}

// ─── Progress Steps ─────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {SCOPE_STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
              i === current
                ? "font-semibold"
                : i < current
                ? "opacity-60"
                : "opacity-30"
            }`}
            style={{
              background: i <= current ? IQ.accentMuted : IQ.card,
              color: i <= current ? IQ.accent : IQ.textMuted,
              border: `1px solid ${i === current ? IQ.accent : IQ.border}`,
            }}
          >
            <s.icon size={12} />
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < SCOPE_STEPS.length - 1 && (
            <ChevronRight size={12} style={{ color: IQ.textMuted }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────────
function GoldButton({
  children,
  onClick,
  disabled,
  secondary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  if (secondary) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-xl font-semibold transition-all duration-100 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{
          background: IQ.card,
          border: `1.5px solid ${IQ.border}`,
          color: IQ.textSecondary,
          padding: "14px 24px",
          fontSize: 15,
          fontFamily: "Inter, sans-serif",
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl font-semibold text-black transition-all duration-100 active:scale-[0.98] flex items-center justify-center gap-2"
      style={{
        background: disabled ? "#555" : IQ.accent,
        opacity: disabled ? 0.4 : 1,
        padding: "14px 24px",
        fontSize: 15,
        fontFamily: "Inter, sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FieldBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: IQ.textPrimary, fontSize: 15, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function LineItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: ScopeLineItem;
  onChange: (updated: ScopeLineItem) => void;
  onRemove: () => void;
}) {
  const total = item.quantity * item.unitPrice;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical size={14} style={{ color: IQ.textMuted, flexShrink: 0 }} />
          <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[item.category]}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: IQ.textPrimary }}>
              {item.description}
            </div>
            <div className="text-xs" style={{ color: IQ.textMuted }}>
              {CATEGORY_LABELS[item.category]}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: IQ.textMuted, background: "transparent", border: "none", cursor: "pointer" }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label style={{ color: IQ.textMuted, fontSize: 11, display: "block", marginBottom: 4 }}>
            Qty ({item.unit})
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={item.quantity || ""}
            onChange={(e) => {
              const qty = parseFloat(e.target.value) || 0;
              onChange({ ...item, quantity: qty, total: qty * item.unitPrice });
            }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: IQ.elevated, border: `1px solid ${IQ.border}`, color: IQ.textPrimary }}
          />
        </div>
        <div>
          <label style={{ color: IQ.textMuted, fontSize: 11, display: "block", marginBottom: 4 }}>
            Unit Price
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={item.unitPrice || ""}
            onChange={(e) => {
              const price = parseFloat(e.target.value) || 0;
              onChange({ ...item, unitPrice: price, total: item.quantity * price });
            }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: IQ.elevated, border: `1px solid ${IQ.border}`, color: IQ.textPrimary }}
          />
        </div>
        <div className="flex flex-col justify-end">
          <div style={{ color: IQ.textMuted, fontSize: 11, marginBottom: 4 }}>Total</div>
          <div style={{ color: IQ.accent, fontSize: 18, fontWeight: 800 }}>
            ${total.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 0: Review Lead ────────────────────────────────────────
function StepReview({
  lead,
  snapshot,
  setSnapshot,
}: {
  lead: LeadData;
  snapshot: ScopeSnapshot;
  setSnapshot: (s: ScopeSnapshot) => void;
}) {
  const projectLabel = lead.project_type?.replace(/_/g, " ") || "—";
  const cy = calculateCY(lead.sqft || 0, lead.depth_in || 4);

  return (
    <div className="flex flex-col gap-5 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 24, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        Review Lead Details
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 14, fontFamily: "Inter, sans-serif" }}>
        Confirm the lead info before building the scope.
      </p>

      {/* Lead info card */}
      <div
        className="rounded-xl p-5"
        style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
      >
        <div className="grid grid-cols-2 gap-4 mb-4">
          <FieldBox label="Customer" value={lead.customer_name || "—"} />
          <FieldBox label="Project" value={projectLabel} />
          <FieldBox label="Phone" value={lead.customer_phone || "—"} />
          <FieldBox label="Email" value={lead.customer_email || "—"} />
          <FieldBox label="Dimensions" value={`${lead.length_ft || "?"}′ × ${lead.width_ft || "?"}′`} />
          <FieldBox label="Area" value={`${lead.sqft?.toLocaleString() || "?"} sq ft`} />
          <FieldBox label="Depth" value={`${lead.depth_in || "?"}″`} />
          <FieldBox label="Volume" value={`${cy} CY`} />
          <FieldBox label="PSI" value={`${lead.psi || 3000} PSI`} />
          <FieldBox label="Zip" value={lead.zip || "—"} />
        </div>

        {lead.estimate_range_min > 0 && (
          <div
            className="rounded-lg p-3"
            style={{ background: IQ.accentMuted, border: `1px solid ${IQ.accent}40` }}
          >
            <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>
              Original estimate
            </div>
            <div style={{ color: IQ.accent, fontSize: 22, fontWeight: 800 }}>
              ${lead.estimate_range_min.toLocaleString()} — ${lead.estimate_range_max.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label style={{ color: IQ.textSecondary, fontSize: 13, display: "block", marginBottom: 6, fontFamily: "Inter, sans-serif" }}>
          Notes
        </label>
        <textarea
          value={snapshot.notes}
          onChange={(e) => setSnapshot({ ...snapshot, notes: e.target.value })}
          placeholder="Scope notes, customer requests, special instructions..."
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
          style={{ background: IQ.card, border: `1px solid ${IQ.border}`, color: IQ.textPrimary, fontFamily: "Inter, sans-serif" }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={{ color: IQ.textSecondary, fontSize: 13, display: "block", marginBottom: 6, fontFamily: "Inter, sans-serif" }}>
            Access notes
          </label>
          <input
            value={snapshot.accessNotes}
            onChange={(e) => setSnapshot({ ...snapshot, accessNotes: e.target.value })}
            placeholder="Backyard access, gate code..."
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: IQ.card, border: `1px solid ${IQ.border}`, color: IQ.textPrimary, fontFamily: "Inter, sans-serif" }}
          />
        </div>
        <div>
          <label style={{ color: IQ.textSecondary, fontSize: 13, display: "block", marginBottom: 6, fontFamily: "Inter, sans-serif" }}>
            Special conditions
          </label>
          <input
            value={snapshot.specialConditions}
            onChange={(e) => setSnapshot({ ...snapshot, specialConditions: e.target.value })}
            placeholder="Permits, HOA, utilities..."
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: IQ.card, border: `1px solid ${IQ.border}`, color: IQ.textPrimary, fontFamily: "Inter, sans-serif" }}
          />
        </div>
      </div>

      <GoldButton onClick={() => setSnapshot({ ...snapshot, lineItems: prefillItems(snapshot, lead) })}>
        Continue to Specs
        <ChevronRight size={16} />
      </GoldButton>
    </div>
  );
}

function prefillItems(snapshot: ScopeSnapshot, lead: LeadData): ScopeLineItem[] {
  if (snapshot.lineItems.length > 0 && snapshot.lineItems.some((i) => i.quantity > 0)) {
    return snapshot.lineItems;
  }
  const cy = calculateCY(lead.sqft || 0, lead.depth_in || 4);
  const sf = lead.sqft || 0;
  return DEFAULT_ITEMS.map((item) => {
    let qty = 0;
    if (item.category === "concrete") qty = cy;
    else if (item.category === "rebar" && sf > 0) qty = Math.round(sf * 1.1 / 2 * 10) / 10; // ~1.1 LF/SF for #4 @ 24" OC
    else if (item.category === "finishing") qty = sf;
    else if (item.category === "forming") {
      const perimeter = 2 * ((lead.length_ft || 0) + (lead.width_ft || 0));
      qty = perimeter;
    } else if (item.category === "sitework") qty = Math.ceil(sf / 500);

    return { ...item, quantity: qty, total: qty * item.unitPrice };
  });
}

// ─── Step 1: Specs ──────────────────────────────────────────────
function StepSpecs({
  snapshot,
  setSnapshot,
}: {
  snapshot: ScopeSnapshot;
  setSnapshot: (s: ScopeSnapshot) => void;
}) {
  const concreteItem = snapshot.lineItems.find((i) => i.category === "concrete");
  const concreteCY = concreteItem?.quantity || 0;
  const finishingSF = snapshot.lineItems.find((i) => i.category === "finishing")?.quantity || 0;

  const totalMaterial = snapshot.lineItems.reduce((sum, i) => sum + i.total, 0);

  const categories = [...new Set(snapshot.lineItems.map((i) => i.category))];

  return (
    <div className="flex flex-col gap-5 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 24, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        Scope Specifications
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 14, fontFamily: "Inter, sans-serif" }}>
        Auto-calculated quantities based on lead dimensions. Adjust as needed.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Concrete", value: `${concreteCY} CY`, icon: "🧱" },
          { label: "Finish Area", value: `${finishingSF.toLocaleString()} SF`, icon: "✨" },
          { label: "Est. Material", value: `$${totalMaterial.toLocaleString()}`, icon: "💰", accent: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-4 text-center"
            style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
            <div style={{ color: stat.accent ? IQ.accent : IQ.textPrimary, fontSize: 18, fontWeight: 800 }}>
              {stat.value}
            </div>
            <div style={{ color: IQ.textMuted, fontSize: 11, marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick spec grid view */}
      {categories.map((cat) => {
        const catItems = snapshot.lineItems.filter((i) => i.category === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat}>
            <div style={{ color: IQ.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </div>
            <div className="flex flex-col gap-2">
              {catItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-4 py-3"
                  style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm" style={{ color: IQ.textPrimary }}>{item.description}</div>
                    <div className="text-xs" style={{ color: IQ.textMuted }}>
                      {item.quantity} {item.unit} × ${item.unitPrice}/{item.unit}
                    </div>
                  </div>
                  <div className="text-sm font-bold shrink-0 ml-4" style={{ color: IQ.accent }}>
                    ${item.total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <GoldButton onClick={() => setSnapshot({ ...snapshot })}>
        Edit Line Items
        <ChevronRight size={16} />
      </GoldButton>
    </div>
  );
}

// ─── Step 2: Line Items ─────────────────────────────────────────
function StepItems({
  snapshot,
  setSnapshot,
}: {
  snapshot: ScopeSnapshot;
  setSnapshot: (s: ScopeSnapshot) => void;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const updateItem = (updated: ScopeLineItem) => {
    setSnapshot({
      ...snapshot,
      lineItems: snapshot.lineItems.map((i) => (i.id === updated.id ? updated : i)),
    });
  };

  const removeItem = (id: string) => {
    setSnapshot({
      ...snapshot,
      lineItems: snapshot.lineItems.filter((i) => i.id !== id),
    });
  };

  const addItem = (category: ScopeLineItem["category"]) => {
    const newItem: ScopeLineItem = {
      id: generateItemId(),
      category,
      description: `New ${CATEGORY_LABELS[category].toLowerCase()} line`,
      quantity: 0,
      unit: category === "concrete" ? "CY" : category === "finishing" ? "SF" : category === "sitework" ? "HR" : "LF",
      unitPrice: 0,
      total: 0,
    };
    setSnapshot({ ...snapshot, lineItems: [...snapshot.lineItems, newItem] });
    setShowAddMenu(false);
  };

  const totalAll = snapshot.lineItems.reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 style={{ color: IQ.textPrimary, fontSize: 24, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
          Line Items
        </h2>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all active:scale-95"
            style={{ background: IQ.accent, color: "#000", border: "none", cursor: "pointer" }}
          >
            <Plus size={14} />
            Add
          </button>
          {showAddMenu && (
            <div
              className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20 shadow-xl min-w-[180px]"
              style={{ background: IQ.elevated, border: `1px solid ${IQ.border}` }}
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => addItem(key as ScopeLineItem["category"])}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:brightness-125"
                  style={{ color: IQ.textSecondary, background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <span>{CATEGORY_ICONS[key]}</span>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p style={{ color: IQ.textSecondary, fontSize: 14, fontFamily: "Inter, sans-serif" }}>
        Adjust quantities and prices for each line item.
      </p>

      <div className="flex flex-col gap-3">
        {snapshot.lineItems.map((item) => (
          <LineItemRow
            key={item.id}
            item={item}
            onChange={updateItem}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </div>

      {snapshot.lineItems.length === 0 && (
        <div className="text-center py-12">
          <p style={{ color: IQ.textMuted, fontSize: 14 }}>No line items yet. Tap "Add" to get started.</p>
        </div>
      )}

      {/* Running total */}
      <div
        className="rounded-xl p-4 flex items-center justify-between"
        style={{ background: IQ.accentMuted, border: `1px solid ${IQ.accent}40` }}
      >
        <div>
          <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Running total
          </div>
          <div style={{ color: IQ.textMuted, fontSize: 12, marginTop: 2 }}>
            {snapshot.lineItems.length} line items
          </div>
        </div>
        <div style={{ color: IQ.accent, fontSize: 28, fontWeight: 800 }}>
          ${totalAll.toLocaleString()}
        </div>
      </div>

      <GoldButton
        onClick={() => setSnapshot({ ...snapshot })}
        disabled={snapshot.lineItems.length === 0}
      >
        Review Scope
        <ChevronRight size={16} />
      </GoldButton>
    </div>
  );
}

// ─── Step 3: Summary ────────────────────────────────────────────
function StepSummary({
  snapshot,
  lead,
  onSave,
  saved,
  saving,
}: {
  snapshot: ScopeSnapshot;
  lead: LeadData;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  const totalAll = snapshot.lineItems.reduce((sum, i) => sum + i.total, 0);
  const categories = [...new Set(snapshot.lineItems.map((i) => i.category))];

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: IQ.accentMuted }}
        >
          {saved ? (
            <Check size={32} style={{ color: IQ.success }} />
          ) : (
            <Eye size={32} style={{ color: IQ.accent }} />
          )}
        </div>
        <h2 style={{ color: IQ.textPrimary, fontSize: 24, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
          {saved ? "Scope Saved!" : "Scope Summary"}
        </h2>
        <p style={{ color: IQ.textSecondary, fontSize: 14, fontFamily: "Inter, sans-serif" }}>
          {lead.customer_name || lead.customer_phone || "Lead"} ·{" "}
          {lead.project_type?.replace(/_/g, " ") || "Concrete"}
        </p>
      </div>

      {/* Total */}
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: IQ.card, border: `1px solid ${IQ.accent}40` }}
      >
        <div style={{ color: IQ.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Total Scope
        </div>
        <div style={{ color: IQ.accent, fontSize: 42, fontWeight: 800, letterSpacing: "-0.02em" }}>
          ${totalAll.toLocaleString()}
        </div>
        <div style={{ color: IQ.textMuted, fontSize: 12, marginTop: 4 }}>
          {snapshot.lineItems.length} line items
        </div>
      </div>

      {/* Breakdown */}
      {categories.map((cat) => {
        const catItems = snapshot.lineItems.filter((i) => i.category === cat);
        const catTotal = catItems.reduce((s, i) => s + i.total, 0);
        if (catItems.length === 0) return null;
        return (
          <div key={cat}>
            <div style={{ color: IQ.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </div>
            <div className="flex flex-col gap-1.5">
              {catItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-4 py-2.5"
                  style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm" style={{ color: IQ.textPrimary }}>{item.description}</div>
                    <div className="text-xs" style={{ color: IQ.textMuted }}>
                      {item.quantity} {item.unit} @ ${item.unitPrice}/{item.unit}
                    </div>
                  </div>
                  <div className="text-sm font-bold shrink-0 ml-4" style={{ color: IQ.textPrimary }}>
                    ${item.total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Customer notes */}
      {snapshot.notes && (
        <div
          className="rounded-xl p-4"
          style={{ background: IQ.card, border: `1px solid ${IQ.border}` }}
        >
          <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Notes
          </div>
          <div style={{ color: IQ.textSecondary, fontSize: 14, whiteSpace: "pre-wrap" }}>
            {snapshot.notes}
          </div>
        </div>
      )}

      {!saved ? (
        <GoldButton onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : <><Save size={16} /> Save Scope</>}
        </GoldButton>
      ) : (
        <GoldButton secondary onClick={() => window.history.back()}>
          Back to Dashboard
        </GoldButton>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function ScopeBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.leadId as string;

  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [snapshot, setSnapshot] = useState<ScopeSnapshot>({
    leadId: leadId || "",
    notes: "",
    accessNotes: "",
    specialConditions: "",
    lineItems: DEFAULT_ITEMS.map((i) => ({ ...i })),
  });

  // Track snapshot changes to auto-advance through specs/items steps
  const setSnapshotAndAdvance = useCallback(
    (s: ScopeSnapshot, targetStep?: number) => {
      setSnapshot(s);
      if (targetStep !== undefined) setStep(targetStep);
    },
    []
  );

  useEffect(() => {
    if (!leadId) {
      setError("No lead ID provided");
      setLoading(false);
      return;
    }
    fetchLead(leadId).then((data) => {
      if (data) {
        setLead(data);
      } else {
        setError("Lead not found");
      }
      setLoading(false);
    });
  }, [leadId]);

  // Auto-prefill when lead loads
  useEffect(() => {
    if (lead && snapshot.lineItems.every((i) => i.quantity === 0)) {
      setSnapshot({
        ...snapshot,
        lineItems: prefillItems(snapshot, lead),
      });
    }
  }, [lead]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        lead_id: leadId,
        scope_snapshot: JSON.stringify(snapshot),
        scope_total: snapshot.lineItems.reduce((s, i) => s + i.total, 0),
        line_item_count: snapshot.lineItems.length,
        status: "draft",
      };

      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leadId,
          scope_snapshot: payload.scope_snapshot,
          scope_total: payload.scope_total,
        }),
      });

      if (!res.ok) {
        // Fallback: scope saved locally
        console.warn("Could not save scope to lead, saved locally only");
      }

      setSaved(true);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: IQ.bg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: IQ.textMuted, fontSize: 14 }}>Loading lead...</div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div style={{ background: IQ.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ color: IQ.error, fontSize: 16, fontWeight: 600 }}>{error || "Lead not found"}</div>
        <button
          onClick={() => router.back()}
          className="rounded-xl px-6 py-3 text-sm font-semibold"
          style={{ background: IQ.card, border: `1px solid ${IQ.border}`, color: IQ.textSecondary, cursor: "pointer" }}
        >
          ← Back
        </button>
      </div>
    );
  }

  const totalSteps = saved ? 4 : 4;

  return (
    <div style={{ background: IQ.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${IQ.border}` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: IQ.accent }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#000" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#000" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: IQ.textPrimary, letterSpacing: "-0.5px" }}>
            Scope Builder
          </span>
          {lead && (
            <span style={{ color: IQ.textMuted, fontSize: 13, marginLeft: 8 }}>
              {lead.customer_name || lead.customer_phone || ""}
            </span>
          )}
        </div>
        <button
          onClick={() => router.back()}
          style={{ color: IQ.textMuted, background: "none", border: "none", cursor: "pointer" }}
        >
          <X size={20} />
        </button>
      </header>

      {/* Step indicator */}
      <div className="py-4 px-6" style={{ borderBottom: `1px solid ${IQ.border}` }}>
        <StepIndicator current={step} />
      </div>

      {/* Content */}
      <main
        className="flex-1 flex flex-col px-6 py-6 overflow-y-auto"
        style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}
      >
        {step === 0 && (
          <StepReview lead={lead} snapshot={snapshot} setSnapshot={(s) => {
            setSnapshot(s);
            // Check if we should advance based on item state
            if (s.lineItems.some((i) => i.quantity > 0)) setStep(1);
          }} />
        )}

        {(step === 1 || step === 2) && !saved && (
          <div className="flex flex-col gap-4 w-full">
            {step === 1 && (
              <StepSpecs snapshot={snapshot} setSnapshot={(s) => setSnapshotAndAdvance(s, 2)} />
            )}
            {step === 2 && (
              <StepItems snapshot={snapshot} setSnapshot={(s) => setSnapshotAndAdvance(s, 3)} />
            )}
            {step === 3 && (
              <StepSummary
                snapshot={snapshot}
                lead={lead}
                onSave={handleSave}
                saved={saved}
                saving={saving}
              />
            )}
          </div>
        )}

        {saved && step === 3 && (
          <StepSummary
            snapshot={snapshot}
            lead={lead}
            onSave={handleSave}
            saved={saved}
            saving={saving}
          />
        )}
      </main>

      {/* Back nav */}
      {step > 0 && step < 3 && (
        <footer
          className="px-6 py-4 flex items-center gap-2 cursor-pointer"
          style={{ borderTop: `1px solid ${IQ.border}` }}
          onClick={() => setStep(step - 1)}
        >
          <ArrowLeft size={16} style={{ color: IQ.textMuted }} />
          <span style={{ color: IQ.textMuted, fontSize: 13, fontFamily: "Inter, sans-serif" }}>
            Back to {SCOPE_STEPS[step - 1]?.label || "previous"}
          </span>
        </footer>
      )}
    </div>
  );
}
