/**
 * §10.2 Generate. Picker order per the brief: Time, Anchors, Focus, Effort. ADR 0002: no
 * sub-15-minute option in this picker — Quick Session (Home screen) is the only supported short
 * path. Anchors default from the user's sticky `anchorsAvailable` (§5.3) and any change here
 * persists back through `usersRepo.updateUser`, never a local-only edit.
 *
 * "Pre-filled with the recommendation" (smart generation as the default): this build pre-fills
 * sensible fixed defaults (full/normal/30min) rather than inventing a recommendation heuristic
 * of its own — the engine/store do not yet expose a "recommended next focus" query, and
 * fabricating one here would put a selection decision in the UI layer, which this wave's
 * ground rule forbids. Flagged in STATUS-4-loop.md as a follow-up once such a query exists.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Anchor, Focus } from '@roamfit/data';
import { createRng, seedFromString } from '@roamfit/engine';
import type { Effort } from '@roamfit/engine';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

type Props = NativeStackScreenProps<RootStackParamList, 'Generate'>;

const TIME_OPTIONS = [15, 20, 30, 45, 60]; // ADR 0002 floor
const FOCUS_OPTIONS: Focus[] = ['upper', 'abs', 'legs', 'full'];
const EFFORT_OPTIONS: Effort[] = ['easy', 'normal', 'hard'];
const ALL_ANCHORS: Anchor[] = [
  'none',
  'stance',
  'feet',
  'self-low',
  'thigh-loop',
  'body-support',
  'anchor-low',
  'anchor-mid',
  'anchor-high',
  'pullup-bar',
];

export default function GenerateScreen({ navigation, route }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const [minutes, setMinutes] = useState(30);
  const [focus, setFocus] = useState<Focus>('full');
  const [effort, setEffort] = useState<Effort>('normal');
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [generating, setGenerating] = useState(false);
  // §9.9 — pre-filled by an accepted Recovery Week auto-suggestion (Home), or toggled manually
  // here. Either way it's just a request flag until the user taps Generate — never applied
  // silently, per the brief's "always available as a manual toggle" requirement.
  const [recoveryWeek, setRecoveryWeek] = useState(route.params?.recoveryWeek ?? false);

  useEffect(() => {
    const user = usersRepo.ensureUser(db, nowUtcInstant());
    setAnchors(user.anchorsAvailable);
  }, [db]);

  const toggleAnchor = useCallback(
    (anchor: Anchor) => {
      const next = anchors.includes(anchor)
        ? anchors.filter((a) => a !== anchor)
        : [...anchors, anchor];
      setAnchors(next);
      usersRepo.updateUser(db, { anchorsAvailable: next }, nowUtcInstant());
    },
    [anchors, db],
  );

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    try {
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: { focus, effort, targetMinutes: minutes },
        clock,
        rng: createRng(seedFromString(utcInstant)),
        utcInstant,
        recoveryWeek,
      });
      const sessionId = sessionsRepo.createPendingSession(db, {
        plan,
        utcInstant,
        localDate: clock.today,
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      navigation.replace('Approval', { sessionId });
    } finally {
      setGenerating(false);
    }
  }, [db, library, families, focus, effort, minutes, recoveryWeek, navigation]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>Time</Text>
      <View style={styles.chipRow}>
        {TIME_OPTIONS.map((m) => (
          <Chip key={m} label={`${m} min`} selected={m === minutes} onPress={() => setMinutes(m)} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Anchors</Text>
      <View style={styles.chipRow}>
        {ALL_ANCHORS.map((a) => (
          <Chip key={a} label={a} selected={anchors.includes(a)} onPress={() => toggleAnchor(a)} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Focus</Text>
      <View style={styles.chipRow}>
        {FOCUS_OPTIONS.map((f) => (
          <Chip key={f} label={f} selected={f === focus} onPress={() => setFocus(f)} />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Effort</Text>
      <View style={styles.chipRow}>
        {EFFORT_OPTIONS.map((e) => (
          <Chip key={e} label={e} selected={e === effort} onPress={() => setEffort(e)} />
        ))}
      </View>

      <Pressable
        testID="recovery-week-toggle"
        style={[styles.recoveryToggle, recoveryWeek && styles.recoveryToggleOn]}
        onPress={() => setRecoveryWeek((v) => !v)}
      >
        <Text style={[styles.recoveryToggleText, recoveryWeek && styles.recoveryToggleTextOn]}>
          {recoveryWeek ? 'Recovery week — on' : 'Make this a recovery week'}
        </Text>
        <Text style={styles.recoveryToggleSubtitle}>Lighter loads, same consistency.</Text>
      </Pressable>

      <Pressable
        testID="generate-button"
        style={styles.generateButton}
        onPress={handleGenerate}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateButtonText}>Generate</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      testID={`chip-${label}`}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: '#111' },
  chipText: { color: '#334155', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  recoveryToggle: {
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f1f5f9',
    gap: 2,
  },
  recoveryToggleOn: { backgroundColor: '#e0f2fe' },
  recoveryToggleText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  recoveryToggleTextOn: { color: '#0369a1' },
  recoveryToggleSubtitle: { fontSize: 12, color: '#64748b' },
  generateButton: {
    marginTop: 24,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  generateButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
