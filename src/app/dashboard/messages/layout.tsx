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

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // A conversation is open when the path goes deeper than /dashboard/messages.
  const conversationOpen = /^\/dashboard\/messages\/[^/]+/.test(pathname);

  return (
    <div className="lg:flex lg:items-stretch" style={{ minHeight: "calc(100vh - 54px - 58px)" }}>
      <div
        className={`${conversationOpen ? "hidden lg:block" : "block"} lg:shrink-0 lg:overflow-y-auto`}
        style={{
          borderRight: `1px solid ${T.hair}`,
          // A fixed rail on desktop: the list is a constant, the conversation
          // is what changes, so the list must not resize as threads come and go.
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <div className="lg:w-[380px] xl:w-[420px]">
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
      </div>

      <div className={`${conversationOpen ? "block" : "hidden lg:block"} lg:flex-1 lg:min-w-0 lg:overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
