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
 * header back on every page change.
 */
export function useHideHeadOnScroll(resetKey?: string): void {
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 1023px)");
    const root = document.documentElement;
    let last = window.scrollY;
    let hidden = false;
    const set = (h: boolean) => {
      if (h === hidden) return;
      hidden = h;
      if (h) root.setAttribute("data-head-hide", "");
      else root.removeAttribute("data-head-hide");
    };
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - last;
      if (!phone.matches || y < 40) set(false);
      else if (dy > 6) set(true);
      else if (dy < -10) set(false);
      if (Math.abs(dy) > 6 || y < 40) last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); root.removeAttribute("data-head-hide"); };
  }, [resetKey]);
}
