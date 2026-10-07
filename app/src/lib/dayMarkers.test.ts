import { FOCUS_TONE } from './focusLabels';
import {
  DAY_MARKER_OPTIONS,
  REST_EMOJI,
  markerEmoji,
  markerIsNeutral,
  markerLabel,
  markerTone,
} from './dayMarkers';
import { daybreakTheme, midnightTheme } from '../theme';

describe('markerTone', () => {
  it('is null for an untrained day and for gray travel/rest, gold for quick, the focus tone for trained', () => {
    expect(markerTone('none')).toBeNull();
    expect(markerTone('travel')).toBeNull();
    expect(markerTone('rest')).toBeNull();
    expect(markerIsNeutral('travel')).toBe(true);
    expect(markerIsNeutral('rest')).toBe(true);
    expect(markerIsNeutral('quick')).toBe(false);
    expect(markerTone('quick')).toBe('gold');
    expect(markerTone('legs')).toBe(FOCUS_TONE.legs);
    expect(markerTone('cardio')).toBe('rose');
  });

  it('agrees with the theme semantic maps in both themes', () => {
    for (const t of [midnightTheme, daybreakTheme]) {
      expect(t.dayCellNeutral.border).toBe(t.dayMarker.travel);
      expect(t.dayCellNeutral.border).toBe(t.dayMarker.rest);
      expect(t.colors[markerTone('quick')!]).toBe(t.dayMarker.quick);
      for (const f of ['upper', 'legs', 'abs', 'full', 'cardio'] as const) {
        expect(t.colors[markerTone(f)!]).toBe(t.trainedColor(f));
      }
    }
  });
});

describe('rest day marker', () => {
  it('is offered right after travel, with its own glyph and label', () => {
    const order = DAY_MARKER_OPTIONS.map((o) => o.marker);
    expect(order.indexOf('rest')).toBe(order.indexOf('travel') + 1);
    expect(markerEmoji('rest')).toBe(REST_EMOJI);
    expect(markerLabel('rest')).toBe('Rest day');
  });
});
