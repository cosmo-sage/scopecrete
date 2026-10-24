import localFont from "next/font/local";

/**
 * The thread's reading fonts, self-hosted (Coy, 2026-10-24: "Round and Plex don't seem to be
 * anything. Can I have 4 fonts that are different and that work?"). They were named from the
 * Google Fonts @import in v34-shell.css, which loads Lexend only at 600–700 and never reached his
 * phone reliably; Plex is the app's own text, so picking it changed nothing. Loaded here, not
 * preloaded, so they download only when a thread asks for one.
 */
const plex = localFont({ src: "../../fonts/ibm-plex-sans-100-700.woff2", weight: "100 700", display: "swap", preload: false, variable: "--rf-plex" });
const clear = localFont({
  src: [{ path: "../../fonts/atkinson-hyperlegible-400.woff2", weight: "400" }, { path: "../../fonts/atkinson-hyperlegible-700.woff2", weight: "700" }],
  display: "swap", preload: false, variable: "--rf-clear",
});
const serif = localFont({ src: "../../fonts/source-serif-4-400-700.woff2", weight: "400 700", display: "swap", preload: false, variable: "--rf-serif" });
const mono = localFont({ src: "../../fonts/jetbrains-mono-100-800.woff2", weight: "100 800", display: "swap", preload: false, variable: "--rf-mono" });

/** Put on the thread's box so `var(--rf-…)` in READ_FONTS resolves. */
export const READ_FONT_VARS = [plex.variable, clear.variable, serif.variable, mono.variable].join(" ");
