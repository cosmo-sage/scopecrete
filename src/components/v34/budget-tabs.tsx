"use client";
/**
 * The Budget view's three tabs (Coy, 2026-10-09; Claude Design "Budget v3"):
 * Market rate · Proposed budget · Actual costs. On a phone they hang from the
 * Budget button (JobTabs `subnav`, like Takeoffs' Files · Measurements); on a
 * desktop they open the tools row under the name, with the ScopeCrete emblem at
 * its far right to open Dusty. The tab lives in the address (?tab=market |
 * actuals; none = the proposed budget).
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { T, disp } from "@/lib/v34/tokens";
import { Emblem } from "@/components/site/marks";
import { BUDGET_TABS, tabOf, type BudgetTab } from "@/lib/budget-v3";

export function useBudgetTab(): [BudgetTab, (t: BudgetTab) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = tabOf(sp.get("tab"));
  const go = useCallback((t: BudgetTab) => {
    const q = new URLSearchParams(sp.toString());
    if (t === "proposed") q.delete("tab"); else q.set("tab", t);
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [sp, router, path]);
  return [tab, go];
}

export function BudgetSubTabs({ tab, onTab, counts }: { tab: BudgetTab; onTab: (t: BudgetTab) => void; counts?: Partial<Record<BudgetTab, number>> }) {
  return (
    <span role="tablist" aria-label="Budget" className="inline-flex rounded overflow-hidden shrink-0" style={{ border: `1px solid ${T.hairStrong}` }}>
      {BUDGET_TABS.map((t, i) => {
        const on = t.k === tab;
        const n = counts?.[t.k];
        return (
          <button key={t.k} role="tab" aria-selected={on} onClick={() => onTab(t.k)} className="flex items-center gap-1"
            style={{ height: 28, padding: "0 9px", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, borderLeft: i ? `1px solid ${T.hair}` : "none",
              fontFamily: disp, fontSize: 11.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer" }}>
            {t.label}
            {n ? <span style={{ fontSize: 10, borderRadius: 999, padding: "0 5px", background: on ? T.hiviz : T.hivizSoft, color: "#fff", letterSpacing: 0 }}>{n}</span> : null}
          </button>
        );
      })}
    </span>
  );
}

/** The ScopeCrete emblem: opens Dusty on this job, with a question put in his box when given. */
export function DustyEmblemButton({ ask, title = "Ask Dusty about this job" }: { ask?: string; title?: string }) {
  return (
    <button aria-label={title} title={title} className="flex items-center justify-center shrink-0"
      onClick={() => {
        window.dispatchEvent(new Event("sc:dusty-open"));
        if (ask) setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: ask } })), 250);
      }}
      style={{ width: 32, height: 32, borderRadius: 4, border: `1px solid ${T.hairStrong}`, background: T.card, cursor: "pointer" }}>
      <Emblem size={20} spin={false} />
    </button>
  );
}

/** Ask Dusty a question about this job now (a quick select), sending it once his chat has loaded. */
export function askDusty(text: string, send = true) {
  window.dispatchEvent(new Event("sc:dusty-open"));
  setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text, send } })), 250);
}
