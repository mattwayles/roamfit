/**
 * Space, radius and motion tokens (docs/DESIGN.md §2). No drop shadows on dark — depth is
 * surface steps + a 1px `line` border; accents get a glow, reserved for the one primary thing on
 * a screen.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Standard horizontal screen gutter. */
export const gutter = 20;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const motion = {
  /** `press`: scale to 0.96 in 90ms, spring back. */
  press: { scale: 0.96, duration: 90 },
  /** `enter`: opacity 0->1 + translateY 14->0, spring, staggered 45ms per item on first mount. */
  enter: { translateY: 14, stagger: 45 },
  /** `pop`: scale 0.6 -> 1.12 -> 1 (set pips filling, badges landing). */
  pop: { from: 0.6, peak: 1.12, to: 1 },
  /** `pulse`: 1 -> 1.06 loop for the final 3 seconds of any countdown. */
  pulse: { to: 1.06, duration: 480 },
  spring: { speed: 22, bounciness: 8 },
} as const;
