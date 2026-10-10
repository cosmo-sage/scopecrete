"use client";

/**
 * Settings → Account: you (name and phone — they go on the proposals you
 * prepare — email, organization and role), Switch company for someone in two
 * orgs or more (Coy, 2026-10-09), Install the app, and Sign out.
 */

import React from "react";
import { T, F, disp } from "@/lib/v34/tokens";
import { useMe } from "@/lib/v34/me-ctx";
import { YouSection } from "@/components/v34/org-settings";
import { InstallApp } from "@/components/v34/install-app";
import { switchRows } from "@/lib/org-switch";
import { SettingsBlock, SettingsTitle } from "@/components/v34/settings/parts";

export function AccountSettings() {
  const { me, reload } = useMe();
  return (
    <div>
      <SettingsTitle title="Account" note="Who you are here, the companies you work in, and signing out." />
      <SettingsBlock title="You" note="Your name and phone go on the proposals you prepare.">
        {me
          ? <YouSection key={`${me.name ?? ""}|${me.phone ?? ""}`} name={me.name} phone={me.phone ?? null} email={me.email} orgName={me.org_name} role={me.role} onSaved={reload} />
          : <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading your account…</div>}
      </SettingsBlock>

      {/* The org switcher (Coy, 2026-10-09) — only for someone in two orgs or more.
          Each org is its own address; one sign-in covers them all. */}
      {(me?.orgs?.length ?? 0) > 1 && (
        <SettingsBlock title="Switch company" note="Every company you work in. Each opens its own dashboard.">
          <div className="flex flex-col">
            {switchRows(me?.orgs ?? [], me?.org_id ?? null).map((o) => {
              const inner = (
                <>
                  <span className="flex-1 min-w-0" style={{ fontSize: F.sm, fontWeight: o.current ? 700 : 500, color: T.ink }}>{o.name}</span>
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>{o.role}</span>
                  <span style={{ width: 18, textAlign: "right", color: o.current ? T.green : T.ink3 }}>{o.current ? "✓" : o.href ? "›" : ""}</span>
                </>
              );
              const row: React.CSSProperties = { minHeight: 36, borderBottom: `1px solid ${T.hairSoft}`, color: T.ink };
              return o.current || !o.href
                ? <div key={o.id} className="flex items-center gap-2" style={row} title={o.href ? undefined : "This company has no address yet"}>{inner}</div>
                : <a key={o.id} href={o.href} className="flex items-center gap-2 no-underline" style={row}>{inner}</a>;
            })}
          </div>
        </SettingsBlock>
      )}

      <div className="flex flex-col">
        <InstallApp />
      </div>

      <button onClick={() => { void import("@/lib/auth").then((m) => m.signOut()); }} className="w-full rounded mt-3"
        style={{ height: 44, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontFamily: disp, fontSize: F.md, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
        Sign out
      </button>
    </div>
  );
}
