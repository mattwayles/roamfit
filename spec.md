# RoamFit — Application Spec

> **Working title.** Front-runner as of this writing; not locked in. Name candidates and
> rationale in **Appendix A**.
> Status: v1 specification. Everything marked *(Future)* is deliberately out of scope for v1
> and collected in **§16 Future Features**.

---

## 1. Purpose & Positioning

An exercise library and workout engine for people who train without a gym — nomads, frequent
travelers, and anyone whose training environment changes weekly.

**The wedge is not equipment. It is consistency under disruption.**

Competitors (Fitbod, Freeletics, Nike Training Club, Centr) all generate workouts and all handle
"no equipment." None of them are built for a user whose week contains a 14-hour flight, three
time zones, a hostel with no floor space, and a stretch with no connectivity. RoamFit wins on
four things, in this order:

1. **It works with no connection at all.** Full-quality workout generation runs on-device.
   Nothing about the core loop requires a network. (§11)
2. **Progression is the product.** With bands and bodyweight you cannot add 5 lb, so most apps
   plateau users at week six and lose them. An explicit progression ladder per movement family
   turns "did a workout" into "leveled up," which is the strongest motivator this app has. (§6)
3. **Accountability that survives travel.** No daily streaks — they punish exactly this user.
   Weekly targets, travel days, a permanent minimum-effort session, and a comeback path that
   never shames. (§9)
4. **Zero setup.** Open the app, tap once, start training. No profiles to build, no rooms to
   describe, no photos to take.

### 1.1 Design principles

These resolve most open questions without escalation.

- **Ask nothing up front; recover gracefully in the moment.** The app never front-loads a
  configuration step to avoid a possible mid-workout problem. If a band anchor doesn't work in
  this particular room, the fix is a one-tap swap during the set — not a setup wizard beforehand.
- **The deterministic engine is the product.** The LLM is an enhancement layer that improves
  wording, intake, and feedback interpretation. It never selects exercises, never sets loads, and
  never overrides a safety filter. (§7)
- **Never punish.** No red days, no broken streaks, no guilt copy. Every element of the dashboard
  either accumulates monotonically or points at the next concrete action. (§14)
- **Explicit feedback is a bonus; implicit feedback is the system.** Assume the user rates
  nothing. The engine must get measurably smarter from behavior alone. (§8)
- **Safety constraints live in code, not in prompts.** Injury filters and anchor safety classes
  are hard filters applied before any model sees anything. (§13)
- **Promise the time and keep it.** If the app says 30 minutes it must finish in 27–33. A travel
  day has hard edges; overrunning is how you lose this user.

---

## 2. Non-Goals (v1)

Stated so they don't creep in:

- No barbell, machine, or full-gym programming. Bands + bodyweight only. *(Found equipment is the
  #1 fast-follow — see §16.)*
- No nutrition, macro, or weight tracking.
- No social feed, leaderboards, or public profiles.
- No onboarding flow. The app is usable and self-calibrating from a cold install. *(§6.5)*
- No monetization framework, paywall, or entitlement model.
- No place/room profiles, saved locations, or setup photos. This is a deliberate, considered
  rejection — see §5.3.
- No Android.

---

## 3. Foundation

| Layer | Choice | Notes |
|---|---|---|
| App | React Native, iOS only | Expo with dev-client + config plugins (needed for HealthKit, background audio, keep-awake) |
| Local store | SQLite — source of truth | WatermelonDB or op-sqlite + Drizzle. All reads and writes hit local first. |
| Sync | Firebase (Firestore + Auth) | Sync target only, never on the critical path |
| Exercise library | Versioned JSON bundled in the binary | ~200 records, ~150–200 KB. Delta-synced from Firestore. |
| Generation engine | Pure TypeScript, on-device | No I/O, no network, fully unit-testable |
| LLM | Claude via a Cloud Function proxy | Never called from the app directly; key never ships in the bundle |
| Health | HealthKit (write) | §13.4 |

---

## 4. Domain Model

### 4.1 Exercise (global, read-only, bundled)

Extends the existing 196-record library. New fields marked **+**.

```
id                    string, stable
name                  string
aliases[]             string, for search

focus[]               upper | abs | legs | full
pattern               horizontal_push | vertical_push | horizontal_pull | vertical_pull |
                      squat | hinge | lunge | hip_extension | abduction | calf |
                      anti_rotation | anti_extension | flexion | lateral_flexion |
                      elbow_flexion | elbow_extension | shoulder_isolation
primary[]             muscle groups
secondary[]           muscle groups

equipment             band | bodyweight
band                  suggested range, e.g. "B1-B2" (null for bodyweight)
anchor                none | stance | feet | self-low | thigh-loop |
                      body-support | anchor-low | anchor-mid | anchor-high | pullup-bar
+ anchor_class        none | band_tension | bodyweight_bearing        (derived; drives §13.1)

unilateral            boolean
+ metric              reps | time | amrap
+ default_seconds     integer, for metric=time
tier                  core | fill | stretch
+ role                warmup | main | cooldown

difficulty            easy | medium | hard          (intrinsic tier, used for selection)
+ progression_family  family id, or null (warmups, stretches, finishers)
+ progression_level_id  level_id within that family's levels[] (§4.2) — stable, never a
                      positional index (§6.6)

+ contraindications[] shoulder_overhead | shoulder_horizontal | elbow | wrist_extension |
                      knee_flexion_loaded | knee_impact | hip | lower_back_flexion |
                      lower_back_extension | neck | ankle | core_pressure

setup                 string — authoritative cue text; overrides any video that disagrees
video_search          constructed YouTube search URL — the always-valid fallback
+ demo_media          { type: figure | clip, id }          — bundled offline (§11.4)
                      figure = in-house line art (v1, all exercises) · clip = self-filmed, post-launch
```

**Curated video — remote config, never bundled** (`video/{exercise_id}`, §11.4):
```
video_id              YouTube id, nullable — null means "not yet curated"
video_verified_at     date the id was last confirmed playable and correct
video_flag_count      user "this video is wrong or broken" reports since last verification
```

**The rule, stated precisely.** The prototype's rule is *never **invent** a video id* — a
recalled id is dead or wrong. A **curated and verified** id is a different thing and is permitted.
What remains non-negotiable: `setup` is the authority when a video disagrees, because most band
tutorials online use handled tube bands that anchor differently than long loops. A video is a
supplement to the cue, never a replacement for it.

### 4.2 Progression Family (global, bundled)

```
id                    e.g. "horizontal_push"
name                  "Horizontal Push"
pattern               the movement pattern it satisfies
levels[]              ordered { level_id, exercise_id }, easiest → hardest
                      level_id is assigned once, never reordered or reused. Inserting a new
                      rung — anywhere in the ladder, including before an existing level —
                      appends a new level_id; it never renumbers the array. This is what makes
                      §4.5's stored progress durable across content changes (§6.6).
```

### 4.3 User (single record, local + synced)

```
units                 kg | lb
band_tensions{}       B1..B5 → { label, color, approx_load, note }   user-editable
weekly_target         integer, default 3
limitations[]         [{ tag, note, created_at, source: user|pain_report, expires_at? }]
anchors_available[]   see §5.3 — sticky, single global list
passport_enabled      boolean, default false (opt-in)
health_write_enabled  boolean
notification_prefs    { enabled, quiet_hours, observed_training_window }
```

### 4.4 User Exercise State (per user × exercise)

Stored at `users/{uid}/exercise_state/{exercise_id}` — **not** on the global exercise record.
This is the single most important correction to the original spec: pinned notes and learned
suggestions are per-user data and must never live on the shared library table.

```
last_performed_at
sessions_performed
best_set                { reps | seconds, band, at }
difficulty_ema          -1..+1   (too_hard … too_easy)
enjoyment_ema           1..5     (see §8.2)
skip_count, swap_away_count, remove_at_approval_count
pinned_note             string — user-authored, shown verbatim every time (§10.5)
suppressed_until        date, set by REPEATEDLY-SKIPPED (§5.2)
```

### 4.5 User Progression State (per user × family)

```
family_id
level_id              references family.levels[].level_id (§4.2) — never a positional index
micro                 { rep_target, band, tempo_sec, rest_sec, sets }
calibrating           boolean (§6.5)
consecutive_hits      integer
consecutive_misses    integer
last_level_change_at
```

### 4.6 Session

```
id, status            planned | active | completed | discarded
utc_instant           when it started
local_date            YYYY-MM-DD in the device's tz at start   ← all calendar math uses this
tz_id                 IANA zone                                 ← §12
focus, effort, format (`straight_sets` — the only v1 value; supersets are grouped entries
                       within it via `group`, §4.7. `circuit` cut from v1, see §17.4)
target_minutes, estimated_minutes, actual_minutes
anchors_snapshot      anchors enabled at generation time
warmup[] main[] cooldown[]   → Session Entries
retrospective         string, optional
city, country         nullable, only if passport_enabled
generated_by          engine | engine+llm
engine_version        for reproducibility
```

### 4.7 Session Entry & Set Log

```
Entry:  exercise_id, role, group (A1/A2 for superset pairs), band, sets,
        rep_target | duration_sec, rest_sec, tempo, notes,
        substituted_for, unplanned (bool), progression_level_id_at_time

SetLog: entry_id, index, status: completed | skipped | not_reached,
        reps_actual | seconds_actual,
        started_at, completed_at,          → time-under-set, an implicit signal
        rest_taken_sec, rest_extended_count
```

**Planned-vs-actual adherence is recorded, not overwritten.** The plan is preserved; what actually
happened is stored alongside it. This is the substrate for every implicit signal in §8.3.

---

## 5. The Generation Engine

Pure, deterministic, on-device, sub-50ms. This is the product. It is a direct port and extension
of the existing `daily-workout` prototype's `context` + planning rules, which already encode the
domain knowledge — nothing there should be lost in translation.

### 5.1 Pipeline

```
1. HARD FILTERS      equipment · anchors · injuries                     — never negotiable
2. TEMPLATE          fill the focus template's pattern slots in priority order
3. SELECTION         cooldown / novelty / volume-balance / enjoyment weights
4. PROGRESSION       for each slot, pick the variant at the user's current level (§6)
5. PRESCRIPTION      sets · reps or seconds · band · tempo · rest, from the effort table
6. TIME FIT          run the budget formula; add or drop until within ±10% of target
7. EXPLAIN           generate the "why this session looks like this" line
```

Steps 1–6 are code. Step 7 is a template string that the LLM may later rewrite (§7).

### 5.2 Selection rules (ported verbatim from the prototype)

- **Never** program anything in BLOCKED (used within the last N sessions).
- Take **≥70%** of main exercises from PREFERRED (not used recently).
- Include **≥1 novelty exercise** (never performed) whenever one fits a pattern slot.
- SOFT COOLDOWN only to fill a slot nothing else covers.
- Muscles flagged **OVER-WORKED** (>1.5× trailing mean): at most one exercise, never as primary
  mover. **UNTRAINED / LOW**: prioritize into a slot.
- **48h recovery** — anything trained hard in the last two days drops a band size and is capped at
  one exercise, or its volume shifts to another pattern. Same focus trained yesterday ⇒ this
  session is not `hard` on the same muscles.
- **Enjoyment breaks ties** toward the higher-rated exercise. Avoid anything at ≤2 unless it fills
  a slot nothing else can. Favorites capped at **~40%** of the session so enjoyment never quietly
  undoes variety.
- **REPEATEDLY SKIPPED** — an exercise skipped or swapped away twice is suppressed for 30 days and
  the user is told once: *"Not programming Bulgarian split squats for a while — you've skipped
  them twice."*
- **Default to ≥50% of main work on bands.** They are the progressive-overload tool; a band session
  that quietly becomes a calisthenics session wastes them.
- **PATTERN GAP — never silent.** Bodyweight alone cannot train pulling. A bodyweight-only upper or
  full session has no back work, and the app must say so and either use a band for the pulling slot
  or state plainly that the session is deliberately push-dominant.

### 5.3 Anchor availability — and why there are no place profiles

**Decision: place profiles are rejected.** Naming rooms, saving anchor sets, and taking setup
photos is meaningful up-front overhead for a user whose entire mental model is *grab the bands and
go*, and who does not expect to return to any given room. Do not reintroduce this.

The one thing the engine genuinely cannot infer is *what can you anchor to right now*. That is the
**only** per-session constraint in the app, held as a **single global, sticky list** — one row, no
names, no history, no photos, no per-location anything — surfaced as one chip above the Generate
button.

| Chip | Values | Default | Effect |
|---|---|---|---|
| **Anchors** | multi-select over the anchor taxonomy | all `band_tension` on; all `bodyweight_bearing` **off** | hard filter |

Rationale for the defaults: band-tension anchors (a door, a bed frame, a post, a tree) are close to
universally available, so they are on and the user never has to think about them. Bodyweight-bearing
anchors — a pull-up bar, a bench — are a different safety class and are **off until explicitly
enabled** (§13.1). A brand-new user taps Generate and gets a valid workout with zero configuration.

Anything the setting gets wrong is corrected reactively by a one-tap **mid-workout swap** (§10.6),
not preventively by a setup flow. That is the design principle in §1.1 doing its job.

**Deliberately not modeled, anywhere in UI, generation, or schema:** ground surface, noise/impact,
and space footprint. Each is a plausible-sounding dimension that adds schema, filter logic, and a
question the user has to answer, in exchange for edge cases the mid-workout swap already handles.
Do not add them.

### 5.4 Effort table

The user picks **effort for today**, not absolute difficulty. Absolute difficulty is a property of
their progression level (§6), which the engine already knows.

| | sets | reps | rest | tempo | effort | format |
|---|---|---|---|---|---|---|
| **easy** | 2–3 | 12–15 | 60s | 3s/rep | ~4 reps in reserve | straight sets |
| **normal** | 3 | 10–12 | 45s | 3s/rep | ~2 in reserve | straight sets, or one superset pair |
| **hard** | 3–4 | 8–12 or AMRAP | 30s | 4s/rep (3s eccentric + pause) | 0–1 in reserve | supersets + one finisher |

### 5.5 Focus templates

Pattern slots to fill, in priority order:

- **upper** — horizontal push, horizontal pull, vertical push, vertical pull, then arm/delt
  isolation. **Push and pull counts stay equal**; an upper day that rows less than it presses is a
  bad upper day. Under 25 min: horizontal push, horizontal pull, one vertical, one isolation.
- **legs** — squat, hinge, unilateral, glute/abduction isolation, calves if time. Knee-dominant and
  hip-dominant roughly 50/50.
- **abs** — anti-rotation, flexion, anti-extension, plus one oblique/lateral. Rotate which pattern
  leads. **Never an all-flexion core day.**
- **full** — lower push, lower hinge, upper push, upper pull, core. Conditioning finisher if `hard`
  or if the budget is 40+ min.

Every session gets a warmup and a cooldown drawn from the `role`-tagged pool, matched to the
session's patterns.

### 5.6 Time budget

```
warmup_min   = clamp(round(0.12 × T), 3, 8)
cooldown_min = clamp(round(0.10 × T), 3, 7)
main_sec     = (T − warmup_min − cooldown_min) × 60

straight sets, per exercise:
  work_sec     = reps × tempo_sec          (× 2 if unilateral — both sides)
  set_sec      = work_sec + rest_sec
  exercise_sec = sets × set_sec + 30       (+45 if the anchor must be rebuilt)

superset pair over R rounds:
  pair_sec = R × (workA + 15 + workB + rest_sec) + 45

timed exercise:
  exercise_sec = sets × (duration_sec + rest_sec) + 30    (× 2 if unilateral)
```

Fill `main_sec` until the next exercise would overshoot. Sanity check on count: ≤15 min → 3–4
exercises; 20 min → 4–5; 30 min → 5–6; 45 min → 7–8; 60 min → 8–10.

**Estimate accuracy is tracked as a product SLA** (§14.2). If sessions consistently run long, the
engine's tempo and transition constants are recalibrated per user from their observed set and rest
times.

### 5.7 Band selection

Bands are B1 (lightest) → B5 (heaviest). Band tension climbs through the range of motion, so
**select for the hardest position, not the easiest**. Standing further from the anchor, or choking
the band shorter, adds tension without changing bands — these are legitimate micro-progression
steps and are surfaced as cues, not as separate exercises.

### 5.8 The explanation line — required, not optional

Every generated session carries one sentence stating what it balanced and what changed:

> *"Lighter on shoulders — you pressed hard two days ago. New today: Copenhagen plank.
> Push-ups moved up to Level 5."*

This is the cheapest trust-builder in the product. It is the difference between *"an app made me a
workout"* and *"something thought about this."* When the engine acts on repeated feedback it must
say what it changed and why — never silently reprint a prescription that was just called too easy.

---

## 6. Progression & Overload — first-class feature

The single strongest motivator in the product. Working toward and achieving a progression is what
gets the user off the couch, so it is treated as a headline feature, not an internal mechanic.

### 6.1 The ladder

Each movement family is an ordered list of variants:

```
horizontal_push:  wall → incline → knee → full → banded B1 → banded B2 →
                  deficit → archer → one-arm
                                          ▲ user is here (Level 5 of 9)
```

### 6.2 Micro-progression within a level

Applied in order before a level ever changes.

**Band exercises:** `reps → top of range` → `band +1` (reps reset to bottom of range) → … → at max
band *and* top of range → **next level**

**Bodyweight exercises:** `reps → top of range` → `tempo +1s` → `rest −15s` → `sets +1` →
**next level**

### 6.3 Advance / regress rules

- **Advance one micro-step** when every working set is completed at or above the top of the
  prescribed range *and* difficulty feedback is not `too_hard`.
- **Regress one micro-step** after two consecutive sessions missing the bottom of the range, or one
  `too_hard` combined with missing the bottom of the range.
- **Drop a level** after two consecutive regressions at the bottom micro-step of a level.
- Timed exercises use held-seconds against the target the same way.
- **At the top level of a family**, a micro-progression that would normally trigger a level change
  holds at the maximum micro-step instead — there is nowhere higher to go. See §6.7 for what
  replaces the level-up moment from there.

### 6.4 Surfacing it

- Level badge on every exercise card: **Level 5 of 9**, with progress through the micro-ladder.
- **Next Unlock** is a hero element on the dashboard: *"Push-ups — 2 sessions from archer
  push-ups."* This is the answer to "why open the app tomorrow."
- **Level-up is a celebrated, unmissable moment** at workout completion — full-screen, named, with
  the new variant previewed. Level-ups are logged as milestones and counted for life.
- A **Progression board** screen lists every family, current level, and next unlock. (§14.1)
- At the top of a ladder, this surfacing hands off to the Mastery treatment (§6.7).

### 6.5 Cold start without onboarding

Because v1 has no onboarding, progression state must self-calibrate.

- Every family starts at a **conservative level** — roughly the 30th percentile of its ladder.
- The first **three sessions run in calibration mode**: any `too_easy` rating, or exceeding the rep
  target by ≥25%, advances a **full level immediately** rather than one micro-step. Missing the
  bottom of the range drops a full level.
- Calibration converges in two or three sessions with no assessment flow and no questions asked.
- The app says so, once, on the first session: *"Your first few sessions set your starting levels —
  push a little and it'll calibrate fast."*
- Re-entering calibration is also the deep-comeback behavior after a 21+ day gap (§9.4).

### 6.6 v1 ladder scope — laddered vs. accessory patterns

The mechanism is **fully general and data-driven from day one**: families live in bundled JSON
(§4.2), and adding one later is a content change with **zero code change**. What v1 scopes is the
*content*, not the capability.

Not every movement needs a ladder, and this is a real training distinction rather than a
convenience cut. **Compound patterns progress by changing leverage** — that is what a ladder
encodes. **Isolation and accessory patterns progress by adding tension**, which the micro-ladder
(§6.2) already handles completely. Nobody needs a "lateral raise ladder"; they need a heavier band.

**Laddered in v1 — 8 primary families**

| Family | Covers |
|---|---|
| `horizontal_push` | upper + full push slot |
| `horizontal_pull` | upper + full pull slot |
| `vertical_push` | upper overhead slot |
| `vertical_pull` | upper vertical pull slot |
| `squat` | legs knee-dominant slot |
| `hinge` | legs hip-dominant slot |
| `lunge` | legs unilateral slot |
| `anti_extension` | abs plank slot — the most motivating core ladder |

This covers **every main slot in the upper, legs, and full templates plus one core slot**, so a
laddered exercise appears in essentially every session and the Next Unlock element (§14.1) always
has something to show.

**Micro-progression only in v1 — accessory patterns**

`elbow_flexion` · `elbow_extension` · `shoulder_isolation` · `hip_extension` · `abduction` ·
`calf` · `anti_rotation` · `flexion` · `lateral_flexion`

These carry `progression_family: null` and progress purely on band, reps, tempo, rest, and sets.
They still contribute to volume, balance, variety, and the muscle-balance dashboard — they simply
have no level index.

**Authoring cost.** 8 families × 6–9 variants ≈ 55–70 entries, the large majority of which already
exist in the 196-record library and need only a family tag and a level_id. This is a tractable
v1 task, not a content program.

**Adding families later** *(Future)* is a JSON edit plus a review pass. Users already at a
micro-progression ceiling in a newly-laddered pattern are seeded at the level matching their
current band and rep performance, so nobody restarts. Because `level_id` is a stable identifier
rather than an array position (§4.2, §4.5), inserting a rung anywhere in an existing ladder —
including ahead of a level users are already sitting at — never shifts what any stored progress
refers to.

### 6.7 Mastery — past the top of the ladder

Every ladder ends. A user who reaches the top level of a family (e.g. one-arm push-ups, Level 9 of
9) has done exactly what the mechanic in this section is designed to produce, and the worst
response is for the product's strongest motivator to go silent right when it matters most.

- At max level, the exercise card switches from a level badge to a **Mastery badge**: session count
  on that variant and a live best-set record (most reps, or longest hold).
- **Micro-progression (§6.2) keeps running past the top level** — reps, tempo, rest, and sets
  continue to ratchet — so there is always a next micro-step to chase even with nowhere higher to
  climb.
- Where a micro-progression would normally trigger a level change and none exists (§6.3), the
  engine holds at the maximum micro-step and treats the next all-sets-at-top performance as a
  best-set PR check instead.
- **Best-set PRs are milestones**, celebrated the same way a level-up is (§9.7): *"New best —
  14 one-arm push-ups, up from 11."*
- The Progression board (§6.4, §14.1) marks maxed families distinctly rather than leaving a
  "Level 9 of 9" that reads like a ceiling instead of an achievement.

---

## 7. The LLM Layer

The engine decides. The model decorates, interprets, and translates. It is never on the critical
path and its absence degrades wording, never function.

### 7.1 What the LLM does

| Job | When | Blocking? |
|---|---|---|
| **Natural-language intake** — *"shoulder's cranky, 20 minutes, hotel room"* → structured params | On demand, online only | No — pickers always work |
| **Coach voice** — rewrite the §5.8 explanation line; expand setup cues on first-ever performance | Async, cached per session | No |
| **Feedback distillation** — retrospective text → structured signals (suspected limitation, band too light, exercise aversion) | Once at completion, queued | No |
| **Library authoring** — expanding the library, tagging, building ladders | Offline, batch, dev-side | N/A |

### 7.2 What the LLM must never do

- Select exercises, set loads, set sets/reps, or choose bands.
- Override or relax an injury filter or the anchor filter.
- Be required for a workout to be generated, started, completed, or logged.

### 7.3 Implementation constraints

- **Key never ships in the bundle.** All calls proxy through a Cloud Function.
- Use **structured outputs** (`output_config.format`) or strict tool use (`strict: true` with
  `additionalProperties: false`) so responses are schema-valid by construction.
- **Validate anyway.** Every referenced exercise id must exist in the eligible pool; every anchor
  must be enabled; nothing may violate a limitation. Invalid → one repair attempt → fall back to
  the deterministic output. The prototype already rejects invalid ids and anchors; keep that
  invariant.
- **Prompt caching is prefix-match** (`tools` → `system` → `messages`). Library and system prompt
  first behind a cache breakpoint, volatile per-user data last. Verify with
  `usage.cache_read_input_tokens` — a persistent zero means something in the prefix is varying.
- **User freeform text is untrusted input.** Retrospectives and pinned notes are delimited and
  treated as data. They can influence tone and suggestions; they can never relax a hard filter.
- Model tiering: `claude-opus-5` for intake; `claude-haiku-4-5` for coach voice and distillation;
  Batch API (50% discount) for dev-side library work.

---

## 8. Feedback & The Learning Loop

The original spec asked for enjoyment (1–5), difficulty, equipment used, freeform text, and pinned
notes on every exercise, plus a retrospective. Realistic capture on that is under 10%, at which
point the "gets smarter over time" promise quietly dies. v1 inverts the design: **assume the user
rates nothing.**

### 8.1 Explicit feedback — the entire surface

Exactly two controls, both optional, both on the rest screen (§10.4):

1. **Difficulty** — a 3-position segmented control: `too easy · just right · too hard`.
   **Unset by default, and unset means "just right."** Never required, never blocks, never nags.
2. **Enjoyment** — a single tap on a five-emoji row, which is the full 1–5 scale at one-tap cost:

   | 😩 | 😞 | 😕 | 🙂 | 😄 |
   |---|---|---|---|---|
   | 1 | 2 | 3 | 4 | 5 |

   Unset is neutral (treated as 3) and is never solicited twice. This keeps the prototype's
   enjoyment ranking, its tie-break, and its "avoid anything rated ≤2" rule fully intact — a
   slider or a star row would cost a drag or five targets; this costs one tap on a row the user can
   read without thinking. Tapping the same emoji again clears it.

Plus, at the workout level only: **one optional retrospective textbox** on the summary page.

**"Equipment used" is removed entirely.**

Feedback is per-exercise, not per-set — rating Exercise A on set 1 applies to all its sets.

### 8.2 Pinned notes are a tool, not feedback

Distinct from the above and deliberately prominent. A pinned note is the user's own coaching memory
— *"row to the hips, not the chest"*, *"left shoulder: warm up first"* — shown verbatim in a yellow
sticky-note component every time that exercise appears. Editable inline at any moment, persisting
instantly. It must be obvious that it is editable. This is one of the strongest ideas in the
original spec and no competitor has it.

### 8.3 Implicit signals — the real engine input

Captured with no user action. This list is the specification; all of it is recorded.

**Performance**
- Reps logged vs. prescribed, per set
- Seconds held vs. prescribed, for timed work — a hold ended at 32 of 45s is an unambiguous
  "too hard" with no rating needed
- Set status: completed / skipped / never reached
- Time-under-set (start → complete) → actual pace vs. prescribed tempo
- Best-set improvement per exercise

**Fatigue & pacing**
- Rest actually taken vs. prescribed; count of `+15s` taps
- Pause count and total paused duration
- Session duration vs. estimate

**Preference & aversion**
- Exercises removed at the approval page — never even attempted; a stronger aversion signal than
  any post-hoc rating
- Mid-workout swaps: what was swapped, for what, at which set
- Sets added or deleted at approval
- Regenerate taps, and how many in a row

**Comprehension**
- Demo media expanded → unfamiliarity; re-program it sooner to build familiarity, and prefer the
  fuller cue text next time
- Pinned note created or edited → this exercise needs attention

**Context**
- Session abandoned, and at exactly which exercise
- Time of day and day of week → adaptive notification timing (§9.6)
- Days since last session → comeback detection (§9.4)
- **Device timezone change → travel detection.** Offer a one-tap travel day (§9.3). Free, and
  perfectly on-brand.

### 8.4 Asking well

The app asks for explicit input rarely, specifically, and only when the answer visibly changes
tomorrow:

> *"Push-ups have felt easy three sessions running. Ready for archer push-ups?"* → one tap

That is a level-up prompt, not a survey. It teaches the user that feedback moves something.

---

## 9. Accountability & Motivation

The app's stated thesis. **Do not build daily streaks** — they punish 14-hour flights, jet lag, and
food poisoning in Oaxaca, which are the defining features of the target user's life. A broken
streak is the single most common churn event in consumer fitness.

### 9.1 Weekly targets

- User sets a target (default **3 sessions/week**), evaluated on a **rolling 7-day window**.
- Displayed as dots, not a bar: `● ● ○` — filled, filled, open. Neutral, never red.
- **Week streak** = consecutive weeks the target was hit. Lumpy lives, forgiving math.
- After **4 weeks** of observed completion rate, the app may *suggest* a different target —
  bounded 1–7, never applied silently. The user confirms or dismisses; a declined suggestion
  doesn't resurface for another 4 weeks. The app should never look like it quietly lowered its
  expectations of the user without telling them.

### 9.2 Rest days are unremarked

No copy anywhere treats a non-training day as a failure. Untrained days on the calendar are neutral,
not empty or red.

### 9.3 Travel days

One tap: **"I'm in transit."** It reduces that week's denominator by one (floor of 2) and is
recorded with the reason. This deliberately converts the highest-churn moment in the product into
an engagement moment.

**Auto-suggested** when the device timezone changes: *"Looks like you traveled. Mark today as a
travel day?"*

### 9.4 The comeback path

- **Gap ≥ 7 days** — the next session auto-regresses one micro-step per family and cuts volume
  ~20%. Copy: *"Welcome back — let's ease in."* No mention of the gap's length, no apology
  requested.
- **Gap ≥ 21 days** — return to calibration mode (§6.5) and rebuild levels from where the user
  actually is.

Most apps re-serve the exact workout the user failed at and lose them permanently. This is the fix.

### 9.5 Quick Session — the minimum-effort floor

A **permanent, always-visible button on the home screen**, equal in prominence to the main CTA. No
pickers, no approval page: one tap goes straight into a ~7-minute session — one warmup, three main
exercises drawn from current progression state, one cooldown — built from whatever the current
anchor setting allows.

**This is the §5.1 pipeline, not a separate code path.** Quick Session is the same generation
engine run with a minimal template (1 warmup + 3 main + 1 cooldown) and a fixed ~7-minute budget —
not a hand-rolled shortcut that risks reimplementing (and forgetting) the hard filters. It still
applies the injury and anchor filters in step 1, the 48h recovery and OVER-WORKED caps in step 3
(§5.2), and the effort table (§5.4) at `normal`. This matters specifically because it's the one
control a motivated user might tap every single day: without the shared pipeline it could silently
re-hammer the same pattern day after day.

Consistency comes from lowering activation energy on bad days, not from optimizing good ones. This
is not a buried convenience; it is a primary control.

### 9.6 The Passport

The gamification layer, and the one element a competitor cannot copy.

- Every completed session pins its **city** on a world map. *(Future — route line between cities;
  v1 ships pins only. A connecting line is a rendering nice-to-have that can slip to v1.1 without
  losing the core "you trained in 11 cities" hook.)*
- Counters: cities, countries, sessions abroad.
- **Opt-in.** Coarse reverse-geocode once at completion; stores city and country **strings only** —
  never coordinates, never continuous location. If offline at completion, the lookup queues and
  resolves later, pinned to the session's `local_date` (§11.3).
- It is structurally incapable of punishing: it only accumulates.
- *"You've trained in 11 cities and 4 countries since March"* beats *"total time: 840 minutes"* for
  this audience by a wide margin, and it is screenshot-worthy, which matters for organic growth.
- **Share.** A one-tap export renders the map (or the counters, if pins are sparse) as a branded
  image card to the native share sheet. This is the actual mechanism behind "screenshot-worthy" —
  see §9.10.

### 9.7 Milestones

Celebrated in-app at completion: Nth session · first session in a new city · new country ·
**every level-up** · a Mastery best-set PR (§6.7) · weekly target hit four weeks running ·
a new best set · a completed Recovery Week (§9.9).

### 9.8 Notifications

- Adaptive to the user's **observed** training window, not a fixed time.
- **Maximum one per day.** Respects quiet hours and the device timezone.
- Never guilt-based. Loss-aversion framing is allowed and preferred:
  *"Two sessions from holding your push volume this month."*
- Weekly summary on Sunday evening, shareable as a recap card (§9.10).

### 9.9 Recovery Week

Continuous linear progression with no planned deload is a real overuse risk with band and
bodyweight training specifically, because there is no coach in the room to notice fatigue
accumulating. Recovery Week reuses the mechanism already built for the comeback path (§9.4) rather
than adding a new one.

- **Auto-suggested** every 6–8 weeks of consistent training, and always available as a manual
  toggle in settings for a user who wants to call one themselves.
- Applies the same treatment as a 7-day-gap return, for that week only: auto-regress one
  micro-step per family and cut volume ~20% (§9.4).
- **Counts toward the weekly target as normal** — a Recovery Week session still fills a dot
  (§9.1). Credited, not penalized, consistent with §1.1's "never punish."
- Copy: *"Recovery week — lighter loads, same consistency."* No mention of fatigue, burnout, or
  overtraining; the user never has to self-diagnose to get the benefit.
- Logged as a milestone (§9.7) the same as any other accumulating event — completing one is a
  positive record, not a gap in the history.

### 9.10 Shareable moments

The passport and level-ups are repeatedly the app's best organic-growth surface (§9.6, §9.7), but
screenshotting only works as a growth loop if there's something worth screenshotting on purpose.

- **Share is a real action, not a hope.** A one-tap native share-sheet export renders a branded
  image card wherever the app already has something worth showing — the level-up and milestone
  screens (§10.9), the passport (§9.6), and the Sunday weekly summary above.
- The card is built entirely from data already computed for the screen it's attached to — no new
  backend, no new state. It's a render step, not a feature.
- Never auto-posts anywhere. It hands the user an image; where it goes is entirely theirs.

---

## 10. Screens & Flows

### 10.1 Home

**The action goes above the analytics.** The original spec opened to a dashboard of graphs, which
puts reflection in front of action. Reordered:

1. **Today card** — hero. The recommendation, pre-filled, with its *why* line, and one tap to
   start. `Legs · 30 min · normal — 6 days since you trained legs.`
2. **Quick Session** button (§9.5).
3. **This week** — `● ● ○`, travel days as a neutral plane glyph.
4. **Next Unlock** — *"Push-ups: 2 sessions from archer push-ups."*
5. Then, scrolling: progression board, passport, calendar, muscle balance (§14.1).

A resumable pending session, if one exists, replaces the Today card at the top.

### 10.2 Generate

**Smart generation is the default, not a button.** The original spec's "enhance from history"
button is a feature users would never discover. The pickers arrive **pre-filled with the
recommendation and the reason shown inline**; the user changes something or taps Generate.

Picker order, deliberately reordered to match what actually varies for a traveler:

1. **Time** — preset list. This is the real constraint.
2. **Anchors** — one chip (§5.3), sticky, usually untouched.
3. **Focus** — pre-filled with the least-recently-trained, reason shown.
4. **Effort** — easy / normal / hard, pre-filled from recent history.

Plus **"Describe it instead"** — a free-text field routed through natural-language intake (§7.1)
when online, hidden when offline.

Generate shows a spinner; on-device generation is effectively instant, so the spinner only ever
appears while optional LLM enrichment is in flight, and it is skippable.

### 10.3 Plan Approval

- Warmup / main / cooldown, with sets, reps or duration, band, and rest.
- The §5.8 explanation line at the top.
- Add / remove / swap exercises; add / remove sets; edit rep targets.
- **Regenerate**, and **"Regenerate with a note"** — free text: *"less shoulder, my back is
  tight."* This is a far better use of the model than picker-fiddling, and the note is also stored
  as an implicit signal.
- Time estimate updates live as the plan is edited.
- **START.**

### 10.4 Active Workout — rep-based

The original spec put ~13 regions on this screen. Mid-set, one-handed, sweating, it would read as a
form. Strict hierarchy instead:

**Always visible**
- **Hero:** exercise name · target reps · `Set 2 of 3`. Nothing else at this size.
- Stage indicator (Warmup / Main / Cooldown) and, during a superset pair, `Round 2 of 4`.
- **Level badge** — `Level 5 of 9`.
- Rep count, editable inline at any time.
- **COMPLETE** — large, thumb-reachable, marks the set done at the shown count and starts the rest
  timer.
- Back / Forward. Expandable **Quick Jump**, collapsed by default.
- Elapsed workout timer, pausable.

**Progressive disclosure**
- **Demo media** — resolved by the §11.4 ladder: the curated YouTube embed when one exists and the
  device is online, otherwise the in-house figure or filmed loop, with the search link always
  offered beneath as the "watch a real person" escape hatch.
  **Auto-expands only on the user's first-ever performance of that exercise**; collapsed
  thereafter, one tap to open. It never autoplays, never takes more than about a third of the
  screen, and never displaces the hero — the original spec gave video "most of the screen real
  estate," which is backwards for a screen used mid-set.
  A **"this video is wrong or broken"** tap sits under the player (§11.4).
- **"How to"** — the `setup` cue, collapsed. Auto-expanded on first-ever performance.
- **Pinned note** — yellow sticky, always visible when present, editable inline (§8.2).

**Removed from this screen**
- Body focus, movement pattern, and intrinsic difficulty. These are engine metadata. Nobody
  mid-push-up needs to read `horizontal_push`.
- The feedback component — it moves to the rest screen.

**Actions** (a compact row, not competing with COMPLETE)
- **Swap** (§10.6) · **Skip set** · **Remove set**

**Skip and Remove are different and both are kept.** *Skip* = didn't do it, keep the record — it is
a signal. *Remove* = change the plan. The original spec's single "Delete Set" conflated them and
would have thrown away the more valuable of the two.

### 10.5 Active Workout — timed exercises

Full support, with its own layout. Applies to planks, wall sits, dead hangs, carries, isometric
holds, and any `metric: time` or `amrap` entry.

- **Large circular timer.** Counts *down* for a target; counts *up* for AMRAP and open holds.
- **Tap to start**, with a 3-second "get ready" countdown — never auto-starts, the user needs time
  to get into position.
- Pause / resume. **End early** is a first-class button, and the **actual seconds held are
  recorded** — this is one of the highest-quality implicit signals in the system.
- **Unilateral timed work runs two sequential timers** with a short switch-side interval between
  them.
- **Audio:** 3-2-1 count-in; a halfway chime on holds over 45s; 3-2-1 out; a distinct completion
  tone.
- **Haptics** at start, halfway, and completion.
- On completion, auto-advance to the rest timer.

### 10.6 Mid-workout swap

The #1 real-world interaction: the band snapped, someone's on the bar, the ceiling is too low, the
shoulder twinged. Available as one tap from any set.

- Offers 3–5 alternatives that fill the **same pattern slot**, respect all current filters, and sit
  at the **same progression level**.
- One further tap replaces the entry and continues — no re-approval, no regeneration, no
  interruption of the session timer.
- A "different anchor" quick-filter for the specific case of an anchor that didn't work here.
- The swap is recorded (what → what, at which set) as a signal, and repeated swaps away from an
  exercise trigger the REPEATEDLY-SKIPPED suppression in §5.2.

### 10.7 Rest timer

Missing entirely from the original spec despite rest being prescribed at 30/45/60s. It is also the
correct home for everything that doesn't belong mid-set.

- **Auto-starts** when a set is marked complete, at the prescribed duration.
- Large circular countdown. **`+15s` · `−15s` · `Skip`**. `+15s` taps are recorded as a fatigue
  signal.
- Shows **Next up**: exercise name, set number, target, and its pinned note if any.
- Shows **the two feedback controls** (§8.1) — the only place they appear.
- Audio 3-2-1 and a haptic at zero. **Does not force-advance**; the user taps Next when ready.
- In a superset pair, the between-exercise transition is short (10–15s) and the full rest falls
  between rounds.
- **Works with the screen locked or the app backgrounded** — background audio session plus a local
  notification at zero.

### 10.8 Device behavior during a workout

The phone is on the floor. Non-negotiable:

- **Keep-awake** for the whole active session; released on completion or abandonment.
- **Large touch targets**, thumb-reachable primary actions, high contrast, legible at arm's length.
- **Audio ducks over music** rather than interrupting it; all cues respect the silent switch with a
  user override, and haptics carry the same information when muted.
- Timers are **wall-clock based**, not tick-based, so backgrounding, locking, and app suspension
  never drift the count.
- The session is **crash-safe**: state persists per set, so a force-quit resumes exactly where it
  left off.

### 10.9 Summary & completion

- Every set listed with actual reps or seconds, its status (✓ completed / ⚠ skipped or not
  reached), and feedback given or omitted. Tapping a set returns to that page of the workout.
- **Optional retrospective textbox** — one, at workout level.
- **Level-ups are celebrated here**, full-screen, before anything else (§6.4).
- **Share** — one tap to the native share sheet on the level-up and milestone screens (§9.10).
  Never automatic.
- **FINISH** — clears the pending session, writes it to history, persists feedback, applies
  progression updates, updates the exercise state records, queues the LLM distillation pass, writes
  to HealthKit, and pins the city if the passport is enabled.
- Milestone screen: *"That's your 34th session — and your first in Porto."*
- Return to an updated home screen.

### 10.10 Pending & History

- **Pending** — a generated-but-unfinished session is resumable at any time. Only one may be
  pending; generating another prompts to resume or discard, mirroring the prototype's rule that
  nothing reaches the log except through completion.
- **History** — completed sessions by date, filterable and searchable by focus, effort, duration,
  format, exercise, and city.

---

## 11. Offline, Sync & Data Architecture

A nomad app that needs a network to generate a workout fails precisely when the user is most likely
to skip — on a plane, on a train, in a hostel behind a captive portal, on a roaming cap. **Full
offline capability is a v1 requirement, not a degradation mode.**

### 11.1 What works with zero connectivity

Everything in the core loop:

- Generating a workout, at full quality — the engine is on-device and needs no network.
- Approving, editing, regenerating, and swapping.
- Running the session: timers, audio, haptics, cues, pinned notes.
- Completing, logging, progression updates, and the full dashboard.
- Demo media for every exercise — every in-house figure ships in the binary (tier 2, §11.4)
  otherwise, shown as a link rather than a dead player.

### 11.2 What degrades

Only the LLM garnish (§7.1) and video tiers 1 and 3 (§11.4): natural-language intake is hidden, the
explanation line falls back to its deterministic template, feedback distillation queues for later,
and the curated embed and search link give way to the bundled figure. **Nothing blocks.** No error
modals and no dead players — a small, calm offline indicator, and that is all.

### 11.3 Architecture

- **Bundled library.** The exercise JSON ships in the binary, versioned. Instant cold start, works
  on first launch in airplane mode. Firestore delivers deltas when a connection exists.
- **Local-first writes.** SQLite is the source of truth. Firestore is a sync target, never a read
  dependency. Sessions are append-only, so conflicts are rare; resolve per-document
  last-write-wins on a monotonic `updated_at`.
- **Media.** All demo media ships in the binary (§11.4). Any filmed loops added later are lazily
  cached **on Wi-Fi only**, with a visible cache size and a "download all clips" action for
  pre-trip prep.
- **LLM queue.** All model work is enqueued with exponential backoff and merges in whenever it
  arrives. A coach line that shows up an hour late is fine; a blocked workout is not.
- **Location queue.** Passport reverse-geocoding (§9.6) needs connectivity it may not have at
  completion — a session finished in airplane mode in a brand-new city can't resolve city/country
  yet. Queue the lookup the same way as LLM work; when it resolves, pin it against the session's
  `local_date`, not the resolution date, so the passport and any "new city" milestone land on the
  day the user actually trained there.
- **Pre-caching.** While on Wi-Fi, pre-generate and pre-enrich the next 3 likely sessions.
- **Firestore cost note.** Billing is per document read. Do not read the full history to render the
  dashboard — maintain a rolled-up stats document and per-exercise state documents.

### 11.4 Exercise media — the plan

**Constraint: no paid media licensing.** Libraries evaluated August 2026 — ExerciseDB, WorkoutX,
YMove, wger, ExerciseLibrary.com, free-exercise-db.

**The finding that decides this, independent of budget: no library on the market covers long-loop
bands anchored to arbitrary fixed points.** Every one treats a band as a cable-machine substitute.
ExerciseDB's 1,324 records contain 61 band exercises — *fixed back close grip pulldown*, *seated
chest press*, *seated straight back row*, *wrist curl*, *shrug*, *concentration curl* — machine
analogues performed with a handled tube band, usually seated, with **zero records referencing an
anchor, door, post, or tree**. free-exercise-db has 20. ExerciseLibrary.com has 16. This is not a
gap that money closes, so the band library must be produced in-house at any budget.

**Why ExerciseLibrary.com specifically does not work**

- **They don't own the videos.** Exercise pages embed YouTube (`youtube-nocookie.com`) and Vimeo.
  Their terms grant reuse only for *"YouTube videos hosted on the platform… unmodified, with
  attribution"* — permission that adds an attribution obligation to a middleman without granting
  anything YouTube's embed terms don't already allow.
- **Everything else is all-rights-reserved.** Content is *"the exclusive property of Liaqa Fitness
  L.L.C-FZ"*; the terms prohibit reproducing, copying, distributing, publicly displaying, or
  creating derivative works without prior written consent, with an explicit legal-action warning.
  The instructions and cue text — the genuinely valuable part — are off the table.
- **Embeds are online-only.** YouTube's terms forbid downloading or caching for offline playback.
  An embed strategy fails the §11.6 airplane-mode release gate by construction.
- **Link rot and wrong equipment.** Embedding needs specific video ids, which die, go private, and
  region-lock; and third-party band tutorials overwhelmingly demonstrate handled tube bands that
  contradict the `setup` cue. This is exactly what the prototype's search-URL-only rule prevents.
- **The API is not live** — endpoints return a landing page; pricing is *"finalised at launch."*

**Other free options**

- **free-exercise-db** — Unlicense (public domain), 876 exercises with start/end photos. But only
  20 band exercises, and it is missing nearly every ladder variant (no archer, one-arm, or pike
  push-up; no L-sit, hollow hold, nordic curl, or Bulgarian split squat). **Image provenance is
  undocumented** — a repository declaring public domain does not clear third-party photo rights it
  never held. Usable for a few common bodyweight gaps if that risk is accepted; not a foundation.
- **wger** — CC-BY-SA 4.0, properly licensed, commercial use with attribution. Sparse,
  inconsistent community media; share-alike attaches to derivative datasets. Fine as a drawing
  reference, not as shipped media.

**The plan — all free**

Media resolves down a three-tier ladder, first match wins:

| Tier | Source | Requires network | Coverage |
|---|---|---|---|
| 1 | **Curated YouTube embed** — `video_id` set for this exercise | yes | grows over time |
| 2 | **In-house figure or self-filmed loop** — bundled | no | 100% from v1 |
| 3 | **YouTube search link** — constructed, cannot 404 | yes | 100%, always |

Online with a curated id: the embed, with the figure one tap away. Online without one: the figure,
plus the search link. Offline: the figure, always, with no dead player and no error — tier 1 and 3
are simply absent.

1. **Curated YouTube embeds — online, where a video has been selected.** Playing a hand-picked
   demonstration is strictly better than a search link, so where one has been vetted it is used.
   Embedding through the official IFrame player is permitted by YouTube's terms; downloading or
   caching for offline is not, which is exactly why tier 2 exists and why the embed is never the
   only option.
2. **In-house line-art figures — v1, bundled, every exercise.** Start and end position with a
   movement-path arrow and the band line, flat line art or silhouette. ~5–15 KB as SVG; all ~196
   exercises fit well under 3 MB, so **offline coverage is 100%**. Paired with the authoritative
   `setup` cue this teaches an anchored long-loop movement correctly — which nothing on the market
   does at any price. AI generation is appropriate at this tier: the abstraction contains the
   failure mode and each figure reviews in seconds.
3. **Self-filmed loops — post-launch, free, data-driven.** 2–4s silent loops; a phone on a tripod,
   no licensing, no chain-of-title question. Film the exercises that swap-rate and media-expansion
   metrics (§15) show actually confuse people, band movements first.
4. **YouTube search link — always, for anything not yet curated.** Constructed, zero-maintenance,
   cannot 404.

**Curated ids live in remote config, never in the bundle.** `video/{exercise_id}` syncs from
Firestore alongside the library deltas. This is what makes tier 1 safe: ids rot — videos get
deleted, set private, region-locked, or taken down — and a rotten id in a shipped binary is a bug
that needs an App Store release, while a rotten id in remote config is a one-line fix that reaches
every user the same day. **Never bundle a video id.**

**Curation criteria.** A video is only promoted to tier 1 if it demonstrates the movement with
**the same equipment class and anchoring** the `setup` cue describes — for band work that means a
long loop with no handles, anchored comparably. A technically excellent video of a handled tube
band is a rejection, not a compromise: it contradicts the cue and teaches the wrong setup. Also
required: no mid-roll ad-bait intro, movement visible within a few seconds, and no age restriction
or embedding block. Record `video_verified_at` on approval.

**Link health.** Three cheap mechanisms, in order of cost:
- **User reports.** A one-tap *"this video is wrong or broken"* under the player. Free, and the
  fastest real-world detector of rot and mis-curation. Two reports demote the exercise to tier 2
  automatically, pending review.
- **Player error handling.** The IFrame API surfaces unplayable/embedding-disabled/removed states.
  On any error the UI falls back to the figure silently — the user never sees a broken player — and
  the failure is reported back as an automatic flag.
- **Periodic sweep.** A scheduled job re-checks every curated id against the YouTube oEmbed
  endpoint and clears ones that no longer resolve. Anything older than ~12 months is re-reviewed.

**Player behavior.** `youtube-nocookie.com`, official IFrame player, no autoplay, no fullscreen
takeover. It must not hijack the audio session — cue tones and rest-timer alerts (§10.8) keep
priority — and must not pause or drift the workout timer. Skipped entirely on a metered connection
when the user has data saver on, falling back to tier 2.

**This is a differentiator, not a compromise.** Every competitor's band media shows a handled tube
band in a gym. Ours shows a long loop anchored to a bed frame, matching the cue text exactly.

**Rejected: AI-generated exercise video.** Joint angles, knee tracking, band paths, and rep tempo
are what generative video gets wrong, and a form demonstration that looks authoritative while being
subtly wrong is a safety problem, not a cosmetic one. Every clip would need expert review, erasing
the saving.

**Rejected: paid media libraries**, per the findings above. Note the distinction from tier 1:
a *curated, verified, remote-config* video id is supported; a *bundled* one, or one recalled
from memory rather than checked, is not.

### 11.5 Video curation tooling

Setting the canonical video for an exercise is an **operator workflow, not an app feature** — it
writes to remote config, so it never needs an App Store release and takes effect on every device at
the next sync. Modeled on the existing `workout_db.py` CLI, with the same discipline: validate
before writing, refuse invalid input rather than storing it.

```bash
python3 video_db.py queue                        # uncurated exercises, ranked by how often programmed
python3 video_db.py candidates <exercise_id>     # search, auto-filter, print a shortlist
python3 video_db.py set <exercise_id> <video_id> # validate, then write
python3 video_db.py verify [--stale 365]         # re-check every curated id; clear the dead ones
python3 video_db.py flagged                      # user-reported review queue
python3 video_db.py status                       # coverage: N of 196 curated, M flagged, K stale
```

**`candidates` does the filtering the machine can do.** It runs `search.list` using the exercise's
existing `video_search` query, then batches the results through `videos.list` for
`status.embeddable`, `status.privacyStatus`, `contentDetails.duration`, and
`contentDetails.regionRestriction`. It **auto-rejects** anything not embeddable, private,
age-restricted, region-locked, or longer than ~4 minutes — which eliminates the most common rot and
playback-failure classes *before a human ever looks*. It prints a ranked shortlist with title,
channel, duration, and a watch link.

**The human step is the one that can't be automated**: confirming the video shows the same
equipment class and anchoring as the `setup` cue — a long loop with no handles, anchored
comparably. That judgment is the entire value of tier 1 and the reason curation is worth doing at
all.

**`set` re-validates before writing** and refuses an id that fails any check, exactly as `plan`
refuses an invalid exercise id or anchor. On success it writes `video_id`, stamps
`video_verified_at`, and resets `video_flag_count`.

**Quota is a non-issue.** The free tier is 10,000 units/day; `search.list` costs 100 units and
`videos.list` costs 1 unit for up to 50 ids in a single call. So ~100 candidate searches per day —
the top 30 exercises in one sitting, the full 196 across two days — and `verify` re-checking every
curated id costs about **4 units total**. The API key lives on the operator's machine only; the app
never calls the Data API, only the IFrame player.

**Curate in impact order, not alphabetically.** `queue` ranks uncurated exercises by how often the
engine has actually programmed them, so the first 30 picks cover most sessions.

**The loop closes on user flags.** `flagged` lists exercises whose in-app "wrong or broken" reports
(§11.4) have accumulated, including any auto-flags raised by player errors. Re-curate, `set`, and
the counter resets.

*Optional companion:* a curation mode in debug/TestFlight builds — long-press the media block to
paste an id while looking at the cue and the figure together. Better context than the CLI for
judging equipment match; strictly a convenience, since the CLI is the system of record.

### 11.6 Acceptance criterion

> Install the app, put the device in airplane mode before first launch, and complete five workouts
> across three days — generation, progression, dashboard, and history all fully functional.
> This is a release gate.

---

## 12. Units, Time & Locale

- **Units** — kg / lb, user-selectable, defaulted from locale.
- **Band tensions** — B1–B5 with user-editable labels, colors, and approximate loads. Band brands
  differ; letting the user record what theirs actually are costs nothing and makes prescriptions
  meaningful.
- **Time — the important one.** Every session stores a triple: `utc_instant`, `local_date`, and
  `tz_id`. **All calendar math — weekly windows, the streak, the calendar heatmap, "days since" —
  uses `local_date`**, the date it was in the user's own time zone when they trained. Computing
  days in UTC or in a fixed home zone will punish users for flying east, which in a travel app is
  not an edge case but the normal condition.
- A timezone change is a **signal**, not a problem: it triggers the travel-day suggestion (§9.3)
  and the passport pin.
- 12/24-hour clock from locale.

---

## 13. Safety, Health & Privacy

### 13.1 Anchor safety classes

Inherited from the prototype's library, where it is already documented, and promoted to a UI-level
gate. There are two fundamentally different classes of anchor:

- **Band-tension anchors** (`anchor-low` / `-mid` / `-high`, `stance`, `feet`, `self-low`,
  `thigh-loop`) resist band tension only. A door, a bed frame, a post, a tree.
- **Bodyweight-bearing anchors** (`pullup-bar`, `body-support`) hold a full dynamic hanging or
  supported load. **A tree branch or an RV ladder is not a pull-up bar** — band tension and a
  dynamic hanging load are not comparable.

Bodyweight-bearing anchors are **off by default** and enabling one requires an explicit
confirmation carrying that copy: *"Can this hold your entire bodyweight, shock-loaded? Don't
guess."* Re-confirmed if unused for 30 days. Most travel fitness apps will happily program a
pull-up on an improvised anchor; not doing so is both a safety obligation and a trust position.

**Effort is also capped on this anchor class.** §5.4's `hard` effort table allows AMRAP sets at
0–1 reps in reserve — appropriate on the floor, not on a near-failure set from an improvised
hanging anchor with no spotter. Regardless of the user's chosen effort for the day, any exercise
with `anchor_class: bodyweight_bearing` (§4.1) is hard-capped at `normal` (2+ in reserve, no
AMRAP). This is a hard filter in code alongside the anchor gate itself, not a prompt or a
suggestion.

### 13.2 Injury & limitation model

- `user.limitations[]` holds tags matching the `contraindications[]` on exercises.
- **Applied as a hard filter in code, in step 1 of the pipeline, before any model sees anything.**
  A limitation is never expressed as a prompt hint.
- Editable from settings and from any exercise: *"This hurts my shoulder."*
- **Pain is not soreness.** Reporting pain on an exercise immediately (a) removes it from the
  current session with a swap, (b) suppresses that exercise and its contraindication tag for 14
  days, and (c) offers to make it a permanent limitation. The app **never diagnoses**. Copy:
  *"Stop that exercise. If it keeps hurting, see a professional."*
- Distinct from difficulty feedback — a `too_hard` rating regresses progression; a pain report
  removes a movement pattern.
- **Limitation presets bundle related tags.** Picking individual `contraindications[]` tags one at
  a time is real friction for a condition that maps to several at once. `Pregnancy` is the
  motivating case for this audience specifically — a common overlap with remote-work nomads —
  and selecting it applies the right bundle (e.g. `core_pressure`, `lower_back_extension`) in one
  tap, still editable individually afterward. Same hard filter, same code path: this is a UI
  convenience over existing tags, not a new safety mechanism.

### 13.3 Disclaimer

A medical disclaimer on first launch and permanently in settings. No health claims anywhere in
copy or App Store metadata.

### 13.4 HealthKit — in v1 (write only)

**Included in v1.** HealthKit *write* is genuinely cheap: one library, one entitlement, one
permission prompt, no design surface. On completion, write an `HKWorkout` of type
`functionalStrengthTraining` with duration and an estimated active-energy value.

Deliberately **not** in v1, because these are not cheap:

- **HealthKit read** (sleep, HRV, resting HR → jet-lag autoregulation) — a genuinely exciting
  feature for this persona, but it needs a real design and a trust story. *(Future)*
- **Apple Watch app** — React Native does not target watchOS. A companion app means a separate
  Swift target plus bridging: real cost, high value, wrong for v1. *(Future)*
- **Live Activities / Dynamic Island rest timer, plus a home-screen widget** (`This week`'s dots +
  Next Unlock) — both need a native widget extension in Swift, so bundle the work. The widget puts
  the app's core hook on the home screen without requiring an open, arguably higher-leverage than
  the rest timer alone. Small, native, and a strong v1.1 candidate. *(Future)*

### 13.5 Privacy

- Location: **opt-in, city-level, one lookup at completion**, stored as city/country strings.
  No coordinates, no continuous tracking, no background location.
- Health data is written, never read, and never leaves the device.
- Freeform text sent for distillation is user content; state this plainly in the privacy policy.

---

## 14. Dashboard & Analytics

The dashboard's job is not to report. It is to **make the next workout feel worth doing.**

**Governing rule: every element either accumulates monotonically or points at a concrete next
action. Nothing on this screen can shame.**

### 14.1 Elements, in order

**Above the fold**

1. **Today card** — the recommendation and its reason. One tap to start. (§10.1)
2. **This week** — `● ● ○`, travel days as neutral glyphs. Rolling 7-day window.
3. **Next Unlock** — *"Push-ups: 2 sessions from archer push-ups."* The most important motivational
   element in the app and the direct answer to "excitement for the next workout."

**Below**

4. **Progression board** — every movement family with its level badge, progress through the
   micro-ladder, and next unlock. This is v1's substitute for per-exercise graphs, and it is more
   motivating than a graph because it names a reward instead of plotting a trend.
5. **Passport** — world map with pinned cities, plus city and country counts. (§9.6)
6. **Calendar heatmap** — trained days shaded by session length; travel days marked. **Untrained
   days are neutral**, never red or empty-looking.
7. **Muscle balance** — hard sets per muscle group over a trailing 14 days, as horizontal bars with
   under/over-worked flags. This is the original spec's "consolidated progress per focus area",
   done better: it is meaningful from session one and it directly explains why today's
   recommendation is what it is. **Flags are neutral/informational, never a warning color** — an
   OVER-WORKED flag is styled in the same register as everything else on this screen, consistent
   with §1.1's "never punish." It explains a recommendation; it doesn't scold one.
8. **Lifetime counters** — sessions, total minutes, cities, countries, levels gained, best sets.
   All monotonic. All permanent.
9. **Time-estimate accuracy** — small: *"Your sessions finish within 8% of the estimate."* A quiet
   trust-builder.

**Deferred to *(Future)*:** per-exercise progress line graphs. They need ~10 sessions of data
before they say anything, and the progression board is a better motivator in the meantime.

### 14.2 Cold start

The dashboard must never look empty. With zero sessions it shows the full progression board at
starting levels, an explanation that the first sessions calibrate them, and the Today card. The
passport and calendar appear once they have anything to show.

### 14.3 Volume metric

**Hard sets per muscle group per week** is the hero volume metric — it is the evidence-based
number, the trailing-volume computation already exists in the prototype, and it is legible from the
first session. Total workout time is a secondary counter, not a headline.

---

## 15. Product Instrumentation

Separate from the user-facing dashboard. Without this there is no way to tell whether the engine is
any good.

- **Activation:** first *completed* workout. Target: within 5 minutes of install.
- **Funnel:** generate → approve → start → complete, with drop-off at each step.
- **Retention:** D1 / D7 / D30, and week-target adherence over time.
- **Completion rate by session length** — the direct test of the time-budget model.
- **Estimate accuracy** distribution (§14.1.9).
- **Swap and removal rate per exercise** — the library-quality signal. An exercise swapped away by
  many users has a bad cue, bad media, or a wrong difficulty tag.
- **Superset-pair completion rate** — whether users finish superset pairs at the prescribed rounds
  or bail to straight sets via swap/skip. The evidence for whether circuit mode (§17.4) is worth
  building later.
- **Abandon point** — which exercise and which set.
- **Video flag rate per exercise** — the link-rot and mis-curation detector (§11.4), and a
  standing signal that a curated pick contradicts its cue.
- **Explicit feedback capture rate** — expected to be low by design; watch that implicit signal
  volume is high.
- **Offline share** — proportion of sessions generated with no connectivity. Validates §11.

---

## 16. Future Features

Ordered roughly by expected value.

1. **Found equipment / partial gyms.** The fast-follow. Equipment as an inventory of items with
   attributes (dumbbells to a max weight, a bench, a bar) rather than three toggles. The app breaks
   the first time a user hits a hotel gym, and that is the day they open something else — so this
   is the highest-value addition after v1 ships.
2. **Onboarding**, including a 3-move baseline assessment to seed progression levels, an
   implementation-intention capture (*"when I wake up in a new city, before coffee"* — roughly 2–3×
   adherence versus a plain goal), and the user's own stated *why*, surfaced verbatim at friction
   moments.
3. **Apple Watch companion** — rest timer and set logging on the wrist. Separate Swift target.
4. **Live Activities / Dynamic Island rest timer, plus a home-screen widget** (`This week`'s dots +
   Next Unlock). Same native Swift widget-extension work either way, worth bundling; strong v1.1
   candidate.
5. **HealthKit read** → jet-lag and sleep autoregulation: *"You slept 4 hours and crossed 8 time
   zones — want a lighter session?"* Uniquely suited to this app.
6. **Training partner.** One person who sees your weekly check-in — not a feed. The highest-leverage
   retention mechanic identified, and the most expensive. Design the data model for it now.
7. **Filmed demo loops** for the band exercises the data shows are confusing, and **additional
   progression ladders** for the accessory patterns listed in §6.6.
8. **Circuit mode** (3+ exercise rotating format) — cut from v1 (§17.4). Superset pairs already
   cover most of the same variety at a fraction of the state-machine cost; revisit if
   superset-pair completion and format-preference data (§15) show demand for the rest.
9. **Per-exercise progress graphs**, once enough history exists.
10. **Monetization.** Decide the model after v1 is locked. Likely shape: free core generator and
    library forever; subscription for progression coaching, natural-language intake, and advanced
    analytics.
11. Android.

---

## 17. Open Questions

1. **Progression ladder authoring.** *(Scoped — see §6.6.)* Eight primary families,
   ~55–70 entries, mostly retagging exercises that already exist. Batch LLM authoring plus a manual
   review pass. The remaining nine accessory patterns need no ladder at all.
2. **Exercise media.** *(Resolved — see §11.4.)* No paid licensing; no library covers anchored
   long-loop band work at any price. Three tiers: curated YouTube embed when online and selected,
   bundled in-house figure always, search link as the universal fallback. Open: how many exercises
   to curate videos for before launch — the figure tier means zero is shippable, so this can start
   at the most-programmed 30 and grow from user flags.

3. **Default weekly target.** *(Resolved — see §9.1.)* Keep 3 as the default. After four weeks of
   observed completion rate, suggest an adjustment (bounded 1–7) rather than apply one — the app
   should never look like it quietly lowered its expectations of the user without telling them.
4. **Circuit mode.** *(Resolved — cut from v1.)* It doubles the active-workout state machine
   (rounds, transition rests, per-round progression) for a format with no usage data behind it
   yet. Superset pairs (already in the `hard` effort row, §5.4) cover most of the same variety at
   a fraction of the cost. Revisit as a fast-follow if the data asks for it (§15, §16).

---

## Appendix A — Name Candidates

**RoamFit** is the current working title — picked as the front-runner from the batch below,
but not locked in. "Road Warrior" — the name this spec started under — is heavily used (Mad Max,
corporate travel, several existing apps) and is likely hard to own or rank for in the App Store,
which is what started this list. All alternatives below remain live candidates in case the pick
changes. Each needs an App Store and USPTO check before any brand work.

| Name | Why it works |
|---|---|
| **Carry-On** | Travel word and a training pun at once. Implies *everything you need fits in a bag* — which is literally the product. Short, warm, memorable. |
| **Long Haul** | The flight *and* the consistency thesis — "in it for the long haul." Says the accountability promise in two words. |
| **Latitude** | Travel plus *"give yourself latitude"* — the forgiving-accountability model in one word. Elegant, distinctive. |
| **Hitch** | Triple meaning: hitching a band to an anchor (the term is already in your own anchor notes), hitchhiking, and *"without a hitch."* Short and ownable. |
| **Tether** | What a band does, and what training does for you when everything else is in motion. Strong, simple. |
| **Duffel** | The bag the bands live in. Unusual as an app name, warm, easy to own. |
| **Waypoint** | Travel navigation plus progression milestones — pairs naturally with the ladder and the passport. |
| **Bivouac / Bivy** | A temporary camp. Evocative and very ownable; more niche, skews outdoorsy. |
| **Anchor** | Steals the app's own vocabulary — the anchor chip (§5.3) is the one thing the user configures. Anchor is also exactly what this app is *for*: something fixed when the room, time zone, and equipment never are. |
| **Rig** | "Your rig" is already how lifters talk about a home training setup — a band and an anchor point *is* a rig. One syllable, easy to search, reads as insider language. |
| **Foothold** | Literal (stance and ground contact) and metaphorical (gaining purchase on unstable terrain) — a tight match for §1's "consistency under disruption" thesis. |
| **Keel** | "On an even keel" — steady despite rough conditions. Same move as Long Haul (borrow a travel idiom for the accountability promise), nautical instead of aviation. |
| **Groundwork** | Bodyweight/floor-training pun plus "laying the groundwork" for a habit. Warm, approachable. |
| **Ratchet** | A ratchet only moves one direction — matches the monotonic, never-regress design philosophy (§14) almost literally. Carries unrelated slang baggage worth a gut-check. |
| **True North** | The fixed reference point when everything else — city, time zone, gym — is in motion. Leans on the accountability thesis more than the training mechanic. |

Previous pick, before RoamFit: **Untethered**. Before that: **Carry-On**, with **Long Haul** as
runner-up — both say travel and training simultaneously without needing a tagline.
