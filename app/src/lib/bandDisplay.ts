/**
 * Track 37i — how a band prescription reads: the user's own label and colour for a single band, or
 * both for a stacked pair ("B5 + B2"). Band tensions are stored per physical band, so a stacked
 * pair has no record of its own; it is always shown as the two bands it is made of.
 */
import { bandParts } from '@roamfit/engine';
import type { BandId, SingleBandId } from '@roamfit/engine';
import type { BandTension } from '@roamfit/store';

export type BandTensions = Record<SingleBandId, BandTension>;

export interface BandAppearance {
  /** "Red", or "Green + Red" for a pair. */
  label: string;
  /** The heaviest band's colour (the fill), or undefined when the user has no record for it. */
  color: string | undefined;
  /** A stacked pair's lighter band colour, drawn alongside the fill. */
  secondColor?: string;
  stacked: boolean;
}

export function bandAppearance(band: BandId, tensions: BandTensions): BandAppearance {
  const parts = bandParts(band);
  const label = parts.map((p) => tensions[p]?.label ?? p).join(' + ');
  return {
    label,
    color: tensions[parts[0]]?.color,
    secondColor: parts[1] ? tensions[parts[1]]?.color : undefined,
    stacked: parts.length > 1,
  };
}
