# ScopeCrete Glowing Forge Animation — Motion Spec v2

## Concept
A dark slate cubic block with S, C, A, I carved as negative space cut-outs on 4 faces. Warm orange forge-light glows from within the cut-outs — like heated metal inside concrete. The block spins on a central vertical axis. Behavior mirrors Perplexity's spinning book icon: rapid spin-in, then slows/lingers on S and C faces.

## Animation: SCI + AI Spin with Perplexity-Style Easing

### Behavior Pattern
1. **Spin-in:** Block rotates rapidly 2-3 full rotations to build momentum and attention
2. **Decelerate:** Rotation slows dramatically as it approaches S and C faces
3. **Linger:** Holds on S and C faces (the brand letters) — longer dwell time
4. **Quick pass:** A and I faces pass quickly — functional, not promotional
5. **Loop:** Seamlessly back to S

### Timing
- **Spin-in:** 1.5 seconds, rapid full rotations (540°–720°)
- **Deceleration zone:** 0.5 seconds, cubic-bezier overshoot into slow
- **S face linger:** 2.0 seconds
- **C face linger:** 1.5 seconds  
- **A face pass:** 0.5 seconds (quick)
- **I face pass:** 0.5 seconds (quick)
- **Total loop:** ~6.5 seconds

### Easing
- **Spin-in:** `ease-in` — accelerates into the rapid rotation
- **Deceleration:** `cubic-bezier(0.25, 0.1, 0.25, 1.0)` — smooth slow, no bounce
- **Linger holds:** `ease-out` — gentle ease into pause, hold, then ease into next rotation
- **Quick passes:** `ease-in-out` — faster but not jarring

### Rotation Details
- **Axis:** Central vertical rod — Y-axis rotation
- **Direction:** Clockwise when viewed from above
- **Per-face:**
  - 0.0s – 1.5s: Rapid spin-in (540°–720°)
  - 1.5s – 2.0s: Decelerate into S face
  - 2.0s – 4.0s: Linger on S face (2s)
  - 4.0s – 5.5s: Rotate to C face (1.5s linger on C)
  - 5.5s – 6.0s: Quick pass through A face
  - 6.0s – 6.5s: Quick pass through I face
  - 6.5s: Loop back to S

### Forge Glow Effect
- **Glow source:** Point light/emissive material inside cube, visible through all 4 letter cut-outs
- **Glow color:** Warm orange `#e85d04` to yellow-orange `#f97316`
- **Pulse:** Continuous subtle pulse — 2s sine wave cycle
- **Phase:** S and C glow at full brightness. A and I glow dimmer (50% opacity) since they're not the brand letters
- **Ambient:** Subtle orange rim light on top edge — heat rising

### Camera / Perspective
- **View angle:** 15° above horizon — top barely visible, bottom hidden
- **Perspective:** Slight isometric 3D
- **Field of view:** 45°
- **Background:** Near-black `#0a0a0a`

## CSS 3D Implementation Reference

```css
.cube-container {
  perspective: 1000px;
  perspective-origin: 50% 50%;
}

.cube {
  transform-style: preserve-3d;
  animation: forgeSpin 6.5s cubic-bezier(0.25, 0.1, 0.25, 1.0) infinite;
}

.face { position: absolute; width: 200px; height: 200px; }
.face.front  { transform: rotateY(  0deg) translateZ(100px); }
.face.right  { transform: rotateY( 90deg) translateZ(100px); }
.face.back   { transform: rotateY(180deg) translateZ(100px); }
.face.left   { transform: rotateY(-90deg) translateZ(100px); }

/* S and C glow full brightness */
.face.front, .face.right {
  color: #e85d04;
  text-shadow: 0 0 40px rgba(232,93,4,0.8), 0 0 80px rgba(232,93,4,0.4);
  -webkit-text-stroke: 2px #f97316;
}

/* A and I dimmer */
.face.back, .face.left {
  color: #6b7280;
  text-shadow: 0 0 20px rgba(232,93,4,0.3);
  -webkit-text-stroke: 2px #4b5563;
}

@keyframes forgeSpin {
  0%    { transform: rotateY(0deg); }
  /* Spin-in: rapid rotation */
  23%   { transform: rotateY(720deg); }  /* 1.5s of rapid spin */
  /* Decelerate into S */
  30.7% { transform: rotateY(810deg); }  /* 0.5s deceleration */
  /* Linger on S */
  61.5% { transform: rotateY(810deg); }  /* 2s linger on S */
  /* Rotate to C */
  84.6% { transform: rotateY(990deg); }  /* 1.5s to C */
  /* Quick A pass */
  92.3% { transform: rotateY(1080deg); } /* 0.5s through A */
  /* Quick I pass */
  100%  { transform: rotateY(1170deg); } /* 0.5s through I → loop */
}
```

## Lottie / After Effects Notes
- Build 4-face extruded cube, letters S C A I as knockout paths
- Emissive material on inner surfaces
- Forge glow: radial gradient light source inside, visible through all cut-outs
- Spin-in keyframes: rapid rotation (ease-in), then overshoot into slow
- Export at 60fps for smooth deceleration
- Seamless loop at 6.5s

## Design Notes for Engineering
- Perplexity-style behavior: fast spin-in catches the eye, slow linger on brand letters (S+C) creates recognition
- A and I are functional — they complete the rotation but don't need emphasis
- The "rod" through the center can be implied or rendered as a thin chrome cylinder
- CSS version will feel lighter/jankier than Lottie — for production use Lottie or CSS with will-change optimization

## Color Palette (locked)
- Block: Dark slate `#1e293b` to `#0f172a`
- S and C: Bright safety orange `#e85d04` to `#f97316`
- A and I: Muted gray `#6b7280` with dimmer orange glow
- Background: Near-black `#0a0a0a`

## Tagline
"Structure meets precision." — displayed below the spinning block