# ADR 0009 — User-assigned demo videos, entered from the workout screen

Date: 2026-09-01
Status: Accepted
Deviates from: spec.md §11.4, "Curated ids live in remote config, never in the bundle" — and the
implied corollary that remote config is the *only* source of a tier-1 video id.

## Decision

A user can paste a YouTube URL into a field beside the "Watch a real person do this" link, while
running a workout, to assign that video to the current exercise. The id persists locally, the
embed appears immediately, and it comes back automatically the next time that exercise is
programmed.

The media ladder gains a tier above the curated one:

1. **User-assigned video** (this ADR) — the id the user pasted for this exercise.
2. **Curated YouTube embed** — remote config, unchanged.
3. **YouTube search link** — unchanged.

## Why this does not violate invariant 8

Invariant 8 is *"never invent a YouTube video id."* Its failure mode is an id that was recalled,
guessed, or constructed rather than checked — one that 404s, region-locks, or quietly points at
the wrong video. A user pasting a link to a video they are looking at is the opposite: the most
directly verified source available, checked by a human against the actual `setup` cue.

The invariant is enforced at one boundary, `parseYouTubeVideoId`:

- Only a real, well-formed single-video URL is accepted. Playlists, channels, and non-YouTube
  hosts are rejected rather than guessed at.
- An id of the wrong length is **rejected, never truncated or padded**. Slicing a 12-character
  lookalike down to 11 would manufacture a well-formed id for a *different* video — invariant 8's
  exact failure mode, arrived at by accident. There is a test for this.
- The store only ever accepts a parsed id, never a URL, so a malformed paste cannot reach the
  player even if a future call site forgets to validate.

## Why not remote config

`remote_video_config` is pull-only: `firestoreSyncWorker` overwrites it from Firestore deltas, and
the operator CLI (`video_db.py`) is the only writer on the other side. A local write there would
be silently clobbered by the next sync — the user's assignment would vanish with no error and no
explanation, which is the worst available outcome.

So the assignment lives on `exercise_state` (per user × exercise), which satisfies invariant 7 and
keeps the two sources distinguishable. A curated id arriving later by sync does not overwrite or
hide the user's own pick; it sits underneath it, and reappears if they clear theirs.

## Design decisions worth not re-litigating

- **User pick beats curated pick.** They chose it deliberately, for this exercise, having just
  watched it. A curated id syncing in later must not silently replace that.
- **User videos are exempt from the two-flag demotion.** Demotion exists to retire a *curated*
  video that turned out wrong. Applying it to the user's own choice would make their video vanish
  after two accidental taps with nothing on screen explaining why. The "this video is wrong or
  broken" control is therefore hidden for a user-assigned video; "Remove my video" replaces it.
- **Assigning clears any existing demotion and flag count.** That verdict was about the previous
  video. Leaving it set would suppress the new assignment immediately.
- **Assigning clears a player error from the current mount**, for the same reason.
- **Both embed tiers still obey offline and metered.** A user-assigned id is a YouTube id, not a
  local asset — it embeds only when a curated one would. Invariant 1 is untouched: nothing on the
  offline path changed, and the field is simply absent offline (as is the search link it
  accompanies).
- **The field is only shown online.** It accompanies the search link, and that is the actual flow:
  go find a good video, come back, paste it. Offering it offline would accept input whose result
  the user could not see.

## Instrumentation

Assignment logs a `user_video_assigned` signal (`{exerciseId, videoId}`). `signal_events.type` is
plain TEXT with no CHECK constraint, so the new value needed no migration. This is also the
natural feed for a future operator flow: exercises many users assign their own video to are
exactly the ones whose curated slot is empty or wrong.

## Schema

Migration `0008_user_video.sql` adds two nullable columns to `exercise_state`:
`user_video_id`, `user_video_assigned_at`. Nullable with no default, so every existing row means
"none assigned" without a backfill.

## Alternatives considered

- **Store the raw URL and parse at render time.** Rejected: it moves an unvalidated string closer
  to the player, and re-parses on every render for no benefit.
- **Write to `remote_video_config` with a `source` column.** Rejected: it still collides with the
  pull-only sync path, and one table serving two writers with different lifecycles is how the
  clobbering bug gets reintroduced later.
- **A settings screen for managing all assignments.** Not built. The request was specifically to
  do this in the moment, mid-workout, where the user has just noticed the video is wrong. A
  management screen is a reasonable later addition; nothing here forecloses it.
