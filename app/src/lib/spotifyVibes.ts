/**
 * The genre/era "vibes" the browse sheet lets someone pick before searching Spotify for workout
 * playlists. Pure data + two small functions — no I/O, so it is unit-testable in node.
 *
 * **Why this exists.** An unfiltered "workout" search returns the same women-targeted, algorithm-
 * gamed playlists on every open. A vibe narrows the *query* ("metal gym", "90s workout") so the
 * results match the music someone actually trains to; `getFitnessContent` then samples a few of a
 * vibe's terms at random so the list also differs between opens.
 *
 * **Ids are stable identifiers — treat them like `level_id`.** They get persisted (the user's
 * chosen vibes, recents, favorites). Never rename or reuse an id once shipped; add a new one, and
 * change `label`/`terms` freely.
 *
 * **Every term must contain a word `FITNESS_NAME` matches.** Search also matches descriptions and
 * owners, and `getFitnessContent` drops any hit whose *name* doesn't look like fitness. A term like
 * "metal" alone would surface playlists the name filter then discards; "metal gym" asks for what
 * the filter will keep. The test enforces this for the whole catalog.
 */

/** A search hit only counts as a fitness playlist if its name says so — search also matches on
 *  description and owner, which is how unrelated "vibe" playlists sneak in. */
export const FITNESS_NAME =
  /workout|gym|hiit|cardio|running|\brun\b|training|fitness|lift|cycl|spin|sweat|pump|bootcamp|crossfit/i;

export interface SpotifyVibe {
  id: string;
  label: string;
  /** Search queries, each containing a workout word (see header). */
  terms: string[];
}

/** The id used when nothing (or nothing recognised) is selected. */
export const DEFAULT_VIBE_ID = 'anything';

export const SPOTIFY_VIBES: readonly SpotifyVibe[] = [
  {
    id: 'anything',
    label: 'Anything',
    terms: ['workout', 'gym', 'hiit', 'running', 'strength training', 'cardio'],
  },
  {
    id: 'rock',
    label: 'Rock',
    terms: [
      'rock workout',
      'rock gym',
      'hard rock lifting',
      'rock training',
      'rock cardio',
      'rock running',
    ],
  },
  {
    id: 'metal',
    label: 'Metal',
    terms: [
      'metal workout',
      'metal gym',
      'heavy metal lifting',
      'metal training',
      'metal cardio',
      'metal running',
    ],
  },
  {
    id: 'hiphop',
    label: 'Hip-hop',
    terms: [
      'hip hop workout',
      'rap gym',
      'hip hop lifting',
      'rap workout',
      'hip hop training',
      'hip hop running',
    ],
  },
  {
    id: 'electronic',
    label: 'Electronic',
    terms: [
      'edm workout',
      'electronic gym',
      'techno training',
      'edm cardio',
      'house running',
      'electronic hiit',
    ],
  },
  {
    id: 'punk',
    label: 'Punk',
    terms: [
      'punk workout',
      'punk rock gym',
      'punk running',
      'punk training',
      'punk cardio',
      'pop punk workout',
    ],
  },
  {
    id: 'classic-rock',
    label: 'Classic rock',
    terms: [
      'classic rock workout',
      'classic rock gym',
      'classic rock lifting',
      'classic rock training',
      'classic rock cardio',
      'classic rock running',
    ],
  },
  {
    id: 'alternative',
    label: 'Alternative',
    terms: [
      'alternative workout',
      'alternative rock gym',
      'indie workout',
      'alternative training',
      'alternative cardio',
      'alternative running',
    ],
  },
  {
    id: 'country',
    label: 'Country',
    terms: [
      'country workout',
      'country gym',
      'country lifting',
      'country training',
      'country cardio',
      'country running',
    ],
  },
  {
    id: 'pop',
    label: 'Pop',
    terms: ['pop workout', 'pop gym', 'pop cardio', 'pop running', 'pop hiit', 'pop training'],
  },
  {
    id: '80s',
    label: '80s',
    terms: [
      '80s workout',
      '80s gym',
      '80s cardio',
      '80s running',
      '80s training',
      '80s rock workout',
    ],
  },
  {
    id: '90s',
    label: '90s',
    terms: [
      '90s workout',
      '90s gym',
      '90s cardio',
      '90s running',
      '90s training',
      '90s rock workout',
    ],
  },
  {
    id: '2000s',
    label: '2000s',
    terms: [
      '2000s workout',
      '2000s gym',
      '2000s cardio',
      '2000s running',
      '2000s training',
      '2000s rock workout',
    ],
  },
];

export function isKnownVibeId(id: string): boolean {
  return SPOTIFY_VIBES.some((v) => v.id === id);
}

/** Union (order-preserving, deduped) of the selected vibes' terms. Empty, or only-unknown, ids fall
 *  back to the `anything` vibe; unknown ids alongside known ones are ignored. */
export function resolveVibeQueries(vibeIds: readonly string[]): string[] {
  const picked = SPOTIFY_VIBES.filter((v) => vibeIds.includes(v.id));
  const vibes = picked.length > 0 ? picked : SPOTIFY_VIBES.filter((v) => v.id === DEFAULT_VIBE_ID);
  return [...new Set(vibes.flatMap((v) => v.terms))];
}
