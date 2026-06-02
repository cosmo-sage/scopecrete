// ScopeCrete Design System — Single Source of Truth
// All tokens, badges, labels, and constants in one place.
// Import from here — never hardcode values in pages.

// ─── Design Tokens ───────────────────────────────────────────────────────────

export const SC = {
  bg: "#09090b",
  surface: "#18181b",
  surfaceHover: "#27272a",
  elevated: "#3f3f46",
  accent: "#e85d04",
  accentMuted: "rgba(232,93,4,0.10)",
  accentGlow: "rgba(232,93,4,0.18)",
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  border: "#27272a",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
} as const;

export type DesignTokens = typeof SC;

// ─── Plan Tier Badges ──────────────────────────────────────────────────────────

export const PLAN_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  solo:    { bg: "rgba(113,113,122,0.15)",   color: "#71717a", label: "Solo" },
  growth:  { bg: "rgba(34,197,94,0.15)",     color: "#22c55e", label: "Growth" },
  pro:     { bg: "rgba(139,92,246,0.15)",    color: "#8b5cf6", label: "Pro" },
  enterprise: { bg: "rgba(232,93,4,0.15)",  color: "#e85d04", label: "Enterprise" },
};

// ─── Lead Status Badges ───────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  new:       { bg: "rgba(232,93,4,0.15)",    color: "#e85d04" },
  contacted: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
  qualified: { bg: "rgba(139,92,246,0.15)",  color: "#8b5cf6" },
  won:       { bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  lost:      { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
};

// ─── Member Role Badges ───────────────────────────────────────────────────────

export const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  owner:  { bg: "rgba(232,93,4,0.15)",      color: "#e85d04" },
  admin:  { bg: "rgba(139,92,246,0.15)",    color: "#8b5cf6" },
  member: { bg: "rgba(113,113,122,0.15)",    color: "#71717a" },
  billing:{ bg: "rgba(34,197,94,0.15)",      color: "#22c55e" },
  field:  { bg: "rgba(245,158,11,0.15)",     color: "#f59e0b" },
};

// ─── Feedback Status Badges ───────────────────────────────────────────────────

export const FEEDBACK_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(232,93,4,0.15)",      color: "#e85d04" },
  approved:{ bg: "rgba(34,197,94,0.15)",     color: "#22c55e" },
  rejected:{ bg: "rgba(239,68,68,0.15)",     color: "#ef4444" },
};

// ─── Utility Functions ────────────────────────────────────────────────────────

export function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${amount.toFixed(2)}`;
}

// ─── cn() — conditional classnames (like clsx) ────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}