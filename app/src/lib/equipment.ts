/**
 * The equipment a user can say they have: everything the engine gates on (§5.3), as grouped,
 * human-labelled options. Shared by Generate's "Available equipment" checklist and onboarding's
 * equipment step, so both ask the same question in the same words.
 */
import type { Anchor } from '@roamfit/data';
import { SINGLE_BANDS } from '@roamfit/engine';
import type { BandSettings } from '@roamfit/engine';

/**
 * §5.3 available equipment, as a grouped checklist rather than a wrap of chips.
 *
 * Bodyweight exercises are always eligible for a workout and are not shown here at all — there is
 * nothing the user could lack, so there is nothing to ask. Band exercises need Resistance bands
 * (see `BANDS_ROW`), and those that need no fixed point (self-low, stance, feet, thigh-loop) need
 * nothing more. Only equipment the engine actually
 * needs to gate on appears: a band anchored to a low/mid/high point, or a bar/bench.
 *
 * Two problems with the old presentation, all fixed here:
 *  - the labels were raw enum values (`self-low`, `thigh-loop`, `anchor-mid`), which mean nothing
 *    to a user deciding what they can safely tie a band to;
 *  - multi-select chips looked identical to the single-select Time/Focus/Difficulty controls above,
 *    so nothing signalled that these behave differently (those are now scrolling pickers, which
 *    separates the two kinds of choice further still).
 *
 * Track 14 adds a second group, "Cardio gear", for gear that isn't a fixed point at all (a jump
 * rope). The list is no longer only anchors in the literal sense, so each group carries its own
 * title rather than the checklist having one; "Needs something to anchor to" still describes the
 * first group correctly on its own.
 */
export const ANCHOR_GROUPS: {
  title: string;
  anchors: { value: Anchor; label: string; hint?: string; needsBands?: boolean }[];
}[] = [
  {
    title: 'Needs something to anchor to',
    anchors: [
      // Track 37b — no suggested objects. A low, mid or high anchor point is anything the user
      // trusts to hold a band under tension; the safety guide (Settings) covers how to choose one.
      {
        value: 'anchor-low',
        label: 'Low band anchor point',
        hint: 'around ankle height',
        needsBands: true,
      },
      {
        value: 'anchor-mid',
        label: 'Mid band anchor point',
        hint: 'around waist to chest height',
        needsBands: true,
      },
      {
        value: 'anchor-high',
        label: 'High band anchor point',
        hint: 'above head height',
        needsBands: true,
      },
      {
        value: 'low-bar',
        label: 'Waist-height bar',
        hint: 'strong enough to hang your weight from',
      },
      { value: 'pullup-bar', label: 'Pull-up bar', hint: 'takes your full hanging weight' },
      {
        value: 'body-support',
        label: 'Bench or step',
        hint: 'stable enough to press or step up on',
      },
    ],
  },
  {
    title: 'Cardio gear',
    anchors: [{ value: 'jump-rope', label: 'Jump rope', hint: 'for rope skipping moves' }],
  },
];

export const ANCHOR_COUNT = ANCHOR_GROUPS.reduce((n, g) => n + g.anchors.length, 0);
export const VISIBLE_ANCHOR_VALUES: readonly Anchor[] = ANCHOR_GROUPS.flatMap((g) =>
  g.anchors.map((a) => a.value),
);

/**
 * Resistance bands, the one piece of equipment that is not an `Anchor`: whether the user has any is
 * `bandSettings.owned` (Track 37i), which the engine already reads to drop every band exercise. The
 * checklist shows it first, because the low/mid/high anchor points only mean something to a user
 * with a band to tie to them — those rows are disabled until it is ticked.
 */
export const BANDS_ROW = {
  label: 'Resistance bands',
  hint: 'loop bands for banded exercises; choose which in Your bands',
};

export function hasBands(settings: Pick<BandSettings, 'owned'>): boolean {
  return settings.owned.length > 0;
}

/** Ticking the row on gives every band; the detailed set (and any custom names) is Your bands. */
export function bandsToggled(settings: Pick<BandSettings, 'owned'>): Partial<BandSettings> {
  return { owned: hasBands(settings) ? [] : [...SINGLE_BANDS] };
}

/** The anchors that count as selected: a band anchor point is not selected without bands. */
export function effectiveAnchors(anchors: readonly Anchor[], bands: boolean): Anchor[] {
  const gated = new Set(
    ANCHOR_GROUPS.flatMap((g) => g.anchors.filter((a) => a.needsBands).map((a) => a.value)),
  );
  return anchors.filter((a) => bands || !gated.has(a));
}
