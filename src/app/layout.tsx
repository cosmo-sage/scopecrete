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
    // Dusty, the Scopecrete Lander (2026-10-04) — his still drawing.
    icon: [
      { url: "/dusty/lander/dusty-static-24.svg", type: "image/svg+xml" },
      { url: "/dusty/lander/dusty-static-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/dusty/lander/dusty-static-512.png",
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
