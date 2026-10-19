import { buildBadgeShelf } from './badges';
import { emptyBadgeFacts } from './badges.fixtures';
import { buildPassportSummary } from './dashboard';
import {
  bookPageForCountry,
  bookPageForLabel,
  buildPassportBook,
  travelBadges,
  visaPageOffset,
} from './passportBook';
import { manyPlaces, sessionAt } from './passportBook.fixtures';

const shelfOn = () => buildBadgeShelf([], emptyBadgeFacts({ passportEnabled: true }));
const shelfOff = () => buildBadgeShelf([], emptyBadgeFacts({ passportEnabled: false }));

const twoCountries = () =>
  buildPassportSummary([
    ...manyPlaces(7, 'Portugal', 'PT'),
    sessionAt('2026-03-01', 'Cusco', 'Peru', 'PE'),
  ]);

describe('buildPassportBook', () => {
  it('orders cover, bio, contents, visa pages, endorsements', () => {
    const pages = buildPassportBook(twoCountries(), shelfOn());
    expect(pages.map((p) => p.kind)).toEqual([
      'cover',
      'bio',
      'contents',
      'visa',
      'visa',
      'endorsements',
    ]);
    const visa = pages.filter((p) => p.kind === 'visa');
    expect(visa.map((p) => (p.kind === 'visa' ? p.entries.length : 0))).toEqual([6, 2]);
    expect(visa[1]).toMatchObject({ visaIndex: 1, visaCount: 2 });
  });

  it('bio carries counts, first and latest stamp', () => {
    const bio = buildPassportBook(twoCountries(), shelfOn())[1]!;
    expect(bio).toMatchObject({
      kind: 'bio',
      trainingSince: '2026-01-01',
      placeCount: 8,
      countryCount: 2,
    });
    if (bio.kind !== 'bio') throw new Error('bio');
    expect(bio.first?.label).toBe('City01, PRT');
    expect(bio.latest?.label).toBe('Cusco, PER');
  });

  it('omits contents with fewer than 2 country groups', () => {
    const one = buildPassportSummary(manyPlaces(3));
    expect(buildPassportBook(one, shelfOn()).map((p) => p.kind)).not.toContain('contents');
    // Country-less places do not make a group either.
    const none = buildPassportSummary([sessionAt('2026-01-01', 'Bend')]);
    expect(buildPassportBook(none, shelfOn()).map((p) => p.kind)).not.toContain('contents');
  });

  it('omits endorsements when the shelf has no travel badges', () => {
    expect(travelBadges(shelfOff())).toEqual([]);
    expect(buildPassportBook(twoCountries(), shelfOff()).map((p) => p.kind)).not.toContain(
      'endorsements',
    );
  });

  it('endorsements hold only cities and countries badges, earned or in progress', () => {
    const badges = travelBadges(shelfOn());
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((b) => ['cities', 'countries'].includes(b.def.series))).toBe(true);
  });

  it('zero places is cover and bio (and endorsements), no visa pages', () => {
    const pages = buildPassportBook(buildPassportSummary([]), shelfOn());
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'bio', 'endorsements']);
    expect(pages[1]).toMatchObject({ trainingSince: null, first: null, latest: null });
  });
});

describe('absolute page indexes', () => {
  it('maps a label to its page, offset by cover, bio and contents', () => {
    const s = twoCountries();
    expect(visaPageOffset(s)).toBe(3);
    expect(bookPageForLabel(s, 'City01, PRT')).toBe(3);
    expect(bookPageForLabel(s, 'City06, PRT')).toBe(3);
    expect(bookPageForLabel(s, 'City07, PRT')).toBe(4);
    expect(bookPageForLabel(s, 'Cusco, PER')).toBe(4);
    expect(bookPageForLabel(s, 'Nowhere')).toBeNull();
  });

  it('offset shrinks by one without a contents page', () => {
    const s = buildPassportSummary(manyPlaces(2));
    expect(visaPageOffset(s)).toBe(2);
    expect(bookPageForLabel(s, 'City02, PRT')).toBe(2);
  });

  it('maps a country to its first visa page', () => {
    const s = twoCountries();
    expect(bookPageForCountry(s, 'Portugal')).toBe(3);
    expect(bookPageForCountry(s, 'Peru')).toBe(4);
    expect(bookPageForCountry(s, 'Atlantis')).toBeNull();
  });

  it('the indexes point at pages of the built book', () => {
    const s = twoCountries();
    const pages = buildPassportBook(s, shelfOn());
    const i = bookPageForLabel(s, 'Cusco, PER')!;
    const page = pages[i]!;
    expect(page.kind === 'visa' && page.entries.some((e) => e.label === 'Cusco, PER')).toBe(true);
  });
});
