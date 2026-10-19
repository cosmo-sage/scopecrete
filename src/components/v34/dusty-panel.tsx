"use client";

/**
 * Dusty — full screen, a place you work (v34 DustyScreen; Coy, 2026-09-28:
 * "full screen … so that I can reference older conversations in a side
 * project panel to select and continue older conversations").
 *
 * - On a phone, the whole screen — the app's header too (Coy, 2026-10-05);
 *   × in his own header closes it. On a desktop, docked on the right under
 *   the header.
 * - Claude Design "Emblem States" (2026-10-10): Dusty is the emblem, at the
 *   bottom left above the box with a status beside it ("Thinking…" · what
 *   about); a fresh chat opens on a greeting and quick selects for the page;
 *   the box is the fuller kind — two lines, attach, a pill naming what the
 *   chat is about, voice, a round send, Ctrl + Enter.
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
import { DustyEmblem, DOING, type EmblemState } from "@/components/v34/dusty-avatar";
import { Markdown, MdAsk } from "@/components/v34/markdown";
import { PlanCard } from "@/components/v34/plan-card";
import { hideIds, parsePlan } from "@/lib/dusty/plan";
import { useDustyUse, setDustyChat } from "@/lib/v34/dusty-live";
import { splitUse } from "@/lib/dusty/use-block";
import { shareText } from "@/lib/dusty/share";
import { sendBytes } from "@/components/v34/files-panel";
import { VoiceRecorder } from "@/components/v34/voice-recorder";
import { usePref } from "@/lib/v34/prefs";
import { TEXT_SIZES } from "@/lib/v34/text-size";
import { manrope } from "@/components/site/marks";
import { quickFor, statusDetail, type Quick } from "@/lib/dusty/quick";
import { JobPickList } from "@/components/v34/job-pick";
import { DustyReading } from "@/components/v34/dusty-reading";
import { firstName, partOfDay, pickThought, thoughtSource, QUIET_LINES, type Thought } from "@/lib/dusty/hello";

type Ref = { kind: "thread" | "scope" | "customer"; id: string } | { kind: "cash" } | { kind: "cold" };
type TurnFile = { id: string; name: string; kind?: string; url: string | null };
type Turn = { role: "user" | "assistant"; content: string; files?: TurnFile[] };
type Att = { key: string; name: string; pct: number; id: string | null; error: string | null; preview: string | null };
interface Conv { id: string; title: string; context_kind: string; context_id: string | null; context_label: string | null; updated_at: string }

/** The email conversation open in Threads (/dashboard/messages/email/<key>), so Dusty can draft into it (2026-10-14). */
const DUSTY_W_KEY = "sc:dusty-w";
/** Sets the docked column's width (--sc-dusty), kept between 320px and what leaves the page 480px. */
function setDustyWidth(px: number): number {
  const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sc-rail-w")) || 232;
  const max = Math.max(320, Math.min(1200, window.innerWidth - rail - 480));
  const w = Math.round(Math.min(max, Math.max(320, px)));
  document.documentElement.style.setProperty("--sc-dusty", `${w}px`);
  return w;
}

export function emailKeyFor(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/messages\/email\/([^/?#]+)/);
  if (!m || m[1] === "new") return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

export function refFor(pathname: string): Ref {
  // An email conversation is not a person's thread ("email" is no contact id).
  if (/^\/dashboard\/messages\/email(\/|$)/.test(pathname)) return { kind: "cold" };
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
const FONT_STEPS = TEXT_SIZES;
/** What a chat is about, without the context's kind in front ("scope: Wilson Driveway" → "Wilson Driveway"). */
const aboutLabel = (l: string | null) => {
  const s = (l ?? "").replace(/^scope:\s*/i, "").replace(/'s thread$/, "").replace(/ \(customer page\)$/, "");
  return /^\+?\d{10,11}$/.test(s) ? formatPhone(s) : s;
};

const sameRef =(c: Conv, r: Ref) => "id" in r ? c.context_kind === r.kind && c.context_id === r.id : c.context_kind === r.kind && r.kind === "cash";

export function DustyPanel({ open, onClose, onBusy, onStream, onState }: {
  open: boolean; onClose: () => void; onBusy: (b: boolean) => void;
  /** The emblem's state, so the footer's and header's Dusty mirror him while he is open. */
  onState?: (s: EmblemState) => void;
  /** The reply as it streams, for the activity line. "" when idle. */
  onStream?: (text: string) => void;
}) {
  const pathname = usePathname();
  const ref = refFor(pathname);
  const emailKey = emailKeyFor(pathname);
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
  // What a "Use this" tap did, shown in its place (Coy, 2026-10-11: on a phone the chat covers the page,
  // so the scope of work was saved with nothing on screen saying so).
  const [used, setUsed] = useState<{ i: number; ok: boolean; phone: boolean } | null>(null);
  const applyUse = (i: number, text: string) => {
    if (!useTarget) return;
    let ok = true;
    try { ok = useTarget.apply(text) !== false; } catch { ok = false; }
    setUsed({ i, ok, phone: window.matchMedia("(max-width: 1023px)").matches });
  };
  const usedNote = (i: number) => used?.i === i ? (
    <div role="status" style={{ fontSize: F.xs, marginTop: 6, color: used.ok ? T.green : T.red }}>
      {used.ok ? `✓ Saved ${useTarget?.label ?? "on the page"}.${used.phone ? " Close the chat to see it." : ""}` : "Nothing in it to use. Ask Dusty for it as a list."}
    </div>
  ) : null;
  const [loadingConv, setLoadingConv] = useState(false);
  const [listTick, setListTick] = useState(0);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // How the last answer ended — Dusty pours concrete on a good one, scratches his head on a failed one.
  const [mood, setMood] = useState<"done" | "error" | null>(null);
  const [fontKey, setFontKey] = usePref<string>("dusty_font", "m");
  const font = FONT_STEPS.find((f) => f.key === fontKey) ?? FONT_STEPS[1];
  const [fontOpen, setFontOpen] = useState(false);
  // Share (Coy, 2026-10-14): the last answer or the whole chat, through the phone's share sheet; copied where there is none.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const router = useRouter();
  // The + menu in the header (Coy, 2026-10-01): a new chat, or a new customer,
  // job or receipt — each opens its own form on the page beside him.
  const [plusOpen, setPlusOpen] = useState(false);
  // Files attached to the next message (the + left of the box).
  const [atts, setAtts] = useState<Att[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // The box grows with what is typed, up to about eight lines (Coy, 2026-10-09: "expandable").
  const box = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [focused, setFocused] = useState(false);
  // A finished write (a plan applied — plan-card.tsx): the emblem plays "done" and the status says what.
  const [doneNote, setDoneNote] = useState<{ note: string; n: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ ok?: boolean; note?: string }>).detail;
      if (d?.ok) { setMood(null); setDoneNote((x) => ({ note: String(d.note ?? "done"), n: (x?.n ?? 0) + 1 })); }
      else { setMood("error"); setErr(String(d?.note ?? "the plan didn't apply")); }
    };
    window.addEventListener("sc:dusty-done", on);
    return () => window.removeEventListener("sc:dusty-done", on);
  }, []);
  useEffect(() => { if (!doneNote) return; const t = setTimeout(() => setDoneNote(null), 4000); return () => clearTimeout(t); }, [doneNote]);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)"); const on = () => setDesktop(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  // His docked column is widened by dragging its left edge (Coy, 2026-10-15): the width is kept on
  // the device and set as --sc-dusty, which the page beside him already pads by.
  useEffect(() => {
    if (!desktop) return;
    try { const w = Number(localStorage.getItem(DUSTY_W_KEY)); if (w) setDustyWidth(w); } catch { /* storage off */ }
  }, [desktop]);

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
  // The Jobs page's emblem (Coy, 2026-10-09): a fresh chat where Dusty asks
  // "a new job, or one you have?" — his question is fixed text, no model call.
  const [jobAsk, setJobAsk] = useState(false);
  // The Contacts page's emblem (Coy, 2026-10-10): an "Add contact" button, no model call.
  const [contactAsk, setContactAsk] = useState(false);
  // The customer page's emblem (Coy, 2026-10-10): Edit · New job · Add to an existing job, no model call.
  const [customerAsk, setCustomerAsk] = useState<CustomerAskOn | null>(null);
  const select = useCallback((id: string | null) => {
    abort.current?.abort();
    setRailOpen(false); setErr(null); setActiveId(id); setDraft(""); if (id) { setJobAsk(false); setContactAsk(false); setCustomerAsk(null); }
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
    // The phone's talk bar "+" (Spaces): pick files for this chat, as his own + paperclip does.
    const pick = () => setTimeout(() => fileInput.current?.click(), 300);
    window.addEventListener("sc:dusty-attach", pick);
    return () => { window.removeEventListener("sc:dusty-draft", put); window.removeEventListener("sc:dusty-attach", pick); };
  }, []);
  useEffect(() => {
    const on = () => { select(null); setContactAsk(false); setCustomerAsk(null); setJobAsk(true); };
    const onContact = () => { select(null); setJobAsk(false); setCustomerAsk(null); setContactAsk(true); };
    const onCustomer = (e: Event) => {
      const d = (e as CustomEvent<CustomerAskOn>).detail;
      if (!d?.id) return;
      select(null); setJobAsk(false); setContactAsk(false); setCustomerAsk(d);
      setOpenedFor(refKey); // the ask stands: don't swap in the last chat about this customer
    };
    window.addEventListener("sc:dusty-jobs", on);
    window.addEventListener("sc:dusty-contacts", onContact);
    window.addEventListener("sc:dusty-customer", onCustomer);
    return () => { window.removeEventListener("sc:dusty-jobs", on); window.removeEventListener("sc:dusty-contacts", onContact); window.removeEventListener("sc:dusty-customer", onCustomer); };
  }, [select, refKey]);
  useEffect(() => {
    const q = autoAsk.current;
    if (!q || !open || !convs || openedFor !== openKey || loadingConv || busy) return;
    autoAsk.current = null;
    void ask(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ask() reads this render's chat; it runs once per tap
  }, [autoTick, open, convs, openedFor, openKey, loadingConv, busy]);

  // A "search the web for …" in an answer is a button: asked as Coy's next question, in this chat (Coy, 2026-10-15).
  const askRef = useRef<(q: string) => Promise<void>>(async () => {});
  const askSearch = useCallback((q: string) => { void askRef.current(q); }, []);
  useEffect(() => { askRef.current = ask; });

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
        body: JSON.stringify({ question: q, conversation_id: convId, context: convId ? undefined : ref, file_ids: ready.map((a) => a.id), email: emailKey ?? undefined }),
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

  async function share(which: "last" | "chat") {
    setShareOpen(false);
    const title = active?.title ? `Dusty · ${active.title}` : "Dusty";
    const text = shareText(items, which, which === "chat" ? title : null);
    if (!text) { setShareNote("Nothing to share yet"); setTimeout(() => setShareNote(null), 2200); return; }
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try { await nav.share({ title, text }); return; }
      catch (e) { if ((e as Error)?.name === "AbortError") return; /* no share sheet after all: copy */ }
    }
    try { await navigator.clipboard.writeText(text); setShareNote(which === "chat" ? "Chat copied" : "Answer copied"); }
    catch { setShareNote("Couldn't copy — your browser blocked it"); }
    setTimeout(() => setShareNote(null), 2200);
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
  function create(what: "contact" | "customer" | "job" | "receipt" | "vendor" | "quote" | "bill" | "group" | "card") {
    setPlusOpen(false);
    const href = what === "group" || what === "card" ? `/dashboard/price-book?new=${what}` : what === "contact" ? "/dashboard/contacts?new=1" : what === "customer" ? "/dashboard/customers?new=1" : what === "job" ? "/dashboard/scope?new=1"
      : what === "vendor" ? "/dashboard/vendors?new=1" : `/dashboard/vendors?receipt=${what === "receipt" ? 1 : what}`;
    // On a phone Dusty covers the page, so he steps aside for the form.
    if (!window.matchMedia("(min-width: 1024px)").matches) onClose();
    router.push(href);
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:create", { detail: what })), 0);
  }

  // The emblem's state, from what is really happening (never a timer).
  const lastSaid = items.length ? items[items.length - 1] : null;
  const dustyState: EmblemState = busy ? (lastSaid?.role === "assistant" && lastSaid.content ? "answering" : "thinking")
    : recording || hearing || draft.trim() || focused ? "listening"
    : mood === "error" ? "warn" : doneNote ? "done" : "idle";
  useEffect(() => { onState?.(dustyState); }, [dustyState, onState]);

  // The chat, for the artifacts column on Dusty's Home (Coy, 2026-10-19) — published when it loads,
  // a question goes out or an answer lands, never per token.
  const chatTitle = convs?.find((c) => c.id === activeId)?.title ?? null;
  useEffect(() => {
    setDustyChat({ id: activeId, title: chatTitle, items, streaming: busy ? items.length - 1 : null });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- items change per token while streaming; length and busy are enough
  }, [activeId, chatTitle, items.length, busy, loadingConv]);
  // "Show it in the chat" from the artifacts column: scroll to that turn and mark it a moment.
  useEffect(() => {
    const go = (e: Event) => {
      const n = (e as CustomEvent<{ turn?: number }>).detail?.turn;
      const el = typeof n === "number" ? document.getElementById(`sc-dusty-turn-${n}`) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.setAttribute("data-flash", "");
      setTimeout(() => el.removeAttribute("data-flash"), 1600);
    };
    window.addEventListener("sc:dusty-turn", go);
    return () => window.removeEventListener("sc:dusty-turn", go);
  }, []);
  const onHome = pathname === "/dashboard/dusty";

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

  const quick = !loadingConv && items.length === 0 && !jobAsk && !contactAsk ? quickFor(pathname) : [];
  const detail = statusDetail(dustyState, { about: lookingAt, quick: quick.length > 0, desktop, hearing,
    note: dustyState === "done" ? doneNote?.note : dustyState === "warn" ? err : null });
  const pick = (q: Quick) => {
    if (q.create) { create(q.create); return; }
    if (q.more) { setDraft(q.more); setTimeout(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); return; }
    if (q.ask) void ask(q.ask);
  };

  return (
    // Phone: a full page under the header. Desktop (Coy, 2026-09-29: "slide in
    // on the right… so I can see the rest of the dashboard"): a column docked
    // on the right, no backdrop; the layout pads <main> by --sc-dusty so the
    // page beside it stays whole and usable.
    <section role="dialog" aria-label="Dusty"
      className="fixed left-0 right-0 bottom-0 z-50 flex lg:left-auto lg:w-[var(--sc-dusty)] sc-dock-in sc-dusty-sheet"
      style={{ top: "var(--sc-head)", background: T.slab, color: T.ink, borderLeft: `1px solid ${T.hair}`, boxShadow: "-10px 0 30px rgba(10,14,18,.10)" }}>
      {/* history: on a desktop it opens out to the LEFT of his column, over the
          page, the chat staying in view (Coy, 2026-10-10); on a phone from the
          left, over the chat. */}
      {desktop && (
        <div role="separator" aria-orientation="vertical" aria-label="Drag to widen Dusty" title="Drag to widen · double-click to reset"
          onPointerDown={(e) => {
            e.preventDefault();
            let w = 0;
            const mv = (ev: PointerEvent) => { w = setDustyWidth(window.innerWidth - ev.clientX); };
            const up = () => {
              window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
              document.documentElement.removeAttribute("data-dusty-drag");
              if (w) try { localStorage.setItem(DUSTY_W_KEY, String(w)); } catch { /* storage off */ }
            };
            document.documentElement.setAttribute("data-dusty-drag", "");
            window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
          }}
          onDoubleClick={() => { document.documentElement.style.removeProperty("--sc-dusty"); try { localStorage.removeItem(DUSTY_W_KEY); } catch { /* storage off */ } }}
          className="sc-dusty-grip" style={{ position: "absolute", left: -4, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 61, touchAction: "none" }} />
      )}
      {railOpen && desktop && (
        <div className="absolute top-0 bottom-0 sc-rail-in" style={{ right: "100%", width: 320, boxShadow: "-14px 0 40px rgba(10,14,18,.18)", borderRight: `1px solid ${T.hair}`, zIndex: 60 }}>
          {rail}
        </div>
      )}
      {railOpen && !desktop && (
        <div className="absolute inset-0 z-[60]" style={{ background: "rgba(18,22,26,.4)" }}
          onClick={() => setRailOpen(false)}>
          <div className="absolute top-0 left-0 bottom-0 sc-rail-in" style={{ width: "min(320px, 86vw)", boxShadow: "14px 0 40px rgba(10,14,18,.22)" }}
            onClick={(e) => e.stopPropagation()}>{rail}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 px-2.5 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}`, background: T.card }}>
          <button onClick={() => setRailOpen((o) => !o)} aria-label="Conversations" aria-expanded={railOpen} className="flex-col gap-[3.5px]" style={iconBtn}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 13, height: 1.5, background: T.ink2, borderRadius: 1 }} />)}
          </button>
          {/* "DUSTY" alone (Emblem States, 2026-10-10): what the chat is about is the pill in the box,
              what he is doing the status beside his emblem. */}
          <div className="flex-1 min-w-0" title={active ? active.title : undefined}
            style={{ fontFamily: disp, fontSize: 16, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", lineHeight: 1.1 }}>
            Dusty
          </div>
          {/* Share the last answer or the whole chat (2026-10-14). */}
          <div className="relative">
            <button onClick={() => setShareOpen((o) => !o)} aria-label="Share" aria-expanded={shareOpen} title="Share"
              style={{ ...iconBtn, color: T.ink2, background: shareOpen ? T.chalkDim : T.card }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>
            </button>
            {shareOpen && (
              <>
                <button aria-label="Close the menu" onClick={() => setShareOpen(false)} className="fixed inset-0" style={{ zIndex: 70, cursor: "default" }} />
                <div role="menu" aria-label="Share" className="absolute right-0 mt-1 rounded overflow-hidden"
                  style={{ zIndex: 71, width: 200, background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
                  <div className="px-3 pt-2 pb-1" style={{ ...eyebrow, color: T.ink3 }}>Share</div>
                  {([["last", "The last answer"], ["chat", "The whole chat"]] as const).map(([k, label]) => (
                    <button key={k} role="menuitem" onClick={() => void share(k)} className="w-full text-left px-3 py-2"
                      style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer", fontFamily: agent, fontSize: 14, color: T.ink }}>{label}</button>
                  ))}
                </div>
              </>
            )}
            {shareNote && (
              <div role="status" className="absolute right-0 mt-1 px-2.5 py-1.5 rounded whitespace-nowrap"
                style={{ zIndex: 71, background: T.ink, color: T.card, fontSize: F.xs }}>{shareNote}</div>
            )}
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
          {/* On a desktop his column is the tool window's right panel and folds to a strip
              (Coy, 2026-10-18: "the right panel (for chat and artifacts) should be collapsible"). */}
          {desktop ? (
            <button onClick={onClose} aria-label="Collapse Dusty" title="Collapse Dusty" style={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ color: T.ink2 }}>
                <path d="M7.5 4l4 4-4 4M3.5 4l4 4-4 4" />
              </svg>
            </button>
          ) : (<>
            {onHome && (
              <button onClick={onClose} aria-label="What Dusty made — the artifacts" title="Artifacts" style={iconBtn}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" style={{ color: T.ink2 }}>
                  <rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" />
                </svg>
              </button>
            )}
            <button onClick={onClose} aria-label="Close Dusty" style={iconBtn}>
              <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden="true"><path d="M1 1 L12 12 M12 1 L1 12" stroke="currentColor" style={{ color: T.ink }} strokeWidth="1.8" /></svg>
            </button>
          </>)}
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
        {/* Dusty lives in the chat, just above the message bar at its left (Coy, 2026-10-10:
            "live inside the actual chat window, right above where it is"); the box below
            gets the row's whole width, and the chat leaves room under its last line for him. */}
        <div className="flex-1 min-h-0 relative flex flex-col">
        <div ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 pt-4" style={{ maxWidth: 760, paddingBottom: 12 }}>
            {/* On a job: what he is reading and how far along (Coy, 2026-10-12). */}
            {planJob && <DustyReading jobId={planJob} onGo={() => { if (!desktop) onClose(); }} />}
            {loadingConv && <div className="rounded animate-pulse" style={{ height: 80, background: T.hairSoft }} />}
            {!loadingConv && items.length === 0 && jobAsk && (
              <JobAsk onNew={() => { setJobAsk(false); create("job"); }}
                onPick={(id) => { setJobAsk(false); router.push(`/dashboard/scope/${id}/summary`); }} />
            )}
            {!loadingConv && items.length === 0 && contactAsk && !jobAsk && (
              <ContactAsk onAdd={() => { setContactAsk(false); create("contact"); }} />
            )}
            {!loadingConv && items.length === 0 && customerAsk && !jobAsk && !contactAsk && (
              <CustomerAsk on={customerAsk} quick={quick} onPick={pick}
                onAct={(what) => {
                  const detail = { id: customerAsk.id };
                  if (what === "reload") { window.dispatchEvent(new CustomEvent("sc:customer-reload", { detail })); return; }
                  setCustomerAsk(null);
                  if (!window.matchMedia("(min-width: 1024px)").matches) onClose();
                  window.dispatchEvent(new CustomEvent(what === "edit" ? "sc:customer-edit" : "sc:customer-new-job", { detail }));
                }} />
            )}
            {!loadingConv && items.length === 0 && !jobAsk && !contactAsk && !customerAsk && (
              <DustyHello contactId={ref.kind === "thread" ? ref.id : null} onGo={onClose} quick={quick} onPick={pick} />
            )}
            {/* The chat at Coy's text size: zoom scales the answers' tables and plans with the words. */}
            <div style={{ zoom: font.z }}>
            <MdAsk.Provider value={busy ? null : askSearch}>
            {items.map((it, i) => it.role === "user" ? (
              <div key={i} id={`sc-dusty-turn-${i}`} className="sc-dusty-turn" style={{ margin: i === 0 ? "0 0 8px" : "22px 0 8px", paddingTop: i === 0 ? 0 : 16, borderTop: i === 0 ? "none" : `1px solid ${T.hair}` }}>
                <h2 style={{ fontFamily: agent, fontSize: F.md + 1, fontWeight: 700, lineHeight: 1.35 }}>
                  {it.files?.length ? it.content.replace(/\n\n📎 [^\n]*$/, "") : it.content}
                </h2>
                {/* The photos and files this question carried (079) — kept in Files, tap to open. */}
                {!!it.files?.length && <ChatFiles files={it.files} />}
              </div>
            ) : (
              <div key={i} id={`sc-dusty-turn-${i}`} className="sc-dusty-turn">
                <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: agent }}>
                  {it.content ? (() => {
                    // A budget plan rides at the end of an answer: shown as steps with Apply, not as code.
                    const p = parsePlan(it.content);
                    const streaming = busy && i === items.length - 1;
                    const shown = streaming ? hideIds(it.content.replace(/```scopecrete-plan[\s\S]*$/, "").trim()) : p.shown;
                    // The words for the page in a highlighted box; "Use this" copies only those (use-block.ts).
                    const u = splitUse(shown);
                    return (<>
                      {u.box === null ? <Markdown text={shown} size={14} /> : (<>
                        {u.before && <Markdown text={u.before} size={14} />}
                        <div style={{ margin: "10px 0", padding: "10px 12px", background: T.hivizDim, border: `1px solid ${T.hiviz}`, borderRadius: 8 }}>
                          <div style={{ ...eyebrow, color: T.hivizText, marginBottom: 4 }}>For the page</div>
                          <Markdown text={u.box} size={14} />
                          {useTarget && !streaming && (
                            <button type="button" onClick={() => applyUse(i, u.box!)} className="mt-2"
                              style={{ ...eyebrow, color: T.onHiviz, background: T.hiviz, padding: "5px 10px", borderRadius: 6, cursor: "pointer" }}>
                              {used?.i === i && used.ok ? "✓ Used" : `Use this ${useTarget.label}`}
                            </button>
                          )}
                          {usedNote(i)}
                        </div>
                        {u.after && <Markdown text={u.after} size={14} />}
                      </>)}
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
                {useTarget && it.content && !(busy && i === items.length - 1) && splitUse(it.content).box === null && (
                  <button type="button" onClick={() => applyUse(i, it.content)} className="mt-1.5 ml-4" style={{ ...eyebrow, color: T.hiviz, cursor: "pointer" }}>
                    {used?.i === i && used.ok ? "✓ Used" : `Use this ${useTarget.label}`}
                  </button>
                )}
                {useTarget && it.content && splitUse(it.content).box === null && usedNote(i)}
                </div>
              </div>
            ))}
            </MdAsk.Provider>
            </div>
            {err &&<div style={{ fontSize: F.sm, color: T.red, marginTop: 8 }}>{err}</div>}
          </div>
        </div>
        {/* Dusty, bottom left above the box, with what he is doing beside him. */}
        <div className="shrink-0 flex items-end gap-3" style={{ height: 88, padding: "0 16px 12px" }} aria-live="polite">
          <DustyEmblem state={dustyState} size={60} hidden />
          <div className="min-w-0" style={{ paddingBottom: 16 }}>
            <div style={{ fontFamily: agent, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: dustyState === "warn" ? T.red : T.ink2 }}>{DOING[dustyState]}</div>
            <div style={{ fontFamily: agent, fontSize: 12, lineHeight: 1.3, color: T.ink3, maxWidth: 280, ...clip }} title={detail}>{detail}</div>
          </div>
        </div>
        </div>

        {/* The box (Emblem States, 2026-10-10): two lines, then + · what the chat is about · mic · send.
            Enter is a new line; Ctrl (⌘) + Enter sends, as the round arrow does. */}
        <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} className="shrink-0"
          style={{ margin: "0 10px 10px", padding: "10px 10px 8px", background: T.card, border: `1px solid ${T.hairStrong}`, borderRadius: 8 }}>
          {atts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
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
          {recording ? (
            <VoiceRecorder onSend={(b) => void voice(b)} onCancel={() => setRecording(false)} />
          ) : (
            <>
              <div className="flex items-start gap-2">
                <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={4000} aria-label="Ask Dusty"
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void ask(draft); } }}
                  placeholder={hearing ? "Listening back…" : "Ask Dusty"}
                  className="flex-1 outline-none resize-none"
                  style={{ border: "none", fontSize: Math.round(14 * font.z), lineHeight: 1.4, minHeight: 40, maxHeight: 200, overflowY: "auto",
                           fontFamily: agent, minWidth: 0, background: "transparent", color: T.ink, padding: 0 }} />
                {desktop && <span className="shrink-0" style={{ fontFamily: agent, fontSize: 10.5, color: T.ink3, paddingTop: 3 }}>Use Ctrl + Enter to submit</span>}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                {/* + attach (Coy, 2026-10-01): photos and files, filed on what the chat is about. */}
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => void attach(e.target.files)}
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
                <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach photos or files" title="Attach photos or files"
                  className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontSize: 18, cursor: "pointer" }}>+</button>
                {hot && lookingAt && (
                  <span className="min-w-0 flex items-center gap-1.5" title={`This chat is about ${lookingAt}`}
                    style={{ height: 30, borderRadius: 15, padding: "0 11px 0 9px", border: `1px solid ${T.hair}`, background: T.slab, color: T.ink2, fontFamily: agent, fontSize: 12, maxWidth: "60%" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
                    </svg>
                    <span style={{ ...clip }}>{lookingAt}</span>
                  </span>
                )}
                <span className="flex-1" />
                {/* The mic is always there (Coy, 2026-10-09: "what happened to my microphone button"). */}
                <button type="button" onClick={() => { setErr(null); setRecording(true); }} disabled={busy || hearing} aria-label="Record a voice message" title="Record a voice message"
                  className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, background: T.card, color: busy || hearing ? T.ink3 : T.ink2, cursor: "pointer" }}>
                  {hearing ? "…" : (
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none" />
                      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2.2" />
                    </svg>
                  )}
                </button>
                {(() => {
                  const off = busy || (!draft.trim() && !atts.some((a) => a.id)) || atts.some((a) => !a.id && !a.error);
                  return (
                    <button type="submit" disabled={off} aria-label="Send" title="Send"
                      className="shrink-0 rounded-full flex items-center justify-center"
                      style={{ width: 30, height: 30, background: off ? T.hair : T.hiviz, color: off ? T.ink3 : T.onHiviz, cursor: off ? "default" : "pointer" }}>
                      {busy ? "…" : (
                        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 13.5V3M3.5 7.2 8 2.7l4.5 4.5" />
                        </svg>
                      )}
                    </button>
                  );
                })()}
              </div>
            </>
          )}
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

/** Dusty's question from the Jobs page's emblem: a new job (the New job form)
 *  or one of the jobs there are (opens it, Dusty then on that job). */
function JobAsk({ onNew, onPick }: { onNew: () => void; onPick: (id: string) => void }) {
  const [jobs, setJobs] = useState<{ id: string; title: string | null; city: string | null; contact_name: string | null }[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!picking || jobs) return;
    let off = false;
    fetch("/api/jobs").then((r) => (r.ok ? r.json() : { jobs: [] })).then((b) => { if (!off) setJobs(b.jobs ?? []); }).catch(() => { if (!off) setJobs([]); });
    return () => { off = true; };
  }, [picking, jobs]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (jobs ?? []).filter((j) => words.every((w) => [j.title, j.city, j.contact_name].filter(Boolean).join(" ").toLowerCase().includes(w))).slice(0, 12);
  const btn: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 999, border: `1px solid ${T.hiviz}`, fontFamily: agent, fontSize: F.sm, fontWeight: 600, cursor: "pointer" };
  return (
    <div style={{ padding: "20px 4px 12px" }}>
      <div className="flex items-start gap-2.5">
        <DustyEmblem size={30} hidden />
        <div style={{ fontFamily: agent, fontSize: F.md, color: T.ink, lineHeight: 1.45, paddingTop: 4 }}>
          Do you want to create a new job, or edit an existing one?
        </div>
      </div>
      <div className="flex flex-wrap gap-2" style={{ margin: "12px 0 0 40px" }}>
        <button onClick={onNew} style={{ ...btn, background: T.hiviz, color: T.onHiviz }}>A new job</button>
        <button onClick={() => setPicking(true)} style={{ ...btn, background: picking ? T.hivizDim : T.card, color: T.ink }}>Edit an existing one</button>
      </div>
      {picking && (
        <div style={{ margin: "12px 0 0 40px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which job? Name, customer, city…" autoFocus
            className="w-full rounded" style={{ height: 34, padding: "0 10px", border: `1px solid ${T.hair}`, background: T.card, fontFamily: agent, fontSize: F.sm, color: T.ink }} />
          <div className="flex flex-col" style={{ marginTop: 6 }}>
            {!jobs && <div style={{ fontFamily: agent, fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>Finding your jobs…</div>}
            {jobs && shown.length === 0 && <div style={{ fontFamily: agent, fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>No job by that name.</div>}
            {shown.map((j) => (
              <button key={j.id} onClick={() => onPick(j.id)} className="text-left"
                style={{ padding: "8px 2px", borderBottom: `1px solid ${T.hairSoft}`, background: "none", cursor: "pointer", fontFamily: agent }}>
                <div style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, ...clip }}>{j.title || "Untitled job"}</div>
                {(j.contact_name || j.city) && <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{[j.contact_name, j.city].filter(Boolean).join(" · ")}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type CustomerAskOn = { id: string; name: string; jobs: string[]; canNew: boolean };

/** Dusty's offer from the customer page's emblem (Coy, 2026-10-10: Edit and New job "inside the AI dusty
 *  chat", and "add this customer to an existing job"): fixed words, no model call; the page's quick
 *  selects under it, and anything typed is asked about this customer as usual. */
function CustomerAsk({ on, onAct, quick, onPick }: { on: CustomerAskOn; onAct: (what: "edit" | "new" | "reload") => void; quick: Quick[]; onPick: (q: Quick) => void }) {
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState<number>(0);
  const btn: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: 999, border: `1px solid ${T.hiviz}`, fontFamily: agent, fontSize: F.sm, fontWeight: 600, cursor: "pointer" };
  return (
    <div style={{ padding: "20px 4px 12px" }}>
      <div className="flex items-start gap-2.5">
        <DustyEmblem size={30} hidden />
        <div style={{ fontFamily: agent, fontSize: F.md, color: T.ink, lineHeight: 1.45, paddingTop: 4 }}>
          What are we doing with {on.name}? Pick one, or ask me anything about them.
        </div>
      </div>
      <div className="flex flex-wrap gap-2" style={{ margin: "12px 0 0 40px" }}>
        <button onClick={() => onAct("new")} disabled={!on.canNew} title={on.canNew ? undefined : "Add a contact to this customer first"}
          style={{ ...btn, background: T.hiviz, color: T.onHiviz, opacity: on.canNew ? 1 : 0.5 }}>New job</button>
        <button onClick={() => setPicking((v) => !v)} aria-expanded={picking} style={{ ...btn, background: picking ? T.hivizDim : T.card, color: T.ink }}>Add to an existing job</button>
        <button onClick={() => onAct("edit")} style={{ ...btn, background: T.card, color: T.ink }}>Edit customer</button>
        {quick.slice(0, 3).map((q) => (
          <button key={q.label} onClick={() => onPick(q)} style={{ ...btn, background: T.card, color: T.ink, borderColor: T.hairStrong }}>{q.label}{q.more ? " ›" : ""}</button>
        ))}
      </div>
      {added > 0 && <div style={{ margin: "8px 0 0 40px", fontFamily: agent, fontSize: F.sm, color: T.green }}>Done — the job is on {on.name} now.</div>}
      {picking && (
        <div style={{ margin: "12px 0 0 40px" }}>
          <JobPickList customerId={on.id} exclude={on.jobs} font={agent} onDone={() => { setPicking(false); setAdded((n) => n + 1); onAct("reload"); }} />
        </div>
      )}
    </div>
  );
}

/** Dusty's offer from the Contacts page's emblem: one quick answer, Add contact. */
function ContactAsk({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: "20px 4px 12px" }}>
      <div className="flex items-start gap-2.5">
        <DustyEmblem size={30} hidden />
        <div style={{ fontFamily: agent, fontSize: F.md, color: T.ink, lineHeight: 1.45, paddingTop: 4 }}>
          Who are we adding? Tap below for the form, or ask me anything about your contacts.
        </div>
      </div>
      <div className="flex flex-wrap gap-2" style={{ margin: "12px 0 0 40px" }}>
        <button onClick={onAdd} style={{ height: 36, padding: "0 14px", borderRadius: 999, border: `1px solid ${T.hiviz}`, background: T.hiviz, color: T.onHiviz, fontFamily: agent, fontSize: F.sm, fontWeight: 600, cursor: "pointer" }}>Add contact</button>
      </div>
    </div>
  );
}

/**
 * The empty chat: "Good afternoon Coy." (Emblem States, 2026-10-10; one
 * line since Coy's note the same evening), the quick selects for the page — a tap asks it, a › puts the
 * start in the box to finish — and one of Dusty's own recent thoughts, small
 * (Coy, 2026-10-05), from /api/activity, so opening costs no model call.
 */
function DustyHello({ contactId, onGo, quick, onPick }: { contactId: string | null; onGo: () => void; quick: Quick[]; onPick: (q: Quick) => void }) {
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
  const first = firstName(name ?? null);
  return (
    <div style={{ padding: "8px 2px 4px" }}>
      <div style={{ opacity: name === undefined ? 0 : 1, transition: "opacity .35s ease" }}>
        <div style={{ fontFamily: manrope, fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", lineHeight: 1.15, color: "#1FA971" }}>
          Good {partOfDay(new Date()).toLowerCase()}{first ? ` ${first}` : ""}.
        </div>
      </div>
      {quick.length > 0 && (
        <div role="list" aria-label="Quick selects" style={{ marginTop: 16 }}>
          {quick.map((q) => (
            <button key={q.label} role="listitem" onClick={() => onPick(q)} className="w-full text-left flex items-center gap-3 sc-quick"
              style={{ height: 40, padding: "0 8px", borderRadius: 6, background: "none", border: "none", cursor: "pointer", color: T.ink }}>
              <QuickIcon label={q.label} />
              <span style={{ flex: 1, fontFamily: agent, fontSize: 14, fontWeight: 600, ...clip }}>{q.label}</span>
              {q.more && <span aria-hidden style={{ color: T.ink3, fontSize: 16 }}>›</span>}
            </button>
          ))}
        </div>
      )}
      {/* One of his own recent thoughts, small, under the work (Coy, 2026-10-05: "to maybe make me smile"). */}
      <div style={{ opacity: ready ? 1 : 0, transition: "opacity .35s ease", marginTop: quick.length ? 14 : 8 }}>
        <p style={{ fontFamily: agent, fontSize: F.sm, color: T.ink3, lineHeight: 1.5, margin: 0 }}>
          {thought ? thought.summary : QUIET_LINES[Math.floor(roll * QUIET_LINES.length)]}
          {thought && source && (thought.contact_id ? (
            <button onClick={() => { onGo(); router.push(`/dashboard/messages/${thought.contact_id}`); }}
              style={{ fontFamily: agent, fontSize: F.xs, color: T.ink3, marginLeft: 6, cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline" }}>
              — {source}
            </button>
          ) : <span style={{ fontSize: F.xs, marginLeft: 6 }}>— {source}</span>)}
        </p>
      </div>
    </div>
  );
}

/** A quick select's icon (Lucide weight, 17px, ink2). */
function QuickIcon({ label }: { label: string }) {
  const d: Record<string, React.ReactNode> = {
    brief: <><path d="M4 5h16M4 10h16M4 15h10M4 20h7" /></>,
    price: <><path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2 3 5 3.5 5 1.5 5 3.8-2.2 3.7-5 3.7-5-1.2-5-3.2" /></>,
    plans: <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 9h18M9 21V9" /></>,
    rates: <><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></>,
    write: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    crew: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.8.3 5 2.6 5 5.8" /></>,
    needs: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></>,
    reply: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></>,
    job: <><rect x="3" y="7" width="18" height="13" rx="1.5" /><path d="M8 7V4h8v3M12 11v5M9.5 13.5h5" /></>,
    photo: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></>,
    person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7M19 4v6M16 7h6" /></>,
    card: <><rect x="2.5" y="5" width="19" height="14" rx="1.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h5M14 13.5h4" /></>,
  };
  const key = /brief/i.test(label) ? "brief" : /^price/i.test(label) ? "price" : /takeoff/i.test(label) ? "plans" : /rates/i.test(label) ? "rates"
    : /proposal/i.test(label) ? "write" : /receipt/i.test(label) ? "receipt" : /crew/i.test(label) ? "crew" : /needs|heard/i.test(label) ? "needs"
    : /summar/i.test(label) ? "chat" : /reply/i.test(label) ? "reply" : /job/i.test(label) ? "job" : /photo/i.test(label) ? "photo"
    : /card/i.test(label) ? "card" : "person";
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: T.ink2, flexShrink: 0 }}>{d[key]}</svg>
  );
}
