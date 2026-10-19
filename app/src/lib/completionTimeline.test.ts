import {
  BADGE_GAP_MS,
  buildCompletionTimeline,
  HIGHLIGHT_GAP_MS,
  WORD_STAGGER_MS,
} from './completionTimeline';

describe('completion screen timeline', () => {
  it('orders every beat: words, slam, content, stats, highlights, then the button last', () => {
    const t = buildCompletionTimeline(3, 4, 2);
    expect(t.wordTicks).toHaveLength(2);
    expect(t.wordTicks[1] - t.wordTicks[0]).toBe(WORD_STAGGER_MS);
    expect(t.slam).toBeGreaterThan(t.wordTicks[1]);
    expect(t.content).toBeGreaterThan(t.slam);
    expect(t.statTiles[0]).toBeGreaterThan(t.content);
    expect(t.statsDone).toBeGreaterThan(t.statTiles[3]);
    expect(t.highlights[0]).toBeGreaterThan(t.statsDone);
    expect(t.highlights[1] - t.highlights[0]).toBe(HIGHLIGHT_GAP_MS);
    expect(t.button).toBeGreaterThan(t.highlights[1]);
  });

  it('with no highlights, the button arrives as soon as the stats finish', () => {
    const t = buildCompletionTimeline(2, 3, 0);
    expect(t.highlights).toEqual([]);
    expect(t.button).toBe(t.statsDone);
  });

  it('a one-word headline slams immediately with no ticks', () => {
    const t = buildCompletionTimeline(1, 0, 0);
    expect(t.wordTicks).toEqual([]);
    expect(t.statTiles).toEqual([]);
    expect(t.slam).toBe(120);
  });

  it('with a stamp slot, the slot sits where the button would have, and without one there is none', () => {
    const plain = buildCompletionTimeline(3, 4, 2);
    expect(plain.stamp).toBeNull();
    const withSlot = buildCompletionTimeline(3, 4, 2, true);
    expect(withSlot.stamp).toBe(plain.button);
    expect(withSlot.stamp).toBeGreaterThan(withSlot.highlights[1]);
    expect(buildCompletionTimeline(2, 3, 0, true).stamp).toBe(
      buildCompletionTimeline(2, 3, 0).statsDone,
    );
  });

  it('badges land after the last highlight, one beat apart, and push the button back', () => {
    const plain = buildCompletionTimeline(3, 4, 2);
    expect(plain.badges).toEqual([]);
    const t = buildCompletionTimeline(3, 4, 2, false, 3);
    expect(t.badges).toHaveLength(3);
    expect(t.badges[0]).toBeGreaterThan(t.highlights[1]);
    expect(t.badges[1] - t.badges[0]).toBe(BADGE_GAP_MS);
    expect(t.badges[2] - t.badges[1]).toBe(BADGE_GAP_MS);
    expect(t.button).toBeGreaterThan(t.badges[2]);
    expect(t.button).toBeGreaterThan(plain.button);
  });

  it('with no highlights, badges start just after the stats finish', () => {
    const t = buildCompletionTimeline(2, 3, 0, false, 1);
    expect(t.badges[0]).toBeGreaterThan(t.statsDone);
    expect(t.button).toBeGreaterThan(t.badges[0]);
  });

  it('with badges and a stamp slot, the stamp comes after the last badge', () => {
    const t = buildCompletionTimeline(3, 4, 1, true, 2);
    expect(t.stamp).not.toBeNull();
    expect(t.stamp as number).toBeGreaterThan(t.badges[1]);
    expect(t.stamp).toBe(t.button);
  });
});
