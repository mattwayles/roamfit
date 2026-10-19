import { BADGES } from '@roamfit/engine';
import { buildBadgeShelf, badgeLabel, progressText } from './badges';
import { earnedRow, emptyBadgeFacts } from './badges.fixtures';
import { iconMap } from '../ui';

describe('badge catalog icons', () => {
  it('names a real IconName for every badge', () => {
    const bad = BADGES.filter((b) => !Object.prototype.hasOwnProperty.call(iconMap, b.icon));
    expect(bad.map((b) => `${b.id}:${b.icon}`)).toEqual([]);
  });
});

describe('buildBadgeShelf', () => {
  it('a fresh user: nothing earned, passport and hidden badges kept out of the way', () => {
    const shelf = buildBadgeShelf([], emptyBadgeFacts());
    expect(shelf.earnedCount).toBe(0);
    expect(shelf.unseenCount).toBe(0);
    expect(shelf.recent).toEqual([]);
    expect(shelf.almostThere).toEqual([]);
    // Points at the first one even with no progress.
    expect(shelf.next?.def.id).toBe('sessions_1');
    expect(shelf.sections.map((s) => s.category)).toEqual([
      'showing_up',
      'climbing',
      'pushing',
      'exploring',
    ]);
    const all = shelf.sections.flatMap((s) => s.badges);
    expect(all.some((b) => b.def.passport)).toBe(false);
    expect(all.length).toBe(shelf.totalCount);
    // Hidden + locked are mysteries.
    const early = all.find((b) => b.def.id === 'early_bird_1')!;
    expect(early.mystery).toBe(true);
    expect(badgeLabel(early)).toBe('Hidden badge, locked');
  });

  it('shows passport badges when Passport is on', () => {
    const off = buildBadgeShelf([], emptyBadgeFacts());
    const on = buildBadgeShelf([], emptyBadgeFacts({ passportEnabled: true }));
    expect(on.totalCount).toBeGreaterThan(off.totalCount);
    expect(on.sections.flatMap((s) => s.badges).some((b) => b.def.passport)).toBe(true);
  });

  it('earned rows carry their date, unseen flag and no progress; locked ones carry neutral progress', () => {
    const shelf = buildBadgeShelf(
      [
        earnedRow('sessions_1', { sessionId: 's1', localDate: '2026-10-01' }),
        earnedRow('sessions_5', {
          earnedAt: '2026-10-09T12:00:00.000Z',
          localDate: '2026-10-09',
          seenAt: '2026-10-10T00:00:00.000Z',
        }),
      ],
      emptyBadgeFacts({ sessionsCompleted: 7 }),
    );
    expect(shelf.earnedCount).toBe(2);
    expect(shelf.unseenCount).toBe(1);
    expect(shelf.recent.map((b) => b.def.id)).toEqual(['sessions_5', 'sessions_1']);
    const all = shelf.sections.flatMap((s) => s.badges);
    const first = all.find((b) => b.def.id === 'sessions_1')!;
    expect(first.earned && first.unseen && first.sessionId).toBe('s1');
    expect(first.progress).toBeNull();
    expect(badgeLabel(first)).toBe('First Steps, earned Thursday, October 1, 2026');
    const ten = all.find((b) => b.def.id === 'sessions_10')!;
    expect(ten.progress).toMatchObject({ current: 7, target: 10 });
    expect(progressText(ten.progress!)).toBe('7 of 10');
    expect(badgeLabel(ten)).toBe(`${ten.def.name}, locked, 7 of 10`);
    expect(shelf.almostThere.length).toBeGreaterThan(0);
    expect(shelf.almostThere.length).toBeLessThanOrEqual(3);
    expect(shelf.next?.def.id).toBe('sessions_10');
  });

  it('never drops an earned badge, even a passport one after Passport is turned off', () => {
    const shelf = buildBadgeShelf([earnedRow('cities_3')], emptyBadgeFacts());
    expect(shelf.earnedCount).toBe(1);
    expect(shelf.sections.flatMap((s) => s.badges).some((b) => b.def.id === 'cities_3')).toBe(true);
  });

  it('retroactive badges are labelled without a date', () => {
    const shelf = buildBadgeShelf(
      [earnedRow('sessions_1', { retroactive: true })],
      emptyBadgeFacts({ sessionsCompleted: 1 }),
    );
    expect(badgeLabel(shelf.recent[0]!)).toBe('First Steps, earned');
  });
});
