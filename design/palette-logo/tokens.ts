/**
 * ScopeCrete — "Site Office" (1a) palette on draft paper.
 * Drop-in replacement for the `T` object in src/lib/v34/tokens.ts — same keys,
 * plus new ones at the bottom. Design ref: Dusty Dashboard 1a Draft v3.dc.html
 *
 * Contrast (checked against white / slab):
 *   ink 13.9:1 · ink2 6.6:1 · ink3 3.6:1 (labels/meta only, never body)
 *   hiviz #B85A3C with white text 4.6:1 · dustyText on dustyTint 6.1:1
 */

export const T = {
  // ground + surfaces
  slab: "#FBF6EC",        // page ground (warm cream)            was #E9EBEE
  card: "#FFFFFF",
  ink: "#2A2A2A",         //                                     was #12161A
  ink2: "#5E5A52",
  ink3: "#8C8578",
  hair: "#E6DCC8",
  hairSoft: "#F1E9DA",

  // roles
  chalk: "#1E5AA8", chalkDim: "#DCE6F4",     // links, info, Vendor bucket
  hiviz: "#B85A3C", hivizDim: "#F6E2D8",     // primary action, Unsorted bucket, badges (terracotta)
  green: "#2F8A5B", greenDim: "#DDEEE3",     // Customer bucket, good
  violet: "#6A55B0", violetDim: "#ECE8F6",   // Personal bucket
  red: "#B5412C", redDim: "#F7DCD6",         // Spam bucket, drift alarm, bad

  // rail — now LIGHT. Remove the `filter: invert(1)` on NavIcon in layout.tsx.
  dark: "#F3ECDD", darkHair: "#E6DCC8",
  pulse: "#2F8A5B",

  /* ---- new ---- */
  hivizSoft: "#D97757",   // secondary accent: checkbox rings, outlined "Ask Dusty", active rail edge
  hivizText: "#9A4527",   // accent-coloured text on light grounds (missing values, Dusty labels)
  hairStrong: "#D9CDB6",  // input + button outlines
  sun: "#6B4E12", sunDim: "#F7EBC9",
  dustyTint: "#FBEDE6",   // Dusty's cards, next-steps box
  railInk: "#6E685D",     // inactive rail labels/icons
  // draft-paper header
  paper: "#FAF8F3",
  paperGrid: "rgba(89,128,166,.08)",
  pencil: "#3A3E43",
  pencilMuted: "#5A5F66",
  pencilLine: "rgba(58,62,68,.30)",
  logoOrange: "#D9550A",  // "crete" in the wordmark ONLY
} as const;

/**
 * Alternate accent — the "logo orange" tweak. Swap these five keys into T to
 * pull the whole UI toward the wordmark's orange instead of terracotta.
 */
export const LOGO_ACCENT = {
  hiviz: "#C24E0C", hivizDim: "#FBE3D3", hivizSoft: "#D9550A", hivizText: "#9A3F08", dustyTint: "#FDEEE4",
} as const;

/** Activity-line dot on paper (activity-line.tsx WORK_DOT). */
export const WORK_DOT = { read: "#3F74C9", reply: "#C98A12", done: "#2F8A5B", warn: "#B5412C", idle: "#B3AA9A" } as const;

/** Bucket colours (thread-list CHIPS / BucketTag) — unchanged mapping, new values. */
export const BUCKET = { unsorted: T.hiviz, customer: T.green, vendor: T.chalk, personal: T.violet, spam: T.red } as const;

/* ---- type ---- */
export const disp = "'Barlow Condensed', system-ui, sans-serif";   // eyebrows, labels, times, buttons (UPPERCASE, tracked)
export const body = "'IBM Plex Sans', system-ui, sans-serif";      // body copy
export const strong = "'Lexend', system-ui, sans-serif";           // NEW: names, numbers, counts, tile values (600/700)
export const light = "'Inter', system-ui, sans-serif";             // NEW: panel titles (300)
export const hand = "'Kalam', cursive";                            // NEW: Dusty's voice — activity line, his cards, chat titles
