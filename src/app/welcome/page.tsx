// scopecrete.ai's front page (Coy, 2026-10-04: "a simple page with a place to
// login"). src/proxy.ts serves it at / on scopecrete.ai and www; on any other
// host (previews, vercel.app, localhost) it is here at /welcome, and / stays
// the sign-in page. Log in goes to app.scopecrete.ai/login (DECISIONS §8).
import type { Metadata } from "next";
import Landing from "@/components/site/landing";
import { siteFonts } from "@/components/site/fonts";

export const metadata: Metadata = {
  title: "ScopeCrete — the office manager for concrete contractors",
  description:
    "Calls, texts and emails land in one place. Dusty reads them, sorts the people and opens the job. You price the scope on real concrete math.",
};

export default function WelcomePage() {
  return (
    <div className={siteFonts}>
      <Landing />
    </div>
  );
}
