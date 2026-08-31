# Wave 7 — Acceptance & instrumentation

**Track id:** `7-acceptance` · **Status file:** `docs/handoff/STATUS-7-acceptance.md`
**Spec sections to read:** §11.6, §15, §13.3, §13.5, §12. Do not read the whole spec.

The release gate. This wave's job is to **try to break the app**, not to confirm it works.

## 1. The §11.6 acceptance criterion — a hard release gate

> Install the app, put the device in airplane mode **before first launch**, and complete five
> workouts across three days — generation, progression, dashboard, and history all fully
> functional.

Run it literally, on a clean install, from a cold binary. "Before first launch" is the part that
catches assumptions about a first-run network fetch. Record the result honestly in the status
file, including anything that degraded that shouldn't have. **If this fails, the wave is not done
— do not paper over it.**

## 2. Adversarial passes

Test the things unit tests structurally miss:

- **Timezone.** Fly east and west across the date line mid-week. Weekly windows, "days since",
  the heatmap, and the passport must all stay correct — §12 says computing in UTC punishes users
  for flying east, which in this app is the normal condition, not an edge case.
- **Interruption.** Force-quit mid-set, mid-rest, mid-timed-hold, and at the summary screen. Kill
  during the completion transaction specifically.
- **Clock.** Device clock changed forward and backward mid-session. Timers are wall-clock based
  (§10.8) — check they degrade sanely rather than going negative or hanging.
- **Long gaps.** 7-day and 21-day gaps trigger the right comeback tiers; 6–8 weeks triggers a
  Recovery Week suggestion.
- **Cold start.** Zero sessions: dashboard meaningful, progression board populated, nothing empty.
- **Ladder ends.** A user at max level in a family gets Mastery treatment, not a dead end.
- **Safety.** With a limitation set, no contraindicated exercise appears anywhere — generation,
  swap alternatives, or Quick Session. With bodyweight-bearing anchors off, no pull-up appears.
  With one on, effort is still capped at `normal` (§13.1). **Try to make the filters fail.**

## 3. §15 product instrumentation

Separate from the user-facing dashboard — without it there is no way to tell whether the engine is
any good. Activation (first *completed* workout, target within 5 minutes of install) · funnel
generate→approve→start→complete with drop-off · D1/D7/D30 retention and week-target adherence ·
completion rate by session length · estimate-accuracy distribution · swap and removal rate per
exercise (the library-quality signal) · superset-pair completion rate · abandon point · video flag
rate · explicit feedback capture rate (expected low by design — watch that implicit volume is
high) · **offline share** (proportion of sessions generated with no connectivity, which validates
§11).

## 4. Compliance and polish

- **Medical disclaimer** on first launch and permanently in settings (§13.3). No health claims in
  copy or App Store metadata.
- **Privacy** (§13.5): location opt-in, city-level, one lookup at completion, strings only. Health
  written never read. State plainly that freeform text sent for distillation is user content.
- Close out remaining carried-forward issues in `docs/ORCHESTRATION.md`, or re-file them
  explicitly as post-v1 with a reason.

## 5. Before declaring done — the human gate

**Carried-forward issue #1 must be closed by a human**: `docs/review/contraindications-review.md`
lists 32 exercises with no contraindication tags, 18 with a suspected missing tag. §13.2 makes
this a hard safety filter and the pregnancy preset depends on it. **Do not mark this wave done
while that review is unsigned.** Surface it prominently in your final report.

## Done criteria

- [ ] §11.6 airplane-mode gate passes on a clean install, run literally.
- [ ] Every adversarial pass above run and recorded, with failures fixed, not excused.
- [ ] §15 instrumentation emitting and verified.
- [ ] Disclaimer and privacy copy in place.
- [ ] Carried-forward issues closed or explicitly re-filed as post-v1.
- [ ] The contraindication review is flagged to the user as the remaining human blocker.
