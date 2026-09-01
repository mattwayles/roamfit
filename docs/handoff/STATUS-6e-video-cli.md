## Track: 6e-video-cli — video_db.py operator CLI (§11.5)
Last updated: 2026-09-01

### Status
Starting. HEAD at ramp-up: `ad042a1`, tree clean.

### Ramp-up notes (decisions made before writing code)
- **No `workout_db.py` in this repo** — it lives at
  `~/Development/ai-monorepo/skills/health/daily-workout/scripts/workout_db.py` (the prototype
  skill this whole project is based on). Read in full for discipline: argparse subcommands, a
  local JSON/JSONL store, `sys.exit("error: ...")` on invalid input (never a stack trace),
  validate-before-write, everything printed as plain readable text (a `--json` escape hatch only
  where useful). Modeling `video_db.py` on this.
- **Where `set` actually writes.** `firestore.rules` (written by 6d) already anticipates this:
  `/video/{exerciseId}` is `allow read: if signedIn(); allow write: if false` — client-side
  writes are blocked by rule; the comment explicitly says `video_db.py` writes through the Admin
  SDK, which bypasses rules. So `set`/`verify` write to Firestore's top-level `video` collection
  via a Firestore Admin client, not to any local file that's *the* system of record. A local
  JSON mirror is used only as an offline cache/fallback for `status`/`queue` display, never as
  the write target `set` mutates.
- **Where `flagged` reads from.** `exercise_state.video_flag_count`/`video_demoted_at` (6b) sync
  to Firestore as **per-uid** documents (`users/{uid}/exercise_state/{exerciseId}`, per
  `firestore.rules`), not to `video/{exerciseId}` — 6d's own status file confirms this
  ("operator can read it from Firestore once deployed" refers to the per-uid collection, not a
  global aggregate; nothing in this codebase rolls per-user flags up into
  `video/{exerciseId}.video_flag_count`). So `flagged` does a Firestore **collection-group query**
  over every `exercise_state` subcollection, filtering `video_demoted_at != null`, and aggregates
  by exercise id. `video/{exerciseId}.video_flag_count` (the field named in spec §4.1's remote
  schema) is treated as the operator-facing counter `set` resets to 0 on re-curation — distinct
  from, and not automatically fed by, the per-user counter. This is a real, documented gap (no
  Cloud Function rolls one into the other) — noted below, not silently papered over.
- **`queue`'s "ranked by how often programmed"** — no code in this repo tracks "times programmed"
  anywhere that reaches Firestore. `exercise_state.sessionsPerformed` (times actually
  *performed*, synced per-uid) is the closest real signal and is what `queue` sums across users
  as its ranking key. Documented as a deliberate approximation (performed, not merely
  programmed-and-possibly-skipped).
- **Injection boundary, matching 6c/6d's established pattern**: a `VideoDbClient` Protocol
  (Firestore Admin access — video docs + exercise_state collection group) and a `YouTubeClient`
  Protocol (search.list/videos.list/oEmbed). Real implementations lazily import
  `google-cloud-firestore` / use stdlib `urllib` respectively; tests inject fakes. Zero network,
  zero credentials needed to run the test suite.
- Python stdlib only for the CLI itself and for YouTube (raw REST via `urllib`, no
  `google-api-python-client`). `google-cloud-firestore` is the one new dependency, lazily
  imported inside the real Firestore client class only — never imported by the test suite.
- Tests use `unittest` (stdlib) rather than `pytest` — pytest is not installed in this
  environment and nothing else in the repo establishes a Python test runner; stdlib keeps the
  suite runnable with zero setup, per CLAUDE.md's "prefer standard library" guidance.

### In progress
Writing `tools/video_db.py` and `tools/video_db_test.py`.

### Next
- Implement all six subcommands, auto-reject rules, re-validation on `set`.
- Write mutation-style tests (each auto-reject rule and the id-integrity checks must fail when
  the corresponding check is removed).
- Run `npm run check` to confirm nothing JS/TS-side broke (this track shouldn't touch any
  workspace, but verify anyway).
- Update this file to final state with shas and verification detail.
