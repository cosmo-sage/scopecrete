"use client";

import React from "react";
import { DA } from "@/lib/design-tokens";
import { useRouter } from "next/navigation";

interface ToolboxDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
}

const TOOLS = [
  { icon: "📷", label: "Photos", action: "photos" },
  { icon: "🎤", label: "Voice Note", action: "voice" },
  { icon: "✏️", label: "Text Note", action: "note" },
  { icon: "📐", label: "Scope Builder", action: "scope" },
  { icon: "📄", label: "Plan Room", action: "plans" },
  { icon: "📤", label: "Send Quote", action: "quote" },
  { icon: "📞", label: "Call Log", action: "calls" },
  { icon: "⚙️", label: "Settings", action: "settings" },
];

export default function ToolboxDrawer({ open, onClose, leadId }: ToolboxDrawerProps) {
  const router = useRouter();

  const handleAction = (action: string) => {
    onClose();
    if (action === "scope" && leadId) {
      router.push(`/scope-builder/${leadId}`);
    } else if (action === "plans" && leadId) {
      router.push(`/scope-builder/${leadId}?tab=plan`);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 bottom-0 w-52 rounded-l-2xl z-50 flex flex-col"
        style={{ background: DA.surface, boxShadow: "-4px 0 20px rgba(0,0,0,0.3)" }}
      >
        {/* Header */}
        <div className="px-4 py-5" style={{ borderBottom: `1px solid ${DA.border}` }}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: DA.textMuted }}>
            Tools
          </div>
        </div>

        {/* Tools list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {TOOLS.map((tool) => (
              <button
                key={tool.action}
                onClick={() => handleAction(tool.action)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors active:scale-95"
                style={{ color: DA.textPrimary, cursor: "pointer", background: "transparent", border: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = DA.bg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span className="text-base" role="img">{tool.icon}</span>
                <span className="font-medium">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
