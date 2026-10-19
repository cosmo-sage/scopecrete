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
import { useThreads } from "@/components/v34/threads-ctx";
import { threadLabel } from "@/components/v34/thread-rail";
import { useThreadColors } from "@/components/v34/thread-colors";

export default function ThreadsIndexPane() {
  const ctx = useThreads();
  const [colors] = useThreadColors();
  const label = ctx ? threadLabel(ctx.thread, ctx.custom, colors) : { name: "Threads", color: T.ink3 };
  return (
    <>
    {/* The Spaces navigation: the drawer holds the list (Coy, 2026-10-17). */}
    <div className="sc-drawer-empty items-center justify-center px-8" style={{ minHeight: "calc(100dvh - var(--sc-head) - var(--sc-foot))" }}>
      <div style={{ maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1 }}>Pick someone in the drawer</div>
        <p style={{ fontSize: F.sm, color: T.ink3, marginTop: 8, lineHeight: 1.5 }}>
          {ctx?.custom?.some((t) => t.id === ctx.thread)
            ? `${label.name}'s people are listed there, each opening their thread here.`
            : "Customers, vendors, personal and unsorted are listed there, each opening their thread here."}
        </p>
        <button type="button" className="lg:hidden" onClick={() => window.dispatchEvent(new Event("sc:spaces-open"))}
          style={{ marginTop: 14, padding: "9px 16px", borderRadius: 8, ...eyebrow, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontWeight: 700 }}>
          Open the drawer
        </button>
      </div>
    </div>
    <div className="sc-drawer-old hidden lg:flex items-center justify-center h-full px-8"
      style={{ minHeight: "calc(100vh - var(--sc-head) - 58px)" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ ...eyebrow, color: label.color }}>{label.name}</div>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.1, marginTop: 2 }}>
          Pick a contact
        </div>
        <p style={{ fontSize: F.sm, color: T.ink3, marginTop: 8, lineHeight: 1.5 }}>
          Their channels open here. The list folds to initials so the conversation
          gets the room; the › at the top brings it back.
        </p>
      </div>
    </div>
    </>
  );
}
