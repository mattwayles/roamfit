## Track: 6e-video-cli — video_db.py operator CLI (§11.5)
Last updated: 2026-09-01 — **done, this track's committed scope complete**

### Status
Done. `npm run check` and `npm run validate:library` both green (this track touches no
JS/TS workspace at all — verified anyway per CLAUDE.md's "never leave the build broken").
HEAD before this track was `ad042a1`, tree clean.

### Done (commit shas)
- [x] `f444615` — ramp-up: read ORCHESTRATION.md, wave-06-network.md §6, STATUS-6b/6d, spec
  §11.4/§11.5/§4.1's remote-config block, and the prototype `workout_db.py` (found in the
  sibling `ai-monorepo` repo, not this one — see below). Opened this status file with the design
  decisions recorded *before* writing code.
- [x] `2fe0602` — `tools/video_db.py` (six subcommands) + `tools/video_db_test.py` (36 tests,
  stdlib `unittest`). `.gitignore` gains `tools/__pycache__/`.

### What landed
`tools/video_db.py`:
- **`queue`** — uncurated exercises (no `video_id` in the Firestore `video/{id}` doc), ranked
  descending by aggregate `sessions_performed` summed across every user's `exercise_state`
  Firestore doc (collection-group read).
- **`candidates <exercise_id>`** — parses the exercise's existing `video_search` query string,
  runs it through `YouTubeClient.search`, batches results through `videos_details`, and prints
  only what passes all five §11.5 auto-reject rules (title/channel/duration/watch-link), with
  `--verbose` to also show what was rejected and why.
- **`set <exercise_id> <video_id>`** — syntax-checks the id first (11-char `[A-Za-z0-9_-]`,
  cheap, no API call for garbage input), re-validates against the same five auto-reject rules via
  a fresh `videos_details` call, refuses on any failure, and only then writes `video_id` +
  `video_verified_at` (today) + `video_flag_count: 0` to the Firestore `video/{id}` doc.
- **`verify [--stale N]`** — re-checks every currently-curated id via the YouTube oEmbed endpoint
  (no API key/quota needed); dead ones are cleared (`video_id -> null`, never replaced with a
  guess); alive-but-older-than-`--stale`-days (default 365, matching spec) ones are listed for
  re-review, left untouched.
- **`flagged`** — collection-group query over `users/*/exercise_state`, filtered to rows with
  `video_flag_count > 0` or `video_demoted_at` set, aggregated per exercise id (user count, total
  flags, demoted-user count, latest demotion date), sorted most-demoted-first.
- **`status`** — curated / flagged / stale / uncurated counts against the full library.

### Design decisions (see the file's own module docstring + inline comments for the full
reasoning; summarized here)
- **`workout_db.py` isn't in this repo** — it's the daily-workout skill prototype at
  `~/Development/ai-monorepo/skills/health/daily-workout/scripts/workout_db.py`. Read it in full
  for the discipline this brief asked to match: argparse subcommands, `sys.exit("error: ...")`
  on bad input (never a stack trace), validate-before-write, plain readable stdout.
- **Where `set`/`verify` actually write**: Firestore's top-level `video/{exercise_id}` collection,
  through an Admin SDK client. `firestore.rules` (written by 6d) already has
  `match /video/{exerciseId} { allow write: if false; }` with a comment naming this exact tool as
  the intended Admin-SDK writer — confirms the design rather than inventing it.
- **Where `flagged`/`queue` read from**: a Firestore **collection-group** query over every user's
  `exercise_state` subcollection (`users/{uid}/exercise_state/{exerciseId}`), not from
  `video/{exerciseId}.video_flag_count`. Traced this carefully: 6b's local counter lives on
  `exercise_state`; 6d's sync worker pushes `exercise_state` per-uid (LWW), never rolls it up into
  the remote-config doc's own `video_flag_count` field. No Cloud Function exists to do that
  rollup. So `set`'s "resets `video_flag_count`" (spec's literal words) resets the remote-config
  doc's own field — which this tool is the *only* writer of, so it's a real, exclusively-operator-
  controlled counter — while `flagged`'s actual read path is the per-uid collection group, which
  is the one issue #30 names as "reading them back." This is a documented, deliberate design
  choice, not an oversight — recorded here so nobody rebuilds it differently by accident.
- **`queue`'s "ranked by how often programmed"** is approximated as aggregate
  `sessions_performed` (times actually completed, not merely selected-and-possibly-skipped) —
  the only per-exercise usage signal that reaches Firestore in this codebase. Documented as an
  approximation, not the literal metric.
- **Injection boundary**, matching the `ParseFn` (6c) / `FirestoreSyncClient` (6d) precedent:
  `YouTubeClient` and `VideoDbClient` `Protocol`s. `RealYouTubeClient` makes raw `urllib` REST
  calls to `googleapis.com`/`youtube.com/oembed` (no `google-api-python-client` dependency).
  `RealFirestoreVideoDbClient` lazily imports `google-cloud-firestore` inside `__init__` — the
  test suite never imports either real class.
- **Test runner: stdlib `unittest`**, not `pytest` — `pytest` isn't installed in this environment
  and no Python test runner is established anywhere else in the repo; stdlib keeps
  `python3 -m unittest tools.video_db_test` runnable with zero setup, matching CLAUDE.md's
  "prefer standard library" guidance for this track specifically.

### What I verified, and how
- **Every one of the five §11.5 auto-reject rules — verified by mutation, individually.** For
  each of `embeddable`, `privacy_status`, `age_restricted`, `region_restricted`,
  `duration_seconds`, I removed that one `if` block from `auto_reject_reasons` in
  `tools/video_db.py`, re-ran `python3 -m unittest tools.video_db_test`, confirmed the specific
  test(s) targeting that rule failed (and only tests actually exercising that class — e.g.
  removing the region check only broke `test_rejects_region_locked` and the combined shortlist
  test, nothing else), then restored the file from a pre-mutation copy and diffed to confirm the
  restore was byte-identical. Full failure output for each of the five is in this track's
  transcript; not reproduced here to keep this file short, but the transcript is real (used
  `cp`/`diff` to guarantee restoration, not manual re-editing).
- **`set`'s re-validation gate — verified by mutation.** Removed the `if reasons: sys.exit(...)`
  block entirely (re-validation silently skipped) — `test_id_failing_revalidation_is_refused_not_stored`
  failed as expected (store received a call it shouldn't have), all 35 others still passed.
  Restored and diffed clean.
- **`verify`'s dead-id clearing — verified by mutation.** Removed the `if not alive: ... cleared`
  block — `test_dead_id_is_cleared` failed (the id stayed set instead of being nulled). Restored
  and diffed clean.
- **The bundled-video-id refusal in `load_library` — verified by mutation.** Removed the
  `if "video_id" in rec: sys.exit(...)` guard — `test_load_library_refuses_a_library_carrying_a_video_id`
  failed (a synthetic library record carrying `video_id` loaded silently instead of refusing).
  Restored and diffed clean.
- **Never reaches `packages/data`, live check** — `test_real_library_on_disk_carries_no_video_id`
  calls `load_library()` with no path override, i.e. against the *actual* bundled
  `packages/data/library/exercises.json` (200 records) — passes, meaning the real file today
  carries no `video_id` field, same invariant `packages/data/src/validate.ts` enforces
  independently. `test_this_module_has_no_write_path_into_packages_data` is a structural grep
  over the module's own source confirming no `LIBRARY_PATH`/`open(LIBRARY_PATH` write call exists
  anywhere in it (this tool has no write path into the library at all, by construction, not just
  by never being called that way).
- **No key/credential material** — `YOUTUBE_API_KEY`/`GOOGLE_APPLICATION_CREDENTIALS` are read
  only via `os.environ.get`, both with a clear operator-setup error message if unset; re-grepped
  the two new files for `AIza`/literal-key patterns, nothing found.
- **`npm run check` and `npm run validate:library`** both green post-commit — this track added no
  JS/TS files, so this confirms (rather than risks) nothing was disturbed.
- **Full suite**: `python3 -m unittest tools.video_db_test -v` → 36/36 pass, in ~0.008s, zero
  network calls (confirmed by construction: `RealYouTubeClient`/`RealFirestoreVideoDbClient` are
  never instantiated anywhere in the test file).

### What I could NOT verify, stated plainly
- **No real YouTube Data API call was ever made.** `RealYouTubeClient`'s `search`/`videos_details`
  (and the oEmbed liveness check) are proven only against hand-built `VideoDetails`/id lists via
  the fake client — the real HTTP request construction (query params, JSON parsing of an actual
  `search.list`/`videos.list` response shape) is written against the documented API response
  schema, not exercised against a live response. I have no API key in this environment and was
  not asked to obtain one.
- **No real Firestore write or collection-group query was ever made.** Same class of gap as 6d's
  Firestore work — `RealFirestoreVideoDbClient` is written against `google-cloud-firestore`'s
  documented client API (`.collection()`, `.collection_group()`, `.stream()`, `.set()`) but never
  imported or run here; no `GOOGLE_APPLICATION_CREDENTIALS` exists in this environment.
  `google-cloud-firestore` isn't even installed here — `pip show google-cloud-firestore` was not
  attempted since it isn't needed to run the test suite, but that also means the real class's
  import path itself has never successfully executed, only been read for correctness.
- **`firestore.rules`' `allow write: if false` for `/video/{exerciseId}` and the Admin SDK's
  ability to bypass it** — asserted by the Firestore documentation and by 6d's own rules-file
  comment, not exercised against a live rules evaluation (6d already flagged that the rules file
  itself has never run against the Firestore emulator — same underlying gap, not a new one).
- **The YouTube oEmbed endpoint's actual failure modes** (HTTP 401 vs 404 vs timeout for a
  private/deleted/region-locked video) are approximated as "any exception or non-200 = dead" in
  `RealYouTubeClient.oembed_ok` — untested against real responses for each specific failure class.
- **`--verbose` candidates output and the exact `videos.list`/`search.list` JSON field names**
  (`status.embeddable`, `contentDetails.regionRestriction`, etc.) were checked against the YouTube
  Data API v3 reference documentation from training knowledge, not a live call — if the API shape
  has changed since, `_video_details_from_api`'s field extraction could be stale. Worth a real
  smoke-test call by whoever has a key, before relying on this in anger.

### Deliberately cut (scope, not oversight)
- **No local JSON cache/mirror of the Firestore video collection.** `workout_db.py`'s pattern is
  a local file as the system of record; here the system of record is genuinely Firestore (per
  spec: "it writes to remote config... takes effect on every device at the next sync"), so a
  local mirror would just be a second source of truth to keep in sync for no real benefit at CLI
  scale (196-200 exercises, one document read/write per command). Cut deliberately rather than
  half-built.
- **No debug/TestFlight in-app curation mode** — spec names this explicitly as an *optional
  companion*, not required scope ("the CLI is the system of record").
- **No periodic-sweep scheduler** (spec's "a scheduled job re-checks every curated id") — `verify`
  is the manual trigger for that sweep; wiring it to a cron/Cloud Scheduler job is an operator
  deployment concern, not this CLI's job, and no deployment infrastructure exists yet per 6d's
  own carried-forward issue #35/#41.
- **No aggregation of per-user flags into `video/{exerciseId}.video_flag_count`** — see "Design
  decisions" above. This is the one place I'd flag as a genuine, not-fully-closed gap: the spec's
  literal words for `set` ("resets `video_flag_count`") describe a field that today only this CLI
  ever writes to (starts at 0, incremented by nothing), while the actual "loop closes on user
  flags" signal lives entirely in the per-uid collection group `flagged` reads directly. Both
  behaviors are implemented and correct on their own terms; they're just two different counters
  answering two different questions, and nothing in the codebase unifies them. A future Cloud
  Function (on `exercise_state` write, incrementing the sibling `video/{exerciseId}` doc) would
  close this cleanly if a single global counter is ever wanted instead.

### New dependency (noted per CLAUDE.md)
- **`google-cloud-firestore`** (pip, not in any `package.json` — this is a Python tool). Lazily
  imported inside `RealFirestoreVideoDbClient.__init__` only; not installed in this environment,
  not required to run `tools/video_db_test.py`. Operator installs it (`pip install
  google-cloud-firestore`) alongside setting `GOOGLE_APPLICATION_CREDENTIALS` per the existing
  operator runbook in `STATUS-6d-sync-health.md`.
- No new JS/TS/npm dependency — this track never touches any workspace's `package.json`.

### Is issue #30's loop fully closed?
**Yes, for what the issue actually asked.** Issue #30's text: *"Local video-flag state... has no
path to the operator. Closing §11.5's 'loop closes on user flags' needs 6d (sync it somewhere
reachable) + 6e (`video_db.py flagged` reads it)."* 6d synced `exercise_state.video_flag_count`/
`video_demoted_at` to Firestore per-uid; `video_db.py flagged` (this track) reads it back via a
collection-group query and prints a ranked review queue. An operator can now see what got
flagged, re-curate via `candidates`/`set`, and `set` resets the remote-config doc's own flag
counter. The one nuance (see "Deliberately cut" above): the counter `set` resets is not the same
counter `flagged` reads from, because nothing rolls the per-user counter up into the remote-config
doc. That's a real, named gap for a future Cloud Function — but it does not block the operator
workflow issue #30 describes; `flagged` genuinely surfaces what users reported today, and
re-curating genuinely clears the operator's view of it (the exercise drops out of `flagged`
once no user's `exercise_state` still carries a `video_demoted_at`/positive count — which itself
requires a fresh app pull cycle client-side; the CLI's job ends at Firestore).

### Carried-forward issues for the orchestrator to file
1. **No real YouTube Data API or Firestore call has ever been made against this tool** — same
   class of gap as 6c/6d's untested-against-a-live-service caveats. Everything is proven at the
   `YouTubeClient`/`VideoDbClient` interface boundary. Needs a real API key + a real Firestore
   project (6d's operator runbook already covers the Firestore half) before first real use.
2. **Two independent `video_flag_count` counters exist with no reconciliation** — the per-uid
   `exercise_state` counter (what `flagged` reads, what drives local tier-2 demotion) and the
   `video/{exerciseId}` remote-config counter (what `set` resets, per spec's literal wording).
   Nothing rolls one into the other. Low practical impact today (both are individually correct
   for their own purpose) but worth a real decision — likely a Cloud Function trigger — before
   relying on the remote-config counter as an aggregate signal.
3. **`YouTubeClient`'s real implementation has never executed against a live response** — field
   names (`status.embeddable`, `contentDetails.regionRestriction`, oEmbed HTTP semantics) are
   written from documented API shape, not confirmed against an actual API call. Worth a manual
   smoke test with a real key before the first real curation session.
4. **No periodic-sweep scheduling** — `verify` is manual-trigger only; spec names a scheduled job
   as the third link-health mechanism. Deployment infrastructure for any scheduled job doesn't
   exist yet (same gap as 6d's un-deployed `functions/`).
