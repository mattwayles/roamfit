import {
  dayNumber,
  layoutChart,
  linePath,
  nearestPointIndex,
  niceTicks,
  stepPath,
} from './chartGeometry';

const box = { width: 300, height: 160, left: 40, right: 10, top: 20, bottom: 20 };

describe('dayNumber', () => {
  it('counts whole calendar days, across month and year boundaries and leap days', () => {
    expect(dayNumber('2026-01-02') - dayNumber('2026-01-01')).toBe(1);
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    expect(dayNumber('2027-01-01') - dayNumber('2026-01-01')).toBe(365);
  });
  it('is NaN for garbage rather than silently 0', () => {
    expect(dayNumber('nope')).toBeNaN();
  });
});

describe('niceTicks', () => {
  it('covers the range with round steps', () => {
    expect(niceTicks(2, 12)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(0, 100)).toEqual([0, 50, 100]);
  });
  it('never labels fractions on an integer axis, even for a flat series', () => {
    const t = niceTicks(3, 3, 4, true);
    expect(t.every(Number.isInteger)).toBe(true);
    expect(t[0]).toBeLessThan(3);
    expect(t[t.length - 1]).toBeGreaterThan(3);
  });
});

describe('layoutChart', () => {
  it('spaces points in proportion to the days between them', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 5 },
        { localDate: '2026-01-02', value: 6 },
        { localDate: '2026-01-11', value: 9 },
      ],
      [],
      box,
    );
    const [a, b, c] = l.points;
    expect((b.x - a.x) * 9).toBeCloseTo(c.x - b.x, 5);
    expect(a.x).toBeGreaterThanOrEqual(l.plot.x0);
    expect(c.x).toBeLessThanOrEqual(l.plot.x1);
  });

  it('puts higher values higher up (smaller y), inside the plot', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 2 },
        { localDate: '2026-01-05', value: 12 },
      ],
      [],
      box,
    );
    expect(l.points[1].y).toBeLessThan(l.points[0].y);
    for (const p of l.points) {
      expect(p.y).toBeGreaterThanOrEqual(l.plot.y0);
      expect(p.y).toBeLessThanOrEqual(l.plot.y1);
    }
    expect(l.yTicks.length).toBeGreaterThan(1);
  });

  it('centres a single point and survives a flat series', () => {
    const l = layoutChart([{ localDate: '2026-01-01', value: 7 }], [], box);
    expect(l.points).toHaveLength(1);
    expect(Number.isFinite(l.points[0].x)).toBe(true);
    expect(Number.isFinite(l.points[0].y)).toBe(true);
  });

  it('returns an empty layout for no data or a bad date', () => {
    expect(layoutChart([], [], box).points).toEqual([]);
    expect(layoutChart([{ localDate: 'x', value: 1 }], [], box).points).toEqual([]);
  });

  it('splits runs on a segment change or an explicit gap', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 1, segment: 0 },
        { localDate: '2026-01-02', value: 2, segment: 0 },
        { localDate: '2026-01-03', value: 3, segment: 1 },
        { localDate: '2026-01-04', value: 4, segment: 1, gapBefore: true },
      ],
      [],
      box,
    );
    expect(l.runs.map((r) => [r.segment, r.points.length])).toEqual([
      [0, 2],
      [1, 1],
      [1, 1],
    ]);
  });

  it('places markers by date and drops those outside the charted range', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 1 },
        { localDate: '2026-01-11', value: 2 },
      ],
      [
        { localDate: '2026-01-06', label: 'L4' },
        { localDate: '2025-12-01', label: 'L2' },
      ],
      box,
    );
    expect(l.markers).toHaveLength(1);
    expect(l.markers[0].label).toBe('L4');
    expect(l.markers[0].x).toBeCloseTo((l.points[0].x + l.points[1].x) / 2, 5);
  });

  it('carries a marker kind through, defaulting to rung', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 1 },
        { localDate: '2026-01-11', value: 2 },
      ],
      [
        { localDate: '2026-01-04', label: 'L4' },
        { localDate: '2026-01-06', label: 'B3', kind: 'band' },
      ],
      box,
    );
    expect(l.markers.map((m) => [m.label, m.kind])).toEqual([
      ['L4', 'rung'],
      ['B3', 'band'],
    ]);
  });
});

describe('nearestPointIndex / paths', () => {
  it('picks the nearest point and -1 when empty', () => {
    const l = layoutChart(
      [
        { localDate: '2026-01-01', value: 1 },
        { localDate: '2026-01-11', value: 2 },
      ],
      [],
      box,
    );
    expect(nearestPointIndex(l.points, l.plot.x0)).toBe(0);
    expect(nearestPointIndex(l.points, l.plot.x1)).toBe(1);
    expect(nearestPointIndex([], 5)).toBe(-1);
  });

  it('builds line and step paths', () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(linePath(pts)).toBe('M0 10 L10 0');
    expect(stepPath(pts)).toBe('M0 10 L10 10 L10 0');
  });
});
