/**
 * ScopeCrete themes — for a colour selector in Settings.
 * Every theme has the SAME keys as `T` in src/lib/v34/tokens.ts (plus the new
 * ones from the palette handoff), so components never branch on theme — they
 * read CSS variables (themes.css) or `useTheme()`.
 *
 * 1a Site Office · 2a Blueprint · 2b Kraft Yard · 2c Night Shift (dark)
 * Design ref: Dusty Dashboard 1a Draft v3.dc.html, Dusty Palette Options v2.dc.html
 */

export type ThemeKey = "site-office" | "blueprint" | "kraft-yard" | "night-shift";

export interface Theme {
  key: ThemeKey; label: string; note: string; dark: boolean;
  slab: string; card: string; sunk: string;
  ink: string; ink2: string; ink3: string;
  hair: string; hairSoft: string; hairStrong: string;
  hiviz: string; onHiviz: string; hivizDim: string; hivizSoft: string; hivizText: string;
  chalk: string; chalkDim: string;
  green: string; violet: string; red: string; teal: string;
  bucket: { unsorted: string; customer: string; vendor: string; personal: string; spam: string };
  outBg: string; outInk: string;
  dustyTint: string; dustyText: string; dustyEdge: string;
  rail: string; railActive: string; railInk: string; railInkOn: string;
  paper: string; paperGrid: string; pencil: string; pencilMuted: string; pencilLine: string; paperBtn: string;
  hatch: string; hatchEdge: string; guide: string; crete: string;
  workDot: { read: string; reply: string; done: string; warn: string; idle: string };
}

export const THEMES: Record<ThemeKey, Theme> = {
  "site-office": {
    key: "site-office", label: "Site Office", note: "Cream and terracotta — the default", dark: false,
    slab: "#FBF6EC", card: "#FFFFFF", sunk: "#F3ECDD",
    ink: "#2A2A2A", ink2: "#5E5A52", ink3: "#8C8578",
    hair: "#E6DCC8", hairSoft: "#F1E9DA", hairStrong: "#D9CDB6",
    hiviz: "#B85A3C", onHiviz: "#FFFFFF", hivizDim: "#F6E2D8", hivizSoft: "#D97757", hivizText: "#9A4527",
    chalk: "#1E5AA8", chalkDim: "#DCE6F4",
    green: "#2F8A5B", violet: "#6A55B0", red: "#B5412C", teal: "#0F7C86",
    bucket: { unsorted: "#D97757", customer: "#2F8A5B", vendor: "#1E5AA8", personal: "#6A55B0", spam: "#B5412C" },
    outBg: "#F6E2D8", outInk: "#2A2A2A",
    dustyTint: "#FBEDE6", dustyText: "#9A4527", dustyEdge: "#D97757",
    rail: "#F3ECDD", railActive: "#FFFFFF", railInk: "#6E685D", railInkOn: "#2A2A2A",
    paper: "#FAF8F3", paperGrid: "rgba(89,128,166,.08)", pencil: "#3A3E43", pencilMuted: "#5A5F66", pencilLine: "rgba(58,62,68,.30)", paperBtn: "rgba(255,255,255,.55)",
    hatch: "rgba(52,56,61,.95)", hatchEdge: "rgba(52,56,61,.7)", guide: "rgba(58,62,68,.35)", crete: "#D9550A",
    workDot: { read: "#3F74C9", reply: "#C98A12", done: "#2F8A5B", warn: "#B5412C", idle: "#B3AA9A" },
  },
  blueprint: {
    key: "blueprint", label: "Blueprint", note: "Cool vellum, steel-blue ink", dark: false,
    slab: "#F2F4F3", card: "#FFFFFF", sunk: "#E6EBEC",
    ink: "#1F2A33", ink2: "#51606B", ink3: "#7A8791",
    hair: "#D6DDE0", hairSoft: "#E8EDEF", hairStrong: "#C3CDD2",
    hiviz: "#2E5E8C", onHiviz: "#FFFFFF", hivizDim: "#E1EAF3", hivizSoft: "#5980A6", hivizText: "#234A70",
    chalk: "#2E5E8C", chalkDim: "#E1EAF3",
    green: "#2F8A5B", violet: "#7A5AA8", red: "#B5412C", teal: "#0F7C86",
    bucket: { unsorted: "#2E5E8C", customer: "#2F8A5B", vendor: "#0F7C86", personal: "#7A5AA8", spam: "#B5412C" },
    outBg: "#E1EAF3", outInk: "#1F2A33",
    dustyTint: "#FBEDE3", dustyText: "#9A4527", dustyEdge: "#D97757",
    rail: "#E6EBEC", railActive: "#FFFFFF", railInk: "#5A6772", railInkOn: "#1F2A33",
    paper: "#F7F9F9", paperGrid: "rgba(89,128,166,.13)", pencil: "#2F3B46", pencilMuted: "#5A6772", pencilLine: "rgba(47,59,70,.28)", paperBtn: "rgba(255,255,255,.6)",
    hatch: "rgba(40,52,64,.95)", hatchEdge: "rgba(40,52,64,.7)", guide: "rgba(47,59,70,.34)", crete: "#E0590F",
    workDot: { read: "#2E5E8C", reply: "#C98A12", done: "#2F8A5B", warn: "#B5412C", idle: "#A8B2B8" },
  },
  "kraft-yard": {
    key: "kraft-yard", label: "Kraft Yard", note: "Kraft tan, navy rail, safety orange", dark: false,
    slab: "#EFE7D8", card: "#FBF7EE", sunk: "#E6DCC7",
    ink: "#26231E", ink2: "#574F42", ink3: "#7E7361",
    hair: "#D8CBB0", hairSoft: "#E9DFCB", hairStrong: "#C9B996",
    hiviz: "#C74B08", onHiviz: "#FFFFFF", hivizDim: "#F6DEC8", hivizSoft: "#E0590F", hivizText: "#9A3F08",
    chalk: "#1F3A4D", chalkDim: "#DCE3E8",
    green: "#3E7B4F", violet: "#7A5AA8", red: "#A93A26", teal: "#1F6F73",
    bucket: { unsorted: "#C74B08", customer: "#3E7B4F", vendor: "#1F3A4D", personal: "#7A5AA8", spam: "#A93A26" },
    outBg: "#1F3A4D", outInk: "#F4ECDC",
    dustyTint: "#F6E3CF", dustyText: "#9A3F08", dustyEdge: "#E0590F",
    rail: "#1F3A4D", railActive: "#2B4C63", railInk: "#B9C7D1", railInkOn: "#FFFFFF",
    paper: "#F4ECDC", paperGrid: "rgba(120,96,60,.11)", pencil: "#3A342B", pencilMuted: "#62584A", pencilLine: "rgba(58,52,43,.30)", paperBtn: "rgba(255,252,245,.6)",
    hatch: "rgba(40,36,30,.95)", hatchEdge: "rgba(40,36,30,.7)", guide: "rgba(58,52,43,.34)", crete: "#E0590F",
    workDot: { read: "#1F3A4D", reply: "#C98A12", done: "#3E7B4F", warn: "#A93A26", idle: "#B3A58A" },
  },
  "night-shift": {
    key: "night-shift", label: "Night Shift", note: "Dark — charcoal graph paper, orange glow", dark: true,
    slab: "#1B1D1F", card: "#232629", sunk: "#2D3135",
    ink: "#ECE7DD", ink2: "#B5AEA2", ink3: "#8E887E",
    hair: "#363B40", hairSoft: "#2C3034", hairStrong: "#474D53",
    hiviz: "#F07A3A", onHiviz: "#1B1D1F", hivizDim: "#3A2A20", hivizSoft: "#F07A3A", hivizText: "#F4A071",
    chalk: "#8DB2EA", chalkDim: "#22324A",
    green: "#5FBF8A", violet: "#A995E6", red: "#F08A76", teal: "#5EC2C8",
    bucket: { unsorted: "#F07A3A", customer: "#5FBF8A", vendor: "#7FA8E0", personal: "#A995E6", spam: "#F08A76" },
    outBg: "#3A2A20", outInk: "#ECE7DD",
    dustyTint: "#2F2621", dustyText: "#F4A071", dustyEdge: "#F07A3A",
    rail: "#16181A", railActive: "#232629", railInk: "#8E887E", railInkOn: "#ECE7DD",
    paper: "#202326", paperGrid: "rgba(140,170,200,.09)", pencil: "#DDD8CE", pencilMuted: "#A39D93", pencilLine: "rgba(221,216,206,.22)", paperBtn: "rgba(255,255,255,.04)",
    hatch: "rgba(236,231,221,.92)", hatchEdge: "rgba(236,231,221,.6)", guide: "rgba(221,216,206,.26)", crete: "#F07A3A",
    workDot: { read: "#7FA8E0", reply: "#F0B35A", done: "#5FBF8A", warn: "#F08A76", idle: "#5E5A54" },
  },
};

export const THEME_ORDER: ThemeKey[] = ["site-office", "blueprint", "kraft-yard", "night-shift"];
export const DEFAULT_THEME: ThemeKey = "site-office";

/** Writes a theme onto <html> as CSS variables (--sc-*) + data-theme. Call on load and on change. */
export function applyTheme(key: ThemeKey) {
  const t = THEMES[key] ?? THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  root.dataset.theme = t.key;
  root.style.colorScheme = t.dark ? "dark" : "light";
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string" && k !== "key" && k !== "label" && k !== "note") flat[k] = v;
    else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v)) flat[`${k}-${k2}`] = v2 as string;
  }
  for (const [k, v] of Object.entries(flat)) root.style.setProperty(`--sc-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.paper);
}
