## Track: 23 — Spotify browse: vibe picker, fresh results, recents + favorites
Last updated: 2026-10-02

### The ask (user feedback on Track 20's browse sheet)
1. Results skew heavily to women-targeted playlists ("Women's Workout", "Baddie Girl Playlist");
   the user (35, male) wants results tuned to the vibe *they* want. → Ask for a vibe, build the
   queries from it.
2. Same results every time. → Randomize so the same vibe still gives fresh results.
3. A playlist you play goes into "Recently played"; you can favorite one so it isn't lost; both
   show alongside new search results, collapsible.

### Read before starting
`app/src/lib/spotifyRemote.ts` (`getFitnessContent` and its header), `app/src/components/SpotifyControls.tsx`,
STATUS-20-spotify-browse.md, `packages/store/src/migrations/0022_theme_preference.sql` +
`repositories/users.ts` (the column-on-users precedent), `0015_manual_day_markers.sql` (the
per-user-table precedent).

### Plan (three increments; A and B are independent, C needs both)

**A — store layer (`packages/store` only).**
- Migration `0023_spotify_playlists.sql`, embedded in `migrations/data.ts`, mirrored in `schema.ts`:
  - `users.spotify_vibes TEXT NOT NULL DEFAULT '[]'` — JSON array of vibe ids (stable strings).
  - Table `spotify_playlists` (`user_id TEXT NOT NULL DEFAULT 'local'`, `playlist_id`, `uri`,
    `name`, `owner` nullable, `last_played_at` nullable ISO, `play_count INTEGER NOT NULL DEFAULT 0`,
    `favorited_at` nullable ISO), unique on `(user_id, playlist_id)`.
- Repository `repositories/spotifyPlaylists.ts`: `recordPlaylistPlayed`, `setPlaylistFavorite`
  (upserts — you can favorite a search result you never played), `listFavoritePlaylists` (newest
  favorite first), `listRecentPlaylists(limit)` (played, not favorited, newest first),
  pruning so non-favorited, played rows are capped at 25. `users.ts` gains `spotifyVibes: string[]`
  read/patch (bad JSON → `[]`). Exported from the package index. Tests in the same commit.
- Not synced — note it on BACKLOG's "don't sync" line.

**B — search lib (`app/src/lib` only).**
- New `app/src/lib/spotifyVibes.ts`: the vibe catalog — `{ id, label, terms }[]` with stable ids:
  Rock, Metal, Hip-Hop, Electronic, Punk, Classic Rock, Alternative, Country, Pop, 80s, 90s,
  2000s, plus `anything` (today's generic terms). Each vibe's terms pair the genre with workout
  words ("rock workout", "rock gym", "rock lifting", "hard rock training", …) so the existing
  name filter still applies sensibly.
- `getFitnessContent(vibeIds, { random })`: builds the query pool from the selected vibes
  (empty / unknown → `anything`), samples ~6 queries, gives each a random `offset` (0/10/20/30 —
  shallow, so relevance holds), round-robin + dedupe as today, then shuffles. `random` is
  injectable (defaults to `Math.random`) so tests are deterministic. Optional `excludeIds` so
  favorites/recents aren't repeated as "fresh" results.
- Tests updated in `spotifyRemote.test.ts` + new `spotifyVibes.test.ts`.

**C — UI (`SpotifyControls.tsx`), after A + B are merged.**
- Sheet root: horizontally scrolling vibe `Chip` row (multi-select, persisted to
  `users.spotify_vibes`, pre-selected from last time); changing it re-runs the search.
- Below it, a `SectionList`: **Favorites** (expanded by default), **Recently played** (collapsed by
  default, header shows count), **Fresh picks** (always open, header has a `refresh` icon button
  that re-rolls). Collapsible headers are tappable rows with a chevron. Empty sections are hidden.
- Every playlist row: tap = play, `heart` toggle = favorite, chevron = preview tracks (as today).
- On a successful play of a playlist row → `recordPlaylistPlayed`. Playing a track from inside a
  drilled-in playlist records the parent playlist.
- Favorites/recents render from SQLite even when search fails (offline) — the search error only
  replaces the Fresh picks section.
- Tests in `SpotifyControls.test.tsx`; DESIGN.md Spotify paragraph updated; BACKLOG device-pass
  item; this file closed.

### Done
- [x] Plan written (this file) — b79dcac.
- [x] B — vibe catalog (`app/src/lib/spotifyVibes.ts`, FITNESS_NAME moved there) + randomized,
  partial-failure-tolerant `getFitnessContent(vibeIds, { random, excludeIds })` — 4881bdf.
- [x] A — migration 0023 (`spotify_playlists`, `users.spotify_vibes`), `spotifyPlaylistsRepo`
  (exported from the store index), `UserRecord.spotifyVibes` — 9aba136.

### In progress
- C (UI) is **done but not on master**: commit 3710c81 on branch
  `worktree-agent-a38a25d9734a9dfb2` (worktree `.claude/worktrees/agent-a38a25d9734a9dfb2`),
  already rebased onto 054e116. Touches SpotifyControls.tsx/.test.tsx, ui/IconButton.tsx
  (additive `accessibilityState` prop), docs/BACKLOG.md, docs/DESIGN.md (~L302, ~L437).
  Check in the worktree: typecheck/lint/engine-purity green, store/engine/data/functions green,
  SpotifyControls 36/36 + WorkoutScreen.spotify green; the app suites that failed under load
  (load avg ~82) were 5s timeouts and all pass run alone.
- **Held on the user's call**: the main tree has another session's uncommitted docs/DESIGN.md
  edits (Journey section, disjoint hunks). User chose to wait for that session to commit, then
  land C with a plain `git cherry-pick 3710c81`.

### Next
- Once main tree's docs/DESIGN.md is clean: `git cherry-pick 3710c81`, `npm run check`, remove the
  worktree + branch, close this file.

### Decisions / gotchas
- **Agent worktrees were created from a stale commit (e52637b), not master.** Any subagent
  brief must tell it to verify/reset its base first, and commits are cherry-picked onto master.
- **A concurrent session was editing the main tree mid-track** (session place: `app/src/lib/place.ts`,
  migration `0024_session_place.sql`, Journey/dashboard tests). No file overlap with this track;
  left untouched. Its uncommitted state makes `npm run check` in the main tree fail
  (migrate.test byte-sync, Journey/dashboard suites) — not this track's regression.
- `spotifyPlaylists` repo functions take `now: Date` (other repos take ISO strings) — deliberate,
  per the brief.
- Vibe picker rather than a gendered-term blocklist: the user asked for results tuned to the vibe
  they want, not for a filter. If gendered results still dominate after a device pass, a name
  exclusion is a small follow-up — not built now.
- Recents/favorites live in SQLite (source of truth, offline), not SecureStore/AsyncStorage.
- Default collapse: Favorites open, Recents closed — favorites are the deliberate keepers; recents
  are the long tail that would otherwise push Fresh picks off-screen.
- Randomness: shallow random offsets + query sampling + shuffle. Deep offsets were rejected — they
  trade relevance for novelty.
