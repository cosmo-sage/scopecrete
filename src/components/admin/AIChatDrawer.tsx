"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkle, FirstAid, PaperPlaneRight, CircleNotch } from "@phosphor-icons/react";
import { SC } from "@/lib/theme";

interface Message {
  role: "user" | "agent";
  text: string;
  agent?: "dusty" | "doctor";
}

interface AIChatDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "dusty" | "doctor";
}

const TABS = [
  { id: "dusty" as const,   label: "Dusty",   icon: Sparkle,  desc: "Full DB access — contractors, leads, pricing" },
  { id: "doctor" as const,  label: "Doctor",  icon: FirstAid, desc: "VPS management — services, logs, deployment" },
];

export default function AIChatDrawer({ open, onClose, defaultTab = "dusty" }: AIChatDrawerProps) {
  const [activeTab, setActiveTab] = useState<"dusty" | "doctor">(defaultTab);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "agent",
        text: activeTab === "dusty"
          ? "I'm Dusty. I have full access to the entire ScopeCrete platform database. Ask me anything about contractors, leads, pricing, or platform health."
          : "I'm Doctor. I manage the VPS at root@2.24.30.51. Ask me to check services, logs, restart processes, or deploy updates.",
        agent: activeTab,
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text, agent: activeTab }]);
    setInput("");
    setTyping(true);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agent: activeTab }),
      });
      const data = await res.json();
      setTyping(false);
      setMessages((m) => [...m, { role: "agent", text: data.response || "No response.", agent: activeTab }]);
    } catch {
      setTyping(false);
      setMessages((m) => [...m, { role: "agent", text: "Error contacting agent. Try again.", agent: activeTab }]);
    }
  };

  const handleTabChange = (tab: "dusty" | "doctor") => {
    setActiveTab(tab);
    if (messages.filter(m => m.agent === tab).length === 0) {
      setMessages((m) => [...m, {
        role: "agent",
        text: tab === "dusty"
          ? "I'm Dusty. I have full access to the entire ScopeCrete platform database. Ask me anything about contractors, leads, pricing, or platform health."
          : "I'm Doctor. I manage the VPS at root@2.24.30.51. Ask me to check services, logs, restart processes, or deploy updates.",
        agent: tab,
      }]);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 480,
          maxWidth: "100vw",
          background: SC.bg,
          borderLeft: `1px solid ${SC.border}`,
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Tab bar */}
        <div className="flex shrink-0 relative" style={{ borderBottom: `1px solid ${SC.border}` }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
              style={{
                background: activeTab === tab.id ? SC.surface : "transparent",
                borderBottom: activeTab === tab.id ? `2px solid ${SC.accent}` : "2px solid transparent",
                cursor: "pointer",
                border: "none",
              }}
            >
              <tab.icon size={18} weight={activeTab === tab.id ? "fill" : "regular"}
                color={activeTab === tab.id ? SC.accent : SC.textMuted} />
              <span className="text-[11px] font-semibold"
                style={{ color: activeTab === tab.id ? SC.accent : SC.textMuted }}>
                {tab.label}
              </span>
            </button>
          ))}
          <button onClick={onClose}
            className="absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: SC.elevated, color: SC.textMuted, border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>

        {/* Agent desc */}
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${SC.border}`, background: SC.surface }}>
          <p className="text-[11px]" style={{ color: SC.textMuted }}>
            {activeTab === "dusty"
              ? "Full DB access — all contractors, leads, pricing, market data"
              : "VPS management — services, logs, deployment, tunnel"}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: "contain" }}>
          {messages.filter(m => m.agent === activeTab).map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "agent" && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2"
                  style={{ background: SC.accent }}>
                  {activeTab === "dusty"
                    ? <Sparkle size={12} weight="fill" color="white" />
                    : <FirstAid size={12} color="white" />}
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
                }`}
                style={
                  msg.role === "user"
                    ? { background: SC.elevated, color: SC.textPrimary, border: `1px solid ${SC.border}` }
                    : { background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: SC.accent }}>
                {activeTab === "dusty"
                  ? <Sparkle size={12} weight="fill" color="white" />
                  : <FirstAid size={12} color="white" />}
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
                <div className="flex gap-1">
                  {[0, 1, 2].map((idx) => (
                    <span key={idx} className="w-2 h-2 rounded-full inline-block animate-bounce-dot"
                      style={{ background: SC.textMuted, animationDelay: `${idx * 200}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${SC.border}` }}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
              }}
              placeholder={`Message ${activeTab === "dusty" ? "Dusty" : "Doctor"}...`}
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none"
              style={{ color: SC.textPrimary, maxHeight: "6rem", overflowY: "auto" }}
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || typing}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-30"
              style={{ background: SC.accent, cursor: typing ? "not-allowed" : "pointer", border: "none" }}>
              {typing
                ? <CircleNotch size={14} color="white" className="animate-spin" />
                : <PaperPlaneRight size={14} color="white" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}