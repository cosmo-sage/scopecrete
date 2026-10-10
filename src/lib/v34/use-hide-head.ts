"use client";
import { useEffect } from "react";

/**
 * On a phone, the dashboard header slides away while the page scrolls down and
 * comes back on the way up (Coy, 2026-10-05, on the job page: "let the main
 * dashboard header disappear under the job page header so the job page can be
 * full screen"). It sets html[data-head-hide]; v34-shell.css moves the header
 * and makes --sc-head 0 so the page's own sticky rows ride up to the top.
 * Since 2026-10-06 on every page (Coy: "this page and any other page that I
 * have opened"), from the dashboard layout; `resetKey` (the path) brings the
 * header back on every page change. Since 2026-10-10 (Coy: "consistent on
 * every single page") a page that scrolls in its own box (the contact card,
 * a thread) slides it away too, and a record page's own sticky header rides
 * up to the top instead of keeping ours.
 */
export function useHideHeadOnScroll(resetKey?: string): void {
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 1023px)");
    const root = document.documentElement;
    // The last position of each scroller: the window, or a page that scrolls
    // inside its own box (the contact card, a thread — .sc-pinned).
    const lastOf = new WeakMap<object, number>();
    let hidden = false;
    let settle = 0;
    const set = (h: boolean) => {
      if (h === hidden) return;
      hidden = h;
      // Moving the header resizes what measures from --sc-head, and the
      // browser's own scroll correction would read as Coy scrolling; let the
      // page settle before a scroll counts again.
      settle = performance.now() + 350;
      if (h) root.setAttribute("data-head-hide", "");
      else root.removeAttribute("data-head-hide");
    };
    const onScroll = (e: Event) => {
      const t = e.target;
      let key: object, y: number, room: number;
      if (t === document || t === document.documentElement || t === document.body) {
        key = window; y = window.scrollY;
        room = document.documentElement.scrollHeight - window.innerHeight;
      } else if (t instanceof HTMLElement) {
        // Only a scroller that is the page itself (most of the screen tall),
        // never a list in a drawer, a picker or a sideways strip.
        if (t.clientHeight < window.innerHeight * 0.5 || t.closest("[role=dialog], .sc-slide-panel, .sc-dusty-sheet")) return;
        key = t; y = t.scrollTop; room = t.scrollHeight - t.clientHeight;
      } else return;
      const last = lastOf.get(key) ?? y;
      const dy = y - last;
      // A page with little to scroll keeps its header: hiding it there made
      // the page jump back and forth (Coy, 2026-10-06, a customer's Files tab).
      if (!phone.matches || y < 40 || room < 240) set(false);
      else if (performance.now() < settle) { lastOf.set(key, y); return; }
      else if (dy > 6) set(true);
      else if (dy < -10) set(false);
      if (Math.abs(dy) > 6 || y < 40) lastOf.set(key, y);
    };
    // Capture: scroll events don't bubble, so an inner scroller is heard here too.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => { document.removeEventListener("scroll", onScroll, { capture: true }); root.removeAttribute("data-head-hide"); };
  }, [resetKey]);
}
