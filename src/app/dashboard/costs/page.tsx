"use client";

/**
 * Markups & overhead (Coy, 2026-09-30: "isn't this the same as the cost
 * book?") — no: the Price book is what things cost; this is what the budget
 * and the bid floor stand on — markups per type, sales tax, waste, the
 * short-load threshold, overhead, off the top, crew days and pay-yourself.
 * Opened from Settings in the header; the Cash page keeps its door too. One
 * editor, two doors (DECISIONS §6).
 */

import Link from "next/link";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { CostSettingsEditor } from "@/components/v34/cost-settings";

export default function CostsScreen() {
  return (
    <div style={{ paddingBottom: 24, maxWidth: 760 }} className="mx-auto">
      <div className="px-3 pt-3">
        <h1 style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 700, margin: 0 }}>Markups &amp; overhead</h1>
        <div style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45 }}>
          What every budget and bid floor stands on. Prices themselves live in the{" "}
          <Link href="/dashboard/price-book" style={{ ...eyebrow, color: T.chalk }}>Price book</Link>.
        </div>
      </div>
      <CostSettingsEditor />
    </div>
  );
}
