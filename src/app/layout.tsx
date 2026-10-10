import type { Metadata, Viewport } from "next";
// Fonts are self-hosted from src/fonts (latin, from Google Fonts) so a build
// never downloads them — a failed fetch once failed a production deploy.
import localFont from "next/font/local";
import "./globals.css";

const outfit = localFont({
  src: "../fonts/outfit-100-900.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-100-800.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

// Dusty's voice — his chat and his thoughts in the header (Coy, 2026-10-05).
const figtree = localFont({
  src: "../fonts/figtree-300-900.woff2",
  weight: "300 900",
  variable: "--font-agent",
  display: "swap",
});

// The wordmark's face (Claude Design wordmark 2c, 2026-10-10) — on <html>
// so the site, sign-in and every dashboard read --site-manrope.
const manrope = localFont({
  src: "../fonts/manrope-200-800.woff2",
  weight: "200 800",
  variable: "--site-manrope",
  display: "swap",
});

const caveat = localFont({
  src: "../fonts/caveat-400-700.woff2",
  weight: "400 700",
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
      { url: "/favicon.ico?v=4e", sizes: "any" },
      { url: "/favicon.svg?v=4e", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png?v=4e",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${figtree.variable} ${caveat.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* The colour theme (Settings → Appearance) before first paint, so a
            dark theme never flashes cream. Saved per device by useTheme(). */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('sc-theme')||'site-office'}catch(e){}" }} />
        {/* Dusty's thought line switched off (Settings → Dusty (AI)): the header is
            one row from the first paint, so nothing jumps as the app loads. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var p=JSON.parse(localStorage.getItem('sc:prefs')||'{}');if((p.activity_line_phone===undefined?p.activity_line:p.activity_line_phone)===false)document.documentElement.dataset.activityPhone='off'}catch(e){}" }} />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
