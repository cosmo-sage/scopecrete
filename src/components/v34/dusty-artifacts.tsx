"use client";

/**
 * Dusty's Home (Coy, 2026-10-19: "selecting the Dusty Home in the rail should open up dusty chat in
 * the main window with the right panel becoming an artifacts panel"). /dashboard/dusty opens his
 * panel and marks <html data-dusty-main>; on a desktop the CSS then stretches his column across the
 * main window and this page becomes the column on the right — the plans, tables, words for a page,
 * files and links of the chat that is open (src/lib/dusty/artifacts.ts). On a phone his chat covers
 * the screen as always; the grid button in his header shows this page under it.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, agent, clip } from "@/lib/v34/tokens";
import { useDustyChat } from "@/lib/v34/dusty-live";
import { artifactsOf, ARTIFACT_KINDS, type Artifact, type ArtifactKind } from "@/lib/dusty/artifacts";
import { Markdown } from "@/components/v34/markdown";

export function DustyHome() {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-dusty-main", "");
    window.dispatchEvent(new Event("sc:dusty-open"));
    return () => html.removeAttribute("data-dusty-main");
  }, []);
  return <DustyArtifacts />;
}

const ICON: Record<ArtifactKind, string> = { plan: "☰", table: "▦", drawing: "✎", words: "¶", file: "📎", link: "↗" };

function DustyArtifacts() {
  const chat = useDustyChat();
  const all = useMemo(() => artifactsOf(chat.items, { streaming: chat.streaming }), [chat]);
  const [kind, setKind] = useState<"all" | ArtifactKind>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const shown = kind === "all" ? all : all.filter((a) => a.kind === kind);
  const counts = new Map<string, number>();
  for (const a of all) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const toChat = (a: Artifact) => {
    window.dispatchEvent(new Event("sc:dusty-open"));
    setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-turn", { detail: { turn: a.turn } })), 60);
  };

  return (
    <aside className="sc-art-col" aria-label="What Dusty made">
      <div className="sc-art-head">
        <div style={{ ...eyebrow, color: T.ink3 }}>Artifacts</div>
        <div style={{ ...clip, fontFamily: agent, fontSize: F.md, fontWeight: 700, color: T.ink }}>
          {chat.title ?? (chat.items.length ? "This chat" : "A new chat")}
        </div>
        <div className="sc-art-chips" role="tablist" aria-label="Kind">
          {ARTIFACT_KINDS.filter((k) => k.k === "all" || counts.get(k.k)).map((k) => (
            <button key={k.k} type="button" role="tab" aria-selected={kind === k.k} onClick={() => setKind(k.k)} className="sc-art-chip">
              {k.label}{k.k !== "all" && <span style={{ opacity: .6 }}> {counts.get(k.k)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-art-list">
        {shown.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: F.sm, color: T.ink3, lineHeight: 1.5 }}>
            {chat.items.length
              ? "Nothing made in this chat yet. Plans, tables, words for a page, the files you send him and the links he finds land here."
              : "Ask Dusty something. The plans, tables and words he writes, the files you send him and the links he finds land here, one tap from the spot in the chat."}
          </div>
        )}
        {shown.map((a) => {
          const isOpen = openKey === a.key;
          return (
            <div key={a.key} className="sc-art-card" data-open={isOpen ? "" : undefined}>
              <button type="button" className="sc-art-row" onClick={() => setOpenKey(isOpen ? null : a.key)} aria-expanded={isOpen}>
                {a.thumb
                  // eslint-disable-next-line @next/next/no-img-element -- a signed storage link, not a static asset
                  ? <img src={a.thumb} alt="" className="sc-art-thumb" />
                  : <span className="sc-art-ico" data-kind={a.kind} aria-hidden="true">{ICON[a.kind]}</span>}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...clip, display: "block", fontSize: F.sm, fontWeight: 600, color: T.ink }}>{a.title}</span>
                  <span style={{ ...clip, display: "block", fontSize: F.xs, color: T.ink3 }}>{a.sub}</span>
                </span>
              </button>
              {isOpen && (
                <div className="sc-art-body">
                  {a.body && <div style={{ fontFamily: agent, overflowX: "auto" }}><Markdown text={a.body} size={13} /></div>}
                  <div style={{ display: "flex", gap: 14, marginTop: a.body ? 8 : 0 }}>
                    <button type="button" onClick={() => toChat(a)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>
                      {a.kind === "plan" ? "Apply it in the chat ›" : "Show it in the chat ›"}
                    </button>
                    {a.href && (a.href.startsWith("/")
                      ? <Link href={a.href} style={{ ...eyebrow, color: T.hivizText }}>Open ›</Link>
                      : <a href={a.href} target="_blank" rel="noreferrer noopener" style={{ ...eyebrow, color: T.hivizText }}>Open ↗</a>)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="sc-art-back" onClick={() => window.dispatchEvent(new Event("sc:dusty-open"))}>Back to the chat</button>
    </aside>
  );
}
