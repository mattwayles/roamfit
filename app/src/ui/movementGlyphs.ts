/**
 * Movement pictograms: one stick-figure pose per movement pattern, drawn on a 24x24 grid, so a
 * Field Guide row shows *the movement* (a press overhead, a row, a hinge) rather than a stock
 * arrow or a radio dot. Pure data - `MovementIcon` draws it, and a preview script can too.
 *
 * Conventions: side views face right; the head is a filled circle; `body` is the figure, stroked
 * at full weight; `aux` is the scenery (ground, band, seat, a direction arrow), stroked lighter and
 * fainter so the pose stays the read. Every `Pattern` must appear (the type makes a new one a
 * compile error).
 */
import type { Pattern } from '@roamfit/data';

export interface MovementGlyph {
  head: readonly [number, number];
  body: string;
  aux?: string;
}

export const MOVEMENT_GLYPHS: Record<Pattern, MovementGlyph> = {
  // Standing chest press: arms straight out in front.
  horizontal_push: {
    head: [9, 4],
    body: 'M9 6.5V14 M7 22L9 14L11 22 M9 8.5H19',
    aux: 'M2 8.5H6',
  },
  // Overhead press, front view: both arms straight up.
  vertical_push: {
    head: [12, 4.5],
    body: 'M8.5 1.5V8H15.5V1.5 M12 8V15 M9.5 22L12 15L14.5 22',
  },
  // Lateral raise, front view: a T.
  shoulder_isolation: {
    head: [12, 4.5],
    body: 'M3 8H21 M12 8V15 M9.5 22L12 15L14.5 22',
  },
  // Pull-down, front view: hands high and wide, elbows bent, a bar above.
  vertical_pull: {
    head: [12, 5],
    body: 'M6.5 3L6 9.5L9.5 8.5H14.5L18 9.5L17.5 3 M12 8.5V15 M9.5 22L12 15L14.5 22',
    aux: 'M3.5 2.5H20.5',
  },
  // Row: elbow drawn back past the body, band out to the anchor in front.
  horizontal_pull: {
    head: [9, 4],
    body: 'M9 6.5V14 M7 22L9 14L11 22 M9 8.5L5 11L10 11.5',
    aux: 'M10 11.5H22',
  },
  // Curl: upper arm at the side, forearm folded up.
  elbow_flexion: {
    head: [9, 4],
    body: 'M9 6.5V14 M7 22L9 14L11 22 M9.5 8.5L11 13.5L15.5 9.5',
  },
  // Triceps pushdown: upper arm at the side, forearm driven down against a band from above.
  elbow_extension: {
    head: [9, 4],
    body: 'M9 6.5V14 M7 22L9 14L11 22 M9.5 8.5L11 12.5L14 17',
    aux: 'M14 17L17 2',
  },
  // Squat: hips back, thighs level, arms forward.
  squat: {
    head: [12.5, 5.5],
    body: 'M11.5 8L8 14 M8 14L14 14.5L12 21.5H15 M11 9L18 9.5',
    aux: 'M3 22H21',
  },
  // Hinge: hips back, chest forward and down, arms hanging.
  hinge: {
    head: [19, 6.5],
    body: 'M9 12L17 8.5 M9 12L10.5 16.5L9.5 21.5 M16 9L15.5 15',
    aux: 'M3 22H21',
  },
  // Glute bridge: shoulders down, hips lifted, knees bent.
  hip_extension: {
    head: [3.5, 18.5],
    body: 'M6 19.5L13 13.5L18 12L19 21 M7 19.5L11 21',
    aux: 'M2 22H22',
  },
  // Lunge: long split stance, back knee near the floor.
  lunge: {
    head: [11, 4],
    body: 'M11 6.5V13.5 M11 13.5L16 14L16 21.5 M11 13.5L8 20L4 21.5',
    aux: 'M2 22H22',
  },
  // Hamstring curl, lying face down: heel curling up toward the seat.
  knee_flexion: {
    head: [3.5, 16.5],
    body: 'M6 18H14L19 18.5L16 12',
    aux: 'M2 20.5H22',
  },
  // Leg extension, seated: lower leg kicking out straight.
  knee_extension: {
    head: [8, 4],
    body: 'M8 6.5V14H14L20 11 M8 9L11 12',
    aux: 'M5 16H14 M6 16V22 M13 16V22',
  },
  // Abduction, front view: one leg sweeping out, arrow out.
  abduction: {
    head: [10, 4],
    body: 'M10 6.5V14 M7.5 8H12.5 M7.5 8L7 14 M12.5 8L13 14 M10 14L9 22 M10 14L17 19.5',
    aux: 'M17 14.5L21.5 16 M19.6 14.1L21.5 16L19.6 17.9',
  },
  // Adduction, front view: the same leg, arrow in toward the midline.
  adduction: {
    head: [10, 4],
    body: 'M10 6.5V14 M7.5 8H12.5 M7.5 8L7 14 M12.5 8L13 14 M10 14L9 22 M10 14L17 19.5',
    aux: 'M22 14.5L17.5 16 M19.4 14.1L17.5 16L19.4 17.9',
  },
  // Calf raise: up on the toes on a step, arrow up.
  calf: {
    head: [11, 3.5],
    body: 'M11 6V13.5 M11 13.5L11.5 19.5L14 21.5 M11 8L10 13',
    aux: 'M9 22H18 M6 21V15 M4.5 16.5L6 15L7.5 16.5',
  },
  // Pallof press, front view: hands pressed out at the chest, band pulling from the side.
  anti_rotation: {
    head: [11, 4],
    body: 'M11 6.5V14.5 M8.5 8.5H13.5 M8.5 8.5L11 11.5L13.5 8.5 M8.5 22L11 14.5L13.5 22',
    aux: 'M11 11.5H22',
  },
  // Forearm plank: one straight line, propped on the elbows.
  anti_extension: {
    head: [19.5, 12.5],
    body: 'M17 14.5L3 20 M17 14.5V20H20.5',
    aux: 'M2 21.5H22',
  },
  // Crunch: lying, knees bent, shoulders curling up toward them.
  flexion: {
    head: [4.5, 13],
    body: 'M11 20Q7 20 6 15.5 M11 20L15.5 14L19 21 M6.5 16L11 13.5',
    aux: 'M2 21.5H22',
  },
  // Side plank: a diagonal line on one arm, the other arm to the sky.
  lateral_flexion: {
    head: [18, 9.5],
    body: 'M3 21L16 12 M16 12V21 M16 12V4',
    aux: 'M2 21.5H22',
  },
  // Conditioning: a runner mid-stride.
  conditioning: {
    head: [14.5, 3.5],
    body: 'M13.5 6L10.5 13 M12.5 8L9 10.5L7 8.5 M12.5 8L16 10.5L18.5 9 M10.5 13L15 16L14 21.5 M10.5 13L8 17L4 15.5',
  },
};
