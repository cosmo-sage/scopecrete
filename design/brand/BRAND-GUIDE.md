# ScopeCrete.ai — Brand Guidelines

## Brand Concept
"ScopeCrete is like if your dishwasher loaded and unloaded itself, and then thanked you for the extra work."
Data emerging from concrete — digital measurement and oversight of physical construction.

---

## Color Palette

### Primary Palette — Concrete + Safety Orange (Recommended)
| Color | Hex | Usage |
|-------|-----|-------|
| Concrete Gray | `#6b7280` | S letter, block body |
| Safety Orange | `#e85d04` | C letter, accent, glow |
| Near-Black | `#0a0a0a` | Background |

### Secondary — Slate Gray
| Color | Hex | Usage |
|-------|-----|-------|
| Slate Gray | `#2d3748` | Alternative block tone |

### Secondary Palette — Slate + Orange Gradient
| Color | Hex | Usage |
|-------|-----|-------|
| Slate Gray | `#2d3748` | Block body |
| Orange Gradient | `#e85d04` → `#f97316` | C element, glow |

### Tertiary Palettes (for comparison)
| Palette | Colors | Notes |
|---------|--------|-------|
| Dark Slate + Electric Blue | `#1e293b` + `#3b82f6` | Tech-forward, differentiates from orange |
| Navy + Copper | `#0f172a` + `#cd7f32` | Premium warmth |
| All Orange | `#e85d04` variants | Bold monochromatic |

---

## Logo Mark

### Primary Direction — 3D Isometric SC Letterblock
Isometric cube with hexagonal footprint. S formed by two left sections, C by single right section. Orange accent on C.

### Animation Direction — Glowing Forge Block
Dark slate rectangular block with S, C, A, I as glowing cut-outs. Orange forge-light emanates from within the cut-outs. Animation: Perplexity-style spin — rapid spin-in, linger on S and C, quick pass on A and I.

### Key Assets
- `brand-guidelines-3x3.jpg` — Full 3×3 brand guidelines board
- `palette-comparison.jpg` — All 5 color variants
- `forge-animation-spec.md` — Motion spec for spinning forge block
- `forge-rotation-demo.html` — CSS animation demo

---

## Tagline
**Leave blank** — use ad copy above for marketing materials.

---

## Animation Spec Summary
- **4-face rotation:** S → C → A → I (clockwise)
- **Behavior:** Perplexity-style — fast spin-in (540° over 1.5s), decelerate, linger on S+C, quick pass on A+I
- **Total loop:** 6.5 seconds
- **Glow:** Orange pulse, S+C full brightness, A+I dimmer
- **Reference:** `forge-animation-spec.md` for full timing/easing details

---

## Status
- [x] Brand concept confirmed
- [x] Tagline: "Structure meets precision."
- [x] Primary palette selected: Concrete + Safety Orange
- [ ] Production-quality S+C+A+I vector mark (needs designer/Figma)
- [x] Animation spec complete
- [x] CSS animation demo working
- [ ] Animation to be built by engineering from spec

---

## Design Files
```
scopecrete/
  design/
    brand/
      brand-guidelines-3x3.jpg
      forge-animation-spec.md
      forge-rotation-demo.html
    logo/
      palette-comparison.jpg
```

---

*Last updated: 2026-05-31*