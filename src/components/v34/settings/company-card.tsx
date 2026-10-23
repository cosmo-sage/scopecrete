"use client";

/**
 * The company you're in, top and centre of Settings (Coy, 2026-10-23: "can we make it easier for
 * him to switch? Top and center of the settings page it should show what company he is on and a
 * button to switch"). Someone in two companies or more gets Switch company, which drops down the
 * others; each opens its own address (src/lib/org-switch.ts). Account keeps the full list.
 */

import React, { useState } from "react";
import { T, F, disp } from "@/lib/v34/tokens";
import { useMe } from "@/lib/v34/me-ctx";
import { switchRows, roleLabel } from "@/lib/org-switch";

export function CompanyCard() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  if (!me?.org_name) return null;
  const rows = switchRows(me.orgs ?? [], me.org_id ?? null);
  const others = rows.filter((r) => !r.current);
  return (
    <div className="mx-auto px-3 lg:px-4 pt-3" style={{ maxWidth: 560 }}>
      <div className="rounded-lg px-4 py-3 text-center" style={{ background: T.card, border: `1px solid ${T.hair}` }}>
        <div style={{ fontSize: F.xs, color: T.ink3, letterSpacing: ".06em", textTransform: "uppercase" }}>You&apos;re working in</div>
        <div style={{ fontFamily: disp, fontSize: 22, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>{me.org_name}</div>
        <div style={{ fontSize: F.xs, color: T.ink3 }}>{roleLabel(me.role)}</div>
        {others.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded mt-2 px-4"
            style={{ height: 38, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 14, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
            Switch company {open ? "▴" : "▾"}
          </button>
        )}
        {open && (
          <div className="flex flex-col mt-2 text-left">
            {others.map((o) => {
              const inner = (
                <>
                  <span className="flex-1 min-w-0" style={{ fontSize: F.sm, fontWeight: 600, color: T.ink }}>{o.name}</span>
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>{o.role}</span>
                  <span style={{ width: 18, textAlign: "right", color: T.ink3 }}>{o.href ? "›" : ""}</span>
                </>
              );
              const row: React.CSSProperties = { minHeight: 44, borderTop: `1px solid ${T.hairSoft}`, color: T.ink };
              return o.href
                ? <a key={o.id} href={o.href} className="flex items-center gap-2 no-underline" style={row}>{inner}</a>
                : <div key={o.id} className="flex items-center gap-2" style={row} title="This company has no address yet">{inner}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
