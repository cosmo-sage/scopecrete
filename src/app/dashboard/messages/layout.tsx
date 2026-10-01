"use client";

/**
 * Threads, two panes on desktop.
 *
 * The one genuinely net-new piece of work order 17: scopecrete-v34.jsx is
 * mobile-only, so there is nothing to port here. The brief is "list +
 * conversation side by side on desktop", and the reason desktop exists at all
 * per the UI handoff is simultaneity — a desktop screen that would be just as
 * good on a phone has wasted the desktop.
 *
 * The list lives in this LAYOUT, not in page.tsx, so that opening a thread does
 * not unmount it. A list owned by the index route would lose its scroll
 * position and refetch on every row you clicked.
 *
 *   /dashboard/messages        children = the right-pane placeholder
 *   /dashboard/messages/<id>   children = the conversation
 *
 * Below `lg` only one pane shows at a time, which is the existing mobile
 * behaviour and must stay exactly that: the phone is the primary device.
 */

import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { T } from "@/lib/v34/tokens";
import { ThreadList, THREAD_BUCKETS, DESKTOP_DEFAULT_BUCKET } from "@/components/v34/thread-list";
import { SubRail } from "@/components/v34/sub-rail";

/**
 * Desktop (Coy, 2026-10-01): the five buckets as a second icon rail beside the
 * main one — the main rail picks Threads, this one the bucket, Customer first.
 * The list follows ?f=; the phone keeps its row of chips.
 */
function BucketRail() {
  const params = useSearchParams();
  const pathname = usePathname();
  const value = params.get("f") ?? DESKTOP_DEFAULT_BUCKET;
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const on = (e: Event) => setCounts((e as CustomEvent<Record<string, number>>).detail);
    window.addEventListener("sc:thread-counts", on);
    return () => window.removeEventListener("sc:thread-counts", on);
  }, []);
  return (
    <div className="hidden lg:block shrink-0">
      <SubRail label="Buckets" value={value}
        items={THREAD_BUCKETS.map((b) => ({ ...b, count: counts ? counts[b.k] ?? null : null }))}
        // history, not the router: Next keeps useSearchParams in step with it,
        // and the open conversation stays open (see thread-list's search note).
        onChange={(k) => window.history.replaceState(null, "", `${pathname}?f=${k}`)} />
    </div>
  );
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // A conversation is open when the path goes deeper than /dashboard/messages.
  const conversationOpen = /^\/dashboard\/messages\/[^/]+/.test(pathname);

  return (
    <div className={`lg:flex lg:items-stretch ${conversationOpen ? "" : "min-h-[calc(100dvh-var(--sc-head)-var(--sc-foot))]"} lg:h-[calc(100dvh-var(--sc-head))] lg:min-h-0`}>
      <Suspense fallback={null}><BucketRail /></Suspense>
      {/* A fixed rail on desktop: the list is the constant, the conversation is
          what changes, so the list must not resize as threads come and go.

          The width lives on THIS element and as a class, not as an inline
          `width: 100%` on a wrapper. The first version did the latter, and an
          inline width beats every Tailwind class: combined with `lg:shrink-0`
          the list claimed the whole flex row, the conversation pane was handed
          zero width, and it rendered off the right edge. Everything worked and
          nothing was visible — including "Open thread", which navigated
          correctly into a pane nobody could see. */}
      <div
        className={`${conversationOpen ? "hidden lg:block" : "block"} w-full lg:w-[380px] xl:w-[420px] lg:shrink-0 lg:overflow-y-auto`}
        style={{ borderRight: `1px solid ${T.hair}` }}
      >
        {/* ThreadList reads ?q= through useSearchParams, which needs a
            boundary or the whole subtree opts out of static rendering. */}
        <Suspense fallback={
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
            ))}
          </div>
        }>
          <ThreadList />
        </Suspense>
      </div>

      <div className={`${conversationOpen ? "block" : "hidden lg:block"} lg:flex-1 lg:min-w-0 lg:overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
