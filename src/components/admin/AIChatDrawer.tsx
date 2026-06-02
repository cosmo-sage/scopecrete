"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkle, FirstAid, PaperPlaneRight, CircleNotch } from "@phosphor-icons/react";

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
  { id: "dusty" as const, label: "Dusty", icon: Sparkle, desc: "Full DB access — contractors, leads, pricing" },
  { id: "doctor" as const, label: "Doctor", icon: FirstAid, desc: "VPS management — restart services, check logs" },
];

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e85d04" }}>
        <Sparkle size={14} weight="fill" color="white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]" style={{ background: "#18181b", border: "1px solid #27272a" }}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full inline-block" style={{
              background: "#71717a",
              animation: `bounce 1.2s ease-in-out ${i * 200}ms infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const SYSTEM_PROMPTS = {
  dusty: `You are Dusty, the ScopeCrete platform admin assistant. You have FULL ACCESS to the entire Supabase database — all contractors, all orgs, all leads, all pricing, all market data. You can read and analyze anything.

You help the platform admin (admin@scopecrete.ai) manage the ScopeCrete contractor platform. You can:
- Query and summarize all contractor orgs, members, and leads
- Analyze market pricing data
- Review feedback from contractors
- Generate reports on platform health

Be direct, concise, and actionable. When you answer with data, cite specific numbers. When you can't access something, say so clearly.`,
  doctor: `You are Doctor, the ScopeCrete VPS infrastructure agent. You have direct access to the VPS at root@2.24.30.51 (Hostinger Ubuntu 22.04).

You help manage the ScopeCrete platform infrastructure:
- Check and restart services (PM2, Docker, Nginx, SSH tunnels)
- View logs and system status
- Deploy code updates
- Monitor disk/memory/CPU
- Manage the Dusty/Ollama SSH tunnel

Be direct and technical. When running commands, report the actual output. When something is wrong, diagnose and suggest a fix.`,
};

export default function AIChatDrawer({ open, onClose, defaultTab = "dusty" }: AIChatDrawerProps) {
  const [activeTab, setActiveTab] = useState<"dusty" | "doctor">(defaultTab);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-open when `open` becomes true
  useEffect(() => {
    if (open) setDrawerOpen(true);
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
    if (messages.length === 0) {
      setMessages([{
        role: "agent",
        text: `I'm ${tab === "dusty" ? "Dusty" : "Doctor"}. ${tab === "dusty" ? SYSTEM_PROMPTS.dusty : SYSTEM_PROMPTS.doctor}`,
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
          background: "#09090b",
          borderLeft: "1px solid #27272a",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
          transition: "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Tab bar */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid #27272a" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
              style={{
                background: activeTab === tab.id ? "#18181b" : "transparent",
                borderBottom: activeTab === tab.id ? "2px solid #e85d04" : "2px solid transparent",
                cursor: "pointer",
                border: "none",
              }}
            >
              <tab.icon size={18} weight={activeTab === tab.id ? "fill" : "regular"} color={activeTab === tab.id ? "#e85d04" : "#71717a"} />
              <span className="text-[11px] font-semibold" style={{ color: activeTab === tab.id ? "#e85d04" : "#71717a" }}>{tab.label}</span>
            </button>
          ))}
          <button onClick={onClose} className="absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#27272a", color: "#71717a", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>

        {/* Agent description */}
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: "1px solid #27272a", background: "#18181b" }}>
          <p className="text-[11px]" style={{ color: "#71717a" }}>
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
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2" style={{ background: "#e85d04" }}>
                  {activeTab === "dusty" ? <Sparkle size={12} weight="fill" color="white" /> : <FirstAid size={12} color="white" />}
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                style={
                  msg.role === "user"
                    ? { background: "#27272a", color: "#fafafa", border: "1px solid #3f3f46" }
                    : { background: "#18181b", color: "#fafafa", border: "1px solid #27272a" }
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
          {typing && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid #27272a" }}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: "#18181b", border: "1px solid #3f3f46" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder={`Message ${activeTab === "dusty" ? "Dusty" : "Doctor"}...`}
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none"
              style={{ color: "#fafafa", maxHeight: "6rem", overflowY: "auto" }}
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || typing}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-30"
              style={{ background: "#e85d04" }}
            >
              {typing ? <CircleNotch size={14} color="white" className="animate-spin" /> : <PaperPlaneRight size={14} color="white" />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </>
  );
}