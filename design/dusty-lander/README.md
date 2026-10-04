# Dusty — the Scopecrete Lander

A hatched concrete block on steel legs, with green-light eyes, a dish antenna and an orange ring.
Colors: orange #F2610C · steel #5980A6 · green #1FA971 · amber #F2B40C (alert) · ink #34383D · paper #FAF8F3

## Files
- `svg/dusty-<state>.svg` — 240px, animated with CSS inside the SVG. Works in `<img src>`.
- `svg/small/dusty-<state>-24.svg` — heavier strokes for 20–40px (header button, tab bar).
- `png/` — static renders.
- `dusty.js` — `DustySVG(state, { size })` returns the SVG as a string, for inline use in the app
  (inline lets you swap states without reloading an image).

## States
- **idle** — Default, waiting
- **listen** — A call or text is coming in
- **sort** — Reading and filing messages
- **scan** — Pulling dimensions from a map or plan
- **land** — A new job lands on the board (play once)
- **celebrate** — Proposal sent or job won
- **alert** — Something needs a decision
- **sleep** — After hours / offline
- **static** — No animation — favicon, print, email

Animations respect `prefers-reduced-motion`.

## React example
```tsx
import DustySVG from './dusty.js';
export function Dusty({ state = 'idle', size = 32 }) {
  const html = React.useMemo(() => DustySVG(state, { size }), [state, size]);
  return <span aria-label="Dusty" style={{ display: 'inline-flex', width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} />;
}
```
Memoize the string — a new string each render restarts the animation.
