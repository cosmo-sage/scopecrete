"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatCircle, Phone, WarningCircle } from "@phosphor-icons/react";
import { DA } from "@/lib/design-tokens";

// ─── Types ────────────────────────────────────────────────────
// Mirrors the Thread shape returned by /api/threads.
interface Thread {
  contact_id: string;
  display_name: string;
  name_is_phone: boolean;
  phone: string | null;
  contact_type: string | null;
  contact_subtype: string | null;
  channel: string | null;
  direction: string | null;
  occurred_at: string | null;
  preview: string;
  preview_source: "body" | "summary" | "synthesised";
  msg_count: number;
}

/**
 * Avatar content for a thread.
 *
 * 124 of 144 contacts have no name, so this is the normal path, not the edge.
 * The previous implementation called getInitials(name || "UN"), which stamped a
 * literal "UN" on ~85% of rows. Where there is a real name we take initials;
 * otherwise we take the last two digits of the phone, which at least varies per
 * row and is traceable to the number on screen. Never invent a name — names are
 * governed by contact_name_claims and nothing here may write contacts.name.
 */
function avatarGlyph(t: Thread): string {
  if (!t.name_is_phone && t.display_name.trim()) {
    return t.display_name
      .split(/\s+/).slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join("");
  }
  const digits = (t.phone ?? "").replace(/[^\d]/g, "");
  return digits.length >= 2 ? digits.slice(-2) : "·";
}

function timeAgo(ts: string | null): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "Yesterday";
  if (d < 365) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function MessagesPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/threads")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        setThreads(Array.isArray(data.threads) ? data.threads : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col" style={{ background: DA.bg, minHeight: "100%" }}>
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
          {!loading && !error && (
            <span className="ml-2 text-[10px] font-normal" style={{ color: DA.textMuted }}>
              {threads.length}
            </span>
          )}
        </div>
        <div className="w-8 h-8" />
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: DA.surface }} />
            ))}
          </div>
        ) : error ? (
          // Errors are shown, not swallowed. A thread list that silently renders
          // empty on a 401 looks identical to an empty inbox.
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <WarningCircle size={36} color={DA.error} />
            <p className="text-sm mt-3 font-semibold" style={{ color: DA.textPrimary }}>
              Couldn&apos;t load messages
            </p>
            <p className="text-xs mt-1 break-words" style={{ color: DA.textMuted }}>{error}</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <ChatCircle size={40} color={DA.textMuted} />
            <p className="text-sm mt-3" style={{ color: DA.textMuted }}>No messages yet</p>
          </div>
        ) : (
          threads.map((t) => (
            <button
              key={t.contact_id}
              onClick={() => router.push(`/dashboard/messages/${t.contact_id}`)}
              className="w-full text-left px-4 py-3 transition-colors"
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
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ background: t.name_is_phone ? DA.textMuted : DA.accent }}
                >
                  {avatarGlyph(t)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {t.channel === "call" && (
                        <Phone size={12} color={DA.textMuted} weight="fill" className="shrink-0" />
                      )}
                      <span
                        className="font-semibold text-sm truncate"
                        style={{
                          color: DA.textPrimary,
                          // A phone number shown in place of a name is rendered
                          // in a tabular font so it reads as an identifier
                          // rather than as somebody actually called "(225)…".
                          fontVariantNumeric: t.name_is_phone ? "tabular-nums" : "normal",
                        }}
                      >
                        {t.display_name}
                      </span>
                      {t.contact_type && t.contact_type !== "customer" && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                          style={{ background: DA.elevated, color: DA.textMuted }}
                        >
                          {t.contact_subtype || t.contact_type}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: DA.textMuted }}>
                      {timeAgo(t.occurred_at)}
                    </span>
                  </div>

                  {/* Fixed height so the 3% of rows that have a summary do not
                      reflow the list against the 97% that do not. */}
                  <div
                    className="text-xs mt-0.5 truncate"
                    style={{
                      color: t.preview_source === "synthesised" ? DA.textMuted : DA.textSecondary,
                      fontStyle: t.preview_source === "synthesised" ? "italic" : "normal",
                      minHeight: "1.1rem",
                      lineHeight: "1.1rem",
                    }}
                  >
                    {t.preview}
                  </div>
                </div>

                {t.msg_count > 1 && (
                  <span
                    className="text-[10px] shrink-0 mt-0.5 tabular-nums"
                    style={{ color: DA.textMuted }}
                  >
                    {t.msg_count}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
