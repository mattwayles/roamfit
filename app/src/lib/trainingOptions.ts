/**
 * Track 37f — the words for every training preference: one group per setting, one option per
 * value, with the default first-class ("Recommended") so a beginner who doesn't know what to pick
 * has an obvious answer. Shared by Settings → Training preferences and onboarding's goal step.
 */
import type { TrainingPreferences } from '@roamfit/engine';

export interface TrainingOption<V extends string> {
  value: V;
  label: string;
  description: string;
}

export interface TrainingOptionGroup<K extends keyof TrainingPreferences> {
  key: K;
  title: string;
  caption?: string;
  options: TrainingOption<TrainingPreferences[K]>[];
}

export const GOAL_GROUP: TrainingOptionGroup<'goal'> = {
  key: 'goal',
  title: 'Training goal',
  caption: 'Changes reps, rest and sets. Your progress on every trail carries over if you switch.',
  options: [
    {
      value: 'general',
      label: 'General fitness (recommended)',
      description: '8–12 reps. A balance of strength and stamina, and the best place to start.',
    },
    {
      value: 'strength',
      label: 'Strength',
      description: '5–9 reps with longer rest. Fewer, harder reps.',
    },
    {
      value: 'muscle',
      label: 'Build muscle',
      description: '8–12 reps with an extra set on each exercise.',
    },
    {
      value: 'endurance',
      label: 'Endurance',
      description: '15–19 reps and longer holds, with shorter rest.',
    },
  ],
};

export const TRAINING_OPTION_GROUPS = [
  GOAL_GROUP,
  {
    key: 'rest',
    title: 'Rest between sets',
    options: [
      {
        value: 'standard',
        label: 'Standard (recommended)',
        description: 'What your goal calls for.',
      },
      {
        value: 'shorter',
        label: 'Shorter',
        description: 'About a quarter less. Harder, and quicker.',
      },
      {
        value: 'longer',
        label: 'Longer',
        description: 'About a third more, for fuller recovery between sets.',
      },
    ],
  } satisfies TrainingOptionGroup<'rest'>,
  {
    key: 'variety',
    title: 'Exercise variety',
    options: [
      {
        value: 'balanced',
        label: 'Balanced (recommended)',
        description: 'A main exercise comes back after a couple of workouts.',
      },
      {
        value: 'consistent',
        label: 'Keep it consistent',
        description: 'The same moves more often. Good while you are learning them.',
      },
      {
        value: 'varied',
        label: 'Mix it up',
        description: 'More different exercises from one workout to the next.',
      },
    ],
  } satisfies TrainingOptionGroup<'variety'>,
  {
    key: 'recovery',
    title: 'Recovery after a hard day',
    caption: 'How long a muscle you trained hard is eased off before it is pushed again.',
    options: [
      { value: 'standard', label: '2 days (recommended)', description: 'The usual 48 hours.' },
      { value: 'quick', label: '1 day', description: 'For experienced lifters who recover fast.' },
      { value: 'extra', label: '3 days', description: 'More time between hard sessions.' },
    ],
  } satisfies TrainingOptionGroup<'recovery'>,
  {
    key: 'pace',
    title: 'Progression pace',
    options: [
      {
        value: 'steady',
        label: 'Steady (recommended)',
        description: 'Hit every target once and the next workout is a step harder.',
      },
      {
        value: 'patient',
        label: 'Patient',
        description: 'Hit every target twice before stepping up. Steadier for experienced lifters.',
      },
    ],
  } satisfies TrainingOptionGroup<'pace'>,
  {
    key: 'warmup',
    title: 'Warm-up and cool-down',
    options: [
      {
        value: 'standard',
        label: 'Standard (recommended)',
        description: 'About a fifth of the workout.',
      },
      { value: 'short', label: 'Short', description: 'A quick warm-up and cool-down.' },
      {
        value: 'extended',
        label: 'Extended',
        description: 'More time to loosen up. Good for early mornings and stiff joints.',
      },
    ],
  } satisfies TrainingOptionGroup<'warmup'>,
] as const;

/** The selected option's label, without the "(recommended)" suffix, for a Settings row summary. */
export function trainingSummary(prefs: TrainingPreferences): string {
  const goal = GOAL_GROUP.options.find((o) => o.value === prefs.goal)!;
  return goal.label.replace(' (recommended)', '');
}
