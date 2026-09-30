/**
 * Encouraging empty state (DESIGN.md §5.11): an icon in a tinted circle, one `h3` line, one
 * `small` line, optionally a button. Never "nothing here" — it always points at what will appear.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { space, type AccentName } from '../theme';
import { Button, Card, Txt, type IconName } from '../ui';
import { IconBadge } from './IconBadge';

export interface EmptyStateProps {
  icon: IconName;
  tone: AccentName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  /** Id on the body line, for a caller whose tests read that copy (Exercise detail's progress). */
  bodyTestID?: string;
}

export function EmptyState({
  icon,
  tone,
  title,
  body,
  actionLabel,
  onAction,
  testID,
  bodyTestID,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Card testID={testID} style={styles.card}>
      <IconBadge icon={icon} tone={tone} size={52} />
      <Txt variant="h3" align="center">
        {title}
      </Txt>
      <Txt variant="small" color="text2" align="center" testID={bodyTestID}>
        {body}
      </Txt>
      {actionLabel && onAction ? (
        <Button label={actionLabel} size="sm" onPress={onAction} style={styles.action} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.sm },
  action: { marginTop: space.sm },
});
