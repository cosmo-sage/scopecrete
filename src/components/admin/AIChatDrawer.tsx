"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Lightning, PaperPlaneRight, CircleNotch, Plus } from "@phosphor-icons/react";
import { SC } from "@/lib/theme";

interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  attachments?: any[];
  created_at?: string;
}

interface Session {
  id: string;
  agent: "dusty" | "doctor";
  title: string;
  created_at: string;
  updated_at: string;
}

interface AIChatDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "dusty" | "doctor";
}

const AGENT_ICONS = { dusty: Lightning, doctor: Lightning };

const SYSTEM_PROMPTS = {
  dusty: "You are Dusty, ScopeCrete's AI assistant for platform admins. You have FULL ACCESS to the entire Supabase database — all contractors, orgs, leads, contacts, market pricing, feedback. Be direct, cite specific numbers.",
  doctor: "You are Doctor, ScopeCrete's VPS infrastructure agent. You manage root@2.24.30.51 — PM2, Docker, Nginx, system monitoring. Be direct and technical.",
};

function TypingIndicator({ agent }: { agent: "dusty" | "doctor" }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: SC.accent }}>
        <Lightning size={12} weight="fill" color="white" />
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

export default function AIChatDrawer({ open, onClose, defaultTab = "dusty" }: AIChatDrawerProps) {
  const [activeTab, setActiveTab] = useState<"dusty" | "doctor">(defaultTab);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions on tab change
  useEffect(() => {
    if (!open) return;
    fetchSessions();
  }, [open, activeTab]);

  // Load messages when session changes
  useEffect(() => {
    if (!currentSession) return;
    fetchMessages(currentSession.id);
  }, [currentSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`/api/admin/chat/sessions?agent=${activeTab}`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/admin/chat/sessions/${sessionId}/messages`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  };

  const createSession = async () => {
    try {
      const res = await fetch("/api/admin/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: activeTab, title: `New ${activeTab} session` }),
      });
      const data = await res.json();
      if (data.session) {
        setCurrentSession(data.session);
        setMessages([]);
        fetchSessions();
      }
    } catch { /* ignore */ }
  };

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Auto-create session if none selected
    let session = currentSession;
    if (!session) {
      try {
        const res = await fetch("/api/admin/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: activeTab }),
        });
        const data = await res.json();
        session = data.session;
        setCurrentSession(session);
        fetchSessions();
      } catch { return; }
    }

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setTyping(true);

    try {
      const res = await fetch(`/api/admin/chat/sessions/${session!.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, agent: activeTab }),
      });
      const data = await res.json();
      setTyping(false);
      if (data.message) {
        setMessages((m) => [...m, data.message]);
      } else if (data.error) {
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch {
      setTyping(false);
      setMessages((m) => [...m, { role: "assistant", content: "Failed to send message." }]);
    }
  }, [currentSession, activeTab]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "assistant", content: SYSTEM_PROMPTS[activeTab] }]);
    }
  }, [open, activeTab]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{ width: 480, maxWidth: "100vw", background: SC.bg, borderLeft: `1px solid ${SC.border}`, boxShadow: "-8px 0 40px rgba(0,0,0,0.5)" }}>

        {/* Tab bar */}
        <div className="flex shrink-0 relative" style={{ borderBottom: `1px solid ${SC.border}` }}>
          {(["dusty", "doctor"] as const).map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setCurrentSession(null); setMessages([]); }}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
              style={{ background: activeTab === tab ? SC.surface : "transparent", borderBottom: activeTab === tab ? `2px solid ${SC.accent}` : "2px solid transparent", cursor: "pointer", border: "none" }}>
              <Lightning size={18} weight={activeTab === tab ? "fill" : "regular"} color={activeTab === tab ? SC.accent : SC.textMuted} />
              <span className="text-[11px] font-semibold" style={{ color: activeTab === tab ? SC.accent : SC.textMuted }}>{tab === "dusty" ? "Dusty" : "Doctor"}</span>
            </button>
          ))}
          <button onClick={onClose} className="absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: SC.elevated, color: SC.textMuted, border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>

        {/* Sessions + new session bar */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${SC.border}`, background: SC.surface }}>
          <button onClick={() => setSessionOpen(!sessionOpen)} className="text-[10px] font-semibold px-2 py-1 rounded transition-all" style={{ background: SC.elevated, color: SC.textMuted, border: "none", cursor: "pointer" }}>
            {sessionOpen ? "▼" : "▲"} Sessions
          </button>
          <button onClick={createSession} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-all" style={{ background: SC.accentMuted, color: SC.accent, border: "none", cursor: "pointer" }}>
            <Plus size={10} /> New
          </button>
          {currentSession && (
            <span className="text-[10px] truncate flex-1" style={{ color: SC.textMuted }}>{currentSession.title}</span>
          )}
        </div>

        {/* Session list */}
        {sessionOpen && (
          <div className="shrink-0 max-h-48 overflow-y-auto" style={{ borderBottom: `1px solid ${SC.border}`, background: SC.surface }}>
            {sessions.length === 0 ? (
              <p className="text-xs p-3" style={{ color: SC.textMuted }}>No sessions yet. Start chatting to create one.</p>
            ) : sessions.map((s) => (
              <button key={s.id} onClick={() => { setCurrentSession(s); setSessionOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs transition-all truncate"
                style={{ background: currentSession?.id === s.id ? SC.accentMuted : "transparent", color: currentSession?.id === s.id ? SC.accent : SC.textSecondary, border: "none", cursor: "pointer" }}>
                {s.title}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: "contain" }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2" style={{ background: SC.accent }}>
                  <Lightning size={12} weight="fill" color="white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                style={msg.role === "user"
                  ? { background: SC.elevated, color: SC.textPrimary, border: `1px solid ${SC.border}` }
                  : { background: SC.surface, color: SC.textPrimary, border: `1px solid ${SC.border}` }}>
                {msg.content}
              </div>
            </div>
          ))}
          {typing && <TypingIndicator agent={activeTab} />}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${SC.border}`, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: SC.surface, border: `1px solid ${SC.border}` }}>
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
              placeholder={`Message ${activeTab === "dusty" ? "Dusty" : "Doctor"}...`} rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none" style={{ color: SC.textPrimary, maxHeight: "6rem", overflowY: "auto" }} />
            <button onClick={() => handleSend(input)} disabled={!input.trim() || typing}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-30"
              style={{ background: SC.accent, cursor: "pointer", border: "none" }}>
              {typing ? <CircleNotch size={14} color="white" className="animate-spin" /> : <PaperPlaneRight size={14} color="white" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}