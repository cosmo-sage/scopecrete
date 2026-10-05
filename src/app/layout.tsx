import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono, Caveat, Figtree } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Dusty's voice — his chat and his thoughts in the header (Coy, 2026-10-05).
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-agent",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-handwritten",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FAF8F3",
};

export const metadata: Metadata = {
  title: "ScopeCrete — Contractor Dashboard",
  description:
    "Describe your project, get an accurate concrete bid powered by real market data, and a contractor texts you within the hour. No phone calls, no guesswork.",
  keywords: ["concrete estimate", "concrete calculator", "concrete contractor", "Baton Rouge", "Louisiana"],
  // The ScopeCrete emblem (Coy's emblem pack, 2026-10-05) on every page —
  // the landing page, sign-in and every org's dashboard. Still, since browser
  // tabs don't play animated icons reliably.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${figtree.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        {/* The colour theme (Settings → Appearance) before first paint, so a
            dark theme never flashes cream. Saved per device by useTheme(). */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('sc-theme')||'site-office'}catch(e){}" }} />
        {/* Dusty's thought line switched off (Settings → Dusty (AI)): the header is
            one row from the first paint, so nothing jumps as the app loads. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(JSON.parse(localStorage.getItem('sc:prefs')||'{}').activity_line===false)document.documentElement.dataset.activity='off'}catch(e){}" }} />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
