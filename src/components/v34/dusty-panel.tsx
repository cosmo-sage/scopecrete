"use client";

/**
 * Dusty — full screen, a place you work (v34 DustyScreen; Coy, 2026-09-28:
 * "full screen … so that I can reference older conversations in a side
 * project panel to select and continue older conversations").
 *
 * - Below the header, over everything else. The header and Dusty's activity
 *   line stay on top, so you never lose the app by opening the chat.
 * - History: your saved conversations (migration 043), behind the hamburger
 *   on a phone — sliding in from the LEFT, away from the right-hand drawers —
 *   and always open on the left on a desktop. Grouped: about the screen you
 *   have open, customers, jobs, everything else. Tap one to continue it.
 * - A conversation keeps the context it started with; /api/dusty reads its
 *   history from the database, never from this tab.
 * - Answers read like a page, not bubbles: your question as a heading, Dusty's
 *   answer full width under it, copy under each.
 * - Read-only toward the business: nothing is sent, nothing is changed.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { T, F, disp, eyebrow, body, clip, relTime } from "@/lib/v34/tokens";
import { DustyAvatar, type DustyState } from "@/components/v34/dusty-avatar";

type Ref = { kind: "thread" | "scope" | "customer"; id: string } | { kind: "cash" } | { kind: "cold" };
type Ctx = Ref | { kind: "activity"; since: string };
const CATCHUP_KEY = "sc:dusty-catchup-at";
type Turn = { role: "user" | "assistant"; content: string };
interface Conv { id: string; title: string; context_kind: string; context_id: string | null; context_label: string | null; updated_at: string }

export function refFor(pathname: string): Ref {
  const m = pathname.match(/^\/dashboard\/(messages|scope|customers)\/([^/?#]+)/);
  if (m) return { kind: m[1] === "messages" ? "thread" : m[1] === "scope" ? "scope" : "customer", id: m[2] };
  if (pathname.startsWith("/dashboard/cash")) return { kind: "cash" };
  return { kind: "cold" };
}

const GUESS: Record<Ref["kind"], string> = {
  thread: "this person", scope: "this job", customer: "this customer", cash: "your cost settings", cold: "your business",
};
const PAGE: Record<Ref["kind"], string> = {
  thread: "this person", scope: "this job", customer: "this customer", cash: "cost settings", cold: "",
};
const STARTERS: Record<Ref["kind"], string[]> = {
  thread: ["What does this person want?", "What do I owe them?", "Draft a reply I can send"],
  scope: ["Check these numbers", "What's stopping a price?", "What should I still ask them?"],
  customer: ["Summarise who this is", "What's open with them?"],
  cash: ["Which settings matter most first?", "What does the floor need?"],
  cold: ["What's waiting on me today?", "Price a 24×30 driveway", "Who haven't I called back?"],
};

const sameRef = (c: Conv, r: Ref) => "id" in r ? c.context_kind === r.kind && c.context_id === r.id : c.context_kind === r.kind && r.kind === "cash";

export function DustyPanel({ open, onClose, onBusy, onStream, catchUp = 0 }: {
  open: boolean; onClose: () => void; onBusy: (b: boolean) => void;
  /** Bumped from outside to start a catch-up on the latest activity. */
  catchUp?: number;
  /** The reply as it streams, for the activity line. "" when idle. */
  onStream?: (text: string) => void;
}) {
  const pathname = usePathname();
  const ref = refFor(pathname);
  const refKey = JSON.stringify(ref);

  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [listTick, setListTick] = useState(0);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // How the last answer ended — Dusty pours concrete on a good one, scratches his head on a failed one.
  const [mood, setMood] = useState<"done" | "error" | null>(null);
  const [catchUpLocal, setCatchUpLocal] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [items]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (railOpen) setRailOpen(false); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, railOpen]);

  // The history, whenever Dusty opens or an answer lands.
  useEffect(() => {
    if (!open) return;
    let off = false;
    fetch("/api/dusty/conversations").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off && Array.isArray(b?.conversations)) setConvs(b.conversations as Conv[]); }).catch(() => {});
    return () => { off = true; };
  }, [open, listTick]);

  // Which conversation to load. Set from a tap or on opening; the fetch runs in the effect below.
  const [want, setWant] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const select = useCallback((id: string | null) => {
    abort.current?.abort();
    setRailOpen(false); setErr(null); setActiveId(id); setDraft("");
    setItems([]); setLoadingConv(!!id);
    setWant((w) => ({ id, n: w.n + 1 }));
  }, []);
  useEffect(() => {
    if (!want.id) return;
    let off = false;
    fetch(`/api/dusty/conversations/${want.id}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setItems((b.messages as Turn[]).map((m) => ({ role: m.role, content: m.content }))); })
      .catch((e) => { if (!off) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!off) setLoadingConv(false); });
    return () => { off = true; };
  }, [want]);

  // Opened on a person or a job: pick up the latest chat about it, else start
  // fresh. Decided once per opening, when the list is in.
  const openKey = open ? refKey : null;
  if (open && convs && openedFor !== openKey) {
    setOpenedFor(openKey);
    const about = ref.kind === "cold" ? null : convs.find((c) => sameRef(c, ref)) ?? null;
    if (about && about.id !== activeId) select(about.id);
    else if (!about && activeId && !convs.some((c) => c.id === activeId && sameRef(c, ref))) select(null);
  }
  if (!open && openedFor !== null) setOpenedFor(null);

  // The emblem tap (Coy, 2026-09-29): a fresh chat that reviews what came in
  // since this device last asked. Deferred a tick so no state is set inside
  // the effect body; openedFor is claimed so the list arriving afterwards
  // doesn't swap in an older chat under it.
  const caughtUp = useRef(0);
  const catchUpN = catchUp + catchUpLocal;
  useEffect(() => {
    if (!open || !catchUpN || caughtUp.current === catchUpN) return;
    caughtUp.current = catchUpN;
    const t = setTimeout(() => {
      let since = "";
      try { since = localStorage.getItem(CATCHUP_KEY) ?? ""; localStorage.setItem(CATCHUP_KEY, new Date().toISOString()); } catch { /* private mode */ }
      setOpenedFor(refKey);
      select(null);
      void ask("What's new since I last looked?", { fresh: true, ctx: { kind: "activity", since } });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catchUpN]);

  async function ask(text: string, opts?: { fresh?: boolean; ctx?: Ctx }) {
    const q = text.trim();
    if (!q || (busy && !opts?.fresh)) return;
    const convId = opts?.fresh ? null : activeId;
    setItems((a) => [...a, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setDraft(""); setErr(null); setBusy(true); setMood(null);
    let failed = false;
    const ctrl = new AbortController();
    abort.current = ctrl;
    let said = "";
    const append = (s: string) => {
      said += s;
      onStream?.(said);
      setItems((a) => {
        const copy = [...a];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + s };
        return copy;
      });
    };
    try {
      const r = await fetch("/api/dusty", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ question: q, conversation_id: convId, context: convId ? undefined : (opts?.ctx ?? ref) }),
      });
      if (!r.ok || !r.body) {
        const b = await r.json().catch(() => ({}));
        failed = true;
        append(b?.code === "not_connected"
          ? "I'm not connected. In Vercel, set HERMES_URL and HERMES_API_KEY (Hermes's own key from Doctor), then redeploy."
          : String(b?.error ?? `I couldn't answer (HTTP ${r.status}).`));
        return;
      }
      const cid = r.headers.get("X-Dusty-Conversation");
      if (cid && cid !== convId) setActiveId(cid);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        append(dec.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") { failed = true; append("\n\n[The connection dropped.]"); }
    } finally {
      setBusy(false);
      setMood(failed ? "error" : said.trim() ? "done" : null);
      onStream?.("");
      abort.current = null;
      setListTick((n) => n + 1);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation? It can't be brought back.")) return;
    const r = await fetch(`/api/dusty/conversations/${id}`, { method: "DELETE" });
    if (r.ok) { if (id === activeId) select(null); setListTick((n) => n + 1); }
  }

  async function copy(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1800); } catch { /* blocked */ }
  }

  if (!open) return null;

  const active = convs?.find((c) => c.id === activeId) ?? null;
  const hot = active ? active.context_kind !== "cold" : ref.kind !== "cold";
  // A catch-up just started has no row in the list yet — say what it is.
  const catching = !active && activeId !== null && items[0]?.content === "What's new since I last looked?";
  const lookingAt = active ? (active.context_kind === "cold" ? null : active.context_label)
    : catching ? "the latest activity" : ref.kind === "cold" ? null : GUESS[ref.kind];

  const groups: Array<[string, Conv[]]> = [];
  if (convs) {
    const here = ref.kind === "cold" ? [] : convs.filter((c) => sameRef(c, ref));
    const rest = convs.filter((c) => !here.includes(c));
    const people = rest.filter((c) => c.context_kind === "thread" || c.context_kind === "customer");
    const jobs = rest.filter((c) => c.context_kind === "scope");
    const catchups = rest.filter((c) => c.context_kind === "activity");
    const other = rest.filter((c) => !people.includes(c) && !jobs.includes(c) && !catchups.includes(c));
    if (here.length) groups.push([`About ${GUESS[ref.kind]}`, here]);
    if (people.length) groups.push(["People", people]);
    if (jobs.length) groups.push(["Jobs", jobs]);
    if (catchups.length) groups.push(["Catch-ups", catchups]);
    if (other.length) groups.push(["Everything else", other]);
  }

  const iconBtn: React.CSSProperties = { width: 32, height: 32, border: `1px solid ${T.hair}`, background: T.card, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" };

  const rail = (
    <nav aria-label="Dusty conversations" className="flex flex-col h-full" style={{ background: T.card }}>
      <div className="px-3 py-2.5 flex items-center gap-2 shrink-0" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ ...eyebrow, color: T.ink, flex: 1 }}>Conversations</span>
        <button onClick={() => select(null)} className="rounded px-2.5"
          style={{ height: 28, background: T.ink, color: "#fff", fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {convs === null && <div className="m-3 rounded animate-pulse" style={{ height: 60, background: T.hairSoft }} />}
        {convs?.length === 0 && <div className="px-3 py-3" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing yet. Ask something and it lands here.</div>}
        {groups.map(([g, cs]) => (
          <div key={g}>
            <div className="px-3 pt-3 pb-1" style={{ ...eyebrow, color: T.ink3 }}>{g}</div>
            {cs.map((c) => (
              <div key={c.id} className="flex items-center" style={{ background: c.id === activeId ? T.chalkDim : "transparent" }}>
                <button onClick={() => select(c.id)} className="flex-1 min-w-0 text-left px-3 py-2">
                  <span style={{ display: "block", fontSize: F.sm, fontWeight: c.id === activeId ? 600 : 400, color: T.ink, ...clip }}>{c.title}</span>
                  <span style={{ display: "block", fontSize: F.xs, color: T.ink3, ...clip }}>
                    {c.context_kind !== "cold" && c.context_label ? `${c.context_label} · ` : ""}{relTime(c.updated_at)} ago
                  </span>
                </button>
                <button onClick={() => void remove(c.id)} aria-label={`Delete ${c.title}`} className="px-2" style={{ color: T.ink3, fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );

  const dustyState: DustyState = busy ? "calculating" : loadingConv ? "loading" : mood ?? "idle";

  return (
    // Phone: a full page under the header. Desktop (Coy, 2026-09-29: "slide in
    // on the right… so I can see the rest of the dashboard"): a column docked
    // on the right, no backdrop; the layout pads <main> by --sc-dusty so the
    // page beside it stays whole and usable.
    <section role="dialog" aria-label="Dusty"
      className="fixed left-0 right-0 bottom-0 z-50 flex lg:left-auto lg:w-[var(--sc-dusty)] sc-dock-in"
      style={{ top: "var(--sc-head)", background: T.slab, color: T.ink, borderLeft: `1px solid ${T.hair}`, boxShadow: "-10px 0 30px rgba(10,14,18,.10)" }}>
      {/* history: from the left, over the chat */}
      {railOpen && (
        <div className="absolute inset-0 z-[60]" style={{ background: "rgba(18,22,26,.4)" }}
          onClick={() => setRailOpen(false)}>
          <div className="absolute top-0 left-0 bottom-0 sc-rail-in" style={{ width: "min(320px, 86vw)", boxShadow: "14px 0 40px rgba(10,14,18,.22)" }}
            onClick={(e) => e.stopPropagation()}>{rail}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 px-2.5 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}`, background: T.card }}>
          <button onClick={() => setRailOpen(true)} aria-label="Conversations" className="flex-col gap-[3.5px]" style={iconBtn}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 13, height: 1.5, background: T.ink2, borderRadius: 1 }} />)}
          </button>
          <DustyAvatar state={dustyState} size={40} />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.1, ...clip }}>{active ? active.title : "New chat"}</div>
            <div style={{ ...eyebrow, fontSize: 9, color: hot ? T.hiviz : T.ink3, ...clip }}>
              {lookingAt ? `Looking at ${lookingAt}` : "Cold — your jobs, costs and threads"}
            </div>
          </div>
          <button onClick={() => setCatchUpLocal((n) => n + 1)} disabled={busy} title="What's new since I last looked?"
            className="rounded px-2" style={{ height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.xs, color: T.ink2, cursor: "pointer", whiteSpace: "nowrap" }}>
            What&apos;s new?</button>
          <button onClick={() => select(null)} aria-label="New chat" style={{ ...iconBtn, fontSize: 18, color: T.ink2 }}>+</button>
          <button onClick={onClose} aria-label="Close Dusty" style={iconBtn}>
            <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden="true"><path d="M1 1 L12 12 M12 1 L1 12" stroke={T.ink} strokeWidth="1.8" /></svg>
          </button>
        </header>

        {active && ref.kind !== "cold" && !sameRef(active, ref) && (
          <button onClick={() => select(null)} className="shrink-0 w-full text-left px-3 py-1.5"
            style={{ background: T.chalkDim, borderBottom: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2, cursor: "pointer" }}>
            This chat is about {active.context_label || "something else"}. <b style={{ color: T.ink }}>Ask about {PAGE[ref.kind]} instead →</b>
          </button>
        )}
        <div ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 py-4" style={{ maxWidth: 760 }}>
            {loadingConv && <div className="rounded animate-pulse" style={{ height: 80, background: T.hairSoft }} />}
            {!loadingConv && items.length === 0 && (
              <div className="text-center py-6">
                <div className="flex justify-center mb-2"><DustyAvatar state={dustyState} size={96} /></div>
                <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600 }}>What are we working on?</div>
                <p style={{ fontSize: F.sm, color: T.ink3, lineHeight: 1.5, maxWidth: 360, margin: "4px auto 14px" }}>
                  {ref.kind === "cold" ? "Dusty has your jobs, costs, threads and notes." : `Dusty can see ${GUESS[ref.kind]} and everything behind it.`}
                  {" "}He reads and answers; nothing is sent or changed.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {STARTERS[ref.kind].map((s) => (
                    <button key={s} onClick={() => void ask(s)} className="rounded px-3 py-1.5"
                      style={{ background: T.card, border: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2 }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {items.map((it, i) => it.role === "user" ? (
              <h2 key={i} style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, lineHeight: 1.25, margin: i === 0 ? "0 0 8px" : "22px 0 8px",
                paddingTop: i === 0 ? 0 : 16, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>{it.content}</h2>
            ) : (
              <div key={i} className="flex gap-2.5 items-start">
                <DustyAvatar state={busy && i === items.length - 1 ? "calculating" : "idle"} size={32} still={!(busy && i === items.length - 1)} hidden />
                <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.md, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: body, color: T.ink }}>
                  {it.content || <span style={{ color: T.ink3 }}>Reading…</span>}
                </div>
                {it.content && !(busy && i === items.length - 1) && (
                  <button onClick={() => void copy(i, it.content)} className="mt-1.5" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                    {copied === i ? "Copied" : "Copy"}
                  </button>
                )}
                </div>
              </div>
            ))}
            {err && <div style={{ fontSize: F.sm, color: T.red, marginTop: 8 }}>{err}</div>}
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} className="shrink-0 px-3 py-2.5"
          style={{ borderTop: `1px solid ${T.hair}`, background: T.card }}>
          <div className="mx-auto flex items-end gap-2" style={{ maxWidth: 760 }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
              placeholder={active ? "Follow up…" : hot ? `Ask about ${GUESS[ref.kind]}…` : "Ask Dusty…"}
              className="flex-1 rounded-lg px-3 py-2 outline-none resize-none"
              style={{ border: `1px solid ${T.hair}`, fontSize: F.sm, maxHeight: 140, fontFamily: body, minWidth: 0 }} />
            <button type="submit" disabled={busy || !draft.trim()} className="rounded-lg px-3"
              style={{ height: 38, background: busy || !draft.trim() ? T.hair : T.hiviz, color: "#fff", fontFamily: disp,
                       fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {busy ? "…" : "Ask"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
