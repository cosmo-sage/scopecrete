"use client";

/**
 * The right-hand pane when no thread is open.
 *
 * The list itself moved to src/components/v34/thread-list.tsx and is rendered
 * by the layout, so this route is only what sits BESIDE it on desktop. On a
 * phone the layout hides this entirely and shows the list, which is the whole
 * of the mobile Threads screen and is unchanged behaviour.
 *
 * So everything below is desktop-only, and it is deliberately not a dashboard.
 * The UI handoff's anti-brief rules out a card grid of sparklines, and there is
 * nothing true to put in one: jobs, estimates, invoices, payments and receipts
 * are all 0 rows. An empty pane that says what the pane is for beats a filler
 * that implies the product has more in it than it does.
 */

import React from "react";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";

export default function ThreadsIndexPane() {
  return (
    <div className="hidden lg:flex items-center justify-center h-full px-8"
      style={{ minHeight: "calc(100vh - 54px - 58px)" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={eyebrow}>Threads</div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1, marginTop: 2 }}>
          Pick a thread
        </div>
        <p style={{ fontSize: F.sm, color: T.ink3, marginTop: 8, lineHeight: 1.5 }}>
          It opens here, beside the list, so you can work down the list without
          losing your place in it.
        </p>
      </div>
    </div>
  );
}
