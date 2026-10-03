/**
 * When each beat of the completion screen lands, in ms from the screen appearing. One pure
 * function so the choreography effect (timers for sound/haptics/confetti) and the render (each
 * stat tile's own animation `delay`) read the same clock — a haptic tick that fires 100ms before
 * the tile it belongs to visibly pops reads as broken, not as celebration.
 */
export const WORD_STAGGER_MS = 200;
export const STAT_STAGGER_MS = 160;
export const HIGHLIGHT_GAP_MS = 1300;
/** How far ahead of a highlight landing its card is scrolled into view. */
export const HIGHLIGHT_SCROLL_LEAD_MS = 320;

export interface CompletionTimeline {
  /** A light tick per headline word except the last. */
  wordTicks: number[];
  /** The last word lands: heavy hit, shake, confetti cannons, rays. */
  slam: number;
  /** Count text / subtitle fade up. */
  content: number;
  /** Each stat tile pops (and its tick fires). */
  statTiles: number[];
  /** Every counter has finished counting. */
  statsDone: number;
  /** Each level-up / Mastery card stamps down. */
  highlights: number[];
  /** The new-stamp slot, when Passport is on: where the screen checks whether this session
   *  earned a stamp (it lands here if so). Null when Passport is off. */
  stamp: number | null;
  /** "Heck yes!" arrives. With a stamp slot this is the earliest it can, i.e. when there is no
   *  stamp to wait for; a stamp that lands pushes it back by `STAMP_SETTLE_MS`. */
  button: number;
}

/** After a new stamp has slammed down: how long it gets to sit alone before "Heck yes!" arrives. */
export const STAMP_SETTLE_MS = 1500;

export function buildCompletionTimeline(
  wordCount: number,
  statTileCount: number,
  highlightCount: number,
  hasStampSlot = false,
): CompletionTimeline {
  const words = Math.max(1, wordCount);
  const wordTicks = Array.from({ length: words - 1 }, (_, i) => i * WORD_STAGGER_MS + 120);
  const slam = (words - 1) * WORD_STAGGER_MS + 120;
  const content = slam + 250;
  const statsStart = content + 200;
  const statTiles = Array.from(
    { length: statTileCount },
    (_, i) => statsStart + i * STAT_STAGGER_MS,
  );
  // 700ms count-up (AnimatedStatCounter's default) + a beat for the landing bump.
  const statsDone = statsStart + Math.max(0, statTileCount - 1) * STAT_STAGGER_MS + 750;
  const highlights = Array.from(
    { length: highlightCount },
    (_, i) => statsDone + 200 + i * HIGHLIGHT_GAP_MS,
  );
  const button = highlightCount > 0 ? highlights[highlights.length - 1] + 1100 : statsDone;
  return {
    wordTicks,
    slam,
    content,
    statTiles,
    statsDone,
    highlights,
    stamp: hasStampSlot ? button : null,
    button,
  };
}
