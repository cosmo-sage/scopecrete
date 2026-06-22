"use client"

import { useMemo, useState } from "react"
import {
  Trash,
  Plus,
  MapPin,
  ShareNetwork,
  ChatCircle,
  Check,
  X,
} from "@phosphor-icons/react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SectionType =
  | "driveway"
  | "patio"
  | "sidewalk"
  | "foundation"
  | "pool_deck"
  | "parking_lot"
  | "slab"
  | "other"

type Psi = 3000 | 4000 | 5000

interface Section {
  id: string
  name: string
  sectionType: SectionType
  lengthFt: number
  widthFt: number
  depthIn: number
  psi: Psi
  reinforced: boolean
  pumpNeeded: boolean
}

interface CostResult {
  cy: number
  concrete_cost: number
  rebar_cost: number
  forming_cost: number
  finishing_cost: number
  pump_cost: number
  subtotal: number
}

interface ScopeTabProps {
  jobId?: string
  leadId?: string
  customerName?: string
  projectType?: string
  address?: string
}

// ---------------------------------------------------------------------------
// Design tokens (Direction A — Light Field-Ready)
// ---------------------------------------------------------------------------

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
  cardShadow: "0 1px 3px rgba(0,0,0,0.08)",
}

// ---------------------------------------------------------------------------
// Section type metadata + smart defaults
// ---------------------------------------------------------------------------

const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: "driveway", label: "Driveway" },
  { value: "patio", label: "Patio" },
  { value: "sidewalk", label: "Sidewalk" },
  { value: "foundation", label: "Foundation" },
  { value: "pool_deck", label: "Pool Deck" },
  { value: "parking_lot", label: "Parking Lot" },
  { value: "slab", label: "Slab" },
  { value: "other", label: "Other" },
]

const SECTION_LABEL: Record<SectionType, string> = SECTION_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<SectionType, string>,
)

const TYPE_DEFAULTS: Record<
  SectionType,
  { depthIn: number; psi: Psi; reinforced: boolean; pumpNeeded: boolean }
> = {
  driveway: { depthIn: 4, psi: 3000, reinforced: true, pumpNeeded: false },
  patio: { depthIn: 4, psi: 3000, reinforced: false, pumpNeeded: false },
  sidewalk: { depthIn: 4, psi: 3000, reinforced: false, pumpNeeded: false },
  foundation: { depthIn: 6, psi: 4000, reinforced: true, pumpNeeded: false },
  pool_deck: { depthIn: 4, psi: 4000, reinforced: true, pumpNeeded: false },
  parking_lot: { depthIn: 6, psi: 4000, reinforced: true, pumpNeeded: true },
  slab: { depthIn: 4, psi: 3000, reinforced: false, pumpNeeded: false },
  other: { depthIn: 4, psi: 3000, reinforced: false, pumpNeeded: false },
}

// ---------------------------------------------------------------------------
// Mock calculation (MVP)
// ---------------------------------------------------------------------------

// CY formula: (length_ft × width_ft × depth_in) ÷ 324  →  expressed as ft³ ÷ 27
const calculateCY = (length: number, width: number, depthIn: number): number => {
  return (length * width * (depthIn / 12)) / 27
}

// TODO: replace with fetch('https://scopecrete.ai/bid-engine/calculate')
const estimateSection = (section: Section): CostResult => {
  const cy = calculateCY(section.lengthFt, section.widthFt, section.depthIn)
  const concreteRate = 165 // $ per CY delivered (Baton Rouge market, 3000psi)
  const psiMultiplier = section.psi === 4000 ? 1.12 : section.psi === 5000 ? 1.25 : 1.0
  const rebarRate = section.reinforced ? 2.5 : 0 // $ per sqft
  const pumpRate = section.pumpNeeded ? 450 : 0 // flat fee
  const formingRate = 8.5 // $ per linear ft of edge
  const perimeter = (section.lengthFt + section.widthFt) * 2

  const concrete_cost = cy * concreteRate * psiMultiplier
  const rebar_cost = section.reinforced ? section.lengthFt * section.widthFt * rebarRate : 0
  const forming_cost = perimeter * formingRate
  const finishing_cost = section.lengthFt * section.widthFt * 3.5
  const pump_cost = pumpRate
  const subtotal =
    concrete_cost + rebar_cost + forming_cost + finishing_cost + pump_cost

  return { cy, concrete_cost, rebar_cost, forming_cost, finishing_cost, pump_cost, subtotal }
}

const INITIAL_SECTIONS: Section[] = [
  {
    id: "sec-1",
    name: "Front Driveway",
    sectionType: "driveway",
    lengthFt: 40,
    widthFt: 12,
    depthIn: 4,
    psi: 4000,
    reinforced: true,
    pumpNeeded: false,
  },
  {
    id: "sec-2",
    name: "Rear Patio",
    sectionType: "patio",
    lengthFt: 20,
    widthFt: 16,
    depthIn: 4,
    psi: 3000,
    reinforced: false,
    pumpNeeded: true,
  },
]

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

// ---------------------------------------------------------------------------
// ScopeTab (default export)
// ---------------------------------------------------------------------------

export default function ScopeTab({
  customerName = "Marcus Thibodaux",
  projectType = "Residential Driveway",
  address = "4218 Highland Rd, Baton Rouge, LA 70808",
}: ScopeTabProps) {
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS)
  const [markupPct, setMarkupPct] = useState(30)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { sectionCosts, subtotal, total, totalSqft, pricePerSqft } = useMemo(() => {
    let sub = 0
    const costs = sections.map((sec) => {
      const c = estimateSection(sec)
      sub += c.subtotal
      return c
    })
    const tot = sub * (1 + markupPct / 100)
    const sqft = sections.reduce((s, sec) => s + sec.lengthFt * sec.widthFt, 0)
    return {
      sectionCosts: costs,
      subtotal: sub,
      total: tot,
      totalSqft: sqft,
      pricePerSqft: sqft > 0 ? tot / sqft : 0,
    }
  }, [sections, markupPct])

  const updateSection = (id: string, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const deleteSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const addSection = (type: SectionType) => {
    const d = TYPE_DEFAULTS[type]
    const count = sections.filter((s) => s.sectionType === type).length
    const baseName = SECTION_LABEL[type]
    setSections((prev) => [
      ...prev,
      {
        id: `sec-${Date.now()}`,
        name: count > 0 ? `${baseName} ${count + 1}` : baseName,
        sectionType: type,
        lengthFt: 20,
        widthFt: 12,
        depthIn: d.depthIn,
        psi: d.psi,
        reinforced: d.reinforced,
        pumpNeeded: d.pumpNeeded,
      },
    ])
    setPickerOpen(false)
  }

  const openMaps = () => {
    window.open(
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address),
      "_blank",
    )
  }

  return (
    <div className="min-h-full pb-56" style={{ backgroundColor: T.bg }}>
      <div className="mx-auto w-full max-w-md px-4 pt-4">
        <ProjectHeader
          customerName={customerName}
          projectType={projectType}
          address={address}
          totalSqft={totalSqft}
          onMaps={openMaps}
        />

        <div className="mt-4 flex flex-col gap-3">
          {sections.map((section, i) => (
            <SectionCard
              key={section.id}
              section={section}
              costs={sectionCosts[i]}
              onUpdate={(patch) => updateSection(section.id, patch)}
              onDelete={() => deleteSection(section.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-sm font-medium transition-colors"
          style={{ borderColor: T.border, color: T.textSecondary }}
        >
          <Plus size={18} weight="bold" />
          Add Section
        </button>
      </div>

      <CostSummaryBar
        total={total}
        subtotal={subtotal}
        pricePerSqft={pricePerSqft}
        markupPct={markupPct}
        onMarkupChange={setMarkupPct}
        onSendQuote={() => console.log("[v0] Send Quote — integration point", { total })}
        onDusty={() => console.log("[v0] Open Dusty assistant — integration point")}
      />

      {pickerOpen && (
        <SectionTypePicker onSelect={addSection} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProjectHeader
// ---------------------------------------------------------------------------

function ProjectHeader({
  customerName,
  projectType,
  address,
  totalSqft,
  onMaps,
}: {
  customerName: string
  projectType: string
  address: string
  totalSqft: number
  onMaps: () => void
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: T.surface, borderColor: T.border, boxShadow: T.cardShadow }}
    >
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-base font-semibold" style={{ color: T.textPrimary }}>
          {customerName}
        </h1>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: T.elevated, color: T.textSecondary }}
        >
          {projectType}
        </span>
      </div>

      <button
        type="button"
        onClick={onMaps}
        className="mt-2 flex items-center gap-1 text-left text-xs"
        style={{ color: T.textSecondary }}
      >
        <MapPin size={14} weight="fill" style={{ color: T.accent }} />
        <span className="underline-offset-2 hover:underline">{address}</span>
      </button>

      <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: T.borderLight }}>
        <span className="text-xs" style={{ color: T.textMuted }}>
          Total area
        </span>
        <span className="text-sm font-medium" style={{ color: T.textPrimary }}>
          {totalSqft.toLocaleString()} sqft total
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

const DEPTH_OPTIONS = [4, 5, 6]
const PSI_OPTIONS: Psi[] = [3000, 4000, 5000]

function SectionCard({
  section,
  costs,
  onUpdate,
  onDelete,
}: {
  section: Section
  costs: CostResult
  onUpdate: (patch: Partial<Section>) => void
  onDelete: () => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const numInput = (value: number, onChange: (n: number) => void, label: string) => (
    <div className="flex flex-col items-center">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-11 w-16 rounded-lg border text-center text-sm font-medium outline-none focus:border-[#E85D04]"
        style={{ backgroundColor: T.bg, borderColor: T.border, color: T.textPrimary }}
      />
      <span className="mt-1 text-xs" style={{ color: T.textMuted }}>
        {label}
      </span>
    </div>
  )

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: T.surface, borderColor: T.border, boxShadow: T.cardShadow }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <input
            autoFocus
            value={section.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm font-semibold outline-none focus:border-[#E85D04]"
            style={{ backgroundColor: T.bg, borderColor: T.border, color: T.textPrimary }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
            style={{ color: T.textPrimary }}
          >
            {section.name}
          </button>
        )}
        <button
          type="button"
          aria-label="Delete section"
          onClick={() => setConfirmDelete(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#F0EBE3]"
          style={{ color: T.textSecondary }}
        >
          <Trash size={18} />
        </button>
      </div>

      <div className="my-3 border-t" style={{ borderColor: T.borderLight }} />

      {/* Dimensions */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-start gap-2">
          {numInput(section.lengthFt, (n) => onUpdate({ lengthFt: n }), "ft (L)")}
          <span className="mt-3 text-sm" style={{ color: T.textMuted }}>
            &times;
          </span>
          {numInput(section.widthFt, (n) => onUpdate({ widthFt: n }), "ft (W)")}
          <span className="mt-3 text-sm" style={{ color: T.textMuted }}>
            &times;
          </span>
          <div className="flex flex-col items-center">
            <select
              value={section.depthIn}
              onChange={(e) => onUpdate({ depthIn: Number(e.target.value) })}
              className="h-11 w-16 rounded-lg border text-center text-sm font-medium outline-none focus:border-[#E85D04]"
              style={{ backgroundColor: T.bg, borderColor: T.border, color: T.textPrimary }}
            >
              {DEPTH_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}&quot;
                </option>
              ))}
            </select>
            <span className="mt-1 text-xs" style={{ color: T.textMuted }}>
              in (D)
            </span>
          </div>
        </div>
        <div className="pb-5 text-sm font-medium" style={{ color: T.accent }}>
          CY: {costs.cy.toFixed(1)}
        </div>
      </div>

      {/* PSI */}
      <div className="mt-4">
        <span className="text-xs" style={{ color: T.textSecondary }}>
          PSI strength
        </span>
        <div className="mt-1 flex gap-2">
          {PSI_OPTIONS.map((psi) => {
            const active = section.psi === psi
            return (
              <button
                key={psi}
                type="button"
                onClick={() => onUpdate({ psi })}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? T.accent : T.elevated,
                  color: active ? "#FFFFFF" : T.textSecondary,
                }}
              >
                {psi}
              </button>
            )
          })}
        </div>
      </div>

      {/* Options */}
      <div className="mt-4 flex flex-col gap-2">
        <CheckboxRow
          label="Reinforced (rebar)"
          checked={section.reinforced}
          onChange={(v) => onUpdate({ reinforced: v })}
        />
        <CheckboxRow
          label="Pump truck needed"
          checked={section.pumpNeeded}
          onChange={(v) => onUpdate({ pumpNeeded: v })}
        />
      </div>

      {/* Subtotal */}
      <div className="mt-3 border-t pt-3 text-right" style={{ borderColor: T.borderLight }}>
        <span className="text-sm font-semibold" style={{ color: T.textPrimary }}>
          Subtotal: {fmtMoney(costs.subtotal)}
        </span>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border p-3"
          style={{ backgroundColor: T.bg, borderColor: T.border }}
        >
          <span className="text-sm" style={{ color: T.textPrimary }}>
            Delete this section?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ backgroundColor: T.elevated, color: T.textPrimary }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: T.error }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-left"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md border transition-colors"
        style={{
          backgroundColor: checked ? T.accent : T.surface,
          borderColor: checked ? T.accent : T.border,
        }}
      >
        {checked && <Check size={14} weight="bold" color="#FFFFFF" />}
      </span>
      <span className="text-sm" style={{ color: T.textPrimary }}>
        {label}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// SectionTypePicker
// ---------------------------------------------------------------------------

function SectionTypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: SectionType) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(26,26,26,0.4)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-t-2xl p-4 pb-8"
        style={{ backgroundColor: T.surface }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: T.textPrimary }}>
            Add a section
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.elevated, color: T.textSecondary }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {SECTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onSelect(t.value)}
              className="rounded-xl px-3 py-3 text-sm font-medium transition-colors"
              style={{ backgroundColor: T.elevated, color: T.textSecondary }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CostSummaryBar
// ---------------------------------------------------------------------------

function CostSummaryBar({
  total,
  subtotal,
  pricePerSqft,
  markupPct,
  onMarkupChange,
  onSendQuote,
  onDusty,
}: {
  total: number
  subtotal: number
  pricePerSqft: number
  markupPct: number
  onMarkupChange: (v: number) => void
  onSendQuote: () => void
  onDusty: () => void
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40"
      style={{ backgroundColor: T.surface, borderTop: `1px solid ${T.border}`, boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}
    >
      <div className="mx-auto w-full max-w-md p-4">
        {/* Row 1 */}
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xl font-bold" style={{ color: T.textPrimary }}>
              {fmtMoney(total)}
            </span>
            <span className="ml-2 text-xs" style={{ color: T.textMuted }}>
              total bid
            </span>
          </div>
          <span className="text-sm" style={{ color: T.textSecondary }}>
            {fmtMoney(pricePerSqft)}/sqft
          </span>
        </div>

        {/* Row 2 — markup slider */}
        <MarkupSlider value={markupPct} onChange={onMarkupChange} subtotal={subtotal} />

        {/* Row 3 — actions */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onSendQuote}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: T.accent }}
          >
            <ShareNetwork size={18} weight="bold" />
            Send Quote
          </button>
          <button
            type="button"
            onClick={onDusty}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: T.elevated, color: T.textPrimary }}
          >
            <ChatCircle size={18} weight="fill" style={{ color: T.accent }} />
            Dusty
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MarkupSlider
// ---------------------------------------------------------------------------

function MarkupSlider({
  value,
  onChange,
  subtotal,
}: {
  value: number
  onChange: (v: number) => void
  subtotal: number
}) {
  const profit = subtotal * (value / 100)
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: T.textSecondary }}>
          Markup
        </span>
        <span className="text-xs" style={{ color: T.textMuted }}>
          +{fmtMoney(profit)} margin
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="scope-markup-slider h-2 flex-1 cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(to right, ${T.accent} 0%, ${T.accent} ${value}%, ${T.elevated} ${value}%, ${T.elevated} 100%)`,
          }}
        />
        <span className="w-10 text-right text-sm font-semibold" style={{ color: T.textPrimary }}>
          {value}%
        </span>
      </div>

      <style jsx>{`
        .scope-markup-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: ${T.accent};
          border: 3px solid ${T.surface};
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }
        .scope-markup-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: ${T.accent};
          border: 3px solid ${T.surface};
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
