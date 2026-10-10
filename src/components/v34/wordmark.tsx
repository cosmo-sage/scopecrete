"use client";

/**
 * ScopeCrete wordmark in the app shell — 2c "Rounded, confident" (Claude
 * Design Wordmark Desktop Options, 2026-10-10): one word in Manrope, "scope"
 * 800 in the theme's ink, "crete" 500 in --sc-crete, ".ai" half size in the
 * light's green, glowing. The same mark as the site's (site/marks.tsx); this
 * file stays so org-lockup's import doesn't move. `guides` (the old pencil
 * guide lines) is accepted and ignored.
 */
import { Wordmark as Mark } from "@/components/site/marks";

type Props = { size?: number; guides?: boolean; className?: string };

/** size = font-size of "scopecrete". Header 26, lockup 16, phone lockup 13. */
export function Wordmark({ size = 26, className }: Props) {
  return <Mark size={size} className={className} />;
}
