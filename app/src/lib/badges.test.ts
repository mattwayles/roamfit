import { BADGES, getBadge } from '@roamfit/engine';
import { GLOSSARY } from './glossary';
import {
  badgeLabel,
  badgeShareText,
  buildBadgeShelf,
  completionBadges,
  earnedDuringLabel,
  progressText,
  seriesContext,
  buildSeriesTrails,
  tierTally,
} from './badges';
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
    // Even though a ladder's starting rung gives another badge a head start, a fresh user is
    // pointed at the first one.
    const withHeadStart = buildBadgeShelf([], emptyBadgeFacts({ highestLevelOrdinal: 1 }));
    expect(withHeadStart.almostThere).toEqual([]);
    expect(withHeadStart.next?.def.id).toBe('sessions_1');
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

describe('completionBadges', () => {
  it('keeps the engine order and only what this session earned', () => {
    const rows = [
      earnedRow('sessions_5', { sessionId: 's1' }),
      earnedRow('sessions_1', { sessionId: 's1' }),
      earnedRow('level_ups_1', { retroactive: true }),
    ];
    const out = completionBadges(
      ['sessions_1', 'sessions_5', 'level_ups_1', 'nope_9', 'minutes_60'],
      rows,
    );
    expect(out.map((b) => b.def.id)).toEqual(['sessions_1', 'sessions_5']);
    expect(out.every((b) => b.earned && !b.retroactive)).toBe(true);
  });
});

describe('badgeShareText', () => {
  it('names the badge', () => {
    const def = getBadge('sessions_1')!;
    expect(badgeShareText(def)).toBe(`Earned the ${def.name} badge on Wanderlift`);
  });
});

describe('seriesContext', () => {
  const shelf = buildBadgeShelf([earnedRow('sessions_1')], emptyBadgeFacts());
  const all = shelf.sections.flatMap((s) => s.badges);
  const pick = (id: string) => all.find((b) => b.def.id === id)!;

  it('says where a badge sits in its series and who its neighbours are', () => {
    const c = seriesContext(all, pick('sessions_10'))!;
    expect(c.label).toBe('3rd of 8 in this series');
    expect(c.prev?.def.id).toBe('sessions_5');
    expect(c.next?.def.id).toBe('sessions_25');
    expect(c.earned.filter(Boolean)).toHaveLength(1);
    expect(c.earnedCount).toBe(1);
  });

  it('has no previous at the start or next at the end, and uses 11th-13th correctly', () => {
    expect(seriesContext(all, pick('sessions_1'))!.prev).toBeNull();
    expect(seriesContext(all, pick('sessions_500'))!.next).toBeNull();
    expect(seriesContext(all, pick('sessions_1'))!.label).toBe('1st of 8 in this series');
  });

  it('is null for a lone badge', () => {
    expect(seriesContext(all, pick('all_rounder_4'))).toBeNull();
    expect(seriesContext(all, pick('early_bird_1'))).toBeNull();
  });
});

describe('earnedDuringLabel', () => {
  it('joins date, focus and minutes', () => {
    expect(
      earnedDuringLabel({
        dateLabel: 'Thursday, October 1, 2026',
        focusLabel: 'Legs',
        minutes: 24,
      }),
    ).toBe('Thursday, October 1, 2026 · Legs · 24 min');
  });
});

describe('glossary', () => {
  it('explains badges: earned by milestones, permanent, no streaks', () => {
    const term = GLOSSARY.flatMap((g) => g.terms).find((t) => t.term === 'Badges');
    expect(term?.definition).toMatch(/for good/);
    expect(term?.definition).toMatch(/no streaks/);
  });
});

describe('buildSeriesTrails', () => {
  const facts = emptyBadgeFacts({ sessionsCompleted: 20 });
  const shelf = buildBadgeShelf(
    [earnedRow('sessions_1'), earnedRow('sessions_5'), earnedRow('sessions_10')],
    facts,
  );
  const sections = buildSeriesTrails(shelf.sections);
  const showing = sections.find((s) => s.category === 'showing_up')!;

  it('makes a trail of each multi-badge series and collects the one-offs as singles', () => {
    const sessions = showing.trails.find((t) => t.series === 'sessions')!;
    expect(sessions.nodes).toHaveLength(8);
    expect(sessions.nodes[0]!.def.id).toBe('sessions_1');
    expect(sessions.earnedCount).toBe(3);
    expect(sessions.currentIndex).toBe(3);
    expect(sessions.current!.def.id).toBe('sessions_25');
    expect(sessions.title).toBe(sessions.current!.def.name);
    expect(sessions.subtitle).toBe('20 of 25');
    expect(showing.trails.every((t) => t.nodes.length >= 2)).toBe(true);
    expect(showing.singles.map((b) => b.def.id)).toContain('all_rounder_4');
    // Every shown badge lands in exactly one place.
    for (const s of sections) {
      const placed = s.trails.reduce((n, t) => n + t.nodes.length, 0) + s.singles.length;
      expect(placed).toBe(s.total);
    }
    expect(sections.reduce((n, s) => n + s.earned, 0)).toBe(3);
  });

  it('a finished trail is named for its last badge and counted as all earned', () => {
    const ids = BADGES.filter((b) => b.series === 'sessions').map((b) => b.id);
    const done = buildSeriesTrails(
      buildBadgeShelf(
        ids.map((id) => earnedRow(id)),
        facts,
      ).sections,
    );
    const t = done[0]!.trails.find((x) => x.series === 'sessions')!;
    expect(t.current).toBeNull();
    expect(t.currentIndex).toBe(-1);
    expect(t.subtitle).toBe('All 8 earned');
    expect(t.title).toBe(getBadge(ids[ids.length - 1]!)!.name);
  });

  it('keeps passport series out while Passport is off, and in when on', () => {
    const all = (s: typeof sections) => s.flatMap((x) => x.trails.map((t) => t.series));
    expect(all(sections)).not.toContain('cities');
    const on = buildSeriesTrails(
      buildBadgeShelf([], emptyBadgeFacts({ passportEnabled: true })).sections,
    );
    expect(all(on)).toContain('cities');
  });

  it('never names a locked hidden badge', () => {
    const singles = sections.flatMap((s) => s.singles);
    const early = singles.find((b) => b.def.id === 'early_bird_1')!;
    expect(early.mystery).toBe(true);
    // A trail whose current node were hidden would read "Hidden badge", never its real name.
    const fake = buildSeriesTrails([
      {
        category: 'showing_up',
        title: 'x',
        badges: [
          { ...early, def: { ...early.def, series: 's' } },
          { ...early, def: { ...early.def, series: 's' } },
        ],
      },
    ]);
    expect(fake[0]!.trails[0]!.title).toBe('Hidden badge');
    expect(fake[0]!.trails[0]!.subtitle).toBe('0 of 2 earned');
  });
});

describe('tierTally', () => {
  it('counts earned badges by tier', () => {
    const shelf = buildBadgeShelf(
      [earnedRow('sessions_1'), earnedRow('sessions_5')],
      emptyBadgeFacts(),
    );
    const t = tierTally(shelf);
    expect(t.bronze + t.silver + t.gold + t.summit).toBe(2);
    expect(t.summit).toBe(0);
  });
});
