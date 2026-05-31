"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle } from "lucide-react";

// ─── Cleo palette ────────────────────────────────────────────────
const C = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  elevated: "#F1F5F9",
  accent: "#EA580C",
  accentMuted: "rgba(234,88,12,0.10)",
  text: "#334155",
  textMuted: "#78716C",
  border: "#E2E8F0",
  green: "#22C55E",
};

// Full conversation script for hero animation
const CONVO = [
  { role: "dusty", text: "Hey, I'm Dusty. What are you working on today?" },
  { role: "user", text: "Got a driveway, about 24 by 30 feet" },
  { role: "dusty", text: "Nice. Is this a new pour or a replacement?" },
  { role: "user", text: "New pour" },
  { role: "dusty", text: "Got it. What depth — 4 inches for passenger vehicles, or thicker?" },
  { role: "user", text: "4 inches is fine" },
  { role: "dusty", text: "Perfect. What's your zip code?" },
  { role: "user", text: "70802" },
];

type Phase =
  | "idle"        // dusty's bubble pops in
  | "replying"    // user reply shows
  | "typing"      // dusty typing
  | "calc"        // calculation thinking bubbles show
  | "estimate";   // estimate card appears

const STEPS: { phase: Phase; userIdx: number; dustyIdx: number; bubble?: { label: string; math: string } }[] = [
  { phase: "idle",     userIdx: 0, dustyIdx: 0 },
  { phase: "replying", userIdx: 1, dustyIdx: 0 },
  { phase: "typing",   userIdx: 1, dustyIdx: 1 },
  { phase: "replying", userIdx: 2, dustyIdx: 1 },
  { phase: "typing",   userIdx: 2, dustyIdx: 2 },
  { phase: "replying", userIdx: 3, dustyIdx: 2 },
  { phase: "typing",   userIdx: 3, dustyIdx: 3 },
  { phase: "replying", userIdx: 4, dustyIdx: 3 },
  { phase: "typing",   userIdx: 4, dustyIdx: 4 },
  { phase: "replying", userIdx: 5, dustyIdx: 4 },
  { phase: "typing",   userIdx: 5, dustyIdx: 5 },
  { phase: "replying", userIdx: 6, dustyIdx: 5 },
  { phase: "typing",   userIdx: 6, dustyIdx: 6 },
  { phase: "replying", userIdx: 7, dustyIdx: 6 },
  { phase: "calc",     userIdx: 7, dustyIdx: 7 },
  { phase: "estimate", userIdx: 7, dustyIdx: 7 },
];

export default function TabletHeroAnimation() {
  const [stepIdx, setStepIdx] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const [bubbleUp, setBubbleUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-advance through conversation
  useEffect(() => {
    if (stepIdx >= STEPS.length) return;
    const { phase } = STEPS[stepIdx];
    const delay = phase === "typing" ? 900 : phase === "idle" ? 1400 : 1100;
    const t = setTimeout(() => {
      setStepIdx((s) => s + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [stepIdx]);

  // Bubble pop animation
  useEffect(() => {
    if (stepIdx === 0) {
      const t = setTimeout(() => setBubbleUp(true), 300);
      return () => clearTimeout(t);
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [stepIdx]);

  const step = STEPS[Math.min(stepIdx, STEPS.length - 1)];
  const { phase, userIdx, dustyIdx } = step;
  const showCalc = phase === "calc" || phase === "estimate";
  const showEstimate = phase === "estimate";

  const userMessages = CONVO.slice(0, userIdx + 1);
  const dustyMessages = CONVO.slice(0, dustyIdx + 1);

  const tabletH = 420;
  const tabletW = 640;

  return (
    <div
      className="relative mx-auto"
      style={{
        width: tabletW,
        maxWidth: "100%",
        perspective: 1000,
      }}
    >
      {/* Glow */}
      <div
        className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full"
        style={{ background: "rgba(255,215,0,0.04)", filter: "blur(40px)" }}
      />

      {/* Tablet frame */}
      <div
        className="relative overflow-hidden rounded-[2.5rem]"
        style={{
          background: C.card,
          border: `2px solid ${C.border}`,
          boxShadow: `0 0 0 6px ${C.elevated}, 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(255,215,0,0.08)`,
          height: tabletH,
        }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-8 py-3 shrink-0"
          style={{ background: C.elevated, borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full mr-0.5"
                style={{ background: i === 0 ? C.textMuted : C.border }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: C.textMuted, fontFamily: "monospace" }}>12:00</span>
            <span className="text-[10px]" style={{ color: C.textMuted }}>📶 🔋</span>
          </div>
        </div>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-3 shrink-0"
          style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: C.accent }}
          >
            <MessageCircle size={14} color="#FAFAF9" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>Dusty</div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
              <span className="text-[10px]" style={{ color: C.textMuted }}>Online</span>
            </div>
          </div>
          {/* Progress dots */}
          <div className="ml-auto flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === stepIdx ? 16 : 4,
                  background: i <= stepIdx ? C.accent : C.border,
                }}
              />
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div
          ref={containerRef}
          className="overflow-y-auto px-4 py-3 space-y-2"
          style={{
            background: C.bg,
            height: tabletH - 130,
          }}
        >
          {userMessages.map((msg, i) => (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
                style={{
                  background: C.accent,
                  color: "#FFFFFF",
                  fontWeight: 600,
                  borderBottomRightRadius: 6,
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {dustyMessages.map((msg, i) => (
            <div key={i} className="flex justify-start">
              <div
                className="max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
                style={{
                  background: C.card,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderBottomLeftRadius: 6,
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {phase === "typing" && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-4 py-3"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{
                        background: C.textMuted,
                        animation: `bounce 1.2s ease-in-out ${i * 200}ms infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Calculation thinking bubbles */}
          {showCalc && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3 text-xs"
                  style={{ background: C.card, border: `1px solid ${C.border}40` }}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
                    Working it out
                  </div>
                  <div className="space-y-1">
                    <div style={{ color: C.text }}>
                      24 × 30 ={" "}
                      <span style={{ color: C.accent, fontWeight: 700 }}>720 sq ft</span>
                    </div>
                    <div style={{ color: C.textMuted }}>
                      720 × 4 ÷ 12 ÷ 27 ={" "}
                      <span style={{ color: C.accent, fontWeight: 700 }}>8.9 CY</span>
                    </div>
                    <div style={{ color: C.textMuted }}>
                      Market rate Baton Rouge:{" "}
                      <span style={{ color: C.accent, fontWeight: 700 }}>$175/CY</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Estimate card */}
          {showEstimate && (
            <div className="flex justify-start mt-2">
              <div
                className="rounded-2xl px-4 py-3 max-w-[85%]"
                style={{
                  background: C.accentMuted,
                  border: `1px solid ${C.accent}50`,
                }}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: C.accent }}>
                  Your Estimate
                </div>
                <div className="text-xl font-bold" style={{ color: C.accent }}>
                  $7,500 – $9,500
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                  720 sq ft · 4″ depth · Baton Rouge, 70802
                </div>
                <div className="mt-2 text-[10px] leading-relaxed" style={{ color: C.textMuted }}>
                  Want me to send this to a local contractor? Drop your phone and they&apos;ll text an exact quote.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ background: C.elevated, borderTop: `1px solid ${C.border}` }}
        >
          <input
            type="text"
            value={phase === "estimate" ? "225-555-0142" : inputVal}
            readOnly
            placeholder="Type a message..."
            className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
            style={{
              background: C.card,
              color: phase === "estimate" ? C.text : C.textMuted,
              border: `1px solid ${C.border}`,
            }}
          />
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: C.accent }}
          >
            <Send size={11} color="#FAFAF9" />
          </div>
        </div>

        {/* Home bar */}
        <div className="flex justify-center py-2" style={{ background: C.elevated }}>
          <div className="w-20 h-1 rounded-full" style={{ background: C.border }} />
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}