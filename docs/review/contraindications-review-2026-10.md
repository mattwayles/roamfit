# Contraindication review — full library, 2026-10

> **This is not the human review.** It is an AI pass written in the role of a strength and
> conditioning coach holding the NSCA's CSCS certification, requested 2026-10-18 (Track 37c). It
> reasons from movement mechanics and from widely published coaching and prenatal-exercise
> guidance. It is not clinical advice, and it does not replace a review by a qualified human
> (a physical therapist, or a CSCS working with one) before public release. The pregnancy and
> postpartum filter is the highest-stakes part and should be reviewed first.

**Why this matters.** `contraindications[]` is a hard filter run in code before anything else
(invariant 3). A user who ticks a limitation (Settings → Your body → Limitations, or onboarding)
never sees an exercise carrying any of that choice's tags. A missing tag is a safety failure; a
spurious one only shrinks the pool. The earlier review (`contraindications-review.md`, 2026-08)
covered 32 untagged exercises. This one covers all 267.

**Method.** Every exercise was read by name and setup cue, grouped by pattern, and judged against
what the tag stands for (below). Changes were applied with one scripted pass, so the list at the end
is exactly what changed. Three text-based guards in `packages/data/src/contraindications.test.ts`
now fail the build if a future exercise puts the user on their back, on their front, or on their
hands without the matching tag.

**Result.** 93 exercises changed, 138 tag edits (131 added, 7 removed). Every
limitation choice still leaves a full session (warm-up, at least 3 main exercises, cool-down) for
every focus, with and without equipment — pinned in
`packages/store/src/repositories/limitationChoices.test.ts`.

---

## What each tag means (the standard this review applied)

| Tag                    | Filtered by choice(s)       | Applies when the exercise…                                                                                          |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `shoulder_overhead`    | Shoulder: reaching overhead | loads the arm at or above shoulder height, or hangs from it                                                         |
| `shoulder_horizontal`  | Shoulder: pushing and flyes | presses or flies across the chest, or loads the front of the shoulder in extension (dips, crab position)            |
| `elbow`                | Elbow                       | isolates or heavily loads elbow flexion/extension (curls, triceps work, chin/pull-ups, dips)                        |
| `wrist_extension`      | Wrist                       | puts body weight on a bent-back wrist (hands on the floor or a bench)                                               |
| `knee_flexion_loaded`  | Knee                        | bends the knee deeply under load (squats, lunges, landings)                                                         |
| `knee_impact`          | Knee, No jumping, Pregnancy | involves a flight phase or landing (jumps, hops, running/jogging in place, rope)                                    |
| `hip`                  | Hip                         | takes the hip to end range or loads it unilaterally (deep lunges, wide stances, single-leg hinges)                  |
| `lower_back_flexion`   | Lower back                  | flexes the lumbar spine under load or holds a hinged/rounded position                                               |
| `lower_back_extension` | Lower back                  | extends or arches the lumbar spine under load (hinges, bridges, back extensions, straight-leg lowering)             |
| `neck`                 | Neck                        | lifts or flexes the head against gravity (crunch family) or loads the upper traps                                   |
| `ankle`                | Ankle or foot               | loads the ankle through impact, cutting or a sustained single-foot balance                                          |
| `core_pressure`        | Pregnancy                   | creates high intra-abdominal pressure or abdominal doming: sustained planks, crunches/sit-ups, V-ups, heavy bracing |
| `lying_supine` (new)   | Pregnancy                   | is performed lying on the back                                                                                      |
| `lying_prone` (new)    | Pregnancy                   | is performed lying on the front                                                                                     |

---

## Pregnancy and postpartum — reasoning

Prenatal exercise guidance broadly encourages moderate strength and aerobic work, and asks people to
avoid: lying flat on the back for long periods after the first trimester (pressure on the vena
cava), lying on the front as the bump grows, high intra-abdominal pressure and breath-holding,
crunch-style movements that dome a separating midline (diastasis recti, which also matters
postpartum), and high-impact or fall-risk work unless already well practised. The choice maps to
`core_pressure`, `knee_impact`, `lying_supine` and `lying_prone`.

- **Added `lying_supine` (44)** and **`lying_prone` (7)** — the two new tags. The library had no way to
  express position, so before this review a pregnant user could be given dead bugs, glute bridges,
  floor presses and every crunch.
- **Added `core_pressure` to 27** — the whole crunch/sit-up family, straight-leg lowering (leg raises,
  scissors, windshield wipers), Russian twists, every high-plank variant with movement (shoulder taps,
  knee-to-elbow, plank rows, up-downs, mountain climbers), and the banded swing. Sustained planks and
  V-ups already carried it; the dynamic plank family and crunches did not, which was inconsistent.
- **Removed `core_pressure` from 4** — `wu-cat-cow`, `cd-childs-pose`, `bw-bird-dog`, `bird-dog`. These
  are low-pressure positions that prenatal and back-care programmes commonly prescribe; tagging them
  removed exactly the work a pregnant user is most likely to be told to do. `bw-bird-dog` and
  `bird-dog` keep `wrist_extension`.

**Open questions for the human reviewer (not decided here):**

1. **Short-duration supine work.** Many clinicians allow brief supine exercises (a set of glute bridges)
   in later pregnancy. The filter excludes all of them. That is conservative by design; a reviewer may
   want a "first trimester" vs "later" distinction, which would need a second choice.
2. **Balance and fall risk.** Single-leg work (pistols, single-leg RDLs, step-ups) has no tag for fall
   risk, so the pregnancy choice keeps it. Worth a dedicated tag if the reviewer agrees.
3. **Inversions.** Pike push-ups and wall handstand push-ups are head-down. Only the handstand carries
   `core_pressure`. An `inversion` tag is the honest fix.
4. **Postpartum is not pregnancy.** One choice covers both today. Postpartum guidance (pelvic-floor
   recovery, diastasis) differs, and supine work is usually fine postpartum. Splitting the choice
   would give postpartum users far more of the library back.

---

## Other additions — reasoning by group

- **`neck` (+21).** Only one exercise in the library carried it. Every movement that lifts the head
  against gravity (crunches, sit-ups, V-ups, jackknives, hollow holds, scissors with shoulders lifted,
  side crunches with a hand behind the head) is the classic neck aggravator; the shrug loads the upper
  traps directly.
- **`wrist_extension` (+6).** Quadruped work that was missing it: `bw-fire-hydrant`, `glute-kickback`,
  `donkey-kick`, `wu-cat-cow`; `bw-dip` (bench dips load an extended wrist heavily); `bw-turkish-getup`
  (posting on the hand).
- **`lower_back_extension` (+7).** `bw-superman` (it is a back extension); `donkey-kick` (driving the heel
  to the sky arches the low back); straight-leg flutter kicks and leg raises (the hip flexors pull the
  lumbar spine into extension as the legs lower); `bw-sprawl` ("snap the hips down").
- **`lower_back_flexion` (+2).** `bw-inchworm` (straight-leg forward fold) and `tricep-kickback` (held
  hinge, consistent with `bent-over-row`).
- **`shoulder_horizontal` (+2).** `bw-crab-walk` (loads the front of the shoulder in extension);
  `bw-wall-push-up` (horizontal pressing, however light — the same asymmetry argument the 2026-08
  sign-off used for its wrist tag).
- **`shoulder_overhead` (+1).** `overhead-march` holds both arms pressed overhead.
- **`elbow` (+2).** `bw-pull-up` and `assisted-pull-up`, consistent with `bw-chin-up` and the archer
  pull-up.
- **`knee_impact` (+4).** `bw-butt-kick` (jogging), `banded-resisted-sprint` (sprint in place, consistent
  with `bw-sprint-in-place`), `bw-boxer-shuffle` (continuous small hops), `bw-plank-jack` (the feet jump).
- **`knee_flexion_loaded` (+2).** `bw-pop-squat` and `bw-star-jump` both land into a squat.
- **`ankle` (+5).** Lateral shuffles, sprinting in place, the boxer shuffle and the pop squat.
- **`hip` (+1).** `wu-world-greatest` takes the hip to end range in a deep lunge.

## Removals — reasoning

Each removal loosens a safety filter, so each is listed with why it was judged over-cautious rather
than correct. All are pinned in `contraindications.test.ts`.

| Exercise                                 | Removed             | Why                                                                                                                                                                                          |
| ---------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wu-cat-cow`, `cd-childs-pose`           | `core_pressure`     | Low-pressure mobility staples, routinely prescribed in pregnancy.                                                                                                                            |
| `bw-bird-dog`, `bird-dog`                | `core_pressure`     | The bird dog is a standard low-load spine-stability drill (prenatal, postpartum and back care).                                                                                              |
| `bw-side-plank`, `bw-side-plank-hip-dip` | `wrist_extension`   | Both are cued "on one forearm": no wrist extension. Same call the 2026-08 sign-off made for the forearm plank.                                                                               |
| `bw-scap-push-up`                        | `shoulder_overhead` | Protraction/retraction in a plank, with the arm at 90 degrees, not overhead. It is a common serratus drill in overhead-shoulder rehab. Closes the backlog question. Keeps `wrist_extension`. |

## Considered and left alone

- `band-shrug`, `lateral-raise`, `front-raise`, `upright-row` keep `shoulder_overhead` although none goes
  fully overhead: raising toward and above shoulder height is where an irritated shoulder complains.
- `cd-thoracic-rotation` stays untagged (the 2026-08 reasoning holds: prescribed _for_ back complaints).
- Regular push-ups do not get `core_pressure`. Brief dynamic sets are commonly kept in prenatal
  programmes (often inclined); sustained planks are where the pressure builds. A reviewer may disagree.
- Squats and lunges with a band over the shoulders do not get `core_pressure`: band loads do not reach
  breath-holding territory the way the heavy front squat, thruster and deadlifts (already tagged) can.

---

## Every change

Generated from the scripted pass. `+` = added, `-` = removed.

| Exercise                     | Changes                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `assisted-pull-up`           | `+elbow`                                                   |
| `band-shrug`                 | `+neck`                                                    |
| `band-swing`                 | `+core_pressure`                                           |
| `banded-bicycle-crunch`      | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `banded-jackknife`           | `+lying_supine`, `+neck`                                   |
| `banded-lateral-shuffle`     | `+ankle`                                                   |
| `banded-oblique-v-up`        | `+lying_supine`, `+neck`                                   |
| `banded-plank-knee-to-elbow` | `+core_pressure`                                           |
| `banded-pulse-up`            | `+lying_supine`                                            |
| `banded-resisted-sprint`     | `+ankle`, `+knee_impact`                                   |
| `banded-scissors`            | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `banded-v-up`                | `+lying_supine`, `+neck`                                   |
| `bird-dog`                   | `-core_pressure`                                           |
| `bw-alternating-crunch`      | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-bicycle-crunch`          | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-bird-dog`                | `-core_pressure`                                           |
| `bw-boxer-shuffle`           | `+ankle`, `+knee_impact`                                   |
| `bw-burpee`                  | `+lying_prone`                                             |
| `bw-butt-kick`               | `+knee_impact`                                             |
| `bw-corkscrew`               | `+lying_supine`                                            |
| `bw-crab-walk`               | `+shoulder_horizontal`                                     |
| `bw-crunch`                  | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-dead-bug`                | `+lying_supine`                                            |
| `bw-dip`                     | `+wrist_extension`                                         |
| `bw-elevated-crunch`         | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-fire-hydrant`            | `+wrist_extension`                                         |
| `bw-flutter-kick`            | `+lying_supine`, `+lower_back_extension`                   |
| `bw-glute-bridge`            | `+lying_supine`                                            |
| `bw-heel-tap`                | `+lying_supine`, `+neck`                                   |
| `bw-hollow-hold`             | `+lying_supine`, `+neck`                                   |
| `bw-inchworm`                | `+lower_back_flexion`                                      |
| `bw-jackknife`               | `+lying_supine`, `+neck`                                   |
| `bw-leg-raise`               | `+lying_supine`, `+core_pressure`, `+lower_back_extension` |
| `bw-mountain-climber`        | `+core_pressure`                                           |
| `bw-oblique-v-up`            | `+lying_supine`, `+neck`                                   |
| `bw-pendulum`                | `+lying_supine`                                            |
| `bw-plank-jack`              | `+knee_impact`                                             |
| `bw-plank-knee-to-elbow`     | `+core_pressure`                                           |
| `bw-plank-shoulder-tap`      | `+core_pressure`                                           |
| `bw-plank-up-down`           | `+core_pressure`                                           |
| `bw-pop-squat`               | `+ankle`, `+knee_flexion_loaded`                           |
| `bw-prone-ytw`               | `+lying_prone`                                             |
| `bw-pull-up`                 | `+elbow`                                                   |
| `bw-pulse-up`                | `+lying_supine`                                            |
| `bw-push-through`            | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-reverse-crunch`          | `+lying_supine`, `+core_pressure`                          |
| `bw-russian-twist`           | `+core_pressure`                                           |
| `bw-scap-push-up`            | `-shoulder_overhead`                                       |
| `bw-scissors`                | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-side-crunch`             | `+neck`                                                    |
| `bw-side-plank`              | `-wrist_extension`                                         |
| `bw-side-plank-hip-dip`      | `-wrist_extension`                                         |
| `bw-single-leg-glute-bridge` | `+lying_supine`                                            |
| `bw-sit-up`                  | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `bw-sprawl`                  | `+lower_back_extension`                                    |
| `bw-sprint-in-place`         | `+ankle`                                                   |
| `bw-star-jump`               | `+knee_flexion_loaded`                                     |
| `bw-superman`                | `+lying_prone`, `+lower_back_extension`                    |
| `bw-turkish-getup`           | `+lying_supine`, `+wrist_extension`                        |
| `bw-twist`                   | `+lying_supine`                                            |
| `bw-v-up`                    | `+lying_supine`, `+neck`                                   |
| `bw-wall-push-up`            | `+shoulder_horizontal`                                     |
| `bw-windshield-wiper`        | `+lying_supine`, `+core_pressure`                          |
| `cd-childs-pose`             | `-core_pressure`                                           |
| `cd-cobra`                   | `+lying_prone`                                             |
| `cd-figure-four`             | `+lying_supine`                                            |
| `cd-hamstring-band`          | `+lying_supine`                                            |
| `dead-bug`                   | `+lying_supine`                                            |
| `donkey-kick`                | `+wrist_extension`, `+lower_back_extension`                |
| `floor-press`                | `+lying_supine`                                            |
| `floor-pullover`             | `+lying_supine`                                            |
| `flutter-kick`               | `+lying_supine`, `+lower_back_extension`                   |
| `frog-pump`                  | `+lying_supine`                                            |
| `glute-bridge`               | `+lying_supine`                                            |
| `glute-kickback`             | `+wrist_extension`                                         |
| `hamstring-curl`             | `+lying_prone`                                             |
| `hollow-hold`                | `+lying_supine`, `+neck`                                   |
| `kneeling-crunch`            | `+core_pressure`                                           |
| `leg-raise`                  | `+lying_supine`, `+core_pressure`, `+lower_back_extension` |
| `mountain-climber`           | `+core_pressure`                                           |
| `overhead-march`             | `+shoulder_overhead`                                       |
| `plank-band-drag`            | `+core_pressure`                                           |
| `plank-row`                  | `+core_pressure`                                           |
| `prone-band-pulldown`        | `+lying_prone`                                             |
| `reverse-crunch`             | `+lying_supine`, `+core_pressure`                          |
| `russian-twist`              | `+core_pressure`                                           |
| `self-anchored-crunch`       | `+lying_supine`, `+neck`, `+core_pressure`                 |
| `single-leg-bridge`          | `+lying_supine`                                            |
| `skull-crusher`              | `+lying_supine`                                            |
| `tricep-kickback`            | `+lower_back_flexion`                                      |
| `wu-cat-cow`                 | `-core_pressure`, `+wrist_extension`                       |
| `wu-world-greatest`          | `+hip`                                                     |
| `ytw-raise`                  | `+lying_prone`                                             |

---

## Sign-off

- [ ] Human reviewer (physical therapist or CSCS): ____________ date: ________
- [ ] Open questions 1–4 above decided
