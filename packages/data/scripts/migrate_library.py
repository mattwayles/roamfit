#!/usr/bin/env python3
"""
One-time migration: daily-workout skill prototype exercises.json (196 records) ->
packages/data/library/exercises.json on the wave-01b-content §4.1 schema.

Source is READ ONLY (~/.claude/skills/daily-workout/references/exercises.json); this script
never mutates it. Re-run is idempotent: it always regenerates library/exercises.json from the
source plus the judgment tables below, so all judgment calls live in this file, in git, for
review.

Judgment calls encoded here (see docs/handoff/STATUS-1b-content.md for the ones flagged
uncertain):
  - anchor_class is MECHANICALLY derived from anchor per §13.1 (never hand-tagged).
  - role is derived from id prefix: wu- -> warmup, cd- -> cooldown, else -> main.
  - The prototype's non-schema pattern buckets (`isolation`, `conditioning`, `warmup`,
    `cooldown`) are remapped to the real §4.1 pattern enum in PATTERN_OVERRIDES, decided from
    each exercise's primary/secondary muscles and movement mechanics.
  - metric/default_seconds: TIME_SECONDS lists every held/isometric exercise; everything else
    is reps.
  - contraindications are assigned by pattern + explicit per-id additions/removals in
    CONTRA_EXTRA / CONTRA_REMOVE — see the tag rationale comments inline.
  - tier: 'core' for main-role band/bodyweight strength work, 'fill' for isolation/accessory
    and conditioning finishers, 'stretch' for the cooldown pool.
"""
import json
import re
from pathlib import Path

SRC = Path.home() / ".claude/skills/daily-workout/references/exercises.json"
OUT = Path(__file__).resolve().parents[1] / "library/exercises.json"

# ---------------------------------------------------------------------------
# Pattern remap: only needed for ids whose prototype `pattern` is not a valid
# §4.1 pattern (isolation / conditioning / warmup / cooldown). Anything not
# listed here keeps its prototype pattern unchanged (it already matches).
# ---------------------------------------------------------------------------
PATTERN_OVERRIDES = {
    # --- isolation -> real accessory pattern ---
    "lateral-raise": "shoulder_isolation",
    "front-raise": "shoulder_isolation",
    "reverse-fly": "shoulder_isolation",
    "band-shrug": "shoulder_isolation",
    "ytw-raise": "shoulder_isolation",
    "bicep-curl": "elbow_flexion",
    "hammer-curl": "elbow_flexion",
    "single-arm-curl": "elbow_flexion",
    "reverse-curl": "elbow_flexion",
    "tricep-pushdown": "elbow_extension",
    "overhead-tricep-ext": "elbow_extension",
    "tricep-kickback": "elbow_extension",
    "skull-crusher": "elbow_extension",
    "hamstring-curl": "hip_extension",  # JUDGMENT CALL: no knee_flexion isolation bucket exists;
    # hamstrings are hip extensors too, closest §4.1 accessory pattern. Flagged for review.
    "hip-abduction": "abduction",
    "lateral-walk": "abduction",
    "monster-walk": "abduction",
    "clamshell": "abduction",
    "calf-raise": "calf",
    "single-leg-calf-raise": "calf",
    "wall-sit-abduction": "abduction",
    "tke": "hip_extension",  # JUDGMENT CALL: terminal knee extension has no matching accessory
    # bucket (targets quads, not hip/glute); nearest available leg-accessory tag. Flagged.
    "side-bend": "lateral_flexion",  # was prototype "flexion"; this is a lateral (not sagittal) bend
    "standing-side-crunch": "lateral_flexion",  # was prototype "flexion"; oblique side crunch
    "bent-over-y-raise": "shoulder_isolation",
    "bw-scap-push-up": "shoulder_isolation",
    "bw-prone-ytw": "shoulder_isolation",
    "bw-wall-sit": "squat",  # isometric knee-dominant hold, feeds the squat/legs slot
    "bw-calf-raise": "calf",
    "bw-single-leg-calf-raise": "calf",
    "bw-donkey-kick": "hip_extension",
    "bw-fire-hydrant": "abduction",
    # --- conditioning -> primary mover pattern (per primary muscle in source data) ---
    "thruster": "squat",
    "squat-to-press": "squat",
    "deadlift-high-pull": "hinge",
    "clean-and-press": "hinge",
    "lunge-press": "lunge",
    "push-up-to-row": "horizontal_push",
    "banded-burpee": "squat",
    "bear-crawl": "anti_extension",
    "sprinter-pull": "lunge",
    "squat-to-chop": "squat",
    "lunge-to-chop": "lunge",
    "bw-jumping-jack": "squat",
    "bw-high-knees": "squat",
    "bw-mountain-climber": "flexion",  # matches sibling banded mountain-climber (also flexion)
    "bw-squat-thrust": "squat",
    "bw-burpee": "squat",
    "bw-sprawl": "squat",
    "bw-bear-crawl": "anti_extension",
    "bw-crab-walk": "anti_extension",
    "bw-inchworm": "anti_extension",
    "bw-skater-jump": "lunge",
    "bw-turkish-getup": "hinge",
    # --- warmup pool: tag with the pattern each drill primarily preps ---
    "wu-shoulder-passthrough": "shoulder_isolation",
    "wu-pull-apart": "horizontal_pull",
    "wu-hip-hinge": "hinge",
    "wu-lateral-walk": "abduction",
    "wu-glute-bridge": "hinge",
    "wu-cat-cow": "anti_extension",
    "wu-world-greatest": "lunge",
    "wu-arm-circles": "shoulder_isolation",
    "wu-deadbug-bw": "anti_extension",
    # --- cooldown pool: tag with the pattern each stretch primarily targets ---
    "cd-lat-stretch": "vertical_pull",
    "cd-shoulder-distraction": "shoulder_isolation",
    "cd-chest-stretch": "horizontal_push",
    "cd-hamstring-band": "hinge",
    "cd-hip-flexor": "lunge",
    "cd-figure-four": "hinge",
    "cd-childs-pose": "anti_extension",
    "cd-cobra": "anti_extension",
    "cd-thoracic-rotation": "anti_rotation",
    "cd-calf-stretch": "calf",
    "cd-lat-side-bend": "lateral_flexion",
    "cd-shoulder-band-stretch": "shoulder_isolation",
}

# ---------------------------------------------------------------------------
# metric = time. default_seconds per id. Everything else defaults to reps.
# ---------------------------------------------------------------------------
TIME_SECONDS = {
    "banded-plank": 30,
    "bw-plank": 30,
    "bw-side-plank": 20,
    "bw-side-plank-hip-dip": 20,
    "side-plank-abduction": 20,
    "hollow-hold": 20,
    "bw-hollow-hold": 20,
    "bw-boat-hold": 20,
    "suitcase-hold": 30,
    "pallof-hold": 20,
    "bw-wall-sit": 30,
    "wall-sit-abduction": 30,
    "bw-dead-hang": 20,
    # cooldown pool: every stretch is held
    "cd-lat-stretch": 30,
    "cd-shoulder-distraction": 30,
    "cd-chest-stretch": 30,
    "cd-hamstring-band": 30,
    "cd-hip-flexor": 30,
    "cd-figure-four": 30,
    "cd-childs-pose": 30,
    "cd-cobra": 30,
    "cd-thoracic-rotation": 30,
    "cd-calf-stretch": 30,
    "cd-lat-side-bend": 30,
    "cd-shoulder-band-stretch": 30,
}

# ---------------------------------------------------------------------------
# tier overrides. Default: role warmup/cooldown -> 'stretch'/'fill' handled below;
# main-role: pattern in the 8 ladder families -> 'core', accessory patterns -> 'fill'.
# ---------------------------------------------------------------------------
LADDER_PATTERNS = {
    "horizontal_push",
    "horizontal_pull",
    "vertical_push",
    "vertical_pull",
    "squat",
    "hinge",
    "lunge",
    "anti_extension",
}

# conditioning finishers are 'fill' even though some share a ladder pattern tag —
# they're not the canonical rung movements.
FORCE_FILL = {
    "thruster", "squat-to-press", "deadlift-high-pull", "clean-and-press", "lunge-press",
    "push-up-to-row", "banded-burpee", "bear-crawl", "sprinter-pull", "squat-to-chop",
    "lunge-to-chop", "bw-jumping-jack", "bw-high-knees", "bw-mountain-climber",
    "bw-squat-thrust", "bw-burpee", "bw-sprawl", "bw-bear-crawl", "bw-crab-walk",
    "bw-inchworm", "bw-skater-jump", "bw-turkish-getup", "bw-wall-sit",
}

# ---------------------------------------------------------------------------
# contraindications: base tag set per final pattern, then per-id add/remove.
# "Generous but precise" (§13.2): tag on the movement's actual demand.
# ---------------------------------------------------------------------------
PATTERN_BASE_CONTRA = {
    "horizontal_push": {"shoulder_horizontal"},
    "vertical_push": {"shoulder_overhead"},
    "horizontal_pull": set(),
    "vertical_pull": {"shoulder_overhead"},
    "squat": {"knee_flexion_loaded"},
    "hinge": {"lower_back_extension"},
    "lunge": {"knee_flexion_loaded"},
    "anti_extension": {"core_pressure"},
    "anti_rotation": set(),
    "flexion": {"lower_back_flexion"},
    "lateral_flexion": set(),
    "elbow_flexion": {"elbow"},
    "elbow_extension": {"elbow"},
    "shoulder_isolation": {"shoulder_overhead"},
    "hip_extension": {"hip"},
    "abduction": set(),
    "calf": {"ankle"},
}

# Per-id additions. Keys are exercise ids; values are extra contraindication tags.
CONTRA_EXTRA = {
    # push-ups / floor work: wrist loaded in extension
    "banded-push-up": {"wrist_extension"},
    "close-grip-push-up": {"wrist_extension", "elbow"},
    "floor-press": {"wrist_extension"},
    "bw-wall-push-up": set(),  # hands vertical on wall, no wrist extension load
    "bw-incline-push-up": {"wrist_extension"},
    "bw-knee-push-up": {"wrist_extension"},
    "bw-push-up": {"wrist_extension"},
    "bw-wide-push-up": {"wrist_extension"},
    "bw-diamond-push-up": {"wrist_extension", "elbow"},
    "bw-decline-push-up": {"wrist_extension"},
    "bw-archer-push-up": {"wrist_extension"},
    "push-up-to-row": {"wrist_extension"},
    "pike-push-up": {"shoulder_overhead", "wrist_extension"},
    "bw-pike-push-up": {"shoulder_overhead", "wrist_extension"},
    # planks / floor anti-extension / dynamic core on hands: wrist + core pressure
    "bird-dog": {"wrist_extension"},
    "bw-bird-dog": {"wrist_extension"},
    "mountain-climber": {"wrist_extension", "knee_impact"},
    "bw-mountain-climber": {"wrist_extension"},
    "bear-crawl": {"wrist_extension"},
    "bw-bear-crawl": {"wrist_extension"},
    "bw-crab-walk": {"wrist_extension"},
    "bw-inchworm": {"wrist_extension"},
    "plank-row": {"wrist_extension", "shoulder_horizontal"},
    "plank-band-drag": {"wrist_extension"},
    "bw-plank-shoulder-tap": {"wrist_extension"},
    "bw-plank-up-down": {"wrist_extension", "elbow"},
    "side-plank-abduction": {"wrist_extension"},
    "bw-side-plank": {"wrist_extension"},
    "bw-side-plank-hip-dip": {"wrist_extension"},
    # sit-up / crunch family: spinal flexion under load
    "band-sit-up": {"lower_back_flexion"},
    "bw-sit-up": {"lower_back_flexion"},
    "banded-v-up": {"lower_back_flexion", "core_pressure"},
    "bw-v-up": {"lower_back_flexion", "core_pressure"},
    "reverse-crunch": {"lower_back_flexion"},
    "bw-reverse-crunch": {"lower_back_flexion"},
    "kneeling-crunch": {"lower_back_flexion"},
    "self-anchored-crunch": {"lower_back_flexion"},
    "standing-side-crunch": {"lower_back_flexion"},
    "bw-crunch": {"lower_back_flexion"},
    "bw-bicycle-crunch": {"lower_back_flexion"},
    "bw-heel-tap": set(),
    "leg-raise": {"lower_back_flexion", "hip"},
    "bw-leg-raise": {"lower_back_flexion", "hip"},
    # hollow / boat / v holds: heavy core pressure + lower back flexion
    "hollow-hold": {"lower_back_flexion", "core_pressure"},
    "bw-hollow-hold": {"lower_back_flexion", "core_pressure"},
    "bw-boat-hold": {"lower_back_flexion", "core_pressure"},
    # hinge family: heavy loaded low-back extension + intra-abdominal pressure
    "rdl": {"core_pressure"},
    "single-leg-rdl": {"core_pressure", "hip"},
    "bw-single-leg-rdl": {"hip"},
    "deadlift": {"core_pressure"},
    "sumo-deadlift": {"core_pressure", "hip"},
    "good-morning": {"core_pressure"},
    "band-swing": set(),
    "glute-bridge": set(),
    "single-leg-bridge": set(),
    "hip-thrust": {"hip", "core_pressure"},
    "frog-pump": {"hip"},
    "glute-kickback": set(),
    "bw-glute-bridge": set(),
    "bw-single-leg-glute-bridge": set(),
    "bw-good-morning": set(),
    "bw-nordic-curl": {"knee_flexion_loaded"},
    "deadlift-high-pull": {"core_pressure", "shoulder_overhead"},
    "clean-and-press": {"core_pressure", "shoulder_overhead"},
    "bw-turkish-getup": {"shoulder_overhead", "core_pressure"},
    # squat / lunge deep-flexion & hip-impingement risk
    "front-squat": {"core_pressure"},
    "goblet-squat": set(),
    "banded-squat": set(),
    "bulgarian-split-squat": {"hip"},
    "bw-bulgarian-split-squat": {"hip"},
    "lateral-lunge": {"hip"},
    "bw-lateral-lunge": {"hip"},
    "bw-curtsy-lunge": {"hip"},
    "bw-cossack-squat": {"hip"},
    "bw-pistol-squat": {"hip", "ankle"},
    "step-up": {"hip"},
    "bw-step-up": {"hip"},
    "squat-jump": {"knee_impact", "ankle"},
    "bw-jump-squat": {"knee_impact", "ankle"},
    "bw-broad-jump": {"knee_impact", "ankle"},
    "banded-burpee": {"knee_impact", "wrist_extension"},
    "bw-burpee": {"knee_impact", "wrist_extension"},
    "bw-squat-thrust": {"knee_impact", "wrist_extension"},
    "bw-sprawl": {"knee_impact", "wrist_extension"},
    "bw-skater-jump": {"knee_impact", "ankle"},
    "bw-jumping-jack": {"knee_impact", "ankle"},
    "bw-high-knees": {"knee_impact"},
    "thruster": {"shoulder_overhead", "core_pressure"},
    "squat-to-press": {"shoulder_overhead"},
    "squat-to-chop": set(),
    "lunge-to-chop": set(),
    "lunge-press": {"shoulder_overhead"},
    "sprinter-pull": set(),
    "tke": set(),
    # pull-up-bar / dead hang: none extra beyond bodyweight_bearing anchor gate
    "assisted-pull-up": set(),
    "bw-pull-up": set(),
    "bw-chin-up": {"elbow"},
    "bw-dead-hang": set(),
    "bw-inverted-row": set(),
    "bw-dip": {"shoulder_horizontal", "elbow"},
    # overhead / vertical pull family already gets shoulder_overhead from base; trim where wrong
    "lat-pulldown": set(),
    "straight-arm-pulldown": set(),
    "floor-pullover": {"shoulder_overhead"},
    "wide-high-row": set(),
    "face-pull": set(),
    # isolation shoulder work overhead only when arm travels overhead
    "lateral-raise": set(),
    "front-raise": set(),
    "reverse-fly": set(),
    "band-shrug": set(),
    "ytw-raise": {"shoulder_overhead"},
    "bent-over-y-raise": {"shoulder_overhead"},
    "bw-scap-push-up": {"wrist_extension"},
    "bw-prone-ytw": {"shoulder_overhead"},
    "overhead-tricep-ext": {"shoulder_overhead"},
    "upright-row": {"shoulder_overhead"},
    "single-arm-ohp": set(),
    "half-kneeling-ohp": set(),
    # anti-rotation / woodchop family: rotational load, mild low-back
    "woodchop": {"lower_back_flexion"},
    "reverse-woodchop": set(),
    "russian-twist": {"lower_back_flexion"},
    "bw-russian-twist": {"lower_back_flexion"},
    "bw-windshield-wiper": {"lower_back_flexion", "hip"},
    # calf / ankle
    "calf-raise": set(),
    "single-leg-calf-raise": {"ankle"},
    "bw-calf-raise": set(),
    "bw-single-leg-calf-raise": {"ankle"},
    "wall-sit-abduction": {"knee_flexion_loaded"},
    "bw-wall-sit": {"knee_flexion_loaded"},
    # cooldown stretches: gentle, essentially no contraindications except end-range spinal ones
    "cd-cobra": {"lower_back_extension"},
    "cd-hip-flexor": {"hip"},
    "cd-figure-four": {"hip"},
}

CONTRA_REMOVE = {
    # base-pattern tag would over-apply; strip where the specific exercise doesn't load it
    "bw-wall-push-up": {"shoulder_horizontal"},
    "face-pull": set(),
    "cd-lat-stretch": {"shoulder_overhead"},  # gentle static stretch, not a loaded overhead press
    "cd-shoulder-band-stretch": {"shoulder_overhead"},
    "wu-arm-circles": {"shoulder_overhead"},
    "wu-shoulder-passthrough": {"shoulder_overhead"},
    "cd-shoulder-distraction": {"shoulder_overhead"},
}

ALIAS_EXTRA = {
    "bw-push-up": ["standard push-up"],
    "bw-pull-up": ["strict pull-up"],
    "rdl": ["romanian deadlift", "RDL"],
    "banded-squat": ["resistance band squat"],
    "hollow-hold": ["hollow body"],
    "bw-hollow-hold": ["hollow body hold"],
}


def anchor_class_for(anchor: str) -> str:
    if anchor in ("pullup-bar", "body-support"):
        return "bodyweight_bearing"
    if anchor == "none":
        return "none"
    return "band_tension"


def metric_for(ex_id: str):
    if ex_id in TIME_SECONDS:
        return "time", TIME_SECONDS[ex_id]
    return "reps", None


def role_for(ex_id: str) -> str:
    if ex_id.startswith("wu-"):
        return "warmup"
    if ex_id.startswith("cd-"):
        return "cooldown"
    return "main"


def tier_for(ex_id: str, pattern: str, role: str) -> str:
    if role == "cooldown":
        return "stretch"
    if role == "warmup":
        return "fill"
    if ex_id in FORCE_FILL:
        return "fill"
    if pattern in LADDER_PATTERNS:
        return "core"
    return "fill"


def contra_for(ex_id: str, pattern: str) -> list:
    tags = set(PATTERN_BASE_CONTRA.get(pattern, set()))
    tags |= CONTRA_EXTRA.get(ex_id, set())
    tags -= CONTRA_REMOVE.get(ex_id, set())
    return sorted(tags)


def aliases_for(name: str, ex_id: str) -> list:
    out = []
    lower = name.lower()
    # strip a leading "Banded " since the band variant is implied by equipment=band
    if lower.startswith("banded "):
        out.append(name[len("Banded "):])
    # hyphen-free / space-joined id form
    id_words = ex_id.replace("bw-", "").replace("-", " ")
    if id_words != lower and id_words not in [a.lower() for a in out]:
        out.append(id_words)
    out.extend(ALIAS_EXTRA.get(ex_id, []))
    # de-dupe, preserve order
    seen = set()
    result = []
    for a in out:
        if a.lower() not in seen and a.lower() != lower:
            seen.add(a.lower())
            result.append(a)
    return result


def main():
    src = json.loads(SRC.read_text())
    out_exercises = []
    for e in src["exercises"]:
        ex_id = e["id"]
        pattern = PATTERN_OVERRIDES.get(ex_id, e["pattern"])
        role = role_for(ex_id)
        metric, default_seconds = metric_for(ex_id)
        tier = tier_for(ex_id, pattern, role)
        anchor = e["anchor"]
        new = {
            "id": ex_id,
            "name": e["name"],
            "aliases": aliases_for(e["name"], ex_id),
            "focus": e["focus"],
            "pattern": pattern,
            "primary": e["primary"],
            "secondary": e["secondary"],
            "equipment": e["equipment"],
            "band": None if e.get("band") in (None, "none") else e.get("band"),
            "anchor": anchor,
            "anchor_class": anchor_class_for(anchor),
            "unilateral": e["unilateral"],
            "metric": metric,
            "default_seconds": default_seconds,
            "tier": tier,
            "role": role,
            "difficulty": e["difficulty"],
            "progression_family": None,
            "progression_level_id": None,
            "contraindications": contra_for(ex_id, pattern),
            "setup": e["setup"],
            "video_search": e["video_search"],
            "demo_media": {"type": "figure", "id": ex_id},
        }
        out_exercises.append(new)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"exercises": out_exercises}, indent=2) + "\n")
    print(f"Wrote {len(out_exercises)} exercises to {OUT}")


if __name__ == "__main__":
    main()
