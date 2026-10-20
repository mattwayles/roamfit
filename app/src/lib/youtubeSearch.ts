/**
 * The "How to" video link: a YouTube search for the exercise's name. Constructed, never a stored
 * or recalled video id (invariant 8), so it cannot 404 — and nothing about it is per-user state.
 */
export function youtubeSearchUrl(exerciseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} Exercise`)}`;
}
