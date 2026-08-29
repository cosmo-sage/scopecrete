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

export const T = {
  slab: "#E9EBEE", card: "#FFFFFF", ink: "#12161A", ink2: "#616B77", ink3: "#8A95A1",
  hair: "#DCE0E5", hairSoft: "#F0F2F4",
  chalk: "#1B5FD9", chalkDim: "#EAF0FC",
  hiviz: "#F2610C", hivizDim: "#FFF1E7",
  green: "#0F8A4F", greenDim: "#E6F5ED",
  violet: "#6B4BD6", violetDim: "#F1EFFB",
  red: "#C0341D", redDim: "#FBECE9",
  dark: "#14181C", darkHair: "#262C33",
  pulse: "#1FA971",
} as const;

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
