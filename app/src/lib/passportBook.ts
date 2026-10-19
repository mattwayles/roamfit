/**
 * Track 39b - the Passport book's page model. Pure: takes the passport summary (39a) and the badge
 * shelf and says which pages the book has, in order. The screen only draws them.
 *
 * Order: cover, bio, contents (2+ countries), visa pages (6 stamps each), endorsements (travel
 * badges, when the shelf has any). Nothing here counts what is missing (invariant 4).
 */
import {
  PASSPORT_STAMPS_PER_PAGE,
  passportPageForLabel,
  passportVisaPages,
  type PassportCountryGroup,
  type PassportEntry,
  type PassportSummary,
} from './dashboard';
import type { BadgeShelf, ShelfBadge } from './badges';

/** The badge series that make up the Endorsements page. */
export const TRAVEL_BADGE_SERIES: readonly string[] = ['cities', 'countries'];

export type PassportBookPage =
  | { kind: 'cover' }
  | {
      kind: 'bio';
      trainingSince: string | null;
      placeCount: number;
      countryCount: number;
      first: PassportEntry | null;
      latest: PassportEntry | null;
    }
  | { kind: 'contents'; groups: PassportCountryGroup[] }
  | { kind: 'visa'; entries: PassportEntry[]; visaIndex: number; visaCount: number }
  | { kind: 'endorsements'; badges: ShelfBadge[] };

/** Earned and in-progress travel badges, in catalog order. */
export function travelBadges(shelf: BadgeShelf): ShelfBadge[] {
  return shelf.sections
    .flatMap((s) => s.badges)
    .filter((b) => TRAVEL_BADGE_SERIES.includes(b.def.series));
}

export function hasContentsPage(summary: PassportSummary): boolean {
  return summary.countryGroups.length >= 2;
}

/** Cover + bio, plus contents when there is more than one country. */
export function visaPageOffset(summary: PassportSummary): number {
  return 2 + (hasContentsPage(summary) ? 1 : 0);
}

export function buildPassportBook(summary: PassportSummary, shelf: BadgeShelf): PassportBookPage[] {
  const entries = summary.entries;
  let latest: PassportEntry | null = null;
  for (const e of entries) {
    if (latest === null || e.lastLocalDate >= latest.lastLocalDate) latest = e;
  }
  const pages: PassportBookPage[] = [
    { kind: 'cover' },
    {
      kind: 'bio',
      trainingSince: summary.trainingSince,
      placeCount: summary.places.length,
      countryCount: summary.countries.length,
      first: entries[0] ?? null,
      latest,
    },
  ];
  if (hasContentsPage(summary)) pages.push({ kind: 'contents', groups: summary.countryGroups });
  const visa = passportVisaPages(entries);
  visa.forEach((chunk, visaIndex) =>
    pages.push({ kind: 'visa', entries: chunk, visaIndex, visaCount: visa.length }),
  );
  const badges = travelBadges(shelf);
  if (badges.length > 0) pages.push({ kind: 'endorsements', badges });
  return pages;
}

/** Absolute page index of the visa page holding `label`, or null. For Completion's deep link. */
export function bookPageForLabel(summary: PassportSummary, label: string): number | null {
  const visaIndex = passportPageForLabel(summary.entries, label);
  return visaIndex === null ? null : visaPageOffset(summary) + visaIndex;
}

/** Absolute page index of a country's first visa page, or null (unknown / country-less). */
export function bookPageForCountry(summary: PassportSummary, country: string): number | null {
  const group = summary.countryGroups.find((g) => g.country === country);
  if (!group) return null;
  return visaPageOffset(summary) + Math.floor(group.firstEntryIndex / PASSPORT_STAMPS_PER_PAGE);
}
