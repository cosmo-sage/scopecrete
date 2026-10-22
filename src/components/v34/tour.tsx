"use client";

/**
 * The first-login tour (Coy, 2026-10-22). A dimmed screen with the part being explained cut out
 * and ringed, and a bubble beside it: what it is, Back · Next, Skip. The steps and where the
 * bubble sits are src/lib/v34/tour.ts.
 *
 * Starts by itself the first time someone opens the dashboard (the shell tour) and the first time
 * they open a job (the job tour), once the account's settings are read so a tour already seen on
 * another device never flashes up. `sc:tour` (detail "shell" | "job") starts one again — Settings →
 * Account → Take the tour again. A step whose part isn't on screen (an onsite estimator has no
 * rail, say) is passed over. On a phone the Work Spaces slide out for the steps about them and back
 * when the tour leaves them.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { T, F, disp, body } from "@/lib/v34/tokens";
import { usePref, usePrefsReady } from "@/lib/v34/prefs";
import { autoTour, markSeen, placeBubble, seenTours, tourSteps, type Box, type TourKind, type TourStep } from "@/lib/v34/tour";

const PAD = 6;

function findTarget(step: TourStep | undefined): Box | null {
  if (!step?.targets) return null;
  for (const sel of step.targets) {
    let els: NodeListOf<Element>;
    try { els = document.querySelectorAll(sel); } catch { continue; }
    for (const el of Array.from(els)) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
      // Clip to the screen, so a tall drawer rings what can be seen of it.
      const top = Math.max(0, r.top), left = Math.max(0, r.left);
      const bottom = Math.min(window.innerHeight, r.bottom), right = Math.min(window.innerWidth, r.right);
      return { top, left, width: right - left, height: bottom - top };
    }
  }
  return null;
}

export function TourHost({ desktop, spaces, name, enabled }: { desktop: boolean; spaces: boolean; name: string | null; enabled: boolean }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ready = usePrefsReady();
  const [savedSeen, setSeen] = usePref<unknown>("tours_seen", null);
  const seen = seenTours(savedSeen);
  const [kind, setKind] = useState<TourKind | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [i, setI] = useState(0);
  const dir = useRef(1);

  const start = useCallback(async (k: TourKind) => {
    // Whether the org has sample data in (migration 119), for the welcome and the last card.
    const sample = await fetch("/api/sample-data").then((r) => (r.ok ? r.json() : null)).catch(() => null) as { active?: boolean; job_id?: string | null } | null;
    setSteps(tourSteps(k, { layout: desktop ? "desktop" : "phone", spaces, name, sample: sample?.active ? { job_id: sample.job_id ?? null } : null }));
    dir.current = 1;
    setI(0);
    setKind(k);
  }, [desktop, spaces, name]);

  // By itself, once per tour per account.
  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !ready || kind) return;
    const k = autoTour(pathname, seen);
    if (!k || autoKey.current === `${k}`) return;
    autoKey.current = k;
    const t = setTimeout(() => { void start(k); }, 1200);
    return () => clearTimeout(t);
  }, [enabled, ready, kind, pathname, seen, start]);

  // Again, on request.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TourKind | undefined>).detail;
      const k: TourKind = d === "job" ? "job" : "shell";
      if (k === "shell") setSeen([]);
      autoKey.current = k;
      void start(k);
    };
    window.addEventListener("sc:tour", on);
    return () => window.removeEventListener("sc:tour", on);
  }, [start, setSeen]);

  const step = kind ? steps[i] : undefined;

  // Phone: the Work Spaces out for the steps about them, back after.
  const spacesOut = useRef(false);
  useEffect(() => {
    if (desktop) return;
    const want = !!step?.spaces;
    if (want && !spacesOut.current) { window.dispatchEvent(new Event("sc:spaces-open")); spacesOut.current = true; }
    if (!want && spacesOut.current) { window.dispatchEvent(new Event("sc:spaces-close")); spacesOut.current = false; }
  }, [step, desktop]);

  // Where the part is, read again as things slide and scroll into place.
  const [box, setBox] = useState<Box | null>(null);
  const missingSince = useRef<number | null>(null);
  useEffect(() => {
    if (!step) return;
    missingSince.current = null;
    const read = () => {
      const b = findTarget(step);
      setBox((o) => (o && b && o.top === b.top && o.left === b.left && o.width === b.width && o.height === b.height ? o : b));
      if (step.targets && !b) {
        const now = Date.now();
        if (missingSince.current === null) missingSince.current = now;
        // Not on screen after the drawer had time to slide out: pass it over.
        else if (now - missingSince.current > 900) {
          missingSince.current = null;
          setI((n) => Math.max(0, Math.min(steps.length - 1, n + dir.current)));
        }
      } else missingSince.current = null;
    };
    read();
    const t = setInterval(read, 200);
    window.addEventListener("resize", read);
    return () => { clearInterval(t); window.removeEventListener("resize", read); };
  }, [step, steps.length]);

  const end = useCallback((skipped: boolean) => {
    if (!kind) return;
    // Skipping the first tour skips the job one too; finishing it leaves the job one to come.
    let next = markSeen(seen, kind);
    if (skipped && kind === "shell") next = markSeen(next, "job");
    setSeen(next);
    setKind(null);
    setSteps([]);
    setBox(null);
  }, [kind, seen, setSeen]);

  const next = useCallback(() => { dir.current = 1; if (i >= steps.length - 1) end(false); else setI(i + 1); }, [i, steps.length, end]);
  const back = useCallback(() => { dir.current = -1; setI((n) => Math.max(0, n - 1)); }, []);

  useEffect(() => {
    if (!kind) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); end(true); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [kind, next, back, end]);

  // The bubble's own size, for placing it.
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState({ width: 320, height: 180 });
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - bubble.width) > 1 || Math.abs(r.height - bubble.height) > 1) setBubble({ width: r.width, height: r.height });
  }, [kind, i, steps, bubble.width, bubble.height]);

  if (!kind || !step || typeof document === "undefined") return null;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const ring = box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null;
  const at = placeBubble(ring, bubble, view);
  const last = i === steps.length - 1;
  const width = Math.min(340, view.width - 20);

  return createPortal(
    <div className="sc-tour" role="dialog" aria-modal="true" aria-label="Tour of ScopeCrete"
      style={{ position: "fixed", inset: 0, zIndex: 2000, fontFamily: body }}>
      {/* The screen, dimmed, with the part cut out (one box whose shadow is the dim). */}
      {ring
        ? <div aria-hidden="true" style={{ position: "fixed", ...ring, borderRadius: 10, boxShadow: "0 0 0 9999px rgba(8,12,16,.58)", outline: `2px solid ${T.hiviz}`, outlineOffset: 0, transition: "top .25s, left .25s, width .25s, height .25s", pointerEvents: "none" }} />
        : <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(8,12,16,.58)" }} />}
      <div ref={bubbleRef} style={{ position: "fixed", top: at.top, left: at.left, width, background: T.card, color: T.ink, borderRadius: 12,
        boxShadow: "0 18px 50px rgba(0,0,0,.35)", padding: "14px 16px 12px", transition: "top .25s, left .25s", border: `1px solid ${T.hair}` }}>
        <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3 }}>
          {kind === "job" ? "Jobs" : "Tour"} · {i + 1} of {steps.length}
        </div>
        <div style={{ fontFamily: "var(--sc-font-strong)", fontWeight: 700, fontSize: 17, lineHeight: 1.2, marginTop: 4 }}>{step.title}</div>
        <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5, marginTop: 6 }}>{step.body}</div>
        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          {!last && <button type="button" onClick={() => end(true)} style={{ fontSize: F.sm, color: T.ink3, background: "none", border: 0, padding: "6px 2px", cursor: "pointer" }}>Skip tour</button>}
          <span className="flex-1" />
          {i > 0 && <button type="button" onClick={back} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, cursor: "pointer" }}>Back</button>}
          {last && step.cta && (
            <button type="button" onClick={() => { const href = step.cta!.href; end(false); router.push(href); }}
              style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.hiviz}`, background: T.card, color: T.ink, fontSize: F.sm, cursor: "pointer" }}>{step.cta.label}</button>
          )}
          <button type="button" onClick={next} autoFocus
            style={{ height: 34, padding: "0 14px", borderRadius: 8, border: 0, background: T.hiviz, color: T.onHiviz, fontSize: F.sm, fontWeight: 700, cursor: "pointer" }}>
            {last ? "Done" : i === 0 ? "Show me" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Settings → Account: take either tour again. */
export function TourAgain() {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => { router.push("/dashboard"); setTimeout(() => window.dispatchEvent(new CustomEvent("sc:tour", { detail: "shell" })), 400); }}
        style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.hiviz}`, background: T.card, color: T.ink, fontSize: F.sm, cursor: "pointer" }}>
        Take the tour again
      </button>
      <span style={{ fontSize: F.xs, color: T.ink3 }}>The job tour shows again the next time you open a job.</span>
    </div>
  );
}
