/**
 * v34 design tokens.
 *
 * Ported verbatim from scopecrete-v34.jsx. These are the half of that file's
 * constants that SHOULD survive the port — colour, type scale, date labels and
 * number formatting. The data mocks (THREADS, JOBS, PEOPLE, DRIFT, TODAY …) are
 * deliberately not here and must never be.
 *
 * Layout in v34 is Tailwind utility classes; colour and type are these inline
 * tokens. Both are needed — a component stripped of its className loses its
 * layout.
 */

/**
 * Colour tokens read the theme (Settings → Appearance; src/lib/v34/themes.ts,
 * variables in v34-shell.css): Site Office (default), Blueprint, Kraft Yard,
 * Night Shift. Every `T.x` is a CSS variable, so every screen follows the
 * chosen theme with no branching. The *Dim fills the themes don't name are
 * mixed from their colour and the card. `dark` / `darkHair` stay fixed: the
 * job page's money strip and takeoff rail are dark with white text in every
 * theme. Where JS must do maths on a colour, use THEMES[..] hex values.
 */
const v = (name: string) => `var(--sc-${name})`;
const dim = (name: string) => `color-mix(in srgb, var(--sc-${name}) 14%, var(--sc-card))`;
export const T = {
  // ground + surfaces
  slab: v("slab"), card: v("card"), sunk: v("sunk"), ink: v("ink"), ink2: v("ink2"), ink3: v("ink3"),
  hair: v("hair"), hairSoft: v("hair-soft"), hairStrong: v("hair-strong"),
  // roles
  chalk: v("chalk"), chalkDim: v("chalk-dim"),          // links, info
  hiviz: v("hiviz"), hivizDim: v("hiviz-dim"),          // primary action, badges
  onHiviz: v("on-hiviz"),                               // text on the accent (dark in Night Shift)
  hivizSoft: v("hiviz-soft"), hivizText: v("hiviz-text"),
  green: v("green"), greenDim: dim("green"),
  violet: v("violet"), violetDim: dim("violet"),
  red: v("red"), redDim: dim("red"),
  teal: v("teal"),
  // dark panels (job money strip, takeoff rail) — white text on these, every theme
  dark: "#2A2A2A", darkHair: "#3D3A34",
  pulse: v("green"),
  rail: v("rail"), railInk: v("rail-ink"), railActive: v("rail-active"), railInkOn: v("rail-ink-on"),
  sun: "#6B4E12", sunDim: "#F7EBC9",
  dustyTint: v("dusty-tint"), dustyText: v("dusty-text"), dustyEdge: v("dusty-edge"),
  outBg: v("out-bg"), outInk: v("out-ink"),
  paper: v("paper"), paperGrid: v("paper-grid"),
  pencil: v("pencil"), pencilMuted: v("pencil-muted"), pencilLine: v("pencil-line"),
  logoOrange: v("crete"),  // "crete" in the wordmark ONLY
} as const;

/** The "logo orange" alternate accent — swap these keys into T to pull the UI toward the wordmark's orange. */
export const LOGO_ACCENT = {
  hiviz: "#C24E0C", hivizDim: "#FBE3D3", hivizSoft: "#D9550A", hivizText: "#9A3F08", dustyTint: "#FDEEE4",
} as const;

/** Bucket colours — unchanged mapping, new values. */
export const BUCKET = { unsorted: v("bucket-unsorted"), customer: v("bucket-customer"), vendor: v("bucket-vendor"), personal: v("bucket-personal"), spam: v("bucket-spam") } as const;

/* ---- money palette ----
   Softer than the UI tokens: teal for cash already in, indigo for
   committed, sand for projected, clay for what goes out. Clay is
   deliberately still a warning colour — a week that lost money should
   not look like a prize. Nothing here is brighter than the truth. */
export const M = {
  inDark: "#0E6F63", inLight: "#2FA795",
  comDark: "#3A55C9", comLight: "#6D86EE",
  projDark: "#C08A2E", projLight: "#EDC66A",
  outDark: "#B14A34", outLight: "#E08469",
  line: "#12B886", lineSoft: "rgba(18,184,134,.16)",
  grid: "#EDEFF2", axis: "#C9CFD6",
} as const;

export const F = { xxl: 34, xl: 26, lg: 19, md: 15, sm: 13, xs: 11, micro: 9.5 } as const;

export const disp = "'Barlow Condensed', system-ui, sans-serif";
export const body = "'IBM Plex Sans', system-ui, sans-serif";
/** Names, numbers, counts, tile values (600/700). */
export const strong = "'Lexend', system-ui, sans-serif";
/** Panel titles (300). */
export const light = "'Inter', system-ui, sans-serif";
/** Dusty's voice — the activity line, his cards, chat titles. */
export const hand = "'Kalam', cursive";

export const eyebrow: React.CSSProperties = {
  fontFamily: disp, fontSize: F.micro, letterSpacing: ".14em",
  textTransform: "uppercase", color: T.ink3, lineHeight: 1.3,
};
export const nums: React.CSSProperties = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
export const clip: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOWL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const money0 = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-US");

export const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const moneyK = (n: number) => {
  const v = Math.abs(Number(n) || 0), s = n < 0 ? "-" : "";
  return v >= 1000 ? s + "$" + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : s + "$" + Math.round(v);
};

export interface StatusStyle { label: string; bg: string; fg: string }

export const STATUS: Record<string, StatusStyle> = {
  new: { label: "New", bg: T.chalkDim, fg: T.chalk },
  contacted: { label: "Contacted", bg: T.violetDim, fg: T.violet },
  qualified: { label: "Qualified", bg: "#FDF6E3", fg: "#8A6100" },
  quoted: { label: "Quoted", bg: T.hivizDim, fg: "#C24A00" },
  won: { label: "Won", bg: T.greenDim, fg: T.green },
  progress: { label: "Pouring", bg: "#E6F5ED", fg: "#0E6F63" },
  lost: { label: "Lost", bg: "#EFF1F3", fg: T.ink2 },
};

/**
 * Real relative time, from a real timestamp.
 *
 * v34 computed every "3 days ago" from `TODAY = "2026-08-13"`, a hardcoded
 * anchor, which made every timestamp in the file a fiction that looked
 * completely ordinary. This takes an actual ISO string off a row and returns
 * null when there isn't one — a caller with no timestamp renders nothing
 * rather than something plausible.
 */
export function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}

/** US-style display for an E.164 number. Never invents a name. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/[^\d]/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
