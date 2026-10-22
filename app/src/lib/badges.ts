/**
 * Track 38c — the badge shelf view model. Pure: takes the earned rows (store) and the facts
 * snapshot (store) and says what to draw. Whether something is earned is the engine's call; this
 * only groups, orders and words it.
 *
 * Never punish (invariant 4): a locked badge only ever carries neutral progress ("12 of 25"),
 * a badge is never removed, and nothing here counts what is missing in a way that reads as a debt.
 */
import {
  BADGES,
  BADGE_CATEGORIES,
  badgeProgress,
  getBadge,
  nextBadges,
  type BadgeCategory,
  type BadgeDefinition,
  type BadgeFacts,
  type BadgeProgress,
  type BadgeTier,
} from '@roamfit/engine';
import type { badgesRepo } from '@roamfit/store';
import { formatFullLocalDate } from './sessionHistory';

export type EarnedBadgeRecord = badgesRepo.EarnedBadgeRecord;

export interface ShelfBadge {
  def: BadgeDefinition;
  earned: boolean;
  /** Earned and not yet shown to the user (the NEW dot). */
  unseen: boolean;
  /** `YYYY-MM-DD` the badge was earned (or, for a retroactive one, found). Null while locked. */
  localDate: string | null;
  /** The session it was earned in; null when locked or found by the backfill. */
  sessionId: string | null;
  retroactive: boolean;
  /** Progress while locked; null once earned. */
  progress: BadgeProgress | null;
  /** Hidden and still locked: drawn as a "?" and not named. */
  mystery: boolean;
}

export interface ShelfSection {
  category: BadgeCategory;
  title: string;
  badges: ShelfBadge[];
}

export interface BadgeShelf {
  earnedCount: number;
  /** Everything that can be shown with the current settings (Passport badges only when on). */
  totalCount: number;
  unseenCount: number;
  /** Sections in category order; empty categories are left out. */
  sections: ShelfSection[];
  /** Earned, newest first. */
  recent: ShelfBadge[];
  /** Up to 3 locked badges that already have some progress, closest first. */
  almostThere: ShelfBadge[];
  /** The single closest locked badge (any progress, so a fresh user is pointed at the first one). */
  next: ShelfBadge | null;
}

export const CATEGORY_TITLES: Record<BadgeCategory, string> = {
  showing_up: 'Showing up',
  climbing: 'Climbing',
  pushing: 'Pushing',
  exploring: 'Exploring',
};

/** "12 of 25" - neutral, never a remainder. Long timer totals stay as plain numbers. */
export function progressText(p: BadgeProgress): string {
  return `${p.current} of ${p.target}`;
}

export function buildBadgeShelf(
  earnedRows: readonly EarnedBadgeRecord[],
  facts: BadgeFacts,
): BadgeShelf {
  const byId = new Map(earnedRows.map((r) => [r.badgeId, r]));
  const earnedIds = new Set(byId.keys());

  const shelfOf = (def: BadgeDefinition): ShelfBadge => {
    const row = byId.get(def.id);
    if (row) {
      return {
        def,
        earned: true,
        unseen: row.seenAt === null,
        localDate: row.localDate,
        sessionId: row.sessionId,
        retroactive: row.retroactive,
        progress: null,
        mystery: false,
      };
    }
    return {
      def,
      earned: false,
      unseen: false,
      localDate: null,
      sessionId: null,
      retroactive: false,
      progress: badgeProgress(facts, def),
      mystery: def.hidden === true,
    };
  };

  // Shown: everything earned (a retired badge still resolves), plus the live catalog minus
  // Passport badges while Passport is off.
  const visible = BADGES.filter(
    (def) => earnedIds.has(def.id) || (!def.retired && !(def.passport && !facts.passportEnabled)),
  );

  const sections: ShelfSection[] = BADGE_CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    badges: visible.filter((d) => d.category === category).map(shelfOf),
  })).filter((s) => s.badges.length > 0);

  const earned = earnedRows
    .map((r) => {
      const def = getBadge(r.badgeId);
      return def ? { row: r, shelf: shelfOf(def) } : null;
    })
    .filter((x): x is { row: EarnedBadgeRecord; shelf: ShelfBadge } => x !== null);
  const recent = [...earned]
    .sort(
      (a, b) =>
        b.row.earnedAt.localeCompare(a.row.earnedAt) || b.row.badgeId.localeCompare(a.row.badgeId),
    )
    .map((x) => x.shelf);

  const closest = nextBadges(facts, earnedIds, 3).map(shelfOf);
  // Before the first badge, point at the first one in the catalog ("First Steps"), not at whatever
  // the starting state happens to put a quarter of the way along (a ladder's first rung counts as
  // rung 1), and skip the "Almost there" row - nothing is almost there yet.
  const fresh = earned.length === 0;
  const first = fresh
    ? BADGES.find((d) => !d.retired && !d.hidden && !(d.passport && !facts.passportEnabled))
    : undefined;

  return {
    earnedCount: earned.length,
    totalCount: visible.length,
    unseenCount: earned.filter((x) => x.shelf.unseen).length,
    sections,
    recent,
    almostThere: fresh ? [] : closest.filter((b) => (b.progress?.current ?? 0) > 0),
    next: first ? shelfOf(first) : (closest[0] ?? null),
  };
}

/** Accessibility label for an emblem: "<name>, earned <date>" or "<name>, locked, 3 of 25". */
export function badgeLabel(b: ShelfBadge): string {
  if (b.earned) {
    return b.localDate && !b.retroactive
      ? `${b.def.name}, earned ${formatFullLocalDate(b.localDate)}`
      : `${b.def.name}, earned`;
  }
  if (b.mystery) return 'Hidden badge, locked';
  return b.progress
    ? `${b.def.name}, locked, ${progressText(b.progress)}`
    : `${b.def.name}, locked`;
}

/** The badges a session earned, as shelf entries for the completion screen: `newBadgeIds` in the
 *  order the engine gave them, resolved against the rows just written. A retroactive row (found by
 *  the backfill, never earned in a session) and an id the catalog does not know are skipped,
 *  so the screen can only ever celebrate what this session really earned. */
export function completionBadges(
  newBadgeIds: readonly string[],
  earnedRows: readonly EarnedBadgeRecord[],
): ShelfBadge[] {
  const byId = new Map(earnedRows.map((r) => [r.badgeId, r]));
  const out: ShelfBadge[] = [];
  for (const id of newBadgeIds) {
    const row = byId.get(id);
    const def = getBadge(id);
    if (!row || !def || row.retroactive) continue;
    out.push({
      def,
      earned: true,
      unseen: row.seenAt === null,
      localDate: row.localDate,
      sessionId: row.sessionId,
      retroactive: false,
      progress: null,
      mystery: false,
    });
  }
  return out;
}

/** The share sheet text for a badge. */
export function badgeShareText(def: BadgeDefinition): string {
  return `Earned the ${def.name} badge on Wanderlift`;
}

export interface SeriesContext {
  /** 0-based position of the badge within its series. */
  index: number;
  total: number;
  earnedCount: number;
  /** Per member, in order: earned or not (for Pips). */
  earned: boolean[];
  /** "3rd of 8 in this series". */
  label: string;
  prev: ShelfBadge | null;
  next: ShelfBadge | null;
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Where a badge sits in its series, among the badges the shelf shows (catalog order is tier
 *  order). Null for a lone badge, which has no series to step through. */
export function seriesContext(all: readonly ShelfBadge[], badge: ShelfBadge): SeriesContext | null {
  const members = all.filter((b) => b.def.series === badge.def.series);
  const index = members.findIndex((b) => b.def.id === badge.def.id);
  if (members.length < 2 || index < 0) return null;
  return {
    index,
    total: members.length,
    earnedCount: members.filter((b) => b.earned).length,
    earned: members.map((b) => b.earned),
    label: `${ordinal(index + 1)} of ${members.length} in this series`,
    prev: members[index - 1] ?? null,
    next: members[index + 1] ?? null,
  };
}

/** "Thursday, October 1, 2026 · Full body · 24 min" - the workout a badge was earned in. */
export function earnedDuringLabel(view: {
  dateLabel: string;
  focusLabel: string;
  minutes: number;
}): string {
  return `${view.dateLabel} · ${view.focusLabel} · ${view.minutes} min`;
}

export interface SeriesTrail {
  series: string;
  category: BadgeCategory;
  /** Members the shelf shows, in tier order. Always 2 or more. */
  nodes: ShelfBadge[];
  earnedCount: number;
  /** First locked node; null once the whole trail is earned. */
  current: ShelfBadge | null;
  /** Index of `current` in `nodes`; -1 when complete. */
  currentIndex: number;
  /** The badge the row is named after: the current node, or the last one once complete. A hidden
   *  badge that is still locked stays "Hidden badge". */
  title: string;
  /** Neutral progress toward the current node ("31 of 50"), else "3 of 8 earned" / "All 8 earned". */
  subtitle: string;
}

export interface SectionTrails {
  category: BadgeCategory;
  title: string;
  /** Multi-badge series, in catalog order. */
  trails: SeriesTrail[];
  /** One-off badges (a series that shows just one badge). */
  singles: ShelfBadge[];
  earned: number;
  total: number;
}

/** Trail name for a badge: a locked hidden one is never named. */
function trailName(b: ShelfBadge): string {
  return b.mystery ? 'Hidden badge' : b.def.name;
}

/** Splits each shelf section into series trails and singles. The shelf has already applied the
 *  visibility rules (Passport, retired-only-if-earned, mystery), so a series is judged by the
 *  members it shows: one visible member makes it a single. */
export function buildSeriesTrails(sections: readonly ShelfSection[]): SectionTrails[] {
  return sections.map((section) => {
    const bySeries = new Map<string, ShelfBadge[]>();
    for (const b of section.badges) {
      const list = bySeries.get(b.def.series);
      if (list) list.push(b);
      else bySeries.set(b.def.series, [b]);
    }
    const trails: SeriesTrail[] = [];
    const singles: ShelfBadge[] = [];
    for (const [series, nodes] of bySeries) {
      if (nodes.length < 2) {
        singles.push(nodes[0]!);
        continue;
      }
      const earnedCount = nodes.filter((n) => n.earned).length;
      const currentIndex = nodes.findIndex((n) => !n.earned);
      const current = currentIndex >= 0 ? nodes[currentIndex]! : null;
      const subtitle = !current
        ? `All ${nodes.length} earned`
        : current.progress && !current.mystery
          ? progressText(current.progress)
          : `${earnedCount} of ${nodes.length} earned`;
      trails.push({
        series,
        category: section.category,
        nodes,
        earnedCount,
        current,
        currentIndex,
        title: trailName(current ?? nodes[nodes.length - 1]!),
        subtitle,
      });
    }
    return {
      category: section.category,
      title: section.title,
      trails,
      singles,
      earned: section.badges.filter((b) => b.earned).length,
      total: section.badges.length,
    };
  });
}

/** Earned badges per tier, for the hero's tally. */
export function tierTally(shelf: Pick<BadgeShelf, 'recent'>): Record<BadgeTier, number> {
  const tally: Record<BadgeTier, number> = { bronze: 0, silver: 0, gold: 0, summit: 0 };
  for (const b of shelf.recent) tally[b.def.tier] += 1;
  return tally;
}
