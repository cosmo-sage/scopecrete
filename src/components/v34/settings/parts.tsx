"use client";

/**
 * The pieces every Settings sub-page is built from (2026-10-10): the page's
 * title and line, a block (a white card with a title, a line and an action on
 * the right), and the on/off switch the settings use.
 */

import React from "react";
import { T, F, disp } from "@/lib/v34/tokens";

export function SettingsTitle({ title, note, actions }: { title: string; note?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 flex-wrap" style={{ marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h2 style={{ fontFamily: disp, fontSize: 22, fontWeight: 600, lineHeight: 1.1, margin: 0, color: T.ink }}>{title}</h2>
        {note && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{note}</div>}
      </div>
      {actions}
    </div>
  );
}

export function SettingsBlock({ id, title, note, action, children }: {
  id?: string; title: React.ReactNode; note?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "12px 14px", marginBottom: 12, scrollMarginTop: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 8px)" }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: "var(--sc-font-strong)", fontWeight: 600, fontSize: F.md, color: T.ink }}>{title}</div>
          {note && <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2, lineHeight: 1.45 }}>{note}</div>}
        </div>
        {action}
      </div>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 38, height: 22, borderRadius: 999, background: on ? T.green : T.hairStrong, position: "relative", cursor: "pointer", flex: "0 0 auto" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}
