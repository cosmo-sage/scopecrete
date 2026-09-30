# INTEGRATION.md — Dusty Pixel in ScopeCrete.ai Chat UI

**Audience:** Frontend developers integrating Dusty into the live chat UI.
**Companion to:** `../CLAUDE.md` (start there for palette + sprite specs).

This guide covers the practical "how to wire this up" — state hooks, animation
triggers, accessibility, and performance.

---

## Quick Start (TL;DR)

```jsx
import DustyAvatar from '@/components/DustyAvatar';

<DustyAvatar state="thinking" size={64} />
```

The component handles sprite-swap, idle breathing animation, and reduced-motion
preferences internally.

---

## Component API

```typescript
interface DustyAvatarProps {
  /** Current Dusty state — drives sprite selection */
  state: 'idle' | 'thinking' | 'measuring' | 'thumbs' | 'error' | 'loading' | 'calculating';

  /** Render size in pixels (16, 24, 32, 48, 64, 128) */
  size: 16 | 24 | 32 | 48 | 64 | 128;

  /** Optional override for "calculating" — show mixer animation instead of Dusty */
  showMixer?: boolean;

  /** Accessibility label (auto-generated from state if omitted) */
  ariaLabel?: string;

  /** Disable all animations (also auto-disabled under prefers-reduced-motion) */
  disableAnimations?: boolean;

  /** Additional CSS classes */
  className?: string;
}
```

### State → Asset mapping

| `state` prop | Sprite shown | Animations |
|---|---|---|
| `idle` | `dusty_v1_at_*.png` | chest breathing + hair flutter |
| `thinking` | `dusty_state_1_thinking.png` | none (static) |
| `measuring` | `dusty_state_2_measuring.png` | none |
| `thumbs` | `dusty_state_3_thumbs_up.png` | none |
| `error` | `dusty_state_4_error.png` | head scratch one-shot on enter |
| `loading` | `dusty_state_5_loading.png` | none |
| `calculating` + `showMixer=true` | `anim_concrete_mixer_FINAL.gif` | drum rotation loop |
| `calculating` + `showMixer=false` | `dusty_state_1_thinking.png` | none |

---

## When to Trigger Each State

| Event | Trigger state |
|---|---|
| Component mounts | `idle` |
| User sends a message with dimensions | `measuring` (1.5s) → `calculating` |
| While estimate is being computed | `calculating` (show mixer) |
| Estimate computed successfully | `calculating` → concrete pour one-shot → `thumbs` (2s) → `idle` |
| Estimate error / API failure | `error` (head scratch plays once) → `idle` |
| Page is loading (initial fetch) | `loading` |
| User idle for >30s | `idle` (breathing continues) |

### Recommended transition timings

```
idle → measuring:       instant sprite swap
measuring → calculating: 300ms crossfade (mixer fades in over Dusty)
calculating → pour:     200ms crossfade (mixer fades out, Dusty returns with pour)
pour → thumbs:          pour animation completes, then sprite swap to thumbs
thumbs → idle:          2s hold, then sprite swap to idle
error → idle:           head scratch one-shot, then sprite swap to idle
```

---

## Implementation sketch (React)

```tsx
// components/DustyAvatar.tsx
import { useState, useEffect } from 'react';

export function DustyAvatar({ state, size = 64, showMixer = false, ariaLabel }) {
  const [showPour, setShowPour] = useState(false);
  const [scratched, setScratched] = useState(false);

  // Trigger head scratch one-shot on entering error state
  useEffect(() => {
    if (state === 'error') {
      setScratched(true);
      const t = setTimeout(() => setScratched(false), 1400);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Trigger pour one-shot after calculating completes
  useEffect(() => {
    if (state === 'calculating') {
      const t = setTimeout(() => {
        setShowPour(true);
        setTimeout(() => {
          setShowPour(false);
        }, 1600);
      }, 2000); // wait for "calculating" to feel like it took some time
      return () => clearTimeout(t);
    }
  }, [state]);

  const label = ariaLabel || `Dusty ${state}`;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animDisabled = prefersReducedMotion;

  // Calculating state with mixer
  if (state === 'calculating' && showMixer && !showPour) {
    return (
      <img
        src="/assets/dusty/anim_concrete_mixer_FINAL.gif"
        width={size} height={size}
        alt={label}
        className="dusty-pixel"
      />
    );
  }

  // Pour one-shot
  if (showPour) {
    return (
      <img
        src="/assets/dusty/anim_concrete_pour_v2.gif"
        width={size} height={size}
        alt={label}
        className="dusty-pixel"
      />
    );
  }

  // Head scratch one-shot
  if (scratched) {
    return (
      <img
        src="/assets/dusty/anim_head_scratch_FINAL.gif"
        width={size} height={size}
        alt={label}
        className="dusty-pixel"
      />
    );
  }

  // State sprite (idle + non-animated states)
  const stateIndex = ['idle', 'thinking', 'measuring', 'thumbs', 'error', 'loading'].indexOf(state);
  if (stateIndex >= 0) {
    return (
      <div
        role="img" aria-label={label}
        className={`dusty-state dusty-state-${state} ${animDisabled ? '' : 'dusty-breathing'}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return null;
}
```

### CSS

```css
.dusty-pixel {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

/* State sprite-swap */
.dusty-state {
  image-rendering: pixelated;
  background-image: url('/assets/dusty/dusty_state_sheet_6states.png');
  background-size: 768px 128px;
  background-repeat: no-repeat;
  background-position: 0 0;
}
.dusty-state-idle      { background-position:    0 0; }
.dusty-state-thinking  { background-position: -128px 0; }
.dusty-state-measuring { background-position: -256px 0; }
.dusty-state-thumbs    { background-position: -384px 0; }
.dusty-state-error     { background-position: -512px 0; }
.dusty-state-loading   { background-position: -640px 0; }

/* Idle breathing */
@keyframes dusty-breath {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(2px); }
}
.dusty-breathing { animation: dusty-breath 1.6s ease-in-out infinite; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .dusty-breathing { animation: none; }
  /* For GIF animations: replace with static sprite via JS */
}
```

---

## Accessibility

### ARIA

- Always provide `aria-label` or use `role="img"` with descriptive label
- Default labels: "Dusty is thinking", "Dusty is calculating", etc.
- Decorative uses (e.g., inside a button that has its own label) → `aria-hidden="true"`

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .dusty-breathing { animation: none; }
}
```

```jsx
// For GIF animations, swap to static sprite under reduced motion
const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
};

// Usage
const reduced = useReducedMotion();
const src = reduced
  ? '/assets/dusty/dusty_v1_at_64px.png'  // static fallback
  : '/assets/dusty/anim_concrete_pour_v2.gif';
```

### Color contrast

Dusty's outline color (`#2A2A2A`) on cream bg (`#FBF6EC`) — contrast ratio **13.4:1**,
passes WCAG AAA. The terracotta skin (`#D97757`) on cream — contrast ratio **2.8:1**,
fails WCAG for text but acceptable for decorative pixel art at the sizes used.

If accessibility audit flags the skin tone, consider a darker outline variant for
accessibility mode.

---

## Performance

### Bundle size budget

- 16 PNGs + 6 GIFs + 6 MP4s = ~80KB total uncompressed
- After gzip: ~40KB
- Sprite sheet (`dusty_state_sheet_6states.png`) is the only critical asset for LCP
- Lazy-load animations: only fetch GIFs after first user interaction

### Loading strategy

```jsx
// Critical: ship the idle sprite inline (data URI) for LCP
const DUSTY_IDLE_64 = 'data:image/png;base64,...'; // ~470 bytes

// Lazy: load animations on demand
const DustyAnimation = lazy(() => import('./DustyAnimation'));

<Suspense fallback={<img src={DUSTY_IDLE_64} />}>
  <DustyAnimation src="/assets/dusty/anim_concrete_pour_v2.gif" />
</Suspense>
```

### FPS / paint performance

- CSS animations (chest breathing) → GPU-accelerated, no repaint
- GIF animations → CPU-decoded, can cause jank on low-end mobile
- MP4 → smoother but requires `<video>` element + autoplay handling
- **Recommendation:** Use CSS for breathing, GIF for one-shots on desktop, MP4 for one-shots on mobile

---

## Testing checklist

Before shipping, verify in browser at each size:

- [ ] 16×16 — silhouette reads as "person with light hair" (favicon test)
- [ ] 24×24 — three pokey tufts visible (bottom-nav test)
- [ ] 32×32 — eyes + mouth visible, breathing animation smooth
- [ ] 48×48 — all details readable on mobile
- [ ] 64×64 — idle, thinking, measuring, thumbs, error, loading all distinct
- [ ] 128×128 — empty state composition feels alive

Functional tests:

- [ ] Send dimensions → measuring state shows for ~1.5s
- [ ] Calculating state → mixer appears (if showMixer=true)
- [ ] Successful estimate → pour one-shot plays
- [ ] API error → head scratch one-shot plays once
- [ ] prefers-reduced-motion → all animations stop, static sprites show
- [ ] tab away + back → animations don't drift out of sync

---

## Open implementation questions

- [ ] Where does the Dusty avatar live in the chat UI? (left of every message? header only? footer?)
- [ ] Does Dusty appear in the loading screen (full-screen), or just the chat bubble?
- [ ] Should the mixer state crossfade or hard-cut?
- [ ] Should we ship MP4 alongside GIF for mobile? (GIFs are expensive on iOS Safari)
