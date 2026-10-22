"use client";
/**
 * Who is signed in (/api/session/me), read once by the dashboard layout and
 * shared with the Settings pages, so a name or logo changed there reloads the
 * header too (`reload`). Null until known.
 */
import { createContext, useContext } from "react";
import type { Access } from "@/lib/access";
import type { SwitchOrg } from "@/lib/org-switch";

export interface Me {
  email: string | null; name: string | null; phone?: string | null; org_name: string | null; role: string | null; line: string | null;
  logo_light?: boolean; logo_dark?: boolean; logo_stamp?: string | null;
  access?: Access;
  /** Runs ScopeCrete itself (084's platform_admins) — sees the admin. */
  admin?: boolean;
  /** Every org they belong to — the switcher (src/lib/org-switch.ts). */
  orgs?: SwitchOrg[];
  org_id?: string | null;
  /** An owner viewing as a teammate (src/lib/view-as.ts) — role and access above are theirs. */
  viewing_as?: { user_id: string; name: string | null; role: string | null } | null;
  /** A ScopeCrete admin viewing another company read only (migration 121). */
  viewing_company?: { org_id: string; name: string | null; expires_at: string | null } | null;
}

export const MeContext = createContext<{ me: Me | null; reload: () => void }>({ me: null, reload: () => {} });
export const useMe = () => useContext(MeContext);
