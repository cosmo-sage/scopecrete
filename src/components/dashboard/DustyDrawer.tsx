"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkle, PaperPlaneRight } from "@phosphor-icons/react";

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
  "/": ["Price a driveway", "How much for a slab?", "What PSI do I need?"],
  default: ["Price concrete", "Start a conversation", "Get help"],
};

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "#e85d04" }}
      >
        <Sparkle size={14} weight="fill" color="white" />
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]"
        style={{ background: "#18181b", border: "1px solid #27272a" }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full inline-block"
              style={{
                background: "#71717a",
                animation: `bounce 1.2s ease-in-out ${i * 200}ms infinite`,
              }}
            />
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
  const [drawerHeight, setDrawerHeight] = useState(70); // vh
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(70);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const greeting = CONTEXT_GREETINGS[pathname] || CONTEXT_GREETINGS["default"];
  const suggestions = SUGGESTION_CHIPS[pathname] || SUGGESTION_CHIPS["default"];

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "agent", text: greeting }]);
    }
  }, [open, greeting, messages.length]);

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
      setMessages((m) => [
        ...m,
        { role: "agent", text: "Got it — I'll help with that. Let me pull up the details." },
      ]);
    }, 1500);
  };

  // Drag to resize (mobile only)
  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartHeight.current = drawerHeight;
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = dragStartY.current - clientY;
      const deltaVh = (delta / window.innerHeight) * 100;
      const newHeight = Math.min(90, Math.max(20, dragStartHeight.current + deltaVh));
      setDrawerHeight(newHeight);
    };
    const handleEnd = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  if (!open) return null;

  // Mobile: bottom sheet, Desktop: right panel
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

  return (
    <>
      {/* Backdrop */}
      {isDesktop && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed z-50 flex flex-col"
        style={
          isDesktop
            ? {
                right: 0,
                top: 0,
                bottom: 0,
                width: 380,
                background: "#09090b",
                borderLeft: "1px solid #27272a",
                boxShadow: "-8px 0 40px rgba(0,0,0,0.4)",
              }
            : {
                left: 0,
                right: 0,
                bottom: 0,
                height: `${drawerHeight}vh`,
                background: "#09090b",
                borderTop: "1px solid #27272a",
                borderRadius: "16px 16px 0 0",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
              }
        }
      >
        {/* Drag handle (mobile only) */}
        {isDesktop ? null : (
          <div
            className="w-10 h-1 rounded-full mx-auto mt-2 mb-1 shrink-0 cursor-grab active:cursor-grabbing"
            style={{ background: "#3f3f46" }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          />
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid #27272a" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "#e85d04" }}
            >
              <Sparkle size={16} weight="fill" color="white" />
            </div>
            <div>
              <div
                className="text-sm font-bold"
                style={{ color: "#e85d04" }}
              >
                Dusty
              </div>
              <div
                className="text-[10px]"
                style={{ color: "#71717a" }}
              >
                {pathname === "/" ? "General" : pathname.replace("/", "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: "#27272a", color: "#71717a", border: "none", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
          style={{ overscrollBehavior: "contain" }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "agent" && (
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mr-2 mt-0.5"
                  style={{ background: "#e85d04" }}
                >
                  <Sparkle size={12} weight="fill" color="white" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-tr-sm"
                    : "rounded-tl-sm"
                }`}
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

        {/* Suggestion chips */}
        <div
          className="px-4 py-2 shrink-0"
          style={{ borderTop: "1px solid #27272a" }}
        >
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all active:scale-95"
                style={{
                  background: "#27272a",
                  color: "#a1a1aa",
                  border: "1px solid #3f3f46",
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid #27272a" }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ background: "#18181b", border: "1px solid #3f3f46" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder="Message Dusty..."
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none"
              style={{
                color: "#fafafa",
                maxHeight: "6rem",
                overflowY: "auto",
              }}
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-30"
              style={{ background: "#e85d04" }}
            >
              <PaperPlaneRight size={14} color="white" />
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