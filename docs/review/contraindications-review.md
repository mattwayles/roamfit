# Contraindication review — 32 untagged exercises

**Why this matters:** `contraindications[]` is a **hard filter applied in code** before anything
else runs (§13.2, invariant 3). If a tag is missing, an exercise that should be filtered out for
an injury or for the pregnancy preset (§13.2) will be programmed. A spurious tag only shrinks the
pool; a missing one is a safety issue. This list should be closed before launch.

**How to use this:** each row has my suspicion in the last column. `—` means I think untagged is
genuinely correct. Anything else is a tag I'd expect to be there and would like a second opinion
on. Valid tags are the §4.1 enum: `shoulder_overhead`, `shoulder_horizontal`, `elbow`,
`wrist_extension`, `knee_flexion_loaded`, `knee_impact`, `hip`, `lower_back_flexion`,
`lower_back_extension`, `neck`, `ankle`, `core_pressure`.

To apply a decision, edit `NEW_EXERCISES`/the tagging map in
`packages/data/scripts/migrate_library.py`, re-run it, then `npm run validate:library`.

---

## Likely genuinely fine (low-risk, low-load) — 14

These are light, supported, or small-range movements where no tag is the defensible answer.

| id | name | pattern |
|---|---|---|
| `pull-apart` | Band Pull-Apart | horizontal_pull |
| `face-pull` | Band Face Pull | horizontal_pull |
| `seated-row` | Seated Row | horizontal_pull |
| `door-row` | Door-Anchor Horizontal Row | horizontal_pull |
| `wide-high-row` | Wide High Row | horizontal_pull |
| `hip-abduction` | Standing Hip Abduction | abduction |
| `lateral-walk` | Lateral Band Walk | abduction |
| `monster-walk` | Monster Walk | abduction |
| `wu-lateral-walk` | Warm-Up Lateral Walk | abduction |
| `pallof-press` | Pallof Press | anti_rotation |
| `half-kneeling-pallof` | Half-Kneeling Pallof Press | anti_rotation |
| `pallof-hold` | Anti-Rotation Hold | anti_rotation |
| `staggered-pallof-press` | Staggered-Stance Pallof Press | anti_rotation |
| `suitcase-hold` | Banded Suitcase Hold | anti_rotation |

## I think these are missing a tag — 18

| id | name | my suspicion | reasoning |
|---|---|---|---|
| `wu-shoulder-passthrough` | Band Shoulder Pass-Through | `shoulder_overhead` | The movement is definitionally an overhead arc. This is the one I'm most confident about. |
| `overhead-pull-apart` | Overhead Band Pull-Apart | `shoulder_overhead` | Name says overhead. |
| `cd-lat-stretch` | Banded Lat Stretch | `shoulder_overhead` | Anchored overhead, loaded end-range shoulder flexion. |
| `cd-shoulder-distraction` | Banded Shoulder Distraction | `shoulder_overhead` | Distraction is applied at end-range overhead. |
| `cd-shoulder-band-stretch` | Band Shoulder Stretch | `shoulder_overhead` | Same class as the two above. |
| `wu-arm-circles` | Arm Circles | `shoulder_overhead` | Full circles pass through overhead. Unloaded, so this is the weakest of the shoulder group — arguably fine untagged. |
| `bent-over-row` | Bent-Over Row | `lower_back_flexion` | Sustained hip-hinged position under load is the classic lumbar-flexion complaint. |
| `single-arm-row` | Single-Arm Bent-Over Row | `lower_back_flexion` | Same position, plus an asymmetric load. |
| `reverse-woodchop` | Low-to-High Woodchop | `lower_back_extension` | Finishes high with loaded rotation and extension. |
| `half-kneeling-chop` | Half-Kneeling Band Chop | `lower_back_extension` | Same pattern, half-kneeling. Lower risk but same class. |
| `side-bend` | Banded Side Bend | `lower_back_flexion` | Loaded lateral spinal flexion. |
| `cd-lat-side-bend` | Standing Lat Side Bend | `lower_back_flexion` | Unloaded version of the above. |
| `cd-thoracic-rotation` | Thoracic Rotation | `lower_back_extension` | Usually fine, but it is end-range spinal rotation. |
| `clamshell` | Banded Clamshell | `hip` | Direct hip abduction/external rotation under band tension. |
| `bw-fire-hydrant` | Fire Hydrant | `hip` | Loaded hip abduction in flexion. |
| `bw-wall-push-up` | Wall Push-Up | `wrist_extension` | Any push-up loads an extended wrist, even at the easiest rung. Compare: the rest of the push-up ladder should be checked for the same tag. |
| `bw-inverted-row` | Inverted Row | `shoulder_horizontal`, `elbow` | Horizontal pulling under bodyweight. Also see the separate anchor question below. |
| `wu-pull-apart` | Warm-Up Pull-Apart | `shoulder_horizontal` | Very light, so this may be over-cautious. |

---

## Two related questions while you're in here

1. **`bw-inverted-row` anchor class** (carried-forward issue #2). It is tagged
   `anchor: pullup-bar`, which makes it `bodyweight_bearing` — so it is off by default and
   effort-capped at `normal` (§13.1). That may be too strict: an inverted row is partial-support,
   not a full dynamic hang. Changing it would make it available to far more users. Your call, and
   it's a safety judgment, not a tagging one.

2. **Consistency check worth running.** If you accept `wrist_extension` on `bw-wall-push-up`,
   the same tag probably belongs on every push-up rung and every plank variant — worth a sweep
   rather than a one-off edit.

---

## Sign-off

- [ ] Reviewed by: ____________________  date: __________
- [ ] Decisions applied to `migrate_library.py` and `npm run validate:library` re-run
