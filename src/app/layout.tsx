import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono, Caveat } from "next/font/google";
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
  icons: {
    // Dusty, the pixel foreman (2026-09-30) — the old diamond emblem is gone.
    icon: [
      { url: "/dusty/dusty_v1_at_16px.png", sizes: "24x24", type: "image/png" },
      { url: "/dusty/dusty_v1_at_48px.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/dusty/dusty_v1_at_128px.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        {/* The colour theme (Settings → Appearance) before first paint, so a
            dark theme never flashes cream. Saved per device by useTheme(). */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('sc-theme')||'site-office'}catch(e){}" }} />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
