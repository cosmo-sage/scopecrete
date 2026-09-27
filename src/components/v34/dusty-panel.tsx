"use client";

/**
 * Dusty's panel. Rises from the footer on a phone; slides in from the right on
 * desktop, leaving the rail and the page usable beside it.
 *
 * HOT or COLD is decided by the screen you are on (DECISIONS §6), and the
 * header says which. The browser only names the screen — /api/dusty fetches
 * the facts itself under your session.
 *
 * Read-only. Nothing is stored: the conversation lives in this tab and is gone
 * on reload. Each reply can be copied, which is how a drafted text reaches Quo.
 */

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { T, F, disp, eyebrow, body, clip } from "@/lib/v34/tokens";
import { Emblem } from "@/components/v34/primitives";

type Ref = { kind: "thread" | "scope" | "customer"; id: string } | { kind: "cash" } | { kind: "cold" };
type Item = { role: "user" | "assistant"; content: string } | { role: "note"; content: string };

export function refFor(pathname: string): Ref {
  const m = pathname.match(/^\/dashboard\/(messages|scope|customers)\/([^/?#]+)/);
  if (m) return { kind: m[1] === "messages" ? "thread" : m[1] === "scope" ? "scope" : "customer", id: m[2] };
  if (pathname.startsWith("/dashboard/cash")) return { kind: "cash" };
  return { kind: "cold" };
}

const GUESS: Record<Ref["kind"], string> = {
  thread: "this thread", scope: "this scope", customer: "this customer", cash: "cost settings", cold: "nothing open",
};

const STARTERS: Record<Ref["kind"], string[]> = {
  thread: ["What does this person want?", "Customer, sub or vendor — and why?", "Draft a reply I can send"],
  scope: ["Check these numbers", "What's stopping a price?", "What should I still ask them?"],
  customer: ["Summarise who this is", "What's open with them?"],
  cash: ["Which settings matter most first?", "What does the floor need?"],
  cold: ["What can you do?"],
};

export function DustyPanel({ open, onClose, onBusy }: { open: boolean; onClose: () => void; onBusy: (b: boolean) => void }) {
  const pathname = usePathname();
  const ref = refFor(pathname);
  const refKey = JSON.stringify(ref);

  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [seenRef, setSeenRef] = useState(refKey);
  const [copied, setCopied] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Moving to another screen changes what Dusty sees. Adjusted during render,
  // with a visible line in the conversation so the switch is never silent.
  if (refKey !== seenRef) {
    setSeenRef(refKey);
    setLabel(null);
    if (items.length) setItems((a) => [...a, { role: "note", content: `Now looking at ${GUESS[ref.kind]}.` }]);
  }

  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [items]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...items, { role: "user" as const, content: q }];
    setItems([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const append = (s: string) => setItems((a) => {
      const copy = [...a];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + s };
      return copy;
    });
    try {
      const r = await fetch("/api/dusty", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          context: ref,
          messages: history.filter((i) => i.role !== "note").map((i) => ({ role: i.role, content: i.content })),
        }),
      });
      if (!r.ok || !r.body) {
        const b = await r.json().catch(() => ({}));
        append(b?.code === "no_key"
          ? "I'm not connected yet. Add ANTHROPIC_API_KEY in Vercel (Settings → Environment Variables, marked Sensitive, Preview and Production), then redeploy."
          : `I couldn't answer: ${b?.error || `HTTP ${r.status}`}`);
        return;
      }
      const h = r.headers.get("X-Dusty-Context");
      if (h) setLabel(decodeURIComponent(h));
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        append(dec.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") append("\n\n[The connection dropped.]");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function copy(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ }
  }

  const hot = ref.kind !== "cold";
  const shownLabel = label ?? GUESS[ref.kind];

  return (
    <>
      {/* Phone: dim the page behind the sheet. Desktop keeps the page live. */}
      {open && <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "rgba(18,22,26,.35)" }} onClick={onClose} aria-hidden="true" />}

      <section role="dialog" aria-label="Dusty" aria-hidden={!open}
        className={`fixed z-50 flex flex-col left-0 right-0 bottom-[58px] h-[82dvh] rounded-t-2xl
                    lg:left-auto lg:right-0 lg:top-[54px] lg:bottom-0 lg:h-auto lg:w-[420px] lg:rounded-none
                    transition-transform duration-200 ease-out
                    ${open ? "translate-y-0 lg:translate-x-0" : "translate-y-[110%] lg:translate-y-0 lg:translate-x-[110%]"}`}
        style={{ background: T.card, boxShadow: "0 -12px 40px rgba(10,14,18,.25)", borderLeft: `1px solid ${T.hair}`, color: T.ink }}>

        <div className="lg:hidden flex justify-center pt-2" aria-hidden="true">
          <span style={{ width: 38, height: 4, borderRadius: 2, background: T.hair }} />
        </div>
        <header className="px-4 py-2.5 flex items-center gap-2.5 shrink-0" style={{ borderBottom: `1px solid ${T.hair}` }}>
          <Emblem size={22} stroke={2.6} className={busy ? "sc-em-think" : "sc-em-dream"} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 700, lineHeight: 1 }}>Dusty</div>
            <div style={{ ...eyebrow, color: hot ? T.hiviz : T.ink3, ...clip }}>
              {hot ? `On ${shownLabel}` : "Cold — nothing open"}
            </div>
          </div>
          {items.length > 0 && (
            <button onClick={() => { abort.current?.abort(); setItems([]); }} style={{ ...eyebrow, color: T.ink2, cursor: "pointer" }}>Clear</button>
          )}
          <button onClick={onClose} aria-label="Close Dusty" className="rounded-lg flex items-center justify-center"
            style={{ width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card }}>
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M1 1 L12 12 M12 1 L1 12" stroke={T.ink} strokeWidth="1.8" /></svg>
          </button>
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3" style={{ background: T.slab }}>
          {items.length === 0 && (
            <div>
              <p style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>
                {hot ? `I can see ${GUESS[ref.kind]}. Ask me about it.` : "Open a thread, a scope or a customer and I'll have it in front of me. Or just ask."}
              </p>
              <p style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.45, marginTop: 6 }}>
                I read and answer. I don&apos;t change anything or send anything, and this conversation isn&apos;t saved.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {STARTERS[ref.kind].map((s) => (
                  <button key={s} onClick={() => void ask(s)} className="rounded-full px-3"
                    style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, color: T.ink, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {items.map((it, i) => it.role === "note" ? (
            <div key={i} className="text-center my-2" style={{ ...eyebrow }}>{it.content}</div>
          ) : it.role === "user" ? (
            <div key={i} className="flex justify-end mb-2">
              <div className="rounded-2xl px-3 py-2 max-w-[85%]" style={{ background: T.ink, color: "#fff", fontSize: F.sm, whiteSpace: "pre-wrap" }}>{it.content}</div>
            </div>
          ) : (
            <div key={i} className="mb-3">
              <div className="rounded-2xl px-3 py-2" style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.sm, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: body }}>
                {it.content || <span style={{ color: T.ink3 }}>Reading…</span>}
              </div>
              {it.content && !(busy && i === items.length - 1) && (
                <button onClick={() => void copy(i, it.content)} className="mt-1" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                  {copied === i ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} className="shrink-0 px-3 py-2.5 flex items-end gap-2"
          style={{ borderTop: `1px solid ${T.hair}`, background: T.card }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
            placeholder={hot ? `Ask about ${GUESS[ref.kind]}…` : "Ask Dusty…"}
            className="flex-1 rounded-lg px-3 py-2 outline-none resize-none"
            style={{ border: `1px solid ${T.hair}`, fontSize: F.sm, maxHeight: 120, fontFamily: body, minWidth: 0 }} />
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-lg px-3"
            style={{ height: 38, background: busy || !draft.trim() ? T.hair : T.hiviz, color: "#fff", fontFamily: disp,
                     fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {busy ? "…" : "Ask"}
          </button>
        </form>
      </section>
    </>
  );
}
