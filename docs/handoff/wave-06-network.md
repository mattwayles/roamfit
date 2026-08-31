# Wave 6 — Network layer

**Track id:** `6-network` · **Status file:** `docs/handoff/STATUS-6-network.md`
**Spec sections to read:** §7 (all), §11.2–§11.5, §13.4, §13.5, §4.1's remote-config block.
Do not read the whole spec.

Everything in this wave is optional to the product working. **The test of every item here is
that removing the network changes wording and media quality, never function** (§11.2).

## The two invariants this wave exists to not break

1. **The engine decides; the LLM decorates** (§7.2, invariant 2). The model never selects
   exercises, sets loads, sets sets/reps, chooses bands, or relaxes a filter. It is never required
   for a workout to be generated, started, completed, or logged.
2. **Never invent a YouTube video id** (§11.4, invariant 8). A recalled id is dead or wrong.
   Curated ids live in remote config only and are **never bundled**. Wave 1's validator already
   rejects a bundled `video_id`; keep it that way.

## Scope

### 1. Demo media — in-house line-art figures (§11.4 tier 2)

All ~200 exercises, bundled, SVG, ~5–15 KB each, well under 3 MB total. Start and end position,
movement-path arrow, band line. **Offline coverage must be 100%** — this is what makes §11.6
passable. AI generation is appropriate at this tier (the abstraction contains the failure mode
and each figure reviews in seconds), but every figure needs a review pass against its `setup` cue.

### 2. The three-tier media ladder (§11.4)

First match wins: curated YouTube embed (online, where curated) → bundled figure (always) →
YouTube search link (online, universal fallback). Offline shows the figure with **no dead player
and no error**. Player errors fall back to the figure silently and raise an automatic flag.
`youtube-nocookie.com`, official IFrame player, no autoplay, no fullscreen takeover. **It must not
hijack the audio session** — rest-timer cues keep priority — and must not pause or drift the
workout timer. Skipped on a metered connection with data saver on. A one-tap *"this video is wrong
or broken"* sits under the player; two reports demote to tier 2 automatically.

### 3. LLM proxy (§7.1, §7.3)

Cloud Function. **Key never ships in the bundle.** Jobs: natural-language intake (online only,
pickers always work), coach voice rewriting the §5.8 line, feedback distillation at completion.
All queued with exponential backoff (§11.3) — a coach line an hour late is fine; a blocked workout
is not.

- **Structured outputs** or strict tool use so responses are schema-valid by construction.
- **Validate anyway** (§7.3): every referenced exercise id must exist in the eligible pool, every
  anchor must be enabled, nothing may violate a limitation. Invalid → one repair attempt → fall
  back to deterministic output.
- **Prompt caching is prefix-match**: library and system prompt first behind a cache breakpoint,
  volatile per-user data last. Verify with `usage.cache_read_input_tokens` — a persistent zero
  means something in the prefix is varying.
- **User freeform text is untrusted input.** Retrospectives and pinned notes are delimited and
  treated as data. They may influence tone; they can never relax a hard filter.
- Model tiering per §7.3. Check current model ids against the `claude-api` skill rather than
  assuming — do not hardcode a model id from memory.

### 4. Firebase sync (§11.3)

Firestore + Auth as a **sync target only, never a read dependency**. Local-first writes; sessions
append-only; per-document last-write-wins on a monotonic `updated_at` (Wave 3 already maintains
it). Delta-sync the library and the `video/{exercise_id}` remote config. **Do not read full
history to render the dashboard** — use the rolled-up stats documents.

### 5. HealthKit write (§13.4)

Write only, never read. On completion, an `HKWorkout` of type `functionalStrengthTraining` with
duration and estimated active energy. One entitlement, one permission prompt. Health data never
leaves the device.

### 6. `video_db.py` operator CLI (§11.5)

`queue` / `candidates` / `set` / `verify` / `flagged` / `status`, modeled on the prototype's
`workout_db.py` with the same discipline: validate before writing, refuse invalid input rather
than storing it. `candidates` auto-rejects non-embeddable, private, age-restricted, region-locked,
or >4-minute videos before a human looks. `set` re-validates and stamps `video_verified_at`.
**The API key lives on the operator's machine only** — the app never calls the Data API.

### 7. Location queue (§9.6, §11.3)

Coarse reverse-geocode once at completion, city/country strings only. Offline completion queues
the lookup; when it resolves, pin against the session's `local_date`, not the resolution date.

## Done criteria

- [ ] Airplane mode: every core-loop function works; only wording and tiers 1/3 degrade.
- [ ] No error modals, no dead players — a calm offline indicator and nothing more.
- [ ] LLM output is schema-validated against the eligible pool; invalid falls back deterministically.
- [ ] Prompt cache verified working via `cache_read_input_tokens`, not assumed.
- [ ] No API key anywhere in the bundle; no bundled video id.
- [ ] Every exercise has a bundled figure; total media budget under 3 MB.
- [ ] `video_db.py` refuses invalid ids and writes only validated ones.
- [ ] `npm run check` green.
