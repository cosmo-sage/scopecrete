"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatCircle } from "@phosphor-icons/react";
import { DA } from "@/lib/design-tokens";

// ─── Types ────────────────────────────────────────────────────
interface MessageThread {
  id: string;
  contact_name?: string;
  contact_phone?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
}

// ─── Mock threads ──────────────────────────────────────────────
const MOCK_THREADS: MessageThread[] = [
  {
    id: "thread-001",
    contact_name: "Marcus Thibodaux",
    contact_phone: "(225) 555-0177",
    last_message: "Yes please! Also can you send photos of the materials you'd use?",
    last_message_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    unread_count: 2,
  },
  {
    id: "thread-002",
    contact_name: "Fatima Osei",
    contact_phone: "(225) 777-8823",
    last_message: "Thanks for the quote! When can you start?",
    last_message_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    unread_count: 1,
  },
  {
    id: "thread-003",
    contact_name: "Victoria Patel",
    contact_phone: "(985) 555-0100",
    last_message: "Perfect! Sign the papers and we're good to go.",
    last_message_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unread_count: 0,
  },
  {
    id: "thread-004",
    contact_name: "Brandon Pierce",
    contact_phone: "(504) 889-2211",
    last_message: "Hi, I'm interested in a new construction project...",
    last_message_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    unread_count: 0,
  },
];

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase() || "").join("");
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

export default function MessagesPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<MessageThread[]>(MOCK_THREADS);
  const [loading] = useState(false);

  const totalUnread = threads.reduce((s, t) => s + (t.unread_count || 0), 0);

  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
      {/* Status bar */}
      <div className="h-11 px-6 flex items-end pb-1 justify-between flex-shrink-0">
        <span className="text-xs font-semibold" style={{ color: "rgba(0,0,0,0.4)" }}>
          {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs">📶</span>
          <span className="text-xs">🔋</span>
        </div>
      </div>

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ background: DA.surface, borderBottom: `1px solid ${DA.border}` }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ background: DA.accent }}
        >
          S
        </div>
        <div className="font-bold text-sm" style={{ color: DA.textPrimary }}>
          Messages
          {totalUnread > 0 && (
            <span
              className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: DA.error, color: "#fff" }}
            >
              {totalUnread}
            </span>
          )}
        </div>
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: DA.elevated, border: "none", cursor: "pointer", color: DA.textMuted }}
        >
          🔍
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: DA.surface }} />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <ChatCircle size={40} color={DA.textMuted} />
            <p className="text-sm mt-3" style={{ color: DA.textMuted }}>
              No messages yet
            </p>
          </div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => router.push(`/dashboard/messages/${thread.id}`)}
              className="w-full text-left px-4 py-4 transition-colors"
              style={{
                background: DA.surface,
                borderBottom: `1px solid ${DA.border}`,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = DA.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = DA.surface)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                  style={{ background: DA.accent }}
                >
                  {getInitials(thread.contact_name || "UN")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm truncate" style={{ color: DA.textPrimary }}>
                      {thread.contact_name || thread.contact_phone || "Unknown"}
                    </div>
                    <div className="text-[10px] shrink-0 ml-2" style={{ color: DA.textMuted }}>
                      {thread.last_message_at ? timeAgo(thread.last_message_at) : ""}
                    </div>
                  </div>
                  {thread.last_message && (
                    <div className="text-xs truncate mt-0.5" style={{ color: DA.textSecondary }}>
                      {thread.last_message}
                    </div>
                  )}
                </div>
                {(thread.unread_count ?? 0) > 0 && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ background: DA.error }}
                  >
                    {thread.unread_count}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
