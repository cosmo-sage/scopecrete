"use client";

import { useState, useEffect, useRef } from "react";
import { X, Lightning, PaperPlaneRight } from "@phosphor-icons/react";
import { SC } from "@/lib/theme";

interface Message {
  role: "user" | "agent";
  text: string;
}

const CONTEXT_GREETINGS: Record<string, string> = {
  "/dashboard": "Looking at your pipeline. What do you need?",
  "/dashboard/leads": "Looking at your leads. What do you need?",
  "/calculator": "Ready to price a project. What are we working with?",
  "/scope-builder": "Building a scope. What are we pricing?",
  "/cost-cards": "Working on costs. Which card?",
  "/": "Hi! I'm Dusty, your concrete assistant.",
  default: "Hi! I'm Dusty. What can I help you with?",
};

const SUGGESTION_CHIPS: Record<string, string[]> = {
  "/dashboard": ["Show hot leads", "Summarize this week", "What's pending?"],
  "/dashboard/leads": ["Show new leads", "By source", "Sort by value"],
  "/calculator": ["Price 20x30x4", "What does 4000 PSI cost?", "Add 10% waste"],
  "/scope-builder": ["Add line item", "Price this scope", "Save to lead"],
  "/": ["Price concrete", "Start a conversation", "Get help"],
  default: ["Price concrete", "Start a conversation", "Get help"],
};

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: SC.accent }}>
        <Lightning size={14} weight="fill" color="white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full inline-block animate-bounce-dot"
              style={{ background: SC.textMuted, animationDelay: `${i * 200}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DustyDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function DustyDrawer({ open, onClose }: DustyDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const greeting = CONTEXT_GREETINGS[pathname] || CONTEXT_GREETINGS["default"];
  const suggestions = SUGGESTION_CHIPS[pathname] || SUGGESTION_CHIPS["default"];

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "agent", text: greeting }]);
      setConversation([{ role: "agent", content: greeting }]);
    }
  }, [open, greeting, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userText = text.trim();
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setInput("");
    setTyping(true);

    const updatedConversation = [...conversation, { role: "user", content: userText }];
    setConversation(updatedConversation);

    try {
      const res = await fetch("/api/chat/dusty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:0.5b",
          messages: updatedConversation.map(m => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || data.response || "Sorry, I couldn't get a response.";

      setMessages((m) => [...m, { role: "agent", text: reply }]);
      setConversation((c) => [...c, { role: "agent", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "I'm having trouble reaching the AI right now. Try again in a moment." }]);
    } finally {
      setTyping(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Full-screen panel */}
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{
          background: SC.bg,
          borderLeft: `1px solid ${SC.border}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${SC.border}`, background: SC.surface }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: SC.accent }}>
              <Lightning size={16} weight="fill" color="white" />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: SC.accent }}>Dusty</div>
              <div className="text-[10px]" style={{ color: SC.textMuted }}>
                {pathname === "/" ? "General" : pathname.replace("/", "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: SC.elevated, color: SC.textMuted, border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: "contain" }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "agent" && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2 mt-0.5"
                  style={{ background: SC.accent }}>
                  <Lightning size={12} weight="fill" color="white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
              }`}
                style={
                  msg.role === "user"
                    ? { background: SC.elevated, color: SC.textPrimary, border: `1px solid ${SC.border}` }
                    : { background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }
                }>
                {msg.text}
              </div>
            </div>
          ))}
          {typing && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        <div className="px-4 py-2 shrink-0" style={{ borderTop: `1px solid ${SC.border}` }}>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => handleSend(s)}
                className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all active:scale-95"
                style={{ background: SC.elevated, color: SC.textSecondary, border: `1px solid ${SC.border}`, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${SC.border}`, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
              placeholder="Message Dusty..."
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none"
              style={{ color: SC.textPrimary, maxHeight: "6rem", overflowY: "auto" }}
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-30"
              style={{ background: SC.accent, cursor: "pointer", border: "none" }}>
              <PaperPlaneRight size={14} color="white" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
