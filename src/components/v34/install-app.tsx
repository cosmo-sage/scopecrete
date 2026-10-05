"use client";

/**
 * Settings → Install the app. Chrome offers to install ScopeCrete only on an
 * org's own address on the live site (src/lib/install.ts); its own banner shows
 * when Chrome decides, so this row asks for it on a tap. Shown only when the
 * browser says the app can be installed here and it isn't open as the app.
 */

import React, { useEffect, useState } from "react";
import { T, F } from "@/lib/v34/tokens";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { saved = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { saved = null; listeners.forEach((f) => f()); });
}

export function InstallApp() {
  const [ev, setEv] = useState<InstallEvent | null>(saved);
  useEffect(() => {
    const f = () => setEv(saved);
    listeners.add(f);
    f();
    return () => { listeners.delete(f); };
  }, []);
  if (!ev) return null;
  return (
    <button
      onClick={async () => { await ev.prompt(); await ev.userChoice.catch(() => null); saved = null; setEv(null); }}
      className="text-left py-2.5" style={{ borderBottom: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
      <div style={{ fontSize: F.md, fontWeight: 600 }}>Install the app</div>
      <div style={{ fontSize: F.xs, color: T.ink3 }}>ScopeCrete on your home screen, opening full screen</div>
    </button>
  );
}
