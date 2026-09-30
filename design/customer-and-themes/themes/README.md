# ScopeCrete colour themes: handoff for a Settings colour selector

There are four themes, and they all use the same set of colour names:
**Site Office (1a, default) · Blueprint (2a) · Kraft Yard (2b) · Night Shift (2c, dark)**.
Design refs: `Dusty Dashboard 1a Draft v3.dc.html` and `Dusty Palette Options v2.dc.html`.

## Files
- `themes.ts` → put at `src/lib/v34/themes.ts`. It holds `THEMES`, `THEME_ORDER`, `DEFAULT_THEME` and `applyTheme()`. `applyTheme()` writes `--sc-*` CSS variables and `data-theme` onto `<html>`.
- `themes.css` → import once in `src/app/layout.tsx`. These are static fallbacks for each `data-theme`, so the first paint already has the right colours.
- `ThemePicker.tsx` → contains `useTheme()` and `<ThemePicker/>`, which shows four preview cards. Settings are saved with `usePref("theme")`, which uses the migration 053 table.

## Wiring
1. **Settings (☰) in layout.tsx:** add an "Appearance" row next to "Menus" that expands to `<ThemePicker/>`, the same way Menus expands.
2. **Read colours from variables:** in `tokens.ts`, point `T` at variables, for example `slab: "var(--sc-slab)"`, `hiviz: "var(--sc-hiviz)"`, and so on. Every existing `T.x` use then follows the theme with no other changes. Keep the raw hex values only where JS needs to calculate with a colour.
3. **No colour flash on load:** add this in `<head>` in `src/app/layout.tsx`:
   ```html
   <script>try{document.documentElement.dataset.theme=localStorage.getItem('sc-theme')||'site-office'}catch(e){}</script>
   ```
4. **Rail:** in Site Office and Blueprint the rail is light, so remove `filter: invert(1)` on NavIcon. Use `color: var(--sc-rail-ink)` and draw the icons with `currentColor`. Kraft Yard and Night Shift have dark rails, so the same code works for all four.
5. **Wordmark:** the "scope" hatching uses `--sc-hatch`, the guide lines use `--sc-guide`, and "crete" uses `--sc-crete`. In Night Shift the hatching turns chalk-white.
6. **Dusty:** his card colours come from `--sc-dusty-*`. His tint stays warm in every theme on purpose.

## Night Shift notes
- Buttons are orange with **dark** text: `--sc-on-hiviz` = `#1B1D1F`. Don't hard-code white text on the accent.
- `color-scheme: dark` is set on `<html>`, so native inputs and scrollbars follow it.
- Shadows should be lighter or removed. Separate surfaces with the hairline colours (`--sc-hair`) rather than drop shadows.

Contrast: in every theme, body text on the page background is at least 7:1, and button text on the accent colour is at least 4.5:1.
