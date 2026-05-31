"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X, Send, Check } from "lucide-react";

// ─── Schema-based gating ────────────────────────────────────────
// Mirrors THRESHOLD-GATING.md spec
interface ConcreteJobSchema {
  project_type?: string;
  length_ft?: number;
  width_ft?: number;
  sqft?: number;
  depth_in?: number;
  zip?: string;
  access_issues?: boolean;
  psi?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

type Threshold = "none" | "ballpark" | "firm";

function checkThreshold(schema: ConcreteJobSchema): Threshold {
  const { project_type, sqft, zip, depth_in, contact_phone } = schema;
  if (!project_type || !sqft || !zip) return "none";
  if (!depth_in || !contact_phone) return "ballpark";
  return "firm";
}

const DISCLAIMERS: Record<Threshold, string> = {
  none: "",
  ballpark: "Preliminary estimate — site visit may adjust final price.",
  firm: "Based on current info — site visit may adjust final price.",
};

// ─── Cleo palette ──────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────
const QUICK_REPLIES = ["New driveway", "Patio", "Foundation slab", "Repair existing"];

// ─── Types ────────────────────────────────────────────────────
interface ChatMessage {
  role: "dusty" | "customer" | "system";
  text: string;
  timestamp: Date;
}

interface EstimateResult {
  mode: "ballpark" | "firm";
  estimate_range: { low: number; high: number };
  cy: number;
  breakdown: Record<string, number>;
  disclaimer: string;
  engine: string;
  calibration_source?: string;
}

// ─── Estimate API call ───────────────────────────────────────
async function runEstimate(schema: ConcreteJobSchema): Promise<EstimateResult | null> {
  const sqft = schema.sqft || (schema.length_ft && schema.width_ft ? schema.length_ft * schema.width_ft : 0);
  if (!sqft) return null;

  const res = await fetch("/api/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_type: schema.project_type,
      sqft,
      depth_in: schema.depth_in || 4,
      psi: schema.psi || 3000,
      zip: schema.zip,
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

// ─── Response generator ───────────────────────────────────────
function buildDustyResponse(schema: ConcreteJobSchema, newData: Partial<ConcreteJobSchema>): string {
  const merged = { ...schema, ...newData } as ConcreteJobSchema;
  const threshold = checkThreshold(merged);

  // All fields captured — shouldn't happen here (estimate is triggered separately)
  if (threshold === "none" && !merged.project_type) {
    return "Hey, I'm Dusty. Tell me about your concrete project — type, dimensions, anything you know.";
  }

  // Missing project type
  if (!merged.project_type) {
    return "Got it. What type of project is it — driveway, patio, slab, foundation?";
  }

  // Missing dimensions
  if (!merged.length_ft || !merged.width_ft) {
    return `So we've got a ${merged.project_type}. What are the length and width in feet?`;
  }

  // Missing depth
  if (!merged.depth_in) {
    return `Got ${merged.length_ft}×${merged.width_ft} ft (${merged.sqft || merged.length_ft! * merged.width_ft!} sq ft). What depth — 4\", 5\", or 6\"?`;
  }

  // Missing zip
  if (!merged.zip) {
    return `Almost done. What's your zip code so I can factor in local concrete pricing?`;
  }

  // Has ballpark fields but no contact yet
  if (threshold === "ballpark") {
    return "I've got enough for a ballpark — want to see it? Or give me your phone and I'll text you the full breakdown when a contractor's available.";
  }

  return "Running that estimate for you now.";
}

// ─── Main component ────────────────────────────────────────────
export default function DustyChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "dusty",
      text: "Hey, I'm Dusty. Tell me about your concrete project — type, dimensions, anything you know.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<ConcreteJobSchema>({});
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [showBallpark, setShowBallpark] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [phoneSubmitted, setPhoneSubmitted] = useState(false);
  const [showEstimateResult, setShowEstimateResult] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [conversationLog, setConversationLog] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showBallpark, showEstimateResult, phoneSubmitted]);

  const addMessage = (role: ChatMessage["role"], text: string) => {
    const msg: ChatMessage = { role, text, timestamp: new Date() };
    setMessages((prev) => [...prev, msg]);
    setConversationLog((prev) => [...prev, msg]);
  };

  const handleBallparkReveal = async () => {
    const result = await runEstimate(schema);
    if (result) {
      setEstimate(result);
      setShowBallpark(false);
      setShowEstimateResult(true);
      addMessage(
        "dusty",
        `Here's your ballpark for a ${schema.length_ft}×${schema.width_ft}ft ${schema.project_type} at ${schema.depth_in}" depth: $${result.estimate_range.low.toLocaleString()}–$${result.estimate_range.high.toLocaleString()}. ${result.disclaimer}`
      );
    }
  };

  const handleFirmEstimate = async () => {
    const result = await runEstimate({ ...schema, contact_phone: phone });
    if (result) {
      setEstimate(result);
      setShowEstimateResult(true);
      setShowBallpark(false);
      addMessage(
        "dusty",
        `Your estimate: $${result.estimate_range.low.toLocaleString()}–$${result.estimate_range.high.toLocaleString()}. ${result.disclaimer} A contractor will text you within the hour.`
      );
      setPhoneSubmitted(true);

      // Write lead to Supabase (or log if not configured)
      const phoneDigits = phone.replace(/\D/g, "");
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          source_channel: "dusty_chat",
          customer_name: schema.contact_name || "",
          customer_phone: phoneDigits.length === 10
            ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
            : phone,
          customer_email: schema.contact_email || "",
          project_type: schema.project_type || "other",
          length_ft: schema.length_ft || 0,
          width_ft: schema.width_ft || 0,
          sqft: schema.sqft || 0,
          depth_in: schema.depth_in || 4,
          psi: schema.psi || 3000,
          zip: schema.zip || "",
          access_issues: schema.access_issues || false,
          estimate_range_min: result.estimate_range.low,
          estimate_range_max: result.estimate_range.high,
          estimate_mode: result.mode,
          engine: result.engine,
          calibration_source: result.calibration_source || "robin_plunket",
          conversation_log: conversationLog.map((m) => ({ role: m.role, text: m.text, timestamp: m.timestamp.toISOString() })),
        }),
      }).catch(console.error);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    addMessage("customer", text.trim());
    setInput("");
    setLoading(true);

    try {
      const parseRes = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: schema }),
      });
      const parseData = await parseRes.json();
      const newFields = (parseData.fields || {}) as Partial<ConcreteJobSchema>;

      // Compute sqft if length + width both present
      if (newFields.length_ft && newFields.width_ft) {
        newFields.sqft = newFields.length_ft * newFields.width_ft;
      }

      const currentSchema = schema;
      const merged = { ...currentSchema, ...newFields } as ConcreteJobSchema;

      // Update state
      setSchema(merged);

      // Check threshold BEFORE generating response
      const threshold = checkThreshold(merged);

      // If firm threshold met — run firm estimate + show contact capture
      if (threshold === "firm") {
        addMessage("dusty", "Got it. Almost done — what's your phone number so a contractor can text you?");
        setShowBallpark(false);
      }
      // If ballpark threshold met — show ballpark estimate
      else if (threshold === "ballpark" && !showBallpark && !showEstimateResult) {
        const result = await runEstimate(merged);
        if (result) {
          setEstimate(result);
          setShowBallpark(true);
          setShowEstimateResult(false);
          addMessage(
            "dusty",
            `Got it — $${result.estimate_range.low.toLocaleString()}–$${result.estimate_range.high.toLocaleString()} is your ballpark for a ${merged.length_ft}×${merged.width_ft}ft ${merged.project_type} at ${merged.depth_in}". ${result.disclaimer} Want the full breakdown, or should a contractor text you directly?`
          );
        } else {
          const response = buildDustyResponse(currentSchema, newFields);
          addMessage("dusty", response);
        }
      } else {
        const response = buildDustyResponse(currentSchema, newFields);
        addMessage("dusty", response);
      }
    } catch {
      addMessage("system", "I'm having trouble right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: IQ.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${IQ.border}` }}>
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-full overflow-hidden">
            <Image src="/dusty/dusty-character-v1.png" alt="Dusty" fill className="object-cover object-bottom" />
          </div>
          <div>
            <div style={{ color: IQ.textPrimary, fontWeight: 700, fontSize: 15 }}>Dusty</div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
              <span style={{ color: IQ.textMuted, fontSize: 12 }}>Online</span>
            </div>
          </div>
        </div>
        <button onClick={() => window.history.back()} style={{ color: IQ.textMuted, background: "none", border: "none", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={
                msg.role === "customer"
                  ? { background: IQ.accent, color: "#000", fontWeight: 600, borderRadius: "16px 16px 4px 16px" }
                  : msg.role === "system"
                  ? { background: IQ.card, color: IQ.textMuted, border: `1px solid ${IQ.border}` }
                  : { background: IQ.card, color: IQ.textPrimary, border: `1px solid ${IQ.border}`, borderRadius: "16px 16px 16px 4px" }
              }
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Ballpark estimate card */}
        {showBallpark && estimate && (
          <div style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
            <div className="rounded-2xl px-5 py-4" style={{ background: IQ.card, border: `1px solid ${IQ.border}`, borderRadius: "16px 16px 4px 16px" }}>
              <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                BALLEPARK ESTIMATE
              </div>
              <div style={{ color: IQ.accent, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
                ${estimate.estimate_range.low.toLocaleString()} — ${estimate.estimate_range.high.toLocaleString()}
              </div>
              <div style={{ color: IQ.textMuted, fontSize: 12, marginTop: 6 }}>
                {estimate.disclaimer}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleFirmEstimate}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-black"
                  style={{ background: IQ.accent }}
                >
                  Text me breakdown
                </button>
                <button
                  onClick={() => setShowBallpark(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: IQ.elevated, color: IQ.textSecondary, border: `1px solid ${IQ.border}` }}
                >
                  Ask more first
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Firm estimate result */}
        {showEstimateResult && estimate && phoneSubmitted && (
          <div style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
            <div className="rounded-2xl px-5 py-4" style={{ background: IQ.card, border: `1px solid ${IQ.border}`, borderRadius: "16px 16px 4px 16px" }}>
              <div style={{ color: IQ.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                YOUR ESTIMATE
              </div>
              <div style={{ color: IQ.accent, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>
                ${estimate.estimate_range.low.toLocaleString()} — ${estimate.estimate_range.high.toLocaleString()}
              </div>
              <div style={{ color: IQ.textMuted, fontSize: 12, marginTop: 6 }}>
                {estimate.disclaimer}
              </div>
            </div>
          </div>
        )}

        {phoneSubmitted && (
          <div style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "#22C55E20", color: IQ.success, fontSize: 14, borderRadius: "16px 16px 4px 16px" }}>
              <Check size={16} />
              Sent! A contractor will text you within the hour.
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: IQ.card, border: `1px solid ${IQ.border}`, borderRadius: "16px 16px 16px 4px" }}>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce inline-block" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Contact capture (when firm threshold met) */}
      {showBallpark === false && !phoneSubmitted && !showEstimateResult && checkThreshold(schema) === "firm" && (
        <div className="px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${IQ.border}`, background: IQ.bg }}>
          <div className="mb-2 text-sm" style={{ color: IQ.textSecondary }}>
            Almost done — what's your phone number?
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              placeholder="(225) 555-0100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ flex: 1, background: IQ.card, border: `1.5px solid ${IQ.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 16, color: IQ.textPrimary, fontFamily: "Inter, sans-serif", outline: "none" }}
            />
            <button
              onClick={handleFirmEstimate}
              disabled={phone.replace(/\D/g, "").length < 10}
              style={{
                background: phone.replace(/\D/g, "").length >= 10 ? IQ.accent : IQ.card,
                color: phone.replace(/\D/g, "").length >= 10 ? "#000" : IQ.textMuted,
                border: "none", borderRadius: 12, padding: "14px 18px", fontWeight: 700, cursor: phone.replace(/\D/g, "").length >= 10 ? "pointer" : "not-allowed",
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${IQ.border}` }}>
        {messages.length <= 2 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => sendMessage(reply)}
                style={{ background: IQ.accentMuted, border: `1px solid ${IQ.accent}`, color: IQ.accent, borderRadius: "100px", padding: "6px 14px", fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: "pointer" }}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            style={{ flex: 1, background: IQ.card, border: `1.5px solid ${IQ.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 15, color: IQ.textPrimary, fontFamily: "Inter, sans-serif", outline: "none" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() ? IQ.accent : IQ.card, color: input.trim() ? "#000" : IQ.textMuted, border: "none", borderRadius: 12, padding: "14px", cursor: input.trim() ? "pointer" : "not-allowed" }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}