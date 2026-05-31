"use client";

import { useState, useEffect } from "react";
import { ChevronRight, MapPin, Phone, Check, X, ArrowLeft } from "lucide-react";

// ─── Palette (Cleo) ───────────────────────────────────────────────
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
} as const;

// ─── Schema (matches THRESHOLD-GATING.md + DATA-ARCHITECTURE.md) ───
interface WizardSchema {
  project_type: string;
  length_ft: number;
  width_ft: number;
  sqft: number;
  depth_in: number;
  psi: number;
  zip: string;
  name: string;
  phone: string;
  email: string;
  estimate: EstimateResult | null;
  step: number;
  sessionId: string;
}

interface EstimateResult {
  mode: "ballpark" | "firm";
  estimate_range: { low: number; high: number };
  disclaimer: string;
  cy: number;
  engine: string;
  calibration_source?: string;
  breakdown: Record<string, number>;
}

const initial: WizardSchema = {
  project_type: "",
  length_ft: 0,
  width_ft: 0,
  sqft: 0,
  depth_in: 4,
  psi: 3000,
  zip: "",
  name: "",
  phone: "",
  email: "",
  estimate: null,
  step: 0,
  sessionId: "",
};

// ─── Step definitions ─────────────────────────────────────────────
const STEPS = [
  { id: "project", label: "Project type" },
  { id: "dimensions", label: "Dimensions" },
  { id: "depth", label: "Depth" },
  { id: "location", label: "Location" },
  { id: "contact", label: "Contact" },
  { id: "result", label: "Your quote" },
];

const PROJECT_TYPES = [
  { id: "driveway", label: "Driveway", desc: "Standard concrete pour", icon: "🚗" },
  { id: "patio", label: "Patio", desc: "Outdoor living space", icon: "🏡" },
  { id: "slab", label: "Slab", desc: "Ground-level concrete", icon: "⬜" },
  { id: "foundation", label: "Foundation", desc: "Structural base", icon: "🏗" },
  { id: "other", label: "Other", desc: "Something else", icon: "📐" },
];

const DEPTHS = [
  { value: 4, label: '4" Standard', desc: "Passenger vehicles" },
  { value: 5, label: '5" Heavy Duty', desc: "Trucks, heavy equipment" },
  { value: 6, label: '6" Commercial', desc: "High-traffic, industrial" },
];

// ─── API call ───────────────────────────────────────────────────
async function callEstimate(schema: WizardSchema): Promise<EstimateResult | null> {
  if (!schema.sqft || !schema.depth_in) return null;
  try {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_type: schema.project_type,
        sqft: schema.sqft,
        depth_in: schema.depth_in,
        psi: 3000,
        zip: schema.zip || "00000",
      }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Components ─────────────────────────────────────────────────

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`rounded-full transition-all duration-200 ${
              i === step
                ? "w-2.5 h-2.5 bg-yellow-400"
                : i < step
                ? "w-2 h-2 bg-yellow-400"
                : "w-2 h-2 border border-zinc-600"
            }`}
          />
        ))}
      </div>
      <span style={{ color: IQ.textMuted, fontSize: 12, fontFamily: "Inter, sans-serif" }}>
        Step {step + 1} of {STEPS.length}
      </span>
    </div>
  );
}

function SelectionCard({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl border-2 transition-all duration-150 px-5 py-4 flex items-center gap-4 cursor-pointer"
      style={{
        background: selected ? IQ.accentMuted : IQ.card,
        borderColor: selected ? IQ.accent : IQ.border,
        transform: selected ? "scale(0.98)" : "scale(1)",
      }}
    >
      {children}
      <ChevronRight
        size={18}
        style={{ color: selected ? IQ.accent : IQ.textMuted, marginLeft: "auto", flexShrink: 0 }}
      />
    </button>
  );
}

function GoldButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl font-semibold text-black transition-all duration-100 active:scale-[0.98] flex items-center justify-center gap-2"
      style={{
        background: disabled ? "#555" : IQ.accent,
        opacity: disabled ? 0.4 : 1,
        padding: "18px 24px",
        fontSize: 18,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {children}
    </button>
  );
}

function FieldError({ msg }: { msg: string }) {
  return <p style={{ color: IQ.error, fontSize: 12, marginTop: 6, fontFamily: "Inter, sans-serif" }}>{msg}</p>;
}

const inputStyle: React.CSSProperties = {
  background: IQ.card,
  border: `1.5px solid ${IQ.border}`,
  borderRadius: 12,
  padding: "16px",
  fontSize: 16,
  color: IQ.textPrimary,
  width: "100%",
  fontFamily: "Inter, sans-serif",
  outline: "none",
};

// ─── Ballpark Estimate Card (shown after Step 2) ───────────────
function BallparkCard({ estimate, sqft }: { estimate: EstimateResult | null; sqft: number }) {
  if (!estimate) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 mb-4"
      style={{ background: IQ.accentMuted, border: `1px solid ${IQ.accent}40` }}
    >
      <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
        Ballpark estimate
      </div>
      <div style={{ color: IQ.accent, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
        ${estimate.estimate_range.low.toLocaleString()} — ${estimate.estimate_range.high.toLocaleString()}
      </div>
      <div style={{ color: IQ.textMuted, fontSize: 11, marginTop: 4 }}>
        {estimate.disclaimer}
      </div>
    </div>
  );
}

// ─── Step components ─────────────────────────────────────────────

function StepProject({ state, set }: { state: WizardSchema; set: (s: WizardSchema) => void }) {
  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 28, fontWeight: 700, fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
        What are you working on?
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif", marginBottom: 16 }}>
        Tap to select — we&apos;ll take it from there.
      </p>
      <div className="flex flex-col gap-3">
        {PROJECT_TYPES.map((p) => (
          <SelectionCard
            key={p.id}
            selected={state.project_type === p.id}
            onSelect={() => set({ ...state, project_type: p.id })}
          >
            <span style={{ fontSize: 24 }}>{p.icon}</span>
            <div>
              <div style={{ color: IQ.textPrimary, fontWeight: 600, fontSize: 16, fontFamily: "Inter, sans-serif" }}>{p.label}</div>
              <div style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif" }}>{p.desc}</div>
            </div>
          </SelectionCard>
        ))}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <GoldButton onClick={() => set({ ...state, step: 1 })} disabled={!state.project_type}>
          NEXT
          <ChevronRight size={18} />
        </GoldButton>
      </div>
    </div>
  );
}

function StepDimensions({ state, set }: { state: WizardSchema; set: (s: WizardSchema) => void }) {
  const sqft = state.length_ft * state.width_ft;

  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 28, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        What are the dimensions?
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif" }}>
        Enter length and width in feet.
      </p>
      <div className="flex gap-4">
        {(["length_ft", "width_ft"] as const).map((field) => (
          <div key={field} className="flex-1">
            <label style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif", display: "block", marginBottom: 8 }}>
              {field === "length_ft" ? "Length (ft)" : "Width (ft)"}
            </label>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={state[field] || ""}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                const next = { ...state, [field]: val };
                if (field === "length_ft") next.sqft = next.length_ft * next.width_ft;
                if (field === "width_ft") next.sqft = next.length_ft * next.width_ft;
                set(next);
              }}
              style={{ ...inputStyle, fontSize: 24, fontWeight: 700 }}
            />
          </div>
        ))}
      </div>
      {sqft > 0 && (
        <div style={{ background: IQ.accentMuted, borderRadius: 12, padding: "16px", textAlign: "center" }}>
          <span style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif" }}>Estimated area: </span>
          <span style={{ color: IQ.accent, fontWeight: 700, fontSize: 18, fontFamily: "Inter, sans-serif" }}>{sqft} sq ft</span>
        </div>
      )}
      <GoldButton onClick={() => set({ ...state, step: 2 })} disabled={sqft === 0}>
        NEXT
        <ChevronRight size={18} />
      </GoldButton>
    </div>
  );
}

function StepDepth({ state, set }: { state: WizardSchema; set: (s: WizardSchema) => void }) {
  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 28, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        How thick?
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif" }}>
        Standard for driveways is 4 inches.
      </p>
      <div className="flex flex-col gap-3">
        {DEPTHS.map((d) => (
          <SelectionCard
            key={d.value}
            selected={state.depth_in === d.value}
            onSelect={() => set({ ...state, depth_in: d.value, step: 3 })}
          >
            <div>
              <div style={{ color: IQ.textPrimary, fontWeight: 600, fontSize: 16, fontFamily: "Inter, sans-serif" }}>{d.label}</div>
              <div style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif" }}>{d.desc}</div>
            </div>
          </SelectionCard>
        ))}
      </div>
    </div>
  );
}

function StepLocation({ state, set }: { state: WizardSchema; set: (s: WizardSchema) => void }) {
  const [zipError, setZipError] = useState("");

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => setZipError("Couldn't auto-detect. Please enter zip below."),
      () => setZipError("Location access denied. Enter zip manually.")
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 28, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        What&apos;s your location?
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif" }}>
        We use this to factor in local concrete pricing.
      </p>
      <div>
        <label style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif", display: "block", marginBottom: 8 }}>
          Zip code
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="70802"
          value={state.zip}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 5);
            set({ ...state, zip: val });
            setZipError("");
          }}
          style={{ ...inputStyle, fontSize: 24, fontWeight: 700, letterSpacing: "0.1em", borderColor: zipError ? IQ.error : IQ.border }}
        />
        {zipError && <FieldError msg={zipError} />}
      </div>
      <button
        onClick={handleGeolocate}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-4 cursor-pointer transition-colors hover:border-zinc-500"
        style={{ background: "transparent", color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif" }}
      >
        <MapPin size={16} />
        Use my location
      </button>
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <GoldButton onClick={() => { if (state.zip.length === 5) { setZipError(""); set({ ...state, step: 4 }); } else setZipError("Enter a valid 5-digit zip."); }} disabled={state.zip.length !== 5}>
          NEXT
          <ChevronRight size={18} />
        </GoldButton>
      </div>
    </div>
  );
}

function StepContact({ state, set }: { state: WizardSchema; set: (s: WizardSchema) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!state.name.trim()) e.name = "Name is required";
    if (!/^\d{10}$/.test(state.phone.replace(/\D/g, ""))) e.phone = "Enter a valid 10-digit number";
    if (!state.email.includes("@")) e.email = "Enter a valid email";
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});

    const result = await callEstimate({ ...state, estimate: null });

    // Write lead to Supabase (or log if not configured)
    const phoneDigits = state.phone.replace(/\D/g, "");
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        source_channel: "insta_quote",
        customer_name: state.name,
        customer_phone: `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
        customer_email: state.email,
        project_type: state.project_type,
        length_ft: state.length_ft,
        width_ft: state.width_ft,
        sqft: state.sqft,
        depth_in: state.depth_in,
        psi: state.psi,
        zip: state.zip,
        access_issues: false,
        estimate_range_min: result?.estimate_range.low ?? 0,
        estimate_range_max: result?.estimate_range.high ?? 0,
        estimate_mode: result?.mode ?? "firm",
        engine: result?.engine ?? "local-formula",
        calibration_source: result?.calibration_source ?? "robin_plunket",
        wizard_snapshot: { step: state.step, project_type: state.project_type, length_ft: state.length_ft, width_ft: state.width_ft, depth_in: state.depth_in, psi: state.psi, zip: state.zip },
      }),
    }).catch(console.error);

    set({ ...state, estimate: result, step: 5 });
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 style={{ color: IQ.textPrimary, fontSize: 28, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
        Almost done!
      </h2>
      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif" }}>
        We&apos;ll text you the exact quote from a local contractor.
      </p>

      <div>
        <label style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif", display: "block", marginBottom: 8 }}>Your name</label>
        <input type="text" placeholder="John" value={state.name} onChange={(e) => { set({ ...state, name: e.target.value }); setErrors({ ...errors, name: "" }); }}
          style={{ ...inputStyle, borderColor: errors.name ? IQ.error : IQ.border }} />
        {errors.name && <FieldError msg={errors.name} />}
      </div>

      <div>
        <label style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif", display: "block", marginBottom: 8 }}>Phone number</label>
        <input type="tel" inputMode="tel" placeholder="(225) 555-0100" value={state.phone}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 10);
            set({ ...state, phone: v.length === 10 ? `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}` : v });
            setErrors({ ...errors, phone: "" });
          }}
          style={{ ...inputStyle, borderColor: errors.phone ? IQ.error : IQ.border }} />
        {errors.phone && <FieldError msg={errors.phone} />}
      </div>

      <div>
        <label style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif", display: "block", marginBottom: 8 }}>Email (optional)</label>
        <input type="email" placeholder="john@example.com" value={state.email}
          onChange={(e) => { set({ ...state, email: e.target.value }); setErrors({ ...errors, email: "" }); }}
          style={{ ...inputStyle, borderColor: errors.email ? IQ.error : IQ.border }} />
        {errors.email && <FieldError msg={errors.email} />}
      </div>

      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <GoldButton onClick={handleSubmit}>Get my quote <ChevronRight size={18} /></GoldButton>
      </div>
    </div>
  );
}

function StepResult({ state }: { state: WizardSchema }) {
  const est = state.estimate;
  if (!est) {
    return (
      <div className="flex flex-col items-center gap-6 w-full text-center">
        <p style={{ color: IQ.textSecondary }}>Loading your estimate...</p>
      </div>
    );
  }

  const formattedMin = `$${est.estimate_range.low.toLocaleString()}`;
  const formattedMax = `$${est.estimate_range.high.toLocaleString()}`;

  return (
    <div className="flex flex-col items-center gap-6 w-full text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: IQ.accentMuted }}>
        <Check size={32} style={{ color: IQ.accent }} />
      </div>

      <div>
        <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif", marginBottom: 8 }}>Your instant quote:</p>
        <div style={{ fontSize: 52, fontWeight: 800, color: IQ.accent, letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>{formattedMin}</div>
        <div style={{ color: IQ.textSecondary, fontSize: 18, fontFamily: "Inter, sans-serif" }}>— {formattedMax}</div>
      </div>

      <div style={{ background: IQ.card, border: `1px solid ${IQ.border}`, borderRadius: 16, padding: "16px 24px", maxWidth: 280 }}>
        <p style={{ color: IQ.textSecondary, fontSize: 13, fontFamily: "Inter, sans-serif" }}>
          Based on{" "}
          <span style={{ color: IQ.textPrimary, fontWeight: 600 }}>{state.length_ft}′ × {state.width_ft}′ {state.project_type}</span>{" "}
          at {state.depth_in}″ depth
        </p>
        <p style={{ color: IQ.textMuted, fontSize: 12, fontFamily: "Inter, sans-serif", marginTop: 4 }}>
          {state.sqft} sq ft{est.cy ? ` · ${est.cy} CY` : ""} · {state.zip}
        </p>
        <p style={{ color: IQ.textMuted, fontSize: 11, marginTop: 8, fontStyle: "italic" }}>{est.disclaimer}</p>
      </div>

      <p style={{ color: IQ.textSecondary, fontSize: 15, fontFamily: "Inter, sans-serif", maxWidth: 280 }}>
        A local contractor will text you an exact quote within the hour.
      </p>

      <div className="flex flex-col gap-3 w-full" style={{ maxWidth: 320 }}>
        <GoldButton onClick={() => alert(`Texting breakdown to ${state.phone}...`)}>
          <Phone size={16} />
          Text me the breakdown
        </GoldButton>
        <button
          className="w-full rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{ background: "transparent", border: `1.5px solid ${IQ.border}`, color: IQ.textSecondary, padding: "16px 24px", fontFamily: "Inter, sans-serif" }}
        >
          Share with contractor
        </button>
      </div>

      <p style={{ color: IQ.textMuted, fontSize: 12, fontFamily: "Inter, sans-serif" }}>
        Ref: #SC-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-{Math.floor(Math.random() * 9000 + 1000)}
      </p>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────
export default function CalculatorPage() {
  const [state, setState] = useState<WizardSchema>({ ...initial, sessionId: crypto.randomUUID() });
  const [ballparkEstimate, setBallparkEstimate] = useState<EstimateResult | null>(null);

  // Show ballpark estimate after Step 2 (dimensions entered)
  const showBallpark = state.sqft > 0 && state.project_type && state.step >= 2;

  useEffect(() => {
    if (showBallpark && !ballparkEstimate) {
      callEstimate(state).then((result) => {
        if (result) setBallparkEstimate(result);
      });
    }
  }, [showBallpark, state.sqft, state.project_type]);

  const isResult = state.step === 5;

  return (
    <div style={{ background: IQ.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      {!isResult && (
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${IQ.border}` }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: IQ.accent }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#000" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#000" />
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: IQ.textPrimary, letterSpacing: "-0.5px" }}>Scope Builder</span>
          </div>
          <button onClick={() => window.history.back()} style={{ color: IQ.textMuted, background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </header>
      )}

      {/* Content */}
      <main
        className="flex-1 flex flex-col px-6 py-8"
        style={{ maxWidth: 480, width: "100%", margin: "0 auto", justifyContent: "center" }}
      >
        {!isResult && (
          <div className="mb-8">
            <ProgressDots step={state.step} />
          </div>
        )}

        {/* Ballpark card — shown after Step 2 */}
        {showBallpark && <BallparkCard estimate={ballparkEstimate} sqft={state.sqft} />}

        {state.step === 0 && <StepProject state={state} set={setState} />}
        {state.step === 1 && <StepDimensions state={state} set={setState} />}
        {state.step === 2 && <StepDepth state={state} set={setState} />}
        {state.step === 3 && <StepLocation state={state} set={setState} />}
        {state.step === 4 && <StepContact state={state} set={setState} />}
        {isResult && <StepResult state={state} />}
      </main>

      {/* Back nav */}
      {!isResult && state.step > 0 && (
        <footer
          className="px-6 py-4 flex items-center gap-2 cursor-pointer"
          style={{ borderTop: `1px solid ${IQ.border}` }}
          onClick={() => setState({ ...state, step: state.step - 1 })}
        >
          <ArrowLeft size={16} style={{ color: IQ.textMuted }} />
          <span style={{ color: IQ.textMuted, fontSize: 13, fontFamily: "Inter, sans-serif" }}>Back</span>
        </footer>
      )}
    </div>
  );
}