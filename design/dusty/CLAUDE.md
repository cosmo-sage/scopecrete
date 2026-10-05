# CLAUDE.md — Dusty Pixel Character (ScopeCrete.ai)

**Asset folder:** `Dusty-v5-Pixel/`
**Status:** Production-ready v1
**Last updated:** 2026-09-29

This document is the source of truth for the Dusty pixel mascot. Any agent or developer
integrating this character into ScopeCrete.ai should start here.

---

## What is Dusty?

Dusty is a pixel-art mascot character for ScopeCrete.ai — an AI assistant inside a
concrete-estimating chat app. He's a young male foreman with:

- **Tanned/terracotta skin** (`#D97757`)
- **Pokey blonde hair** in three signature tufts (`#E8C77A`) — non-negotiable
- **Blue collared work shirt** (`#1E5AA8`) — ScopeCrete brand color
- **Two black pixel eyes** with white highlights
- **Slight smirk** by default

The design takes heavy inspiration from Claude Code's mascot (square head, two pixel
eyes, friendly-foreman vibe) — this is intentional and approved. Dusty's hair and
terracotta skin tone differentiate him.

**Reference images:** `dusty_v1_base_24x.png` is the canonical sprite.

---

## Palette (16 colors max, 12 actually used)

```css
:root {
  /* Primary character */
  --dusty-skin:        #D97757;  /* terracotta — face/hands */
  --dusty-skin-shade:  #B85A3C;  /* right-side face shadow */
  --dusty-hair:        #E8C77A;  /* blonde — three pokey tufts */
  --dusty-hair-shade:  #C8A55A;  /* hair shadow */
  --dusty-shirt:       #1E5AA8;  /* blue — ScopeCrete brand */
  --dusty-shirt-shade: #163C78;  /* shirt shadow / collar */

  /* Outlines + utility */
  --dusty-line:        #2A2A2A;  /* NOT pure black — softer */
  --dusty-white:       #FFFFFF;  /* eye highlights only */

  /* Concrete / props */
  --dusty-concrete:    #DCDAC2;  /* concrete slab */
  --dusty-concrete-d:  #B4B2AA;  /* concrete shadow */
  --dusty-steel:       #B4B4BE;  /* mixer drum body */
  --dusty-steel-d:     #82828C;  /* mixer drum shadow */
  --dusty-rust:        #C86432;  /* mixer hub */
  --dusty-cream:       #FBF6EC;  /* brand bg — not in sprite */
}
```

**Hard rule:** Outlines are `#2A2A2A`, never `#000000`. This matches the Claude Code
mascot and avoids a "dead pixels" feel. If you regenerate sprites, keep this rule.

---

## Sprite Specifications

### Logical grid: 24×24 pixels

All sprites are drawn on a 24×24 logical grid, then upscaled with `image-rendering: pixelated`
(NEAREST neighbor) for display. The sprite regions are:

- **Rows 0–2:** Hair (3 tufts)
- **Rows 3–13:** Head + face (eyes at rows 7–8, mouth at row 11)
- **Rows 14–22:** Body (blue shirt, collar V at row 14, belt at row 20)
- **Row 23:** Bottom outline

### Render sizes

| File | Size (logical) | Render size | Use case |
|---|---|---|---|
| `dusty_v1_at_16px.png` | 24×24 | 16×16 | Favicon, tab badge (static only) |
| `dusty_v1_at_24px.png` | 24×24 | 24×24 | Bottom-nav center icon |
| `dusty_v1_at_32px.png` | 24×24 | 32×32 | Small UI avatar |
| `dusty_v1_at_48px.png` | 24×24 | 48×48 | Mobile chat avatar |
| `dusty_v1_at_64px.png` | 24×24 | 64×64 | Desktop chat avatar |
| `dusty_v1_at_128px.png` | 24×24 | 128×128 | Empty states, splash |

**At 16px and 24px, animations do not run** — too small. Show the static idle sprite.

### State sprites (6 states, all 128×128)

`dusty_state_sheet_6states.png` contains all 6 states in a single 768×128 strip,
laid out horizontally for CSS sprite-swap:

| Slot | State | Pose | Used when |
|---|---|---|---|
| 0 (0px) | `idle` | Standing, default | Default avatar everywhere |
| 1 (-128px) | `thinking` | Calculator in hand, eye squinted | Pre-calculation prompt |
| 2 (-256px) | `measuring` | Clipboard + ruler | User sends dimensions |
| 3 (-384px) | `thumbs_up` | Arm raised, big smile | Estimate calculated successfully |
| 4 (-512px) | `error` | Both arms up, confused | Error / retry |
| 5 (-640px) | `loading` | Hard hat, dust at feet | Page loading |

### Concrete mixer sprite

`concrete_mixer_static.png` and `anim_concrete_mixer_FINAL.gif` — a separate
128×128 sprite used during the **calculating** state, replacing Dusty entirely.
The drum rotates (4-frame cycle, dust puffs at wheels) to show "working."

---

## Animation Specifications

All animations are at 128×128, transparent background, looping (idle) or one-shot (reaction).

| Animation | File | Duration | Loop | Trigger |
|---|---|---|---|---|
| **Chest breathing** | `anim_breathing_CHEST_v4.gif` | 1.67s | ✓ | Always when Dusty is visible (≥32px) |
| **Hair flutter** | `anim_hair_v2_flutter.gif` | 3.0s | ✓ | Subtle ambient |
| **Combined idle** | `anim_idle_FULL_LOOP_6s.gif` | 6.0s | ✓ | Breathing + blink + flutter combined |
| **Head scratch** | `anim_head_scratch_FINAL.gif` | 1.4s | one-shot | Error / retry (after 2nd attempt) |
| **Concrete pour** | `anim_concrete_pour_v2.gif` | 1.6s | one-shot | Successful estimate |
| **Mixer rotating** | `anim_concrete_mixer_FINAL.gif` | 2.0s | ✓ | Calculating state (replaces Dusty) |

### Animation notes

- **Chest breathing mechanic:** Head stays 100% fixed, midsection expands 1px outward
  (sides) and 1px upward (into chin) on inhale. **Do NOT move the whole sprite** —
  that reads as "hopping," not breathing.
- **Mixer is a separate state.** When Dusty is calculating, the mixer sprite replaces
  him entirely (128×128 crossfade). When the calculation finishes, mixer fades out,
  Dusty fades in with the concrete pour animation.
- **The "pour" payoff is at Dusty's feet, not from the mixer.** The mixer just rotates;
  the slab + steam appear in the concrete pour animation when Dusty returns.

---

## CSS Implementation (Recommended)

```css
/* Base — pixel-perfect rendering is critical */
.dusty {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

/* Idle sprite with state-swap */
.dusty-idle {
  width: 64px;
  height: 64px;
  background-image: url('/assets/dusty_state_sheet_6states.png');
  background-size: 768px 128px;  /* 6 states × 128px wide */
  background-repeat: no-repeat;
  background-position: 0 0;
}
.dusty-idle[data-state="thinking"]  { background-position: -128px 0; }
.dusty-idle[data-state="measuring"] { background-position: -256px 0; }
.dusty-idle[data-state="thumbs"]    { background-position: -384px 0; }
.dusty-idle[data-state="error"]     { background-position: -512px 0; }
.dusty-idle[data-state="loading"]   { background-position: -640px 0; }

/* Idle breathing — preferred over GIF for performance */
@keyframes dusty-breath {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(2px); }
}
.dusty-idle { animation: dusty-breath 1.6s ease-in-out infinite; }

/* OR use the chest-breathe sprite-stack trick:
   layer two sprites (rest + expanded) and crossfade */
.dusty-breath-stack::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url('/assets/dusty_chest_expanded.png');
  background-size: contain;
  opacity: 0;
  animation: chest-cycle 1.6s ease-in-out infinite;
}
@keyframes chest-cycle {
  0%, 100% { opacity: 0; }
  50%      { opacity: 1; }
}

/* Favicon (static only) */
.dusty-favicon {
  width: 16px; height: 16px;
  background-image: url('/assets/dusty_v1_at_16px.png');
  background-size: contain;
}
```

---

## State Machine

```
                    ┌──────────────┐
                    │     IDLE     │ ◄──────┐
                    │  (breathing) │        │
                    └──────┬───────┘        │
                           │                │
              user sends   │                │
              dimensions   │                │
                           ▼                │
                    ┌──────────────┐        │
                    │   MIXER      │        │
                    │  (rotating)  │        │
                    └──────┬───────┘        │
                           │                │
                  calculation                │
                   finishes  │                │
                           ▼                │
              ┌────────────────────────┐    │
              │  CONCRETE POUR         │    │
              │  (slab at Dusty's feet)│    │
              └────────────┬───────────┘    │
                           │                │
                           └────────────────┘

  ERROR PATH:
  IDLE → ERROR (head scratch one-shot) → MIXER → ...

  LOADING PATH:
  IDLE → LOADING (hard hat sprite) → IDLE
```

---

## What NOT to do

1. **Do NOT move the whole sprite for breathing** — only the chest moves.
2. **Do NOT use pure `#000000` outlines** — keep `#2A2A2A` for warmth.
3. **Do NOT add anti-aliasing** — use `image-rendering: pixelated` always.
4. **Do NOT animate at 16px or 24px** — show static only at favicon sizes.
5. **Do NOT use `font-smoothing: antialiased`** on any text near Dusty sprites.
6. **Do NOT crop the hair** — the three pokey tufts are Dusty's silhouette anchor.

---

## Browser support

- Modern evergreen browsers (Chrome 90+, Safari 14+, Firefox 90+) — full support
- IE11 — **not supported** (uses CSS Grid, custom properties, `image-rendering`)
- Mobile Safari — fully supported, use `-webkit-image-rendering: pixelated`

---

## File manifest

```
Dusty-v5-Pixel/
├── CLAUDE.md                     ← you are here
├── sprites/                      15 PNG files
│   ├── dusty_v1_at_16px.png           favicon
│   ├── dusty_v1_at_24px.png           bottom-nav icon
│   ├── dusty_v1_at_32px.png           small avatar
│   ├── dusty_v1_at_48px.png           mobile chat
│   ├── dusty_v1_at_64px.png           desktop chat
│   ├── dusty_v1_at_128px.png          empty states
│   ├── dusty_v1_base_24x.png          canonical source (192×192 upscaled)
│   ├── dusty_state_sheet_6states.png  768×128 sprite strip
│   ├── dusty_state_{0-5}_*.png        individual state PNGs
│   └── concrete_mixer_static.png      mixer as static sprite
├── animations/                  12 files (6 animations × gif/mp4)
│   ├── anim_breathing_CHEST_v4.gif+mp4
│   ├── anim_hair_v2_flutter.gif+mp4
│   ├── anim_idle_FULL_LOOP_6s.gif+mp4
│   ├── anim_head_scratch_FINAL.gif+mp4
│   ├── anim_concrete_pour_v2.gif+mp4
│   └── anim_concrete_mixer_FINAL.gif+mp4
└── docs/
    ├── SPRITE-CATALOG.md         detailed sprite/animation reference
    └── INTEGRATION.md            chat UI integration guide
```

---

## Open questions for follow-up

- [ ] Perplexity prompt for additional state poses (loading-bored, sign-off, etc.)
- [ ] Confirm bottom-nav icon: variant A (square head) vs variant B (hard hat)
- [ ] Clay (VPS Doctor) to render at production CSS sizes in actual chat UI mockup
- [ ] Decide on animation bundling for first contentful paint (LCP) — at what size do we switch from static to animated?
