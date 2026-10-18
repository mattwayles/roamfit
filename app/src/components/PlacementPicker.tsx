/**
 * Track 37g — the placement questions: an experience level, then the optional "how many can you
 * do?" checks, each a single-select list. Shared by onboarding and Settings → Starting levels; the
 * caller owns the answers and what happens with them.
 */
import React from 'react';
import { EXPERIENCE_OPTIONS, PLACEMENT_QUESTIONS } from '@roamfit/data';
import type { ExperienceLevel } from '@roamfit/data';
import { CheckRow, Group } from './SettingsList';

export interface PlacementValue {
  experience: ExperienceLevel;
  answers: Record<string, string>;
}

export const DEFAULT_PLACEMENT: PlacementValue = { experience: 'new', answers: {} };

export function PlacementPicker({
  value,
  onChange,
}: {
  value: PlacementValue;
  onChange: (next: PlacementValue) => void;
}): React.JSX.Element {
  return (
    <>
      <Group title="Your experience">
        {EXPERIENCE_OPTIONS.map((option) => (
          <CheckRow
            key={option.id}
            testID={`placement-experience-${option.id}`}
            label={option.label}
            description={option.description}
            checked={value.experience === option.id}
            single
            onPress={() => onChange({ ...value, experience: option.id })}
          />
        ))}
      </Group>
      {PLACEMENT_QUESTIONS.map((question) => (
        <Group
          key={question.id}
          title={question.prompt}
          question
          caption={
            question === PLACEMENT_QUESTIONS[0]
              ? 'Optional. Skip any you are unsure of.'
              : undefined
          }
        >
          {question.answers.map((answer) => (
            <CheckRow
              key={answer.id}
              testID={`placement-${question.id}-${answer.id}`}
              label={answer.label}
              checked={(value.answers[question.id] ?? 'unsure') === answer.id}
              single
              onPress={() =>
                onChange({ ...value, answers: { ...value.answers, [question.id]: answer.id } })
              }
            />
          ))}
        </Group>
      ))}
    </>
  );
}
