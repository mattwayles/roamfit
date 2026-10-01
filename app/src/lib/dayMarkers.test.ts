import { FOCUS_TONE } from './focusLabels';
import { markerTone } from './dayMarkers';
import { daylightTheme, goldenHourTheme } from '../theme';

describe('markerTone', () => {
  it('is null for an untrained day, sky for travel, gold for quick, the focus tone for trained', () => {
    expect(markerTone('none')).toBeNull();
    expect(markerTone('travel')).toBe('sky');
    expect(markerTone('quick')).toBe('gold');
    expect(markerTone('legs')).toBe(FOCUS_TONE.legs);
    expect(markerTone('cardio')).toBe('rose');
  });

  it('agrees with the theme semantic maps in both themes', () => {
    for (const t of [goldenHourTheme, daylightTheme]) {
      expect(t.colors[markerTone('travel')!]).toBe(t.dayMarker.travel);
      expect(t.colors[markerTone('quick')!]).toBe(t.dayMarker.quick);
      for (const f of ['upper', 'legs', 'abs', 'full', 'cardio'] as const) {
        expect(t.colors[markerTone(f)!]).toBe(t.trainedColor(f));
      }
    }
  });
});
