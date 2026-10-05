// The site's typefaces (landing, sign-in, invite), as CSS variables the
// stacks in marks.tsx read. Put siteFonts on a wrapping element.
// Self-hosted from src/fonts (latin, from Google Fonts): nothing is
// downloaded at build time, so a font fetch can't fail a deploy.
import localFont from "next/font/local";

const barlow = localFont({
  src: [
    { path: "../../fonts/barlow-condensed-500.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/barlow-condensed-600.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/barlow-condensed-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap", variable: "--site-disp",
});
const plex = localFont({ src: "../../fonts/ibm-plex-sans-100-700.woff2", weight: "100 700", display: "swap", variable: "--site-body" });
const lexend = localFont({ src: "../../fonts/lexend-100-900.woff2", weight: "100 900", display: "swap", variable: "--site-lexend" });
const inter = localFont({ src: "../../fonts/inter-100-900.woff2", weight: "100 900", display: "swap", variable: "--site-inter" });
const figtree = localFont({ src: "../../fonts/figtree-300-900.woff2", weight: "300 900", display: "swap", variable: "--site-figtree" });
const kalam = localFont({ src: "../../fonts/kalam-400.woff2", weight: "400", display: "swap", variable: "--site-kalam" });

export const siteFonts = `${barlow.variable} ${plex.variable} ${lexend.variable} ${inter.variable} ${kalam.variable} ${figtree.variable}`;
