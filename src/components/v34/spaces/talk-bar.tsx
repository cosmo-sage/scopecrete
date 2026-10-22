"use client";

/**
 * The talk bar — the phone's foot under the Spaces navigation (Claude Design "Dusty
 * Home"; Coy, 2026-10-17: "The phone footer does not stay because dusty icon is in
 * the rail and to the right of the chat box"). It takes the footer's place and
 * height (--sc-foot stays 58px): "+" attaches files to a chat with Dusty, the pill
 * is a question for him about the page open, and his emblem on the right sends it —
 * or, empty, opens him. Pages open from the rail (☰ or a swipe from the left edge).
 * Not drawn on an open thread or email, whose own text box is the foot.
 */

import React, { useState } from "react";
import { T, body } from "@/lib/v34/tokens";
import { DustyAvatar, type EmblemState } from "@/components/v34/dusty-avatar";
import { PAGE } from "@/lib/v34/pages";

/** The pill's words for the page open. */
export function talkPlaceholder(active: string | null, path: string): string {
  if (/^\/dashboard\/scope\/[^/]+/.test(path)) return "Ask about this job…";
  if (/^\/dashboard\/customers\/[^/]+/.test(path)) return "Ask about this customer…";
  if (/^\/dashboard\/vendors\/[^/]+/.test(path)) return "Ask about this vendor…";
  const label = active ? PAGE.get(active)?.label : null;
  return label && active !== "dashboard" ? `Ask about ${label.toLowerCase()}…` : "Ask Dusty…";
}

export function TalkBar({ placeholder, dustyState, onOpen }: { placeholder: string; dustyState: EmblemState; onOpen: () => void }) {
  const [text, setText] = useState("");
  const ask = () => {
    const q = text.trim();
    onOpen();
    if (q) {
      setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: { text: q, send: true } })), 250);
      setText("");
    }
  };
  return (
    <div className="sc-talk-bar fixed bottom-0 left-0 right-0 flex items-center lg:hidden"
      style={{ zIndex: 40, background: T.card, borderTop: `1px solid ${T.hair}`, height: 58,
        padding: "0 10px env(safe-area-inset-bottom)", gap: 8 }}>
      <button type="button" aria-label="Attach files for Dusty"
        onClick={() => { onOpen(); window.dispatchEvent(new Event("sc:dusty-attach")); }}
        className="flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${T.hair}`, background: T.card, color: T.ink2, fontSize: 20, lineHeight: 1 }}>+</button>
      <form className="flex-1 min-w-0" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Ask Dusty"
          enterKeyHint="send"
          style={{ width: "100%", height: 40, borderRadius: 20, border: "none", background: T.slab, color: T.ink,
            padding: "0 14px", fontFamily: body, fontSize: 16, outline: "none" }} />
      </form>
      <button type="button" onClick={ask} aria-label={text.trim() ? "Ask Dusty" : "Open Dusty"}
        className="flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, borderRadius: 20, border: `2px solid ${T.hiviz}`, background: T.card, padding: 0 }}>
        <DustyAvatar state={dustyState} size={30} hidden />
      </button>
    </div>
  );
}
