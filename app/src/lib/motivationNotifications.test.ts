import { clampToQuietHours, shiftTime } from './motivationNotifications';

describe('§9.8 quiet hours — never dropped, moved to a gentle default instead', () => {
  it('leaves a daytime time untouched', () => {
    expect(clampToQuietHours('18:00')).toBe('18:00');
  });

  it("moves a late-night time to the quiet window's own end (7am), never silently drops it", () => {
    expect(clampToQuietHours('23:15')).toBe('07:00');
    expect(clampToQuietHours('03:00')).toBe('07:00');
  });

  it('the boundary times themselves are handled consistently (start is quiet, end is not)', () => {
    expect(clampToQuietHours('22:00')).toBe('07:00');
    expect(clampToQuietHours('07:00')).toBe('07:00');
  });

  it('disabling quiet hours leaves any time untouched, including 3am', () => {
    expect(clampToQuietHours('03:00', false)).toBe('03:00');
  });
});

describe('shiftTime — the Settings time stepper, wraps around midnight', () => {
  it('adds and subtracts minutes', () => {
    expect(shiftTime('18:00', 15)).toBe('18:15');
    expect(shiftTime('18:00', -15)).toBe('17:45');
  });

  it('wraps forward past midnight', () => {
    expect(shiftTime('23:50', 15)).toBe('00:05');
  });

  it('wraps backward past midnight', () => {
    expect(shiftTime('00:10', -15)).toBe('23:55');
  });
});
