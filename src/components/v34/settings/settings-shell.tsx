"use client";

/**
 * Settings, a page of its own (Coy, 2026-10-10: "The settings page needs a
 * revamp. It needs its own dedicated full-screen page with sub-pages for
 * different categories of settings"). Was a sheet under the header's ☰.
 *
 * Desktop: the sections down a column on the left, the open one on the right
 * (Account when none is picked). Phone: /dashboard/settings is the list of
 * sections; each opens its own page with ‹ Settings back to it.
 * The sections are src/lib/v34/settings-sections.ts; an onsite estimator
 * sees Account and Appearance only (redirectFor, src/lib/access.ts).
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, F, disp } from "@/lib/v34/tokens";
import { PageHeader } from "@/components/v34/primitives";
import { useAccess } from "@/lib/v34/access-ctx";
import { CompanyCard } from "@/components/v34/settings/company-card";
import { SETTINGS_HOME, settingsSections, settingsSectionOf } from "@/lib/v34/settings-sections";

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? SETTINGS_HOME;
  const access = useAccess();
  const sections = settingsSections(access.limited);
  const at = settingsSectionOf(pathname) ?? "";
  const home = at === "";

  return (
    <div style={{ color: T.ink }}>
      <PageHeader title="Settings" sub="Your account, your organization, lines, appearance, Dusty and the menus." />
      <CompanyCard />
      <div className="flex gap-5 items-start mx-auto px-3 lg:px-4 pb-8" style={{ maxWidth: 1180 }}>
        <nav aria-label="Settings" className={`${home ? "flex" : "hidden lg:flex"} flex-col w-full lg:w-[240px] shrink-0 lg:sticky sc-set-nav`}
          style={{ top: "calc(var(--sc-head) + var(--sc-subhead, 0px) + 4px)" }}>
          {sections.map((s) => {
            const on = at === s.k;
            return (
              <Link key={s.k} href={s.href} aria-current={on ? "page" : undefined}
                data-desk-current={home && s.k === "account" ? "" : undefined}
                className="sc-set-link flex items-center gap-2 no-underline">
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ fontFamily: disp, fontSize: 15, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.ink }}>{s.label}</span>
                  <span className="block" style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.35 }}>{s.note}</span>
                </span>
                <span aria-hidden="true" className="lg:hidden" style={{ color: T.ink3, fontSize: 18 }}>›</span>
              </Link>
            );
          })}
        </nav>
        <div className={`${home ? "hidden lg:block" : "block"} flex-1 min-w-0`}>
          {!home && (
            <Link href={SETTINGS_HOME} className="lg:hidden inline-flex items-center no-underline"
              style={{ fontFamily: disp, fontSize: 14, fontWeight: 600, letterSpacing: ".04em", color: T.chalk, height: 32, marginBottom: 4 }}>
              ‹ Settings
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
