# Fonts

Self-hosted copies of the Google Fonts the app uses (latin subset, woff2),
loaded with `next/font/local` so `next build` never downloads anything — a
failed Google Fonts fetch once failed a production deploy (2026-10-05).

All are under the SIL Open Font License. Files named `-100-900` etc. are
variable fonts covering that weight range.

To refresh or add one, take the `/* latin */` block from
`https://fonts.googleapis.com/css2?family=<Family>:wght@<range>` (with a
browser user agent) and save its woff2 here.
