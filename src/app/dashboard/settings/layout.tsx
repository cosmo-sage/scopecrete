import type { ReactNode } from "react";
import { SettingsShell } from "@/components/v34/settings/settings-shell";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
