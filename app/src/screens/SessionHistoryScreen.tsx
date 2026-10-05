/**
 * A finished workout, read-only: when, what focus, how long, where, and every exercise with the
 * sets actually done. Reached from the Logbook's day sheet.
 *
 * Deliberately not `SummaryScreen`, which is wired to FINISH / `completeSession`; this page never
 * writes. Skipped sets are shown as a quiet neutral note, never in a warning colour (invariant 4).
 * Each exercise row opens its `ExerciseDetail` page.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sessionsRepo } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { EmptyState } from '../components/EmptyState';
import { buildSessionHistoryView } from '../lib/sessionHistory';
import { makeStyles, space } from '../theme';
import { Button, Card, Chip, Enter, Icon, PressableScale, Screen, SectionHeader, Txt } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionHistory'>;

export default function SessionHistoryScreen({ route, navigation }: Props): React.JSX.Element {
  const { db, library } = useStore();
  const styles = useStyles();
  const { sessionId } = route.params;

  const view = useMemo(() => {
    const session = sessionsRepo.getCompletedSessionDetail(db, sessionId);
    return session ? buildSessionHistoryView(session, library.exercises) : null;
  }, [db, library, sessionId]);

  if (!view) {
    return (
      <Screen scroll contentStyle={styles.missing} testID="session-history-missing">
        <EmptyState
          icon="search"
          tone="gold"
          title="That workout isn’t in your history."
          body="It may have been discarded before it was finished."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll testID="session-history-screen" contentStyle={styles.content}>
      <Enter index={0}>
        <Card padding="lg" style={styles.header} testID="history-header">
          <Txt testID="history-date" variant="h1">
            {view.dateLabel}
          </Txt>
          <Txt testID="history-focus" variant="bodyStrong">
            {view.emoji} {view.focusLabel} · {view.minutes} min
          </Txt>
          {view.place ? (
            <Txt testID="history-place" variant="caption" color="text2">
              {view.place}
            </Txt>
          ) : null}
        </Card>
      </Enter>

      <Enter index={1} style={styles.stats} testID="history-stats">
        {view.stats.map((stat) => (
          <Chip key={stat.key} testID={`history-stat-${stat.key}`} label={stat.label} tone="teal" />
        ))}
      </Enter>

      {view.note ? (
        <Enter index={2}>
          <Card padding="md" style={styles.note}>
            <Txt variant="eyebrow" color="text3">
              Your note
            </Txt>
            <Txt testID="history-note" variant="body">
              {view.note}
            </Txt>
          </Card>
        </Enter>
      ) : null}

      {view.sections.map((section, i) => (
        <Enter key={section.section} index={3 + i} style={styles.section}>
          <SectionHeader title={section.title} testID={`history-section-${section.section}`} />
          <Card padding="none" style={styles.rows}>
            {section.rows.map((row, r) => (
              <View key={row.entryId} style={[styles.row, r > 0 && styles.rowDivider]}>
                <PressableScale
                  testID={`history-row-${row.entryId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.name}. ${row.setsText || row.skippedNote || ''}. Open exercise`}
                  onPress={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: row.exerciseId })
                  }
                  style={styles.rowMain}
                >
                  <View style={styles.rowText}>
                    <Txt variant="bodyStrong">{row.name}</Txt>
                    {row.setsText ? (
                      <Txt testID={`history-sets-${row.entryId}`} variant="body" color="text2">
                        {row.setsText}
                        {row.band ? ` · ${row.band}` : ''}
                      </Txt>
                    ) : null}
                    {row.skippedNote ? (
                      <Txt
                        testID={`history-skipped-${row.entryId}`}
                        variant="caption"
                        color="text3"
                      >
                        {row.skippedNote}
                      </Txt>
                    ) : null}
                  </View>
                  <Icon name="chevronRight" size={18} color="text3" />
                </PressableScale>
                {row.familyId ? (
                  <Button
                    testID={`history-trail-${row.entryId}`}
                    label="Trail"
                    variant="quiet"
                    size="sm"
                    icon="chevronRight"
                    iconRight
                    accessibilityLabel={`See ${row.name}'s trail on Journey`}
                    // The trail's best-set chart lives on its card in Journey's Trails section.
                    onPress={() => navigation.navigate('Tabs', { screen: 'Journey' })}
                  />
                ) : null}
              </View>
            ))}
          </Card>
        </Enter>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    missing: { paddingTop: space.huge, justifyContent: 'center' },
    content: { gap: space.lg, paddingTop: space.md, paddingBottom: space.huge },
    header: { gap: space.xs },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    note: { gap: space.xs },
    section: { gap: space.sm },
    rows: { overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingRight: space.sm },
    rowMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.line },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
  }),
);
