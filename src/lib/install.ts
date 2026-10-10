// Installing ScopeCrete as an app (Coy, 2026-10-05: "prompts me to install it
// from the master branch and it doesn't prompt me to install it on any
// sandbox branches"). Only an org's own address on the production build —
// <slug>.app.scopecrete.ai — serves the manifest; previews, the feedback
// sandbox, the landing page, app.scopecrete.ai and localhost answer 404, so
// Chrome never offers to install them.
import { hostKind } from "./hosts.ts";

export function installable(host: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" && hostKind(host).kind === "org";
}

export const APP_MANIFEST = {
  id: "/dashboard",
  name: "ScopeCrete",
  short_name: "ScopeCrete",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  theme_color: "#FAF8F3",
  background_color: "#FAF8F3",
  icons: [
    { src: "/icon-192.png?v=4e", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png?v=4e", sizes: "512x512", type: "image/png" },
  ],
} as const;
