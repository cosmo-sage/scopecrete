"use client";

/**
 * Settings → Organization (Coy, 2026-10-10): the org's name, its logo and the
 * header-logo switch, the office and its radius, and the people — invites and
 * what each onsite estimator may open. The blocks are OrgSection's
 * (src/components/v34/org-settings.tsx); a rename or a new logo reloads the
 * header through the layout's `reload`.
 */

import React from "react";
import { useMe } from "@/lib/v34/me-ctx";
import { OrgSection } from "@/components/v34/org-settings";
import { SettingsTitle } from "@/components/v34/settings/parts";

export function OrganizationSettings() {
  const { reload } = useMe();
  return (
    <div>
      <SettingsTitle title="Organization" note="Your company as everyone sees it, where it works from, and who is in it." />
      <OrgSection onChanged={reload} />
    </div>
  );
}
