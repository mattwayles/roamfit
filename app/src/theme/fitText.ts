/**
 * Shrink-to-fit text sizing, done in JS. Why not `adjustsFontSizeToFit`: on iOS under the New
 * Architecture (RN 0.86 is New-Architecture-only), the native shrink ignores `minimumFontScale`
 * and floors at a hard-coded 4pt (`RCTTextLayoutManager.mm` reads `minimumFontSize`, which JS
 * cannot set). When its fit check fails for every candidate size, it falls to that floor, which is
 * how the Journey stat tiles rendered their numbers at ~4pt.
 *
 * Widths come from the real advance widths in `fontMetrics.ts` (generated from the TTFs by
 * `tools/font_metrics.py`). Kerning is ignored, which can only over-estimate a line's width, so a
 * size picked here never overflows. Pure; Txt supplies the measured width.
 */
import { fontWidths, type FontWidths } from './fontMetrics';

export interface FitTextInput {
  text: string;
  fontFamily: string | undefined;
  /** The unscaled style fontSize, i.e. the size to use when the text fits. */
  fontSize: number;
  letterSpacing?: number;
  /** `fontVariant` includes 'tabular-nums'. */
  tabular?: boolean;
  /** `textTransform: 'uppercase'`. */
  uppercase?: boolean;
  /** Effective Dynamic Type multiplier iOS applies on top of `fontSize`. */
  fontScale?: number;
}

/** Width in pt of one line of `text` at the style size `size`, or null for an unmeasured font. */
export function lineWidth(input: FitTextInput, size: number, text = input.text): number | null {
  const widths: FontWidths | undefined = input.fontFamily
    ? fontWidths[input.fontFamily]
    : undefined;
  if (!widths) return null;
  const scale = input.fontScale ?? 1;
  const s = input.uppercase ? text.toUpperCase() : text;
  let em = 0;
  for (const ch of s) {
    em += (input.tabular ? widths.tabular[ch] : undefined) ?? widths.chars[ch] ?? widths.max;
  }
  // Txt scales letterSpacing with the fitted size, so tracking stays proportional.
  const tracking = (input.letterSpacing ?? 0) * (size / input.fontSize);
  return (em * size + tracking * [...s].length) * scale;
}

/** Whether `text` at `size` wraps into at most `lines` lines of `width` pt (greedy, on spaces —
 *  how the iOS text layout breaks), with no single word wider than a line. */
export function fitsAt(input: FitTextInput, size: number, width: number, lines: number): boolean {
  const whole = lineWidth(input, size);
  if (whole === null) return true;
  if (whole <= width) return true;
  if (lines <= 1) return false;
  const space = lineWidth(input, size, ' ') ?? 0;
  let used = 1;
  let current = 0;
  for (const word of input.text.split(/\s+/).filter(Boolean)) {
    const w = lineWidth(input, size, word) ?? 0;
    if (w > width) return false;
    if (current === 0) current = w;
    else if (current + space + w <= width) current += space + w;
    else {
      used += 1;
      current = w;
      if (used > lines) return false;
    }
  }
  return true;
}

/**
 * The largest style fontSize in [fontSize * minScale, fontSize] at which the text fits `width` in
 * `lines` lines. Returns `fontSize` when it already fits (never grows text) and the floor when even
 * that is too wide (the native ellipsis then takes over, at a legible size). Unmeasured fonts are
 * left at `fontSize`.
 */
export function fitFontSize(
  input: FitTextInput,
  width: number,
  lines: number,
  minScale: number,
): number {
  const max = input.fontSize;
  const min = max * minScale;
  if (width <= 0 || fitsAt(input, max, width, lines)) return max;
  if (!fitsAt(input, min, width, lines)) return min;
  let lo = min;
  let hi = max;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (fitsAt(input, mid, width, lines)) lo = mid;
    else hi = mid;
  }
  return Math.max(min, Math.floor(lo * 4) / 4);
}
