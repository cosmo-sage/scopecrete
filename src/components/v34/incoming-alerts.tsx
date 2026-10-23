"use client";

/**
 * Incoming alerts (Coy, 2026-10-06: "There needs to be a way for me to be
 * notified inside the scopecrete app for incoming emails, text messages and
 * phone calls. And if there is an active phone call I would like that thread
 * channel to show it's active.")
 *
 *  - AlertsBell: a bell in the header with the count not yet seen; it opens
 *    the last three days of texts, calls, emails and vendors opening a bid
 *    request, newest first.
 *  - AlertPopups: a card for each one that arrives while the app is open
 *    (gone after 8 s, a tap opens it), and a card that stays while a call is
 *    live — Ringing, then On a call with its length.
 *  - LiveCallBadge: the green "On a call" marker, for a thread row or channel.
 * One store feeds all of them (src/lib/v34/alerts-live.ts).
 */
import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChatText, Envelope, FileText, Phone, PhoneIncoming, X } from "@phosphor-icons/react";
import { T, F, disp, eyebrow, nums, relTime } from "@/lib/v34/tokens";
import { liveLabel, type Alert, type LiveCall } from "@/lib/alerts";
import { useAlerts, markAlertsSeen, dropFresh, dropAllFresh } from "@/lib/v34/alerts-live";

const ICON: Record<Alert["kind"], React.ComponentType<{ size?: number; color?: string; weight?: "fill" | "regular" }>> = {
  text: ChatText, call: Phone, email: Envelope, bid: FileText,
};
/** A kind this copy of the app doesn't know yet (a tab opened before an update adds one) gets the bell, not a crash. */
function AlertIcon({ kind, ...p }: { kind: string; size?: number; color?: string; weight?: "fill" | "regular" }) {
  const Ico = ICON[kind as Alert["kind"]] ?? Bell;
  return <Ico {...p} />;
}

/** Ticks once a second while something live is on screen. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function LiveDot({ size = 8 }: { size?: number }) {
  return <span aria-hidden="true" className="sc-live-dot" style={{ width: size, height: size }} />;
}

/** "● Ringing" / "● On a call · 3:07", green, for a row or a channel tab. */
export function LiveCallBadge({ call, compact }: { call: LiveCall; compact?: boolean }) {
  const now = useNow(true);
  const label = liveLabel(call, now);
  return (
    <span className="inline-flex items-center gap-1.5" title={call.line ? `On ${call.line}` : undefined}
      style={{ fontSize: compact ? 10.5 : 11.5, fontWeight: 700, color: T.green, whiteSpace: "nowrap", ...nums }}>
      <LiveDot size={compact ? 7 : 8} />{compact ? label.replace(/ · .*/, "") : label}
    </span>
  );
}

function ago(iso: string): string {
  const r = relTime(iso);
  if (!r) return "";
  return r === "now" ? "just now" : /\s/.test(r) ? r : `${r} ago`;
}

export function AlertsBell({ glassBtn }: { glassBtn: React.CSSProperties }) {
  const router = useRouter();
  const { items, unread, seenAt, live } = useAlerts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "none">("none");
  useEffect(() => {
    Promise.resolve().then(() => setPerm(typeof Notification === "undefined" ? "none" : Notification.permission));
  }, [open]);
  useEffect(() => {
    if (!open) { document.documentElement.dataset.alertsOpen = ""; return; }
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = (href: string | null) => { setOpen(false); if (href) router.push(href); };
  const toggle = () => {
    const o = !open;
    setOpen(o);
    // Seen once opened — the count is what came in since he last looked.
    if (o && unread) markAlertsSeen();
    // The list has them all: the pop-ups go, and stay away while it is open.
    if (o) dropAllFresh();
    document.documentElement.dataset.alertsOpen = o ? "1" : "";
  };
  const now = useNow(open && live.length > 0);

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button onClick={toggle} aria-label={unread ? `Alerts, ${unread} new` : "Alerts"} aria-expanded={open}
        className="flex items-center justify-center sc-paper-btn" style={{ ...glassBtn, position: "relative" }}>
        <Bell size={16} weight={unread || live.length ? "fill" : "regular"} color={live.length ? T.green : undefined} />
        {live.length > 0 ? (
          <span className="absolute" style={{ top: -3, right: -3 }}><LiveDot size={9} /></span>
        ) : unread > 0 && (
          <span className="absolute rounded-full flex items-center justify-center"
            style={{ top: -5, right: -6, minWidth: 16, height: 16, padding: "0 4px", background: T.red, color: "#fff", fontFamily: disp,
                     fontSize: 10, fontWeight: 700, lineHeight: 1, ...nums }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Alerts" className="sc-alerts-panel"
          style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,.18)", overflow: "hidden" }}>
          <div className="flex items-center gap-2 px-3" style={{ height: 40, borderBottom: `1px solid ${T.hair}` }}>
            <span style={{ ...eyebrow, color: T.ink, fontSize: 11 }}>Incoming</span>
            <span className="flex-1" />
            <span style={{ fontSize: 11, color: T.ink3 }}>Texts, calls, emails and bid opens · last 3 days</span>
          </div>
          {live.map((c) => (
            <button key={c.id} onClick={() => go(c.href)} className="w-full text-left flex items-start gap-2.5 px-3 py-2.5"
              style={{ background: T.greenDim, borderBottom: `1px solid ${T.hairSoft}`, cursor: c.href ? "pointer" : "default" }}>
              <span style={{ marginTop: 2 }}><PhoneIncoming size={16} weight="fill" color={T.green} /></span>
              <span className="flex-1 min-w-0">
                <span className="block" style={{ fontSize: F.sm, fontWeight: 700, color: T.ink }}>{c.name ?? "Unknown number"}</span>
                <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: T.green, fontWeight: 600, ...nums }}>
                  <LiveDot size={7} />{liveLabel(c, now)}{c.line ? <span style={{ color: T.ink3, fontWeight: 400 }}> · via {c.line}</span> : null}
                </span>
              </span>
            </button>
          ))}
          <div style={{ maxHeight: "min(60vh, 460px)", overflowY: "auto" }}>
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center" style={{ fontSize: F.sm, color: T.ink3 }}>Nothing has come in for three days.</div>
            ) : items.map((a) => {
              const isNew = !!seenAt && a.at > seenAt;
              return (
                <button key={a.id} onClick={() => go(a.href)} className="w-full text-left flex items-start gap-2.5 px-3 py-2"
                  style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: a.href ? "pointer" : "default" }}>
                  <span style={{ marginTop: 2 }}><AlertIcon kind={a.kind} size={15} color={T.ink2} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0" style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                      <span style={{ fontSize: 11, color: T.ink3, whiteSpace: "nowrap", ...nums }}>{ago(a.at)}</span>
                      {isNew && <span aria-label="new" style={{ width: 7, height: 7, borderRadius: 999, background: T.red, flex: "0 0 auto" }} />}
                    </span>
                    <span className="block" style={{ fontSize: 12.5, color: T.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {perm === "default" && (
            <button onClick={() => { void Notification.requestPermission().then(setPerm); }} className="w-full text-left px-3 py-2.5"
              style={{ borderTop: `1px solid ${T.hair}`, fontSize: 12, color: T.chalk, cursor: "pointer" }}>
              Also alert me when ScopeCrete is in the background ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const POP_MS = 8000;

function Pop({ a, onGo }: { a: Alert; onGo: (a: Alert) => void }) {
  useEffect(() => {
    const t = setTimeout(() => dropFresh(a.id), POP_MS);
    return () => clearTimeout(t);
  }, [a.id]);
  return (
    <div role="status" className="sc-pop flex items-start gap-2.5"
      style={{ background: T.card, border: `1px solid ${T.hair}`, borderLeft: `3px solid ${T.hiviz}`, borderRadius: 6, padding: "9px 10px 9px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
      <button onClick={() => onGo(a)} className="flex-1 min-w-0 text-left flex items-start gap-2.5" style={{ cursor: a.href ? "pointer" : "default" }}>
        <span style={{ marginTop: 2 }}><AlertIcon kind={a.kind} size={16} color={T.ink2} weight="fill" /></span>
        <span className="flex-1 min-w-0">
          <span className="block" style={{ fontSize: F.sm, fontWeight: 700, color: T.ink }}>{a.title}</span>
          <span className="block" style={{ fontSize: 12.5, color: T.ink2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.body}</span>
        </span>
      </button>
      <button onClick={() => dropFresh(a.id)} aria-label="Dismiss" style={{ color: T.ink3, cursor: "pointer", padding: 2 }}><X size={14} /></button>
    </div>
  );
}

/** The pop-ups, top right on a desktop, across the top on a phone. */
export function AlertPopups() {
  const router = useRouter();
  const path = usePathname();
  const { fresh: all, live } = useAlerts();
  // Nothing pops up for the thread already open: it is on the screen.
  const fresh = all.filter((a) => !a.href || a.href !== path);
  useEffect(() => { for (const a of all) if (a.href && a.href === path) dropFresh(a.id); }, [all, path]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const now = useNow(live.length > 0);
  // The open thread shows its own call; no card over it.
  const shownLive = live.filter((c) => !hidden.has(c.id) && (!c.href || c.href !== path));
  if (!fresh.length && !shownLive.length) return null;
  const go = (a: { id: string; href: string | null }) => { dropFresh(a.id); if (a.href) router.push(a.href); };
  return (
    <div className="sc-pops" aria-live="polite">
      {shownLive.map((c) => (
        <div key={c.id} role="status" className="sc-pop flex items-center gap-2.5"
          style={{ background: T.card, border: `1px solid ${T.hair}`, borderLeft: `3px solid ${T.green}`, borderRadius: 6, padding: "9px 10px 9px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
          <button onClick={() => go(c)} className="flex-1 min-w-0 text-left flex items-center gap-2.5" style={{ cursor: c.href ? "pointer" : "default" }}>
            <span className="sc-live-ring"><PhoneIncoming size={16} weight="fill" color={T.green} /></span>
            <span className="flex-1 min-w-0">
              <span className="block" style={{ fontSize: F.sm, fontWeight: 700, color: T.ink }}>{c.name ?? "Unknown number"}</span>
              <span className="block" style={{ fontSize: 12, color: T.green, fontWeight: 600, ...nums }}>
                {liveLabel(c, now)}{c.line ? <span style={{ color: T.ink3, fontWeight: 400 }}> · via {c.line}</span> : null}
              </span>
            </span>
          </button>
          <button onClick={() => setHidden((s) => new Set(s).add(c.id))} aria-label="Hide" style={{ color: T.ink3, cursor: "pointer", padding: 2 }}><X size={14} /></button>
        </div>
      ))}
      {fresh.slice(0, 3).map((a) => <Pop key={a.id} a={a} onGo={go} />)}
    </div>
  );
}
