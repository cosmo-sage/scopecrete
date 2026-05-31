"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Send, MessageCircle } from "lucide-react";

// ─── Cleo palette (matches landing page + /dusty) ────────────────
const C = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  elevated: "#EEF2F8",
  accent: "#2457F5",
  accentMuted: "rgba(36,87,245,0.08)",
  text: "#1F2937",
  textMuted: "#78716C",
  border: "#E5E7EB",
  input: "#F1F5F9",
};

const MESSAGES = [
  { role: "dusty", text: "Hey, I'm Dusty. What are you working on today?" },
  { role: "user", text: "Got a driveway, about 24 by 30 feet" },
  { role: "dusty", text: "Nice size driveway. What depth — 4 inches for passenger vehicles, or thicker?" },
  { role: "user", text: "4 inches is fine" },
  { role: "dusty", text: "Perfect. What's your zip code?" },
  { role: "user", text: "70802" },
];

const QUICK_REPLIES = ["New driveway", "Small pad", "Foundation"];

export default function ChatWidgetPreview() {
  const [visibleMessages, setVisibleMessages] = useState(1);
  const [showTyping, setShowTyping] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [inputVal, setInputVal] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleMessages > MESSAGES.length) {
      setShowTyping(false);
      setShowEstimate(true);
      return;
    }
    if (visibleMessages <= MESSAGES.length) {
      setShowTyping(true);
      const delay = visibleMessages === 1 ? 1200 : 1600;
      const t = setTimeout(() => {
        setVisibleMessages((v) => v + 1);
        setShowTyping(false);
      }, delay);
      return () => clearTimeout(t);
    }
  }, [visibleMessages]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleMessages, showTyping, showEstimate]);

  const handleQuickReply = (_reply: string) => {
    setShowReplies(false);
    setVisibleMessages(2);
    setShowTyping(true);
  };

  const turns = [];
  for (let i = 0; i < visibleMessages && i < MESSAGES.length; i += 2) {
    turns.push(MESSAGES.slice(i, i + 2));
  }

  return (
    /* Mobile phone frame */
    <div className="relative mx-auto" style={{ width: 280 }}>
      {/* Phone chrome */}
      <div
        className="rounded-[2.5rem] overflow-hidden"
        style={{
          background: C.card,
          border: `1.5px solid ${C.border}`,
          boxShadow: `0 0 0 8px ${C.elevated}, 0 24px 80px rgba(0,0,0,0.7)`,
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
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: C.accent }}
          >
            <MessageCircle size={16} color="#FAFAF9" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: C.text }}>Dusty</div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: "#22C55E" }}
              />
              <span className="text-xs" style={{ color: C.textMuted }}>Online</span>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={containerRef}
          className="h-[320px] overflow-y-auto p-4 space-y-3"
          style={{ background: C.bg }}
        >
          {turns.map((turn, ti) => (
            <div key={ti} className="space-y-2">
              {turn.map((msg, mi) => (
                <div
                  key={`${ti}-${mi}`}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                    style={
                      msg.role === "user"
                        ? { background: C.accent, color: "#FFFFFF", fontWeight: 600, borderBottomRightRadius: 6 }
                        : { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderBottomLeftRadius: 6 }
                    }
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {showTyping && (
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

          {showEstimate && (
            <div className="space-y-2">
              {/* Estimate card */}
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]"
                  style={{ background: C.card, border: `1px solid ${C.border}` }}
                >
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: C.accent }}
                  >
                    Your Estimate
                  </div>
                  <div className="text-xl font-bold" style={{ color: C.text }}>
                    $7,500 – $9,500
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>
                    720 sq ft · 4″ depth · Baton Rouge
                  </div>
                </div>
              </div>
              {/* Follow-up message */}
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]"
                  style={{ background: C.card, border: `1px solid ${C.border}` }}
                >
                  <div className="text-sm" style={{ color: C.textMuted }}>
                    Want me to text this to a local contractor? Drop your number and they&apos;ll
                    send an exact quote.
                  </div>
                </div>
              </div>
            </div>
          )}

          {showReplies && visibleMessages === 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_REPLIES.map((reply) => (
                <button
                  key={reply}
                  onClick={() => handleQuickReply(reply)}
                  className="text-[11px] font-medium rounded-full px-3 py-1.5 transition-colors cursor-pointer"
                  style={{
                    background: C.accentMuted,
                    color: C.accent,
                    border: `1px solid ${C.accent}40`,
                  }}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ background: C.elevated, borderTop: `1px solid ${C.border}` }}
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={showEstimate ? "Phone number..." : "Type a message..."}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: C.input,
              color: C.text,
              border: `1px solid ${C.border}`,
            }}
          />
          <button
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            style={{ background: C.accent }}
          >
            <Send size={12} color="#FAFAF9" />
          </button>
        </div>

        {/* Home bar */}
        <div className="flex justify-center py-2" style={{ background: C.elevated }}>
          <div
            className="w-24 h-1 rounded-full"
            style={{ background: C.border }}
          />
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