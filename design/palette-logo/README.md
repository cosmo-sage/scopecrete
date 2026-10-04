# ScopeCrete palette and logo: handoff (2026-09-30)

Design refs in the design project:
- `Dusty Dashboard 1a Draft v3.dc.html`: the latest mock, built on the `claude/feedback` shell.
- `ScopeCrete Logo.dc.html` → 2a: the wordmark at display size.

## Files
- `tokens.ts`: a drop-in replacement for `T` in `src/lib/v34/tokens.ts`. It keeps the same keys and adds new ones: `paper`, `pencil*`, `hivizSoft`, `hivizText`, `dustyTint`, `logoOrange`, and so on. It also holds `LOGO_ACCENT` (the alternate accent), `WORK_DOT`, `BUCKET`, and three new font stacks: `strong`, `light` and `hand`.
- `palette.css`: the same palette as CSS variables. Add the `.sc-logo-accent` class to switch to the orange accent.
- `Wordmark.tsx`: the **latest** logo. "scope" and "crete" now sit tight together (gap 0), so they read as one word. Header size is 26.
- `draft-paper-header.css`: the draft-paper header, pencil-outlined buttons, the activity line on paper, and a light rail.

## Palette: Site Office (1a)
Cream ground `#FBF6EC` · white cards · warm ink `#2A2A2A / #5E5A52 / #8C8578` · hairlines `#E6DCC8`.
The accent is terracotta: `#B85A3C` for primary actions, `#D97757` for rings and the active rail edge, and `#9A4527` for accent-coloured text.
Bucket colours: Unsorted = accent · Customer `#2F8A5B` · Vendor `#1E5AA8` · Personal `#6A55B0` · Spam `#B5412C`.
Logo orange `#D9550A` is for "crete" only, unless you switch to `LOGO_ACCENT`.

## Type roles
- **Lexend 600/700**: names, phone numbers, counts, tile values, page titles.
- **Inter 300**: panel titles (Contact, Scope on file, Money).
- **Kalam**: Dusty's voice. The activity line, his cards, "Next steps I heard", and chat titles.
- **Barlow Condensed**: labels, times, buttons, bucket tags. Uppercase, tracked .08–.14em.
- **IBM Plex Sans**: body copy.

## Shape
Radii: 3px for buttons and chips, 4px for cards and inputs, 6px for panels. Icons are 1.5 stroke.

## Changes Code needs to make in layout.tsx
1. Header: `sc-glass` → `sc-paper`, and `sc-glass-btn` → `sc-paper-btn`. Icon strokes change from `#fff` to `#3A3E43`.
2. Replace the "scopecrete.ai" text with `<Wordmark size={26} />`.
3. The divider becomes `.sc-paper-divider`. The activity line text uses Kalam, and its drop-down moves from dark glass to a white card.
4. Rail: the background is now `T.dark` = `#F3ECDD`. **Remove `filter: invert(1)`** on NavIcon. The active item gets a white background with a `#D97757` left edge.
5. The mobile footer stays on `T.card`. Its active mark uses `T.hiviz`.

Not included: a PNG or SVG of the logo. The hatched fill is CSS text clipping, so a static asset for email or an OG image needs a separate export. Ask if you want one.
