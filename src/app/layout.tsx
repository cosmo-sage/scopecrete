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
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  title: "ScopeCrete — Contractor Dashboard",
  description:
    "Describe your project, get an accurate concrete bid powered by real market data, and a contractor texts you within the hour. No phone calls, no guesswork.",
  keywords: ["concrete estimate", "concrete calculator", "concrete contractor", "Baton Rouge", "Louisiana"],
  icons: {
    icon: ["/favicon.ico", "/favicon.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${caveat.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
