import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { parseISO, formatDistanceToNow } from "date-fns";
import { ChartLineUp, Users, CurrencyDollar, Target, Lightning } from "@phosphor-icons/react";

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Utility functions (moved here) ---
export const timeAgo = (dateString: string) => {
  if (!dateString) return "";
  const date = parseISO(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
};

export const capitalize = (s: string) => {
  if (typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// --- Theme --- 
export const SC = {
  primary: "#FE580E",
  secondary: "#f59e0b",
  accent: "#8b5cf6",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#2563eb", 
  purple: "#6d28d9", 
  surface: "#1a1a1a",
  border: "#333333",
  text: "#e0e0e0",
  textMuted: "#a0a0a0",
};

export const STATUS_BADGE: Record<string, { bg: string; color: string; icon: string }> = {
  new:       { bg: "rgba(232,93,4,0.15)",    color: SC.primary, icon: "ph-star" }, // Star for new
  contacted: { bg: "rgba(245,158,11,0.15)",    color: SC.secondary, icon: "ph-chat-circle-dots" }, // Conversation for contacted
  qualified: { bg: "rgba(139,92,246,0.15)",    color: SC.accent, icon: "ph-check-square" }, // Check for qualified
  quoted:    { bg: "rgba(109,40,217,0.15)",    color: SC.purple, icon: "ph-clipboard-text" }, // Clipboard for quoted
  won:       { bg: "rgba(34,197,94,0.15)",     color: SC.green, icon: "ph-trophy" }, // Trophy for won
  lost:      { bg: "rgba(239,68,68,0.15)",     color: SC.red, icon: "ph-x-circle" }, // X for lost
};