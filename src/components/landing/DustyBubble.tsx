"use client";

import { useState } from "react";
import { X, MessageCircle } from "lucide-react";

const C = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  elevated: "#EEF2F8",
  accent: "#2457F5",
  accentMuted: "rgba(36,87,245,0.08)",
  text: "#1F2937",
  textMuted: "#78716C",
  border: "#E5E7EB",
};

export default function DustyBubble() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          background: C.accent,
          boxShadow: "0 4px 24px rgba(255,215,0,0.35)",
        }}
        aria-label="Open Dusty chat"
      >
        <MessageCircle size={24} color="#FAFAF9" />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      {/* Modal container */}
      <div
        className="relative w-full max-w-lg h-[600px] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${C.border}`, background: C.elevated }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: C.accent }}
            >
              <MessageCircle size={14} color="#FAFAF9" />
            </div>
            <span className="text-sm font-semibold" style={{ color: C.text }}>
              Dusty
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.accentMuted, color: C.accent }}>
              Live
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors hover:opacity-80"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
            aria-label="Close"
          >
            <X size={14} style={{ color: C.textMuted }} />
          </button>
        </div>

        {/* Iframe */}
        <iframe
          src="/dusty?source=landing"
          className="flex-1 w-full border-0"
          title="Chat with Dusty"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}