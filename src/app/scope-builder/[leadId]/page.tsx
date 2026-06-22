"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  X,
  Plus,
  Trash,
  Calculator,
  Check,
  Ruler,
  CurrencyDollar,
  FileText,
  Copy,
  CaretDown,
  MapPin,
  Phone,
  Envelope,
} from "@phosphor-icons/react";

// ─── Design Tokens — Direction A (Light Field-Ready) ──────────
const D = {
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
  error: "#DC2626",
  shadow: "0 1px 3px rgba(0,0,0,0.08)",
} as const;

// ─── Types ──────────────────────────────────────────────────────
interface ScopeItem {
  id: string;
  category: "concrete" | "rebar" | "finishing" | "forming" | "sitework" | "stained" | "misc";
  description: string;
  quantity: number;
  unit: "CY" | "SF" | "LF" | "EA" | "HR";
  unitPrice: number;
  notes: string;
}

interface LeadInfo {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  projectType: string;
  address: string;
  zip: string;
  lengthFt: number;
  widthFt: number;
  sqft: number;
  depthIn: number;
  psi: number;
  estimateMin: number;
  estimateMax: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  concrete: "Concrete", rebar: "Rebar", finishing: "Finishing",
  forming: "Forming", sitework: "Site Work", stained: "Stained Finish", misc: "Misc",
};

const CATEGORY_ICONS: Record<string, string> = {
  concrete: "🧱", rebar: "🔗", finishing: "✨",
  forming: "📐", sitework: "🚜", stained: "🎨", misc: "📎",
};

const UNITS: ScopeItem["unit"][] = ["CY", "SF", "LF", "EA", "HR"];

// ─── Helpers ────────────────────────────────────────────────────
function calcCY(sqft: number, depthIn: number): number {
  return Math.round((sqft * (depthIn / 12)) / 27 * 10) / 10;
}

function generateId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Mock Leads ─────────────────────────────────────────────────
const MOCK_LEADS: LeadInfo[] = [
  { id: "lead-001", customerName: "Marcus Thibodaux", phone: "(225) 555-0147", email: "marcus.t@example.com",
    projectType: "Driveway", address: "4412 Government St", zip: "70802",
    lengthFt: 24, widthFt: 25, sqft: 600, depthIn: 4, psi: 3000, estimateMin: 7200, estimateMax: 8900 },
  { id: "lead-003", customerName: "Derek Sonnier", phone: "(225) 555-0384", email: "d.sonnier@example.com",
    projectType: "Foundation", address: "2201 Chippewa St", zip: "70805",
    lengthFt: 30, widthFt: 30, sqft: 900, depthIn: 6, psi: 4000, estimateMin: 11200, estimateMax: 13800 },
  { id: "lead-006", customerName: "Fatima Osei", phone: "(225) 555-0734", email: "fatima.o@example.com",
    projectType: "Pool Deck", address: "3304 Victoria Dr", zip: "70811",
    lengthFt: 40, widthFt: 20, sqft: 800, depthIn: 4, psi: 3000, estimateMin: 9400, estimateMax: 11800 },
];

function getDefaultItems(lead: LeadInfo): ScopeItem[] {
  const cy = calcCY(lead.sqft, lead.depthIn);
  const perimeter = 2 * (lead.lengthFt + lead.widthFt);
  const rebarLF = Math.round(lead.sqft * 1.1 / 2 * 10) / 10;

  const items: ScopeItem[] = [
    { id: generateId(), category: "concrete", description: "Ready-mix concrete", quantity: cy, unit: "CY", unitPrice: 165, notes: "" },
    { id: generateId(), category: "rebar", description: `Rebar #4 (1/2") @ 24" OC`, quantity: rebarLF, unit: "LF", unitPrice: 0.85, notes: "" },
    { id: generateId(), category: "finishing", description: "Broom finish", quantity: lead.sqft, unit: "SF", unitPrice: 1.25, notes: "" },
    { id: generateId(), category: "forming", description: "Form setup & removal", quantity: perimeter, unit: "LF", unitPrice: 4.50, notes: "" },
    { id: generateId(), category: "sitework", description: "Grading & site prep", quantity: Math.ceil(lead.sqft / 500), unit: "HR", unitPrice: 85, notes: "" },
  ];

  if (lead.projectType === "Foundation") {
    items[0].unitPrice = 175;
    items[1].unitPrice = 0.90;
    items[2] = { id: generateId(), category: "forming", description: "Foundation form setup", quantity: perimeter, unit: "LF", unitPrice: 5.00, notes: "" };
  }

  return items;
}

// ─── Components ─────────────────────────────────────────────────
function Input({ value, onChange, suffix, className, ...props }: {
  value: number | string; onChange: (v: number) => void; suffix?: string; className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <div className="relative inline-flex items-center">
      <input
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`text-center font-bold rounded-lg outline-none ${className || ""}`}
        style={{ background: D.elevated, border: `1px solid ${D.border}`, color: D.textPrimary, padding: "8px", width: 72, fontSize: 15 }}
        {...props}
      />
      {suffix && (
        <span className="text-xs font-medium ml-1.5" style={{ color: D.textMuted }}>{suffix}</span>
      )}
    </div>
  );
}

function GoldButton({ children, onClick, disabled, secondary }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean;
}) {
  if (secondary) {
    return (
      <button onClick={onClick} disabled={disabled}
        className="w-full rounded-xl font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2 py-3 text-sm"
        style={{ background: D.surface, border: `1.5px solid ${D.border}`, color: D.textSecondary, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
        {children}
      </button>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full rounded-xl font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2 py-3.5 text-sm"
      style={{ background: disabled ? "#ccc" : D.accent, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, border: "none" }}>
      {children}
    </button>
  );
}

// ─── Scope Item Card ───────────────────────────────────────────
function ScopeItemCard({ item, onChange, onDelete }: {
  item: ScopeItem; onChange: (i: ScopeItem) => void; onDelete: () => void;
}) {
  const total = item.quantity * item.unitPrice;

  return (
    <div className="rounded-xl p-4" style={{ background: D.surface, border: `1px solid ${D.border}`, borderLeft: `3px solid ${D.accent}`, boxShadow: D.shadow }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[item.category]}</span>
          <span className="text-xs" style={{ color: D.textMuted }}>{CATEGORY_LABELS[item.category]}</span>
        </div>
        <button onClick={onDelete} className="p-1.5 rounded-lg transition-colors"
          style={{ color: D.textMuted, background: "transparent", border: "none", cursor: "pointer" }}>
          <Trash size={14} />
        </button>
      </div>

      {/* Description */}
      <input value={item.description} onChange={(e) => onChange({ ...item, description: e.target.value })}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
        style={{ background: D.bg, border: `1px solid ${D.borderLight}`, color: D.textPrimary }}
        placeholder="Item description"
      />

      {/* Qty, Unit, Unit Price */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        <div>
          <label className="text-[10px] font-medium mb-1 block" style={{ color: D.textMuted }}>Qty</label>
          <input type="number" inputMode="decimal" value={item.quantity || ""}
            onChange={(e) => {
              const q = parseFloat(e.target.value) || 0;
              onChange({ ...item, quantity: q });
            }}
            className="w-full rounded-lg px-3 py-2 text-sm font-bold outline-none"
            style={{ background: D.elevated, border: `1px solid ${D.border}`, color: D.textPrimary }}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium mb-1 block" style={{ color: D.textMuted }}>Unit</label>
          <select value={item.unit} onChange={(e) => onChange({ ...item, unit: e.target.value as ScopeItem["unit"] })}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
            style={{ background: D.elevated, border: `1px solid ${D.border}`, color: D.textPrimary }}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium mb-1 block" style={{ color: D.textMuted }}>$/Unit</label>
          <input type="number" inputMode="decimal" value={item.unitPrice || ""}
            onChange={(e) => {
              const p = parseFloat(e.target.value) || 0;
              onChange({ ...item, unitPrice: p });
            }}
            className="w-full rounded-lg px-3 py-2 text-sm font-bold outline-none"
            style={{ background: D.elevated, border: `1px solid ${D.border}`, color: D.textPrimary }}
          />
        </div>
      </div>

      {/* Total + Notes */}
      <div className="flex items-center justify-between mt-2">
        <input value={item.notes} onChange={(e) => onChange({ ...item, notes: e.target.value })}
          className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none mr-3"
          style={{ background: "transparent", border: `1px dashed ${D.borderLight}`, color: D.textMuted }}
          placeholder="Notes (optional)"
        />
        <div className="text-right shrink-0">
          <div className="text-xs" style={{ color: D.textMuted }}>Line total</div>
          <div className="text-base font-bold" style={{ color: D.accent }}>{formatCurrency(total)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function ScopeBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.leadId as string;

  const [leadInfoOpen, setLeadInfoOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Find lead from mock data
  const lead = useMemo(() => MOCK_LEADS.find((l) => l.id === leadId) || null, [leadId]);

  const [items, setItems] = useState<ScopeItem[]>([]);

  // Initialize items when lead loads
  useMemo(() => {
    if (lead && items.length === 0) {
      setItems(getDefaultItems(lead));
    }
  }, [lead]);

  const updateItem = (updated: ScopeItem) => {
    setItems(items.map((i) => (i.id === updated.id ? updated : i)));
  };

  const deleteItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const addItem = (category: ScopeItem["category"]) => {
    const newItem: ScopeItem = {
      id: generateId(), category, description: `New ${CATEGORY_LABELS[category].toLowerCase()}`,
      quantity: 0, unit: "CY" as ScopeItem["unit"], unitPrice: 0, notes: "",
    };
    setItems([...items, newItem]);
    setAddSheetOpen(false);
  };

  const totalCost = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [items]);
  const costPerSqft = lead && lead.sqft > 0 ? totalCost / lead.sqft : 0;

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    setSaved(true);
  };

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ background: D.bg, minHeight: "100dvh", color: D.textMuted }}>
        <FileText size={40} />
        <p className="mt-4 text-sm font-medium">Lead not found</p>
        <button onClick={() => router.back()} className="mt-4 text-sm font-semibold" style={{ color: D.accent, background: "none", border: "none", cursor: "pointer" }}>
          ← Go back
        </button>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ background: D.bg, minHeight: "100dvh" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ background: D.accentMuted }}>
          <Check size={32} color={D.success} />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: D.textPrimary }}>Scope saved!</h2>
        <p className="text-sm mb-8" style={{ color: D.textSecondary }}>{formatCurrency(totalCost)} — {items.length} items</p>
        <GoldButton onClick={() => window.history.back()}>Back to Lead</GoldButton>
      </div>
    );
  }

  const addCategories: { key: ScopeItem["category"]; icon: string; label: string }[] = [
    { key: "concrete", icon: "🧱", label: "Concrete" },
    { key: "rebar", icon: "🔗", label: "Rebar" },
    { key: "finishing", icon: "✨", label: "Finishing" },
    { key: "forming", icon: "📐", label: "Forming" },
    { key: "sitework", icon: "🚜", label: "Site Work" },
    { key: "stained", icon: "🎨", label: "Stained Finish" },
    { key: "misc", icon: "📎", label: "Misc" },
  ];

  return (
    <div style={{ background: D.bg, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${D.border}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: D.textMuted, padding: 4 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-sm font-bold" style={{ color: D.textPrimary }}>Scope Builder</h1>
            <p className="text-[10px]" style={{ color: D.textMuted }}>{lead.customerName} · {lead.projectType}</p>
          </div>
        </div>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: D.textMuted, padding: 4 }}>
          <X size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ maxWidth: 600, width: "100%", margin: "0 auto", paddingBottom: 140 }}>
        {/* Lead Info — collapsible */}
        <div className="rounded-xl" style={{ background: D.surface, border: `1px solid ${D.border}`, boxShadow: D.shadow }}>
          <button onClick={() => setLeadInfoOpen(!leadInfoOpen)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ background: "none", border: "none" }}>
            <div className="flex items-center gap-2">
              <CurrencyDollar size={14} color={D.accent} />
              <span className="text-xs font-semibold" style={{ color: D.textPrimary }}>Lead Details</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: D.accent }}>
                {lead.estimateMin > 0 ? `${formatCurrency(lead.estimateMin)}–${formatCurrency(lead.estimateMax)}` : "—"}
              </span>
              <CaretDown size={12} color={D.textMuted} style={{ transform: leadInfoOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
            </div>
          </button>
          {leadInfoOpen && (
            <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: D.borderLight }}>
              <div className="grid grid-cols-2 gap-3 pt-3">
                {[
                  { label: "Customer", value: lead.customerName },
                  { label: "Project", value: lead.projectType },
                  { label: "Dimensions", value: `${lead.lengthFt}′ × ${lead.widthFt}′` },
                  { label: "Area", value: `${lead.sqft} sq ft` },
                  { label: "Depth", value: `${lead.depthIn}″` },
                  { label: "Volume", value: `${calcCY(lead.sqft, lead.depthIn)} CY` },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="text-[10px] font-medium" style={{ color: D.textMuted }}>{row.label}</div>
                    <div className="text-xs font-semibold" style={{ color: D.textPrimary }}>{row.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ background: D.elevated, color: D.accent }}>
                  <Phone size={12} /> {lead.phone}
                </a>
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ background: D.elevated, color: D.accent }}>
                  <Envelope size={12} /> Email
                </a>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ background: D.elevated, color: D.accent }}>
                  <MapPin size={12} /> Maps
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Scope Items Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: D.textPrimary }}>
            Scope Items
            <span className="text-xs font-normal ml-1.5" style={{ color: D.textMuted }}>({items.length})</span>
          </h2>
          <button onClick={() => setAddSheetOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{ background: D.accent, color: "#FFFFFF", border: "none", cursor: "pointer" }}>
            <Plus size={12} weight="bold" />
            Add Item
          </button>
        </div>

        {/* Items */}
        {items.map((item) => (
          <ScopeItemCard key={item.id} item={item} onChange={updateItem} onDelete={() => deleteItem(item.id)} />
        ))}

        {items.length === 0 && (
          <div className="text-center py-12">
            <Calculator size={32} color={D.textMuted} />
            <p className="text-sm mt-3" style={{ color: D.textMuted }}>No scope items yet. Tap "Add Item" to start.</p>
          </div>
        )}
      </main>

      {/* Sticky Footer */}
      <footer className="fixed bottom-0 left-0 right-0 px-4 py-3" style={{
        background: D.surface,
        borderTop: `1px solid ${D.border}`,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
        zIndex: 30,
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}>
        <div className="flex items-center justify-between mb-3" style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <div>
            <div className="text-[10px] font-medium" style={{ color: D.textMuted }}>
              {items.length} item{items.length !== 1 ? "s" : ""}
              {lead?.sqft ? ` · ${formatCurrency(costPerSqft)}/sqft` : ""}
            </div>
            <div className="text-xl font-bold" style={{ color: D.accent }}>
              {formatCurrency(totalCost)}
            </div>
          </div>
          <GoldButton onClick={handleSave} disabled={items.length === 0 || saving}>
            {saving ? "Saving..." : <><Check size={16} weight="bold" /> Save Scope</>}
          </GoldButton>
        </div>
      </footer>

      {/* Add Item Sheet */}
      {addSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setAddSheetOpen(false)} />
          <div className="relative rounded-t-2xl px-4 py-5" style={{ background: D.surface, zIndex: 1 }}>
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: D.textMuted }} />
            </div>
            <h3 className="text-sm font-bold mb-4" style={{ color: D.textPrimary }}>Add Scope Item</h3>
            <div className="grid grid-cols-2 gap-3">
              {addCategories.map((cat) => (
                <button key={cat.key} onClick={() => addItem(cat.key)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all active:scale-95"
                  style={{ background: D.elevated, border: `1px solid ${D.border}`, cursor: "pointer" }}>
                  <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  <span className="text-sm font-medium" style={{ color: D.textPrimary }}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}