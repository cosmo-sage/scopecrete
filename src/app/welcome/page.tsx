// scopecrete.ai's front page (Coy, 2026-10-04: "a simple page with a place to
// login"). src/proxy.ts serves it at / on scopecrete.ai and www; on any other
// host (previews, vercel.app, localhost) it is here at /welcome, and / stays
// the sign-in page. Log in goes to app.scopecrete.ai/login (DECISIONS §8).
import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Sans, Inter, Kalam, Lexend } from "next/font/google";
import Landing from "@/components/site/landing";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--site-disp" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--site-body" });
const lexend = Lexend({ subsets: ["latin"], weight: ["700"], display: "swap", variable: "--site-lexend" });
const inter = Inter({ subsets: ["latin"], weight: ["300"], display: "swap", variable: "--site-inter" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400"], display: "swap", variable: "--site-kalam" });

export const metadata: Metadata = {
  title: "ScopeCrete — the office manager for concrete contractors",
  description:
    "Calls and texts land in one place. Dusty reads them, sorts the people and opens the job. You price the scope on real concrete math, and the bid never goes under what the job costs to run.",
};

export default function WelcomePage() {
  return (
    <div className={`${barlow.variable} ${plex.variable} ${lexend.variable} ${inter.variable} ${kalam.variable}`}>
      <Landing />
    </div>
  );
}
