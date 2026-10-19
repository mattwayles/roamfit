import { BADGES } from './catalog';
import { BADGE_CATEGORIES, BADGE_TIERS } from './types';
import type { BadgeDefinition, BadgeFacts, BadgeProgress } from './types';

const catalogIndex = new Map(BADGES.map((b, i) => [b.id, i]));

export function getBadge(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Neutral progress toward a badge: `current` is capped at `target` and never negative. */
export function badgeProgress(facts: BadgeFacts, def: BadgeDefinition): BadgeProgress {
  const raw = def.measure(facts);
  const current = Math.min(def.target, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return { current, target: def.target, fraction: def.target > 0 ? current / def.target : 1 };
}

export function isBadgeEarned(facts: BadgeFacts, def: BadgeDefinition): boolean {
  return def.measure(facts) >= def.target;
}

/**
 * Badges the facts now qualify for that are not already in `earnedIds`, ordered by category then
 * tier (then catalog order). Retired badges are never awarded. Pure and idempotent: feed the
 * result back in as `earnedIds` and nothing more comes out.
 */
export function evaluateBadges(
  facts: BadgeFacts,
  earnedIds: ReadonlySet<string>,
): BadgeDefinition[] {
  return BADGES.filter((b) => !b.retired && !earnedIds.has(b.id) && isBadgeEarned(facts, b)).sort(
    (a, b) =>
      BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category) ||
      BADGE_TIERS.indexOf(a.tier) - BADGE_TIERS.indexOf(b.tier) ||
      (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0),
  );
}

/**
 * The `n` closest unearned badges, by progress fraction (ties in catalog order). Skips retired
 * and hidden badges, passport badges while Passport is off, and badges with no progress at all
 * only after closer ones (they still fill the list if there is room).
 */
export function nextBadges(
  facts: BadgeFacts,
  earnedIds: ReadonlySet<string>,
  n: number,
): BadgeDefinition[] {
  return BADGES.map((def, i) => ({ def, i }))
    .filter(
      ({ def }) =>
        !def.retired &&
        !def.hidden &&
        !earnedIds.has(def.id) &&
        !(def.passport && !facts.passportEnabled) &&
        !isBadgeEarned(facts, def),
    )
    .map(({ def, i }) => ({ def, i, fraction: badgeProgress(facts, def).fraction }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map(({ def }) => def);
}
