"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle } from "lucide-react";

// ─── Palette (matches landing page Option A) ─────────────────────
const C = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  elevated: "#EEF2F8",
  accent: "#2457F5",
  accentMuted: "rgba(36,87,245,0.08)",
  text: "#1F2937",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  bubbleUser: "#007AFF",
  bubbleDusty: "#F1F5F9",
};

// Full conversation script — true back-and-forth
const CONVO = [
  { role: "dusty", text: "Hey, I'm Dusty. What are you working on today?" },
  { role: "user", text: "Got a driveway, about 24 by 30 feet" },
  { role: "dusty", text: "Nice size driveway. What's the depth — 4 inches for passenger vehicles, or 5-6 inches for heavier trucks?" },
  { role: "user", text: "4 inches is fine" },
  { role: "dusty", text: "Perfect. Last thing — what's your zip code?" },
  { role: "user", text: "70802" },
];

export default function PhoneHeroAnimation() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-advance: show 1 message every 1.8s
  useEffect(() => {
    if (visibleCount >= CONVO.length) return;
    const delay = visibleCount === 0 ? 1600 : 1800;
    const t = setTimeout(() => setVisibleCount((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visibleCount]);

  // Scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleCount]);

  const isDone = visibleCount >= CONVO.length;
  const lastMsg = isDone ? CONVO[CONVO.length - 1] : null;

  // Show estimate after conversation ends
  const showEstimate = isDone;

  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      {/* Glow */}
      <div
        className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full"
        style={{ background: "rgba(234,88,12,0.06)", filter: "blur(40px)" }}
      />

      {/* Phone frame */}
      <div
        className="rounded-[2.5rem] overflow-hidden"
        style={{
          background: C.card,
          border: `1.5px solid ${C.border}`,
          boxShadow: `0 0 0 8px ${C.elevated}, 0 24px 80px rgba(0,0,0,0.15)`,
        }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-6 py-2 text-xs"
          style={{ background: C.elevated, color: C.textMuted }}
        >
          <span style={{ fontFamily: "monospace" }}>9:41</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">📶</span>
            <span className="text-[10px]">🔋</span>
          </div>
        </div>

        {/* Chat header */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: C.accent }}
          >
            <MessageCircle size={16} color="white" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>Dusty</div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
              <span className="text-xs" style={{ color: C.textMuted }}>Online</span>
            </div>
          </div>
          {/* Progress */}
          <div className="ml-auto flex gap-1">
            {CONVO.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i < visibleCount ? 14 : 4,
                  background: i < visibleCount ? C.accent : C.border,
                }}
              />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={containerRef}
          className="overflow-y-auto px-4 py-3 space-y-3"
          style={{ background: C.bg, height: 300 }}
        >
          {CONVO.slice(0, visibleCount).map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    isUser
                      ? {
                          background: C.bubbleUser,
                          color: "white",
                          fontWeight: 600,
                          borderBottomRightRadius: 6,
                        }
                      : {
                          background: C.bubbleDusty,
                          color: C.text,
                          border: `1px solid ${C.border}`,
                          borderBottomLeftRadius: 6,
                        }
                  }
                >
                  {msg.text}
                </div>
              </div>
            );
          })}

          {/* Estimate card */}
          {showEstimate && (
            <div className="space-y-2">
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3"
                  style={{
                    background: C.accentMuted,
                    border: `1px solid ${C.accent}30`,
                  }}
                >
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: C.accent }}
                  >
                    Your Estimate
                  </div>
                  <div className="text-xl font-bold" style={{ color: C.accent }}>
                    $7,500 – $9,500
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>
                    720 sq ft · 4″ depth · Baton Rouge
                  </div>
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3"
                  style={{ background: C.bubbleDusty, border: `1px solid ${C.border}` }}
                >
                  <div className="text-sm" style={{ color: C.textMuted }}>
                    Want me to send this to a local contractor? Drop your number and they&apos;ll text an exact quote.
                  </div>
                </div>
              </div>
              {/* Phone input shown */}
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2"
                  style={{ background: C.bubbleDusty, border: `1px solid ${C.border}` }}
                >
                  <div
                    className="text-sm"
                    style={{ color: C.text }}
                  >
                    📱 225-555-0142
                  </div>
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
            value={showEstimate ? "225-555-0142" : ""}
            readOnly
            placeholder="Type a message..."
            className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
            style={{ background: C.card, color: C.text, border: `1px solid ${C.border}` }}
          />
          <button
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.accent }}
          >
            <Send size={12} color="white" />
          </button>
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