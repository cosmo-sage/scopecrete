// Direction A — Warm bone light theme (field-ready mobile)
export const DA = {
  bg: "#F5F0E8",
  surface: "#FFFFFF",
  surfaceHover: "#F0EBE3",
  elevated: "#E8E2D9",
  accent: "#E85D04",
  accentMuted: "rgba(232,93,4,0.12)",
  textPrimary: "#1A1A1A",
  textSecondary: "#5C5C5C",
  textMuted: "#9CA3AF",
  border: "#D4CEC6",
  borderLight: "#E8E2D9",
  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2563EB",
  shadow: "0 1px 3px rgba(0,0,0,0.08)",
} as const;

export const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: "New",       color: "#2563EB" },
  contacted: { label: "Contacted", color: "#D97706" },
  qualified: { label: "Qualified", color: "#7C3AED" },
  won:       { label: "Won",       color: "#16A34A" },
  lost:      { label: "Lost",      color: "#DC2626" },
};

export const STAGE_ORDER = ["new", "contacted", "qualified", "won", "lost"];

export const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
  new:       { bg: "#2563EB", text: "#FFFFFF" },
  contacted: { bg: "#D97706", text: "#FFFFFF" },
  qualified: { bg: "#7C3AED", text: "#FFFFFF" },
  won:       { bg: "#16A34A", text: "#FFFFFF" },
  lost:      { bg: "#DC2626", text: "#FFFFFF" },
};
