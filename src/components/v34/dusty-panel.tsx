"use client";

/**
 * Dusty — full screen, a place you work (v34 DustyScreen; Coy, 2026-09-28:
 * "full screen … so that I can reference older conversations in a side
 * project panel to select and continue older conversations").
 *
 * - On a phone, the whole screen — the app's header too (Coy, 2026-10-05);
 *   × in his own header closes it. On a desktop, docked on the right under
 *   the header. Dusty himself sits at the bottom left in his live state.
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
import { usePathname, useRouter } from "next/navigation";
import { T, F, disp, eyebrow, agent, clip, relTime, nums, formatPhone } from "@/lib/v34/tokens";
import { DustyAvatar, type DustyState } from "@/components/v34/dusty-avatar";
import { Markdown } from "@/components/v34/markdown";
import { PlanCard } from "@/components/v34/plan-card";
import { hideIds, parsePlan } from "@/lib/dusty/plan";
import { useDustyUse } from "@/lib/v34/dusty-live";
import { sendBytes } from "@/components/v34/files-panel";
import { VoiceRecorder } from "@/components/v34/voice-recorder";
import { usePref } from "@/lib/v34/prefs";
import { Emblem } from "@/components/site/marks";
import { greeting, pickThought, thoughtSource, QUIET_LINES, type Thought } from "@/lib/dusty/hello";

type Ref = { kind: "thread" | "scope" | "customer"; id: string } | { kind: "cash" } | { kind: "cold" };
type TurnFile = { id: string; name: string; kind?: string; url: string | null };
type Turn = { role: "user" | "assistant"; content: string; files?: TurnFile[] };
type Att = { key: string; name: string; pct: number; id: string | null; error: string | null; preview: string | null };
interface Conv { id: string; title: string; context_kind: string; context_id: string | null; context_label: string | null; updated_at: string }

export function refFor(pathname: string): Ref {
  const m = pathname.match(/^\/dashboard\/(messages|scope|customers)\/([^/?#]+)/);
  if (m) return { kind: m[1] === "messages" ? "thread" : m[1] === "scope" ? "scope" : "customer", id: m[2] };
  // A vendor's page is a person (its id is the contact's): Dusty reads them as on their thread.
  const v = pathname.match(/^\/dashboard\/vendors\/([^/?#]+)/);
  if (v) return { kind: "thread", id: v[1] };
  // The Price book shares the "cash" context (money settings + the Price book and its assemblies).
  if (pathname.startsWith("/dashboard/cash") || pathname.startsWith("/dashboard/price-book")) return { kind: "cash" };
  return { kind: "cold" };
}

const GUESS: Record<Ref["kind"], string> = {
  thread: "this person", scope: "this job", customer: "this customer", cash: "your Price book and money", cold: "your business",
};
const PAGE: Record<Ref["kind"], string> = {
  thread: "this person", scope: "this job", customer: "this customer", cash: "Price book & money", cold: "",
};

/** The chat's text size (Coy, 2026-10-05: "the ability to adjust the size of the font inside the chat"), per account. */
const FONT_STEPS = [
  { key: "s", label: "Small", z: 0.88 },
  { key: "m", label: "Normal", z: 1 },
  { key: "l", label: "Large", z: 1.15 },
  { key: "xl", label: "Extra large", z: 1.3 },
] as const;
/** What a chat is about, without the context's kind in front ("scope: Wilson Driveway" → "Wilson Driveway"). */
const aboutLabel = (l: string | null) => {
  const s = (l ?? "").replace(/^scope:\s*/i, "").replace(/'s thread$/, "").replace(/ \(customer page\)$/, "");
  return /^\+?\d{10,11}$/.test(s) ? formatPhone(s) : s;
};

const sameRef =(c: Conv, r: Ref) => "id" in r ? c.context_kind === r.kind && c.context_id === r.id : c.context_kind === r.kind && r.kind === "cash";

export function DustyPanel({ open, onClose, onBusy, onStream }: {
  open: boolean; onClose: () => void; onBusy: (b: boolean) => void;
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
  // The page's real name for the header — the person (or their number), the job, the customer.
  const [pageName, setPageName] = useState<{ key: string; label: string | null } | null>(null);
  useEffect(() => {
    if (!open || !("id" in ref)) return;
    let gone = false;
    fetch(`/api/dusty/label?kind=${ref.kind}&id=${encodeURIComponent(ref.id)}`).then((r) => r.ok ? r.json() : null)
      .then((j) => { if (!gone) setPageName({ key: refKey, label: j?.label ?? null }); }).catch(() => {});
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refKey]);
  const [copied, setCopied] = useState<number | null>(null);
  const useTarget = useDustyUse();
  const [loadingConv, setLoadingConv] = useState(false);
  const [listTick, setListTick] = useState(0);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // How the last answer ended — Dusty pours concrete on a good one, scratches his head on a failed one.
  const [mood, setMood] = useState<"done" | "error" | null>(null);
  const [fontKey, setFontKey] = usePref<string>("dusty_font", "m");
  const font = FONT_STEPS.find((f) => f.key === fontKey) ?? FONT_STEPS[1];
  const [fontOpen, setFontOpen] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const router = useRouter();
  // The + menu in the header (Coy, 2026-10-01): a new chat, or a new customer,
  // job or receipt — each opens its own form on the page beside him.
  const [plusOpen, setPlusOpen] = useState(false);
  // Files attached to the next message (the + left of the box).
  const [atts, setAtts] = useState<Att[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);

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
      .then((b) => { if (!off) setItems((b.messages as Turn[]).map((m) => ({ role: m.role, content: m.content, files: m.files }))); })
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

  // The "What's new?" catch-up button is gone from the header (Coy, 2026-10-05);
  // catch-ups saved before still open from the history.

  // A page can hand Dusty a question to start from (the proposal's "Edit with
  // Dusty"): it lands in the message box for Coy to send or change — Dusty
  // never sends it on his own. `send` is a button Coy tapped to ask it (the
  // thread's emblem, dusty-brief.ts): asked once the chat about the page is in.
  const autoAsk = useRef<string | null>(null);
  const [autoTick, setAutoTick] = useState(0);
  useEffect(() => {
    const put = (e: Event) => {
      const d = (e as CustomEvent<{ text?: string; send?: boolean }>).detail;
      const q = d?.text;
      if (typeof q !== "string" || !q.trim()) return;
      if (d?.send) { autoAsk.current = q.slice(0, 4000); setAutoTick((n) => n + 1); } else setDraft(q.slice(0, 4000));
    };
    window.addEventListener("sc:dusty-draft", put);
    return () => window.removeEventListener("sc:dusty-draft", put);
  }, []);
  useEffect(() => {
    const q = autoAsk.current;
    if (!q || !open || !convs || openedFor !== openKey || loadingConv || busy) return;
    autoAsk.current = null;
    void ask(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ask() reads this render's chat; it runs once per tap
  }, [autoTick, open, convs, openedFor, openKey, loadingConv, busy]);

  async function ask(text: string) {
    const ready = atts.filter((a) => a.id && !a.error);
    if (atts.some((a) => !a.id && !a.error)) return; // still uploading
    const said0 = text.trim() || (ready.length ? "What's in this?" : "");
    const q = ready.length ? `${said0}\n\n📎 ${ready.map((a) => a.name).join(", ")}` : said0;
    if (!q || busy) return;
    if (ready.length) setAtts([]);
    const convId = activeId;
    setItems((a) => [...a, { role: "user", content: q, files: ready.map((x) => ({ id: x.id as string, name: x.name, url: x.preview })) }, { role: "assistant", content: "" }]);
    setDraft(""); setErr(null); setBusy(true); setMood(null);
    let failed = false;
    const ctrl = new AbortController();
    abort.current = ctrl;
    let said = "";
    // Tokens arrive faster than frames: gather them and draw once per frame,
    // so a long answer never queues a render per token (interaction timing).
    let pending = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (!pending) return;
      const s = pending; pending = "";
      onStream?.(said);
      setItems((a) => {
        const copy = [...a];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + s };
        return copy;
      });
    };
    const append = (s: string) => {
      said += s; pending += s;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    try {
      const r = await fetch("/api/dusty", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ question: q, conversation_id: convId, context: convId ? undefined : ref, file_ids: ready.map((a) => a.id) }),
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
      if (frame) cancelAnimationFrame(frame);
      flush();
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

  // Where an attachment is filed: on what the chat is about — the job, the
  // person, the customer — else unfiled in Files. Dusty's reader reads it.
  function attachTarget(): Record<string, unknown> {
    const a = convs?.find((c) => c.id === activeId);
    const kind = a ? a.context_kind : ref.kind;
    const id = a ? a.context_id : "id" in ref ? ref.id : null;
    if (id && kind === "scope") return { job_id: id };
    if (id && kind === "thread") return { contact_id: id };
    if (id && kind === "customer") return { customer_id: id };
    return { from_dusty: true };
  }
  async function attach(list: FileList | null) {
    const picked = Array.from(list ?? []).slice(0, 8);
    if (fileInput.current) fileInput.current.value = "";
    for (const file of picked) {
      const key = `${Date.now()}-${file.name}`;
      setAtts((a) => [...a, { key, name: file.name, pct: 0, id: null, error: null, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }]);
      const set = (p: Partial<Att>) => setAtts((a) => a.map((x) => (x.key === key ? { ...x, ...p } : x)));
      try {
        const r = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, mime: file.type, size: file.size, ...attachTarget() }) });
        const made = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(made?.error || `HTTP ${r.status}`);
        await sendBytes(made.upload.signed_url, file, (pct) => set({ pct }));
        const d = await fetch(`/api/files/${made.file.id}/done`, { method: "POST" });
        if (!d.ok) throw new Error("the upload didn't finish");
        set({ id: made.file.id as string, pct: 100 });
      } catch (e) { set({ error: e instanceof Error ? e.message : String(e) }); }
    }
  }
  async function voice(blob: Blob) {
    setRecording(false); setHearing(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, blob.type.includes("mp4") ? "voice.mp4" : "voice.webm");
      const r = await fetch("/api/dusty/transcribe", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      void ask(`${draft.trim() ? `${draft.trim()} ` : ""}${String(b.text)}`);
    } catch (e) { setErr(`Voice message: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setHearing(false); }
  }
  function create(what: "contact" | "customer" | "job" | "receipt") {
    setPlusOpen(false);
    const href = what === "contact" ? "/dashboard/contacts?new=1" : what === "customer" ? "/dashboard/customers?new=1" : what === "job" ? "/dashboard/scope?new=1" : "/dashboard/vendors?receipt=1";
    // On a phone Dusty covers the page, so he steps aside for the form.
    if (!window.matchMedia("(min-width: 1024px)").matches) onClose();
    router.push(href);
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:create", { detail: what })), 0);
  }

  if (!open) return null;

  const active = convs?.find((c) => c.id === activeId) ?? null;
  // The job a plan applies to: the chat's own job, else the job page that's open.
  const planJob = active ? (active.context_kind === "scope" ? active.context_id : null) : ref.kind === "scope" ? ref.id : null;
  const hot = active ? active.context_kind !== "cold" : ref.kind !== "cold";
  const lookingAt = active ? (active.context_kind === "cold" ? null : aboutLabel(active.context_label))
    : ref.kind === "cold" ? null : (pageName?.key === refKey && pageName.label) || GUESS[ref.kind];

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
          style={{ height: 28, background: T.ink, color: T.card, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
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
                    {c.context_kind !== "cold" && c.context_label ? `${aboutLabel(c.context_label)} · ` : ""}{relTime(c.updated_at)} ago
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
      className="fixed left-0 right-0 bottom-0 z-50 flex lg:left-auto lg:w-[var(--sc-dusty)] sc-dock-in sc-dusty-sheet"
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
          <div className="flex-1 min-w-0">
            {/* One line: 👀 <the job> when he is on something (Coy, 2026-10-05: the
                eyes instead of "Looking at:"), else the chat's own title. */}
            <div title={hot && lookingAt ? `👀 ${lookingAt}` : undefined}
              style={{ fontFamily: disp, fontSize: F.md, fontWeight: 600, lineHeight: 1.1, ...clip }}>
              {hot && lookingAt ? <><span role="img" aria-label="Looking at" style={{ fontWeight: 400 }}>👀</span> {lookingAt}</> : active ? active.title : "New chat"}
            </div>
          </div>
          {/* The chat's text size, saved to the account (dusty_font). */}
          <div className="relative">
            <button onClick={() => setFontOpen((o) => !o)} aria-label="Text size" aria-expanded={fontOpen} title={`Text size: ${font.label}`}
              style={{ ...iconBtn, fontFamily: disp, fontSize: 15, fontWeight: 600, color: T.ink2, background: fontOpen ? T.chalkDim : T.card }}>
              A<span style={{ fontSize: 11 }}>a</span>
            </button>
            {fontOpen && (
              <>
                <button aria-label="Close the menu" onClick={() => setFontOpen(false)} className="fixed inset-0" style={{ zIndex: 70, cursor: "default" }} />
                <div role="menu" aria-label="Text size" className="absolute right-0 mt-1 rounded overflow-hidden"
                  style={{ zIndex: 71, width: 180, background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
                  <div className="px-3 pt-2 pb-1" style={{ ...eyebrow, color: T.ink3 }}>Chat text size</div>
                  {FONT_STEPS.map((f) => (
                    <button key={f.key} role="menuitemradio" aria-checked={f.key === font.key} onClick={() => { setFontKey(f.key); setFontOpen(false); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2"
                      style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer", background: f.key === font.key ? T.chalkDim : "transparent" }}>
                      <span style={{ fontFamily: agent, fontSize: Math.round(14 * f.z), color: T.ink, flex: 1 }}>{f.label}</span>
                      {f.key === font.key && <span style={{ color: T.chalk, fontSize: 12 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setPlusOpen((o) => !o)} aria-label="New…" aria-expanded={plusOpen} style={{ ...iconBtn, fontSize: 18, color: T.ink2, background: plusOpen ? T.chalkDim : T.card }}>+</button>
            {plusOpen && (
              <>
                <button aria-label="Close the menu" onClick={() => setPlusOpen(false)} className="fixed inset-0" style={{ zIndex: 70, cursor: "default" }} />
                <div role="menu" className="absolute right-0 mt-1 rounded overflow-hidden" style={{ zIndex: 71, width: 230, background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
                  {([
                    ["chat", "New chat", "Start fresh with Dusty"],
                    ["contact", "New contact", "A person to keep — a number, an email, an address"],
                    ["customer", "New customer", "A household, business or school"],
                    ["job", "New job", "For a customer — on the Jobs board"],
                    ["receipt", "Add a receipt or quote", "Photo or file — Dusty reads the vendor and prices"],
                  ] as const).map(([k, l, sub], i) => (
                    <button key={k} role="menuitem" onClick={() => { if (k === "chat") { setPlusOpen(false); select(null); } else create(k); }}
                      className="w-full text-left px-3 py-2" style={{ borderTop: i ? `1px solid ${T.hairSoft}` : "none", cursor: "pointer" }}>
                      <span style={{ display: "block", fontFamily: disp, fontSize: F.md, fontWeight: 600, color: T.ink }}>{l}</span>
                      <span style={{ display: "block", fontSize: 10, color: T.ink3 }}>{sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} aria-label="Close Dusty" style={iconBtn}>
            <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden="true"><path d="M1 1 L12 12 M12 1 L1 12" stroke="currentColor" style={{ color: T.ink }} strokeWidth="1.8" /></svg>
          </button>
        </header>

        {active && ref.kind !== "cold" && !sameRef(active, ref) && (
          <button onClick={() => select(null)} className="shrink-0 w-full text-left px-3 py-1.5"
            style={{ background: T.chalkDim, borderBottom: `1px solid ${T.hair}`, fontSize: F.xs, color: T.ink2, cursor: "pointer" }}>
            This chat is about {active.context_label || "something else"}. <b style={{ color: T.ink }}>Ask about {PAGE[ref.kind]} instead →</b>
          </button>
        )}
        {/* A page can put its own numbers here while Dusty is docked beside it
            (the job page's totals — Coy, 2026-09-30). */}
        <div id="sc-dusty-slot" className="shrink-0" />
        <div ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 py-4" style={{ maxWidth: 760 }}>
            {loadingConv && <div className="rounded animate-pulse" style={{ height: 80, background: T.hairSoft }} />}
            {!loadingConv && items.length === 0 && (
              <DustyHello contactId={ref.kind === "thread" ? ref.id : null} onGo={onClose} />
            )}
            {/* The chat at Coy's text size: zoom scales the answers' tables and plans with the words. */}
            <div style={{ zoom: font.z }}>
            {items.map((it, i) => it.role === "user" ? (
              <div key={i} style={{ margin: i === 0 ? "0 0 8px" : "22px 0 8px", paddingTop: i === 0 ? 0 : 16, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
                <h2 style={{ fontFamily: agent, fontSize: F.md + 1, fontWeight: 700, lineHeight: 1.35 }}>
                  {it.files?.length ? it.content.replace(/\n\n📎 [^\n]*$/, "") : it.content}
                </h2>
                {/* The photos and files this question carried (079) — kept in Files, tap to open. */}
                {!!it.files?.length && <ChatFiles files={it.files} />}
              </div>
            ) : (
              <div key={i}>
                <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: agent }}>
                  {it.content ? (() => {
                    // A budget plan rides at the end of an answer: shown as steps with Apply, not as code.
                    const p = parsePlan(it.content);
                    const streaming = busy && i === items.length - 1;
                    const shown = streaming ? hideIds(it.content.replace(/```scopecrete-plan[\s\S]*$/, "").trim()) : p.shown;
                    return (<>
                      <Markdown text={shown} size={14} />
                      {streaming && /```scopecrete-plan/.test(it.content) && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 6 }}>Writing up the plan…</div>}
                      {!streaming && (p.actions.length > 0 || p.dropped > 0) && (
                        <PlanCard jobId={planJob} actions={p.actions} dropped={p.dropped} done={!streaming} />
                      )}
                    </>);
                  })() : <span style={{ color: T.ink3 }}>Reading…</span>}
                </div>
                {it.content && !(busy && i === items.length - 1) && (
                  <button onClick={() => void copy(i, it.content)} className="mt-1.5" style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                    {copied === i ? "Copied" : "Copy"}
                  </button>
                )}
                {useTarget && it.content && !(busy && i === items.length - 1) && (
                  <button onClick={() => useTarget.apply(it.content)} className="mt-1.5 ml-4" style={{ ...eyebrow, color: T.hiviz, cursor: "pointer" }}>
                    Use this {useTarget.label}
                  </button>
                )}
                </div>
              </div>
            ))}
            </div>
            {err &&<div style={{ fontSize: F.sm, color: T.red, marginTop: 8 }}>{err}</div>}
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} className="shrink-0 px-3 py-2.5"
          style={{ borderTop: `1px solid ${T.hair}`, background: T.card }}>
          {atts.length > 0 && (
            <div className="mx-auto flex flex-wrap gap-1.5 mb-2" style={{ maxWidth: 760 }}>
              {atts.map((a) => (
                <span key={a.key} className="rounded px-2 flex items-center gap-1.5" title={a.error ?? undefined}
                  style={{ height: 26, maxWidth: 220, border: `1px solid ${a.error ? T.red : T.hair}`, background: T.slab, fontSize: F.xs, color: a.error ? T.red : T.ink2 }}>
                  <span style={{ ...clip }}>📎 {a.name}</span>
                  <span style={{ ...nums, color: T.ink3 }}>{a.error ? "failed" : a.id ? "" : `${a.pct}%`}</span>
                  <button type="button" onClick={() => setAtts((x) => x.filter((y) => y.key !== a.key))} aria-label={`Remove ${a.name}`} style={{ color: T.ink3, cursor: "pointer" }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="mx-auto flex items-end gap-2" style={{ maxWidth: 760 }}>
            {/* Dusty at the bottom left, always there while the chat is open, in his
                live state — listening, sorting, done, stuck (Coy, 2026-10-05). */}
            <span className="shrink-0 flex" style={{ alignSelf: "center" }}><DustyAvatar state={recording || hearing ? "loading" : dustyState} size={36} /></span>
            {recording ? (
              <VoiceRecorder onSend={(b) => void voice(b)} onCancel={() => setRecording(false)} />
            ) : (
              <>
                {/* + attach (Coy, 2026-10-01): photos and files, filed on what the chat is about. */}
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)}
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
                <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach photos or files" title="Attach photos or files"
                  className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 38, height: 38, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontSize: 20, cursor: "pointer" }}>+</button>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
                  placeholder={hearing ? "Listening back…" : active ? "Follow up…" : hot ? `Ask about ${GUESS[ref.kind]}…` : "Ask Dusty…"}
                  className="flex-1 rounded-lg px-3 py-2 outline-none resize-none"
                  style={{ border: `1px solid ${T.hair}`, fontSize: Math.round(F.sm * font.z), maxHeight: 140, fontFamily: agent, minWidth: 0, background: T.card, color: T.ink }} />
                {/* Telegram's way: an empty box offers the mic, a typed one the send. */}
                {!draft.trim() && !atts.length ? (
                  <button type="button" onClick={() => { setErr(null); setRecording(true); }} disabled={busy || hearing} aria-label="Record a voice message" title="Record a voice message"
                    className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 38, height: 38, background: busy || hearing ? T.hair : T.hiviz, color: T.onHiviz, cursor: "pointer" }}>
                    {hearing ? "…" : (
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none" />
                        <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2.2" />
                      </svg>
                    )}
                  </button>
                ) : (
                  <button type="submit" disabled={busy || atts.some((a) => !a.id && !a.error)} className="rounded-lg px-3"
                    style={{ height: 38, background: busy ? T.hair : T.hiviz, color: T.onHiviz, fontFamily: disp,
                             fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                    {busy ? "…" : "Ask"}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

/** The files a question carried, under it in the chat: photos as thumbnails, the rest by name. Tap opens it in Files. */
function ChatFiles({ files }: { files: TurnFile[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {files.map((f) => {
        const img = f.url && (f.kind ? f.kind === "photo" : true) && !/\.(pdf|docx?|xlsx?|csv|txt)$/i.test(f.name);
        return (
          <a key={f.id} href={`/dashboard/files?file=${f.id}`} title={f.name} className="rounded overflow-hidden flex items-center"
            style={{ border: `1px solid ${T.hair}`, background: T.slab, height: img ? 72 : 26, maxWidth: img ? 108 : 220 }}>
            {img
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.url as string} alt={f.name} style={{ height: 72, width: "auto", maxWidth: 108, objectFit: "cover" }} />
              : <span className="px-2" style={{ ...clip, fontSize: F.xs, color: T.ink2 }}>📎 {f.name}</span>}
          </a>
        );
      })}
    </div>
  );
}

/**
 * The empty chat (Coy, 2026-10-05): the ScopeCrete emblem, "Hey Coy." and one
 * of Dusty's own recent thoughts — what the background reader already wrote
 * about real calls, texts and emails (/api/activity's musings and dreams), so
 * opening the panel costs no model call. Nothing to mention → a quiet line.
 * No "what I can and can't do", no starter buttons.
 */
function DustyHello({ contactId, onGo }: { contactId: string | null; onGo: () => void }) {
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [thought, setThought] = useState<Thought | null | undefined>(undefined);
  const [roll] = useState(() => Math.random());
  const router = useRouter();
  useEffect(() => {
    let off = false;
    fetch("/api/session/me").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setName(typeof b?.name === "string" ? b.name : null); })
      .catch(() => { if (!off) setName(null); });
    fetch("/api/activity").then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!off) setThought(pickThought(Array.isArray(b?.musings) ? (b.musings as Thought[]) : [], roll, contactId)); })
      .catch(() => { if (!off) setThought(null); });
    return () => { off = true; };
  }, [contactId, roll]);

  const ready = name !== undefined && thought !== undefined;
  const source = thought ? thoughtSource(thought.detail) : null;
  return (
    <div className="text-center" style={{ padding: "28px 8px 12px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Emblem size={44} spin /></div>
      <div style={{ opacity: ready ? 1 : 0, transition: "opacity .35s ease", maxWidth: 380, margin: "0 auto" }}>
        <div style={{ fontFamily: agent, fontSize: F.lg, fontWeight: 600, color: T.ink }}>{greeting(name ?? null, new Date())}</div>
        <p style={{ fontFamily: agent, fontSize: F.md, color: T.ink2, lineHeight: 1.5, margin: "6px 0 0" }}>
          {thought ? thought.summary : QUIET_LINES[Math.floor(roll * QUIET_LINES.length)]}
        </p>
        {thought && source && (
          thought.contact_id ? (
            <button onClick={() => { onGo(); router.push(`/dashboard/messages/${thought.contact_id}`); }}
              style={{ fontFamily: agent, fontSize: F.xs, color: T.ink3, marginTop: 6, cursor: "pointer", background: "none", border: "none" }}>
              — {source}
            </button>
          ) : <div style={{ fontFamily: agent, fontSize: F.xs, color: T.ink3, marginTop: 6 }}>— {source}</div>
        )}
      </div>
    </div>
  );
}
