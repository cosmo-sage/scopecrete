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

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { T } from "@/lib/v34/tokens";
import { ThreadList } from "@/components/v34/thread-list";
import { ThreadsProvider, useThreads } from "@/components/v34/threads-ctx";
import { ThreadRail, ThreadDrawer, NewThreadSheet } from "@/components/v34/thread-rail";

/**
 * Threads v2 (Claude Design handoff, 2026-10-03): level 1 is the threads —
 * the five role buckets and the ones Coy makes — as a rail on a desktop and a
 * drawer on a phone; level 2 the contacts in the picked thread; level 3 the
 * open contact. Opening a contact folds the list to initials (56px) so the
 * conversation gets the room; › brings it back, and picking another thread
 * un-folds it.
 */
const DRAWER_LISTED = new Set(["all", "customers", "vendors", "personal", "unsorted"]);

function Panes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ctx = useThreads();
  // A conversation is open when the path goes deeper than /dashboard/messages.
  const conversationOpen = /^\/dashboard\/messages\/[^/]+/.test(pathname);
  const folded = conversationOpen && !!ctx?.folded;
  // In the Spaces navigation the drawer lists these threads' people (Coy, 2026-10-17: "there
  // is no more page list of channels … they are now listed in the drawer"), so with nobody
  // open the page shows none; spam, the archive and the threads Coy made keep their list.
  const inDrawer = !conversationOpen && DRAWER_LISTED.has(ctx?.thread ?? "all");
  return (
    <div className={`lg:flex lg:items-stretch ${conversationOpen ? "" : "min-h-[calc(100dvh-var(--sc-head)-var(--sc-foot))]"} lg:h-[calc(100dvh-var(--sc-head))] lg:min-h-0`}>
      <ThreadRail />
      {/* The width lives on THIS element and as a class, never an inline
          width: an inline width beats every Tailwind class, and once handed the
          whole row it left the conversation zero width (2026-09-27). */}
      <div
        className={`${conversationOpen ? "sc-old-thread-list hidden lg:block" : "block"}${inDrawer ? " sc-drawer-listed" : ""} w-full ${folded ? "lg:w-[56px]" : "lg:w-[380px] xl:w-[420px]"} lg:shrink-0 lg:overflow-y-auto`}
        style={{ borderRight: `1px solid ${T.hair}`, background: T.card }}
      >
        <ThreadList folded={folded} />
      </div>
      <div className={`${conversationOpen ? "block" : "hidden lg:block"}${inDrawer ? " sc-drawer-pane" : ""} lg:flex-1 lg:min-w-0 lg:overflow-y-auto`}>
        {children}
      </div>
      <ThreadDrawer />
      <NewThreadSheet />
    </div>
  );
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded animate-pulse" style={{ height: 52, background: T.hairSoft }} />
        ))}
      </div>
    }>
      <ThreadsProvider><Panes>{children}</Panes></ThreadsProvider>
    </Suspense>
  );
}
