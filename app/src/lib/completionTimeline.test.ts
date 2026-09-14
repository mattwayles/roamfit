import { buildCompletionTimeline, HIGHLIGHT_GAP_MS, WORD_STAGGER_MS } from './completionTimeline';

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
});
