"use client";

import { useState, useEffect, useRef } from "react";
import { Send, X, Sparkles, Check } from "lucide-react";

interface AIPanelProps {
  open: boolean;
  onClose: () => void;
  theme?: "dark" | "light";
  quoteData: {
    sqft: number;
    depth: number;
    psi: number;
    zip: string;
    estimate: { low: number; high: number };
    concretePerCY: number;
    laborPerSqft: number;
  };
}

const PRESET_RESPONSES = [
  "Got it — updated labor rate to $12/sqft. New estimate: $8,200–$9,800.",
  "Done. Switched to 4000 PSI concrete. Updated range: $8,800–$10,400.",
  "Budget recalculated with 15% markup. Total: $9,500–$11,200.",
  "Applied. Rebar grade upgraded to #5. New estimate: $8,100–$9,600.",
  "Noted. I've flagged this for manual review — some line items need your confirmation.",
];

const SUGGESTIONS = [
  "Raise labor to $12/sqft",
  "Switch to 4000 PSI",
  "Show 5000 PSI option",
  "Add rebar markup",
  "Adjust margin to 20%",
];

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "T.accent" }}
      >
        <Sparkles size={12} color="white" />
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]"
        style={{ background: "T.border", border: "1px solid T.borderLight" }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                background: "T.textMuted",
                animation: `bounce 1.2s ease-in-out ${i * 200}ms infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AIPanel({ open, onClose, theme = "dark", quoteData }: AIPanelProps) {
  const T = theme === "light" ? {
    bg: "T.bg", surface: "T.surface", elevated: "T.elevated",
    accent: "T.accent", accentMuted: "rgba(36,87,245,0.08)",
    textPrimary: "T.textPrimary", textSecondary: "T.textSecondary", textMuted: "T.textMuted",
    border: "T.border", highlight: "T.highlight", highlightMuted: "rgba(245,158,11,0.10)",
  } : {
    bg: "T.bg", surface: "T.surface", elevated: "T.border",
    accent: "T.accent", accentMuted: "rgba(36,87,245,0.15)",
    textPrimary: "T.textPrimary", textSecondary: "T.textSecondary", textMuted: "T.textMuted",
    border: "T.border", highlight: "T.highlight", highlightMuted: "rgba(245,158,11,0.12)",
  };
  const [messages, setMessages] = useState([
    {
      role: "agent",
      text: `I'm your AI copilot for this quote. I can adjust concrete grades, labor rates, margins, and more — just ask. Current estimate: $${quoteData.estimate.low.toLocaleString()}–$${quoteData.estimate.high.toLocaleString()}.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const response = PRESET_RESPONSES[Math.floor(Math.random() * PRESET_RESPONSES.length)];
      setMessages((m) => [...m, { role: "agent", text: response }]);
      setApplied((a) => [...a, text]);
    }, 1400);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 380,
          background: "T.bg",
          borderLeft: "1px solid T.border",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid T.border" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "T.accent" }}
            >
              <Sparkles size={14} color="white" />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "T.accent" }}>AI Copilot</div>
              <div className="text-xs" style={{ color: "T.textMuted" }}>Quote editor</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:brightness-110"
            style={{ background: "T.border", color: "T.textMuted" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Applied changes */}
        {applied.length > 0 && (
          <div
            className="px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid T.border", background: "rgba(34,197,94,0.08)" }}
          >
            <div className="text-xs font-semibold mb-2" style={{ color: "#22C55E" }}>
              Applied changes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {applied.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}
                >
                  <Check size={9} />
                  {a}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "agent" && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5"
                  style={{ background: "T.accent" }}
                >
                  <Sparkles size={12} color="white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-tr-sm"
                    : "rounded-tl-sm"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "T.border", color: "T.textPrimary", border: "1px solid T.borderLight" }
                    : { background: "T.surface", color: "T.textPrimary", border: "1px solid T.border" }
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
          {typing && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        <div
          className="px-5 py-3 shrink-0"
          style={{ borderTop: "1px solid T.border" }}
        >
          <div className="text-xs mb-2" style={{ color: "T.textMuted" }}>Try saying:</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: "T.border",
                  color: "T.textSecondary",
                  border: "1px solid T.borderLight",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div
          className="px-5 py-4 shrink-0"
          style={{ borderTop: "1px solid T.border" }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ background: "T.surface", border: "1px solid T.borderLight" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
              placeholder="Adjust labor rate, change PSI, edit margin..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "T.textPrimary" }}
            />
            <button
              onClick={() => handleSend(input)}
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "T.accent" }}
            >
              <Send size={12} color="white" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}