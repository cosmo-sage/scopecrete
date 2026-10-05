// The site's typefaces (landing, sign-in, invite), as CSS variables the
// stacks in marks.tsx read. Put siteFonts on a wrapping element.
import { Barlow_Condensed, Figtree, IBM_Plex_Sans, Inter, Kalam, Lexend } from "next/font/google";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--site-disp" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--site-body" });
const lexend = Lexend({ subsets: ["latin"], weight: ["600", "700"], display: "swap", variable: "--site-lexend" });
const inter = Inter({ subsets: ["latin"], weight: ["300"], display: "swap", variable: "--site-inter" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--site-figtree" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400"], display: "swap", variable: "--site-kalam" });

export const siteFonts = `${barlow.variable} ${plex.variable} ${lexend.variable} ${inter.variable} ${kalam.variable} ${figtree.variable}`;
