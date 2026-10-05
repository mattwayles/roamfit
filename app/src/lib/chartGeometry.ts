/**
 * Pure geometry for `ProgressChart`: no React, no SVG, so the maths is unit-testable in node.
 *
 * The x axis is **time-proportional**: a point's position is its `local_date` as a whole-day count,
 * so a three-week gap looks like a three-week gap. Dates are parsed from their `YYYY-MM-DD`
 * components and counted with `Date.UTC` — never `new Date('YYYY-MM-DD')` read back in local time,
 * which would shift a day west of Greenwich (invariant 6). UTC is used only as a day-counting
 * calendar here; no instant is ever shown.
 */

export interface SeriesPoint {
  localDate: string;
  value: number;
  /** Points sharing a segment index are drawn in one colour; a change of index starts a new line
   *  (it is also how "this exercise, then that one" reads on a family chart). Default 0. */
  segment?: number;
  /** Start a new line here even within the same segment (a unit change, say). */
  gapBefore?: boolean;
}

export interface ChartMarker {
  localDate: string;
  label: string;
}

export interface ChartBox {
  width: number;
  height: number;
  /** Space reserved for y labels (left), the date labels (bottom) and marker labels (top). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlacedPoint {
  index: number;
  x: number;
  y: number;
  segment: number;
  gapBefore: boolean;
}

export interface Tick {
  value: number;
  y: number;
}

export interface Run {
  segment: number;
  points: PlacedPoint[];
}

export interface ChartLayout {
  points: PlacedPoint[];
  runs: Run[];
  yTicks: Tick[];
  markers: { x: number; label: string; localDate: string }[];
  /** First/last dates on the axis (inclusive of markers inside the range). */
  startDate: string | null;
  endDate: string | null;
  plot: { x0: number; x1: number; y0: number; y1: number };
}

const MS_PER_DAY = 86_400_000;

/** `2026-08-01` -> whole days since the epoch, as a calendar count. NaN for a malformed string. */
export function dayNumber(localDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) return NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

/** A "nice" ascending tick list covering [min, max] with roughly `target` ticks. With `integer`,
 *  the step is never below 1 so a rung chart never labels 2.5. */
export function niceTicks(min: number, max: number, target = 4, integer = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max < min) [min, max] = [max, min];
  if (max === min) {
    const pad = integer ? 1 : Math.max(1, Math.abs(max) * 0.1);
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / Math.max(1, target);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  let step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
  if (integer) step = Math.max(1, Math.round(step));
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function layoutChart(
  series: readonly SeriesPoint[],
  markers: readonly ChartMarker[],
  box: ChartBox,
  opts: { integerTicks?: boolean; zeroBase?: boolean } = {},
): ChartLayout {
  const plot = {
    x0: box.left,
    x1: Math.max(box.left + 1, box.width - box.right),
    y0: box.top,
    y1: Math.max(box.top + 1, box.height - box.bottom),
  };
  const days = series.map((p) => dayNumber(p.localDate));
  const valid = days.every((d) => Number.isFinite(d));
  if (series.length === 0 || !valid) {
    return { points: [], runs: [], yTicks: [], markers: [], startDate: null, endDate: null, plot };
  }
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const span = maxDay - minDay;
  // A small inset so the first/last dots are not clipped by the plot edge.
  const inset = 6;
  const xOf = (day: number) =>
    span === 0
      ? (plot.x0 + plot.x1) / 2
      : plot.x0 + inset + ((day - minDay) / span) * (plot.x1 - plot.x0 - inset * 2);

  const values = series.map((p) => p.value);
  const lo = opts.zeroBase ? Math.min(0, ...values) : Math.min(...values);
  const ticks = niceTicks(lo, Math.max(...values), 4, opts.integerTicks);
  const tMin = ticks[0];
  const tMax = ticks[ticks.length - 1];
  const yOf = (v: number) =>
    tMax === tMin
      ? (plot.y0 + plot.y1) / 2
      : plot.y1 - ((v - tMin) / (tMax - tMin)) * (plot.y1 - plot.y0);

  const points: PlacedPoint[] = series.map((p, i) => ({
    index: i,
    x: xOf(days[i]),
    y: yOf(p.value),
    segment: p.segment ?? 0,
    gapBefore: p.gapBefore ?? false,
  }));

  const runs: Run[] = [];
  for (const pt of points) {
    const last = runs[runs.length - 1];
    if (last && last.segment === pt.segment && !pt.gapBefore) last.points.push(pt);
    else runs.push({ segment: pt.segment, points: [pt] });
  }

  const placedMarkers = markers
    .map((m) => ({ m, d: dayNumber(m.localDate) }))
    .filter(({ d }) => Number.isFinite(d) && d >= minDay && d <= maxDay)
    .map(({ m, d }) => ({ x: xOf(d), label: m.label, localDate: m.localDate }));

  return {
    points,
    runs,
    yTicks: ticks.map((value) => ({ value, y: yOf(value) })),
    markers: placedMarkers,
    startDate: series[days.indexOf(minDay)].localDate,
    endDate: series[days.indexOf(maxDay)].localDate,
    plot,
  };
}

/** Index of the point whose x is nearest `x`; -1 when empty. Ties go to the later point. */
export function nearestPointIndex(points: readonly PlacedPoint[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p.x - x);
    if (d <= bestDist) {
      best = p.index;
      bestDist = d;
    }
  }
  return best;
}

/** `M x y L x y …` for one run. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
}

/** The same run as a step line: hold the old value, then rise/fall at the next point's date. */
export function stepPath(points: readonly { x: number; y: number }[]): string {
  let d = '';
  points.forEach((p, i) => {
    d +=
      i === 0
        ? `M${round(p.x)} ${round(p.y)}`
        : ` L${round(p.x)} ${round(points[i - 1].y)} L${round(p.x)} ${round(p.y)}`;
  });
  return d;
}

const round = (n: number) => Math.round(n * 10) / 10;
