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
