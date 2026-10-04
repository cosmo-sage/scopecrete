# ScopeCrete handoff: customer page and colour themes (2026-09-30)

- `customer-page/`: the customer redesign. It contains the spec (README), the data types, `LocationCard.tsx` (map, street view, copy address), `CallCard.tsx` (summary, recording, transcript, notes), and the clickable mock.
- `themes/`: four colour options for Settings → Appearance: **Site Office** (default), **Blueprint**, **Kraft Yard** and **Night Shift** (dark). It has `themes.ts`, `themes.css`, and `ThemePicker.tsx` (colour picker plus `useTheme()`) with wiring steps.

Suggested order:
1. Themes: point the `T` colour tokens at the `--sc-*` variables, then add the Appearance section to Settings.
2. The customers table migration.
3. The customer page.
