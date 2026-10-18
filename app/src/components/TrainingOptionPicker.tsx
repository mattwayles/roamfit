/**
 * Track 37f — one training preference as a single-select list (radio rows), from
 * `lib/trainingOptions.ts`. The caller owns persistence.
 */
import React from 'react';
import type { TrainingPreferences } from '@roamfit/engine';
import type { TrainingOptionGroup } from '../lib/trainingOptions';
import { CheckRow, Group } from './SettingsList';

export function TrainingOptionPicker<K extends keyof TrainingPreferences>({
  group,
  value,
  onChange,
}: {
  group: TrainingOptionGroup<K>;
  value: TrainingPreferences[K];
  onChange: (next: TrainingPreferences[K]) => void;
}): React.JSX.Element {
  return (
    <Group title={group.title} caption={group.caption}>
      {group.options.map((option) => (
        <CheckRow
          key={option.value}
          testID={`pref-${group.key}-${option.value}`}
          label={option.label}
          description={option.description}
          checked={option.value === value}
          single
          onPress={() => {
            if (option.value !== value) onChange(option.value);
          }}
        />
      ))}
    </Group>
  );
}
