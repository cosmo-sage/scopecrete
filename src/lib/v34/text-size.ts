/** Text sizes a reader can pick (Coy: Dusty's chat 2026-10-05, a thread 2026-10-09), applied with CSS zoom, saved per account. */
export const TEXT_SIZES = [
  { key: "s", label: "Small", z: 0.88 },
  { key: "m", label: "Normal", z: 1 },
  { key: "l", label: "Large", z: 1.15 },
  { key: "xl", label: "Extra large", z: 1.3 },
] as const;
export const textSize = (key: string | null | undefined) => TEXT_SIZES.find((f) => f.key === key) ?? TEXT_SIZES[1];
