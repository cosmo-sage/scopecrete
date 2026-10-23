"use client";

/**
 * A one-time note from Dusty, left on someone's account (`dusty_note` in
 * /api/prefs) — "your new job is on the rail, its plans are in Takeoffs".
 * Shown once when they next open the app; Got it, a link or × clears it.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePref, usePrefsReady } from "@/lib/v34/prefs";
import { T, body } from "@/lib/v34/tokens";
import { DustyAvatar } from "@/components/v34/dusty-avatar";

export type DustyNote = { text: string; links?: { label: string; href: string }[] };

export function readNote(v: unknown): DustyNote | null {
  if (!v || typeof v !== "object") return null;
  const n = v as Record<string, unknown>;
  if (typeof n.text !== "string" || !n.text.trim()) return null;
  const links = Array.isArray(n.links)
    ? n.links.filter((l): l is { label: string; href: string } => !!l && typeof l.label === "string" && typeof l.href === "string" && l.href.startsWith("/dashboard"))
    : [];
  return { text: n.text.slice(0, 600), links: links.slice(0, 3) };
}

export function DustyNoteHost({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const ready = usePrefsReady();
  const [saved, setSaved] = usePref<unknown>("dusty_note", null);
  const [show, setShow] = useState(false);
  const note = readNote(saved);
  useEffect(() => {
    if (!enabled || !ready || !note) return;
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [enabled, ready, !!note]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show || !note) return null;
  const done = () => { setShow(false); setSaved(null); };
  return (
    <div role="dialog" aria-label="A note from Dusty" style={{ position: "fixed", right: 16, left: 16, bottom: "calc(var(--sc-foot, 0px) + 16px)", zIndex: 90, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", maxWidth: 380, width: "100%", background: T.card, color: T.ink, border: `1px solid ${T.hair}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.18)", padding: 14, fontFamily: body }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <DustyAvatar size={34} />
          <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>{note.text}</div>
          <button onClick={done} aria-label="Close" style={{ background: "none", border: 0, color: T.ink3, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          {note.links?.map((l) => (
            <button key={l.href} onClick={() => { done(); router.push(l.href); }} style={{ background: T.hiviz, color: T.onHiviz, border: 0, borderRadius: 8, padding: "8px 12px", fontWeight: 600, cursor: "pointer" }}>{l.label}</button>
          ))}
          <button onClick={done} style={{ background: "none", border: `1px solid ${T.hair}`, color: T.ink, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Got it</button>
        </div>
      </div>
    </div>
  );
}
