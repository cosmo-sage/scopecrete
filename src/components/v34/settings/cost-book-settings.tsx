"use client";

/**
 * Settings → Cost book (Coy, 2026-10-11, from his phone: "Move the import
 * button to the settings page. Make a new page in settings for the cost book"
 * and "Move the defaults tab to the settings also"). The Price book's Import ▾
 * and its Defaults tab, moved here unchanged: importing a spreadsheet or a
 * receipt / invoice / quote, then the pricing defaults (margin, O.H., day
 * minimum, parish tax) and the project types. The Price book keeps its cards
 * and assemblies; the imports' Undo stays on Logs → Price book.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, disp } from "@/lib/v34/tokens";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";
import { PricingDefaults } from "@/components/v34/money-settings";
import { ProjectTypes } from "@/components/v34/project-types";
import { PriceImport } from "@/components/v34/price-import";
import { ReceiptImport } from "@/components/v34/receipt-import";
import { usePref } from "@/lib/v34/prefs";
import { sectionGroups } from "@/lib/section-groups";
import { COST_TYPES, COST_TYPE_LABEL, type CostType } from "@/lib/cost-cards";
import { call, numify, type Card, type Vendor } from "@/components/v34/cost-cards";

export function CostBookSettings() {
  const [importing, setImporting] = useState<null | "sheet" | "receipt">(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // The spreadsheet import matches rows against the cards and vendors on file.
  useEffect(() => {
    let off = false;
    call("/api/cost-items?all=1", "GET")
      .then((b) => {
        if (off) return;
        setCards(((b.items ?? []) as Array<Record<string, unknown>>).map(numify));
        setVendors((b.vendors ?? []) as Vendor[]);
      })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [tick]);

  const btn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 4, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase",
    letterSpacing: ".06em", background: T.card, color: T.ink, border: `1px solid ${T.hair}`, cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <div>
      <SettingsTitle title="Cost book" note={<>Defaults for new budgets and bringing prices into the <Link href="/dashboard/price-book" style={{ color: T.chalk }}>Price book</Link>.</>} />
      {note && <div className="mb-3 rounded px-3 py-2 flex gap-2" style={{ fontSize: F.sm, background: T.greenDim }}><span style={{ flex: 1 }}>{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {err && <div className="mb-3 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}
      <SectionGroupsBlock />
      <SettingsBlock title="Import"
        note={<>Undo an import on <Link href="/dashboard/more/logs?tab=pricebook" style={{ color: T.chalk }}>Logs → Price book</Link>.</>}>
        <div className="flex flex-col gap-2">
          <button onClick={() => setImporting("sheet")} className="text-left rounded px-3 py-2" style={{ border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
            <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink }}>A spreadsheet</span>
            <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>CSV or Excel from JobTread, another CRM, or your own · UFGS .sec sections</span>
          </button>
          <button onClick={() => setImporting("receipt")} className="text-left rounded px-3 py-2" style={{ border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer" }}>
            <span style={{ fontSize: F.sm, fontWeight: 600, color: T.ink }}>A receipt, invoice or quote</span>
            <span style={{ display: "block", fontSize: F.xs, color: T.ink3 }}>Photo or PDF. Dusty reads the vendor and the prices, you check them</span>
          </button>
        </div>
      </SettingsBlock>
      <div className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, marginBottom: 12 }}>
        <PricingDefaults />
        <ProjectTypes />
      </div>
      <Link href="/dashboard/price-book" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open the Price book ›</Link>

      {importing === "receipt" && (
        <ReceiptImport open onClose={() => setImporting(null)} onDone={(m) => { setImporting(null); setNote(m); setTick((n) => n + 1); }} />
      )}
      {importing === "sheet" && (
        <PriceImport open start="sheet" onClose={() => setImporting(null)} cards={cards} vendors={vendors}
          onDone={(m) => { setImporting(null); setNote(m); setTick((n) => n + 1); }} />
      )}
    </div>
  );
}

/** Which cost groups every budget section starts with (Coy, 2026-10-21). */
function SectionGroupsBlock() {
  const [pref, setPref] = usePref<unknown>("section_groups", null);
  const on = sectionGroups(pref);
  const toggle = (t: CostType) => setPref(on.includes(t) ? on.filter((x) => x !== t) : COST_TYPES.filter((x) => x === t || on.includes(x)));
  return (
    <SettingsBlock title="Section cost groups" note="The groups every budget section shows, even before it has items. Job totals break down the same way.">
      <div className="flex flex-wrap gap-2 mt-2">
        {COST_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-1.5 rounded px-2.5" style={{ height: 32, border: `1px solid ${T.hair}`, fontSize: F.sm, cursor: "pointer" }}>
            <input type="checkbox" checked={on.includes(t)} onChange={() => toggle(t)} style={{ accentColor: T.chalk }} />
            {COST_TYPE_LABEL[t]}
          </label>
        ))}
      </div>
    </SettingsBlock>
  );
}
