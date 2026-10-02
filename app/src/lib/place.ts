/**
 * Passport place labels — "Bend, OR, USA". Pure strings; no coordinates anywhere.
 *
 * A place is whatever the geocoder could name: a city, or out in the backcountry a district,
 * county or landmark. The region is kept only when it is already an abbreviation ("OR", "BC"):
 * a spelled-out region would overflow a stamp, so it is dropped rather than guessed at.
 */

/** ISO 3166-1 alpha-2 → alpha-3 for the countries a traveler is likely to stamp. Anything not
 *  listed falls back to its alpha-2 code, which is still a valid abbreviation. */
const ALPHA3: Record<string, string> = {
  AR: 'ARG',
  AT: 'AUT',
  AU: 'AUS',
  BE: 'BEL',
  BR: 'BRA',
  CA: 'CAN',
  CH: 'CHE',
  CL: 'CHL',
  CN: 'CHN',
  CO: 'COL',
  CR: 'CRI',
  CZ: 'CZE',
  DE: 'DEU',
  DK: 'DNK',
  EC: 'ECU',
  EG: 'EGY',
  ES: 'ESP',
  FI: 'FIN',
  FR: 'FRA',
  GB: 'GBR',
  GR: 'GRC',
  HR: 'HRV',
  HU: 'HUN',
  ID: 'IDN',
  IE: 'IRL',
  IL: 'ISR',
  IN: 'IND',
  IS: 'ISL',
  IT: 'ITA',
  JP: 'JPN',
  KE: 'KEN',
  KR: 'KOR',
  MA: 'MAR',
  MX: 'MEX',
  MY: 'MYS',
  NL: 'NLD',
  NO: 'NOR',
  NP: 'NPL',
  NZ: 'NZL',
  PE: 'PER',
  PH: 'PHL',
  PL: 'POL',
  PT: 'PRT',
  RO: 'ROU',
  SE: 'SWE',
  SG: 'SGP',
  TH: 'THA',
  TR: 'TUR',
  TW: 'TWN',
  TZ: 'TZA',
  US: 'USA',
  VN: 'VNM',
  ZA: 'ZAF',
};

export interface PlaceFields {
  city: string | null;
  region?: string | null;
  countryCode?: string | null;
  country?: string | null;
}

/** Region is worth stamping only when it is already short (an abbreviation). */
export function abbreviateRegion(region: string | null | undefined): string | null {
  const r = region?.trim();
  return r && r.length <= 3 ? r.toUpperCase() : null;
}

export function abbreviateCountry(
  countryCode: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const code = countryCode?.trim().toUpperCase();
  if (code) return ALPHA3[code] ?? code;
  return country?.trim() || null;
}

/** "Bend, OR, USA" — each part dropped when unknown (older pins have no region or code). */
export function formatPlace(p: PlaceFields): string | null {
  if (!p.city) return null;
  return [p.city, abbreviateRegion(p.region), abbreviateCountry(p.countryCode, p.country)]
    .filter(Boolean)
    .join(', ');
}
