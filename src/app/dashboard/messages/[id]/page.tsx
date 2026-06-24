"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Phone, PaperPlaneRight, Paperclip, ArrowLeft } from "@phosphor-icons/react";
import { DA } from "@/lib/design-tokens";
import DustyDrawer from "@/components/dashboard/DustyDrawer";
import ToolboxDrawer from "@/components/dashboard/ToolboxDrawer";

// ─── Types ────────────────────────────────────────────────────
interface Message {
  role: "customer" | "dusty" | "system";
  text: string;
  timestamp: string;
  hasQuote?: boolean;
  quoteData?: {
    title: string;
    subtitle: string;
    subtotal: number;
    markup: number;
    total: number;
  };
}

interface Thread {
  id: string;
  contact_name: string;
  contact_phone: string;
  messages: Message[];
}

// ─── Mock data ────────────────────────────────────────────────
const MOCK_THREADS: Record<string, Thread> = {
  "thread-001": {
    id: "thread-001",
    contact_name: "Marcus Thibodaux",
    contact_phone: "(225) 555-0177",
    messages: [
      {
        role: "dusty",
        text: "Hi Marcus! Saw your request for a driveway estimate. Can you tell me about the current condition?",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        role: "customer",
        text: "Hey! Yeah it's a 2-car driveway, about 2,400 sq ft. Some cracks but mostly surface damage.",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3 * 60 * 1000).toISOString(),
      },
      {
        role: "dusty",
        text: "Got it. For a repair like that I'd recommend 4\" depth with rebar. Want me to put together a quote?",
        timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        role: "customer",
        text: "Yes please! Also can you send photos of the materials you'd use?",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        role: "dusty",
        text: "Here's the quote I promised! Let me know if you have any questions.",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        hasQuote: true,
        quoteData: {
          title: "📋 ScopeCrete Estimate",
          subtitle: "Driveway Repair · 2,400 sq ft",
          subtotal: 3217,
          markup: 660,
          total: 3877,
        },
      },
    ],
  },
  "thread-002": {
    id: "thread-002",
    contact_name: "Fatima Osei",
    contact_phone: "(225) 777-8823",
    messages: [
      {
        role: "dusty",
        text: "Hi Fatima! Got your request for a pool deck. How big is the area?",
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        role: "customer",
        text: "Hi! About 800 sq ft. It's around a pool.",
        timestamp: new Date(Date.now() - 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      },
      {
        role: "dusty",
        text: "Thanks! I'll get you an estimate shortly.",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
  },
};

const DEFAULT_THREAD: Thread = {
  id: "thread-001",
  contact_name: "Marcus Thibodaux",
  contact_phone: "(225) 555-0177",
  messages: MOCK_THREADS["thread-001"].messages,
};

// ─── Helpers ───────────────────────────────────────────────────
function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString()}`;
}

function formatMsgTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Quick reply chips ─────────────────────────────────────────
const QUICK_REPLIES = [
  "New driveway",
  "Small pad",
  "Foundation",
  "Repair",
  "Patio",
  "Pool deck",
];

// ─── Main Page ─────────────────────────────────────────────────
export default function ChatThreadPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params?.id as string;
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = MOCK_THREADS[threadId] || DEFAULT_THREAD;
  const [messages, setMessages] = useState<Message[]>(thread.messages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dustyOpen, setDustyOpen] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "customer", text: userText, timestamp: new Date().toISOString() },
    ]);
    setTyping(true);
    await new Promise((r) => setTimeout(r, 1000));
    setTyping(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "dusty",
        text: "Got it! I'll follow up with more details shortly.",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="flex flex-col" style={{ background: "#1A1A1A", height: "100dvh" }}>
      {/* Status bar */}
      <div className="h-11 px-6 flex items-end pb-1 justify-between flex-shrink-0">
        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
          {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">📶</span>
          <span className="text-xs">🔋</span>
        </div>
      </div>

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: "#1A1A1A", borderBottom: "1px solid #333" }}
      >
        <button
          onClick={() => router.back()}
          className="text-white/60 text-sm"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          ←
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          style={{ background: DA.accent }}
        >
          {thread.contact_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-white">{thread.contact_name}</div>
          <div className="text-xs text-white/40">Online</div>
        </div>
        <a
          href={`tel:${thread.contact_phone}`}
          className="text-white/40"
          style={{ textDecoration: "none" }}
        >
          <Phone size={18} />
        </a>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className="flex items-end gap-2"
            style={{ flexDirection: msg.role === "customer" ? "row-reverse" : "row" }}
          >
            {msg.role !== "customer" && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ background: DA.accent }}
              >
                S
              </div>
            )}
            <div
              className="max-w-[78%] rounded-2xl px-3 py-2 text-xs"
              style={{
                background: msg.role === "customer" ? DA.accent : "#2D2D2D",
                color: "white",
                borderRadius:
                  msg.role === "customer" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              }}
            >
              {/* Quote card */}
              {msg.hasQuote && msg.quoteData && (
                <div
                  className="rounded-lg overflow-hidden mb-2"
                  style={{ background: "#2D2D2D", border: "1px solid #444" }}
                >
                  <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="text-xs font-semibold text-white">
                      {msg.quoteData.title}
                    </div>
                    <div className="text-[10px] text-white/50">{msg.quoteData.subtitle}</div>
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Subtotal</span>
                      <span className="text-white">
                        {formatCurrency(msg.quoteData.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/60">Markup 25%</span>
                      <span className="text-white">
                        {formatCurrency(msg.quoteData.markup)}
                      </span>
                    </div>
                    <div
                      className="flex justify-between text-xs font-bold pt-1 mt-1"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      <span className="text-white">Total</span>
                      <span style={{ color: DA.accent }}>
                        {formatCurrency(msg.quoteData.total)}
                      </span>
                    </div>
                  </div>
                  <div
                    className="p-2 flex gap-2"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <button
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white"
                      style={{ background: DA.accent, border: "none", cursor: "pointer" }}
                    >
                      Approve
                    </button>
                    <button
                      className="flex-1 rounded-lg py-1.5 text-xs text-white/60"
                      style={{ background: "#333", border: "none", cursor: "pointer" }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
              {msg.text}
              <div
                className="text-[10px] mt-1 text-right"
                style={{
                  color: msg.role === "customer"
                    ? "rgba(255,255,255,0.7)"
                    : "rgba(255,255,255,0.5)",
                }}
              >
                {formatMsgTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex items-end gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ background: DA.accent }}
            >
              S
            </div>
            <div
              className="rounded-2xl px-3 py-2 flex gap-1"
              style={{ background: "#2D2D2D", borderRadius: "18px 18px 18px 4px" }}
            >
              {[0, 200, 400].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{
                    background: "#666",
                    animation: `typingBounce 1.2s infinite`,
                    animationDelay: `${d}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div
        className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0"
        style={{ borderTop: "1px solid #333", scrollbarWidth: "none" }}
      >
        {QUICK_REPLIES.map((r) => (
          <button
            key={r}
            onClick={() => setInput(r)}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs"
            style={{
              background: "#2D2D2D",
              border: "1px solid #444",
              color: "white",
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div
        className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ borderTop: "1px solid #333", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button className="text-white/40 text-lg shrink-0" style={{ background: "none", border: "none", cursor: "pointer" }}>
          📎
        </button>
        <div
          className="flex-1 rounded-full px-4 py-2.5 text-sm"
          style={{ background: "#2D2D2D" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="w-full bg-transparent outline-none text-white text-sm placeholder:text-white/40"
          />
        </div>
        <button
          onClick={sendMessage}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: DA.accent, border: "none", cursor: "pointer" }}
        >
          <PaperPlaneRight size={16} />
        </button>
      </div>

      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>

      <DustyDrawer
        open={dustyOpen}
        onClose={() => setDustyOpen(false)}
        context={{ leadName: thread.contact_name }}
      />
      <ToolboxDrawer open={toolboxOpen} onClose={() => setToolboxOpen(false)} />
    </div>
  );
}
