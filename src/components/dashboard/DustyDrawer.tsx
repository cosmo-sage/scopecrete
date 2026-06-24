"use client";

import React, { useState, useRef, useEffect } from "react";
import { DA } from "@/lib/design-tokens";

interface DustyMessage {
  role: "dusty" | "user";
  text: string;
  suggestions?: string[];
}

interface DustyDrawerProps {
  open: boolean;
  onClose: () => void;
  context?: {
    leadId?: string;
    leadName?: string;
    page?: string;
  };
}

const DEFAULT_MESSAGES: DustyMessage[] = [
  {
    role: "dusty",
    text: "👋 Hi there! I'm Dusty, your concrete estimating assistant. What can I help you with today?",
    suggestions: ["Build a new scope", "Check a lead status", "Review an estimate"],
  },
];

export default function DustyDrawer({ open, onClose, context }: DustyDrawerProps) {
  const [messages, setMessages] = useState<DustyMessage[]>(DEFAULT_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setTyping(true);

    // Simulate Dusty response
    await new Promise((r) => setTimeout(r, 1200));
    setTyping(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "dusty",
        text: `Great question! For "${userText.slice(0, 40)}..." — let me pull that up for you. Is there a specific lead or estimate you'd like me to look at?`,
        suggestions: ["Yes, show me leads", "Not sure — what can you do?"],
      },
    ]);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 rounded-t-3xl z-50 flex flex-col"
        style={{ background: "#1A1A1A", maxHeight: "85vh", height: "85vh" }}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-9 h-1 rounded-full" style={{ background: "#444" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid #333" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ background: DA.accent }}
            >
              ✨
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Dusty</div>
              <div className="text-xs" style={{ color: "#9CA3AF" }}>
                AI Assistant
                {context?.leadName ? ` · ${context.leadName}` : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "#2D2D2D", border: "none", cursor: "pointer", color: "#9CA3AF" }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className="flex items-end gap-2"
              style={{ flexDirection: msg.role === "user" ? "row-reverse" : "row" }}
            >
              {msg.role === "dusty" && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ background: DA.accent }}
                >
                  ✨
                </div>
              )}
              <div
                className="max-w-[78%] rounded-2xl px-3 py-2 text-xs"
                style={{
                  background: msg.role === "user" ? DA.accent : "#2D2D2D",
                  color: "white",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex items-end gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ background: DA.accent }}
              >
                ✨
              </div>
              <div
                className="rounded-2xl px-3 py-2 flex gap-1"
                style={{ background: "#2D2D2D", borderRadius: "18px 18px 18px 4px" }}
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-bounce" style={{ background: "#666", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-bounce" style={{ background: "#666", animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-bounce" style={{ background: "#666", animationDelay: "400ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages[messages.length - 1]?.suggestions && (
          <div
            className="px-5 pb-3 flex gap-2 overflow-x-auto"
            style={{ flexShrink: 0, scrollbarWidth: "none" }}
          >
            {messages[messages.length - 1].suggestions?.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs"
                style={{ background: "#2D2D2D", border: "1px solid #444", color: "white", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="px-5 pb-5 pt-3 flex gap-2 items-center"
          style={{ borderTop: "1px solid #333", flexShrink: 0 }}
        >
          <div
            className="flex-1 rounded-full px-4 py-2.5 text-sm"
            style={{ background: "#2D2D2D" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask Dusty anything..."
              className="w-full bg-transparent outline-none text-white text-sm placeholder:text-white/40"
            />
          </div>
          <button
            onClick={sendMessage}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ background: DA.accent, border: "none", cursor: "pointer" }}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
}
