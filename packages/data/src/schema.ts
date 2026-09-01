/**
 * @roamfit/data — shared types for the bundled exercise library and progression families.
 *
 * Single source of truth for shape (wave-01b-content.md). Mirrors spec.md §4.1 (Exercise) and
 * §4.2 (Progression Family). Do not add `video_id` / `video_verified_at` / `video_flag_count`
 * here — curated video ids are remote config only (§11.4) and must never be bundled; the
 * validator (`validate.ts`) rejects any library record carrying `video_id`.
 */

export type Focus = 'upper' | 'abs' | 'legs' | 'full';

export type Pattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'hip_extension'
  | 'abduction'
  | 'calf'
  | 'anti_rotation'
  | 'anti_extension'
  | 'flexion'
  | 'lateral_flexion'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'shoulder_isolation';

export type Equipment = 'band' | 'bodyweight';

export type Anchor =
  | 'none'
  | 'stance'
  | 'feet'
  | 'self-low'
  | 'thigh-loop'
  | 'body-support'
  | 'anchor-low'
  | 'anchor-mid'
  | 'anchor-high'
  | 'pullup-bar'
  // A waist-height fixed bar (RV ladder rung, picnic table edge, low branch). Distinct from
  // 'pullup-bar' because it is far more widely available and is partial-support, not a full
  // dynamic hang. Still bodyweight_bearing, so the §13.1 effort cap applies. See ADR 0007.
  | 'low-bar';

/** Derived mechanically from `anchor` (§13.1). Drives the anchor-safety hard filter. */
export type AnchorClass = 'none' | 'band_tension' | 'bodyweight_bearing';

export type Metric = 'reps' | 'time' | 'amrap';

export type Tier = 'core' | 'fill' | 'stretch';

export type Role = 'warmup' | 'main' | 'cooldown';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Contraindication =
  | 'shoulder_overhead'
  | 'shoulder_horizontal'
  | 'elbow'
  | 'wrist_extension'
  | 'knee_flexion_loaded'
  | 'knee_impact'
  | 'hip'
  | 'lower_back_flexion'
  | 'lower_back_extension'
  | 'neck'
  | 'ankle'
  | 'core_pressure';

/** The 8 laddered progression families in v1 scope (§6.6). */
export type ProgressionFamilyId =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'anti_extension';

export interface DemoMedia {
  type: 'figure' | 'clip';
  id: string;
}

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];

  focus: Focus[];
  pattern: Pattern;
  primary: string[];
  secondary: string[];

  equipment: Equipment;
  /** Suggested band range, e.g. "B1-B2". Null for bodyweight. */
  band: string | null;
  anchor: Anchor;
  anchor_class: AnchorClass;

  unilateral: boolean;
  metric: Metric;
  /** Required when metric === 'time', null otherwise. */
  default_seconds: number | null;
  tier: Tier;
  role: Role;

  difficulty: Difficulty;
  /** Family id, or null for accessory patterns (warmups, stretches, finishers). */
  progression_family: ProgressionFamilyId | null;
  /** level_id within that family's levels[] — stable, never a positional index. */
  progression_level_id: string | null;

  contraindications: Contraindication[];

  setup: string;
  video_search: string;
  demo_media: DemoMedia;
}

export interface ProgressionFamilyLevel {
  /** Assigned once, never reordered or reused (§4.2, §6.6). */
  level_id: string;
  exercise_id: string;
}

export interface ProgressionFamily {
  id: ProgressionFamilyId;
  name: string;
  pattern: Pattern;
  /** Ordered, easiest → hardest. */
  levels: ProgressionFamilyLevel[];
}

export interface ExerciseLibrary {
  exercises: Exercise[];
}

export interface FamilyLibrary {
  families: ProgressionFamily[];
}
