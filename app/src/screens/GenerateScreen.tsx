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
import { getNetworkStatus } from '../lib/networkStatus';
import OptionPicker from '../components/OptionPicker';

type Props = NativeStackScreenProps<RootStackParamList, 'Generate'>;

const TIME_OPTIONS = [15, 20, 30, 45, 60, 90, 120]; // ADR 0002 floor, ADR 0013 ceiling
const FOCUS_OPTIONS: Focus[] = ['upper', 'abs', 'legs', 'full'];
const FOCUS_LABELS: Record<Focus, string> = {
  upper: 'Upper',
  abs: 'Core',
  legs: 'Legs',
  full: 'Full body',
};
const EFFORT_OPTIONS: Effort[] = ['easy', 'normal', 'hard'];
const EFFORT_LABELS: Record<Effort, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};
/**
 * §5.3 anchors, as a grouped checklist rather than a wrap of ten chips.
 *
 * Three problems with the old presentation, all fixed here:
 *  - the labels were raw enum values (`self-low`, `thigh-loop`, `anchor-mid`), which mean nothing
 *    to a user standing in a car park deciding what they can tie a band to;
 *  - multi-select chips looked identical to the single-select Time/Focus/Effort controls above,
 *    so nothing signalled that these behave differently (those are now scrolling pickers, which
 *    separates the two kinds of choice further still);
 *  - `low-bar` was missing entirely. It is in `DEFAULT_ANCHORS_AVAILABLE` (ADR 0007), so every
 *    user has it enabled and nobody could turn it off.
 *
 * Grouped by whether a fixed point is needed, which is the only distinction that matters when
 * you are deciding what to tick.
 */
const ANCHOR_GROUPS: {
  title: string;
  anchors: { value: Anchor; label: string; hint?: string }[];
}[] = [
  {
    title: 'No fixed point needed',
    anchors: [
      { value: 'none', label: 'Bodyweight only', hint: 'no band at all' },
      { value: 'stance', label: 'Stand on the band' },
      { value: 'feet', label: 'Band under your feet' },
      { value: 'self-low', label: 'Band around your own body' },
      { value: 'thigh-loop', label: 'Band looped around a thigh' },
    ],
  },
  {
    title: 'Needs something to anchor to',
    anchors: [
      { value: 'anchor-low', label: 'Low point', hint: 'door base, post, heavy furniture' },
      { value: 'anchor-mid', label: 'Mid point', hint: 'rail, handle, waist-height fixing' },
      { value: 'anchor-high', label: 'High point', hint: 'bar, beam, top of a door' },
      { value: 'low-bar', label: 'Waist-height bar', hint: 'picnic table, RV ladder, low branch' },
      { value: 'pullup-bar', label: 'Pull-up bar', hint: 'takes your full hanging weight' },
      { value: 'body-support', label: 'Bench or step', hint: 'something to dip or press off' },
    ],
  },
];

const ANCHOR_COUNT = ANCHOR_GROUPS.reduce((n, g) => n + g.anchors.length, 0);

export default function GenerateScreen({ navigation, route }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const [minutes, setMinutes] = useState(30);
  const [focus, setFocus] = useState<Focus>('full');
  const [effort, setEffort] = useState<Effort>('normal');
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  // Collapsed by default: anchors are sticky user state (§5.3), set once and rarely revisited, so
  // they should not cost eleven rows of the picker on every generation.
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  /** Which drop-down is open, if any. Held here rather than inside each picker so opening one
   *  closes the others — two lists open at once on a short screen is how you pick from the wrong
   *  one. */
  const [openPicker, setOpenPicker] = useState<'time' | 'focus' | 'effort' | null>(null);
  const [generating, setGenerating] = useState(false);
  // §9.9 — pre-filled by an accepted Recovery Week auto-suggestion (Home), or toggled manually
  // here. Either way it's just a request flag until the user taps Generate — never applied
  // silently, per the brief's "always available as a manual toggle" requirement.
  const [recoveryWeek, setRecoveryWeek] = useState(route.params?.recoveryWeek ?? false);
  // §15 "offline share" instrumentation only — never read by generation logic itself, and never
  // awaited on the critical path (invariant 1): a best-effort background reading, undefined until
  // it resolves, in which case `generate()` simply logs nothing for this session (see
  // `generation.ts`'s `online` doc comment) rather than blocking or guessing.
  const [online, setOnline] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const user = usersRepo.ensureUser(db, nowUtcInstant());
    setAnchors(user.anchorsAvailable);
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    void getNetworkStatus().then((status) => {
      if (!cancelled) setOnline(status.online);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        online,
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
  }, [db, library, families, focus, effort, minutes, recoveryWeek, online, navigation]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>Time</Text>
      <OptionPicker
        testID="time-picker"
        accessibilityLabel="Session length"
        options={TIME_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
        value={minutes}
        onChange={setMinutes}
        open={openPicker === 'time'}
        onOpenChange={(next) => setOpenPicker(next ? 'time' : null)}
      />

      <Text style={styles.sectionLabel}>Anchors</Text>
      <Pressable
        testID="anchors-disclosure"
        accessibilityRole="button"
        accessibilityState={{ expanded: anchorsOpen }}
        style={styles.disclosure}
        onPress={() => {
          setOpenPicker(null);
          setAnchorsOpen((v) => !v);
        }}
      >
        <Text style={styles.disclosureText}>Available equipment and anchor points</Text>
        <Text style={styles.disclosureCount} testID="anchors-summary">
          {anchors.length} of {ANCHOR_COUNT} selected {anchorsOpen ? '\u25b4' : '\u25be'}
        </Text>
      </Pressable>

      {anchorsOpen &&
        ANCHOR_GROUPS.map((group) => (
          <View key={group.title} style={styles.anchorGroup}>
            <Text style={styles.anchorGroupTitle}>{group.title}</Text>
            {group.anchors.map((a) => {
              const selected = anchors.includes(a.value);
              return (
                <Pressable
                  key={a.value}
                  testID={`anchor-${a.value}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={a.label}
                  style={styles.anchorRow}
                  onPress={() => toggleAnchor(a.value)}
                >
                  <Text style={[styles.checkbox, selected && styles.checkboxOn]}>
                    {selected ? '\u2713' : ''}
                  </Text>
                  <View style={styles.anchorLabels}>
                    <Text style={styles.anchorLabel}>{a.label}</Text>
                    {a.hint != null && <Text style={styles.anchorHint}>{a.hint}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

      <Text style={styles.sectionLabel}>Focus</Text>
      <OptionPicker
        testID="focus-picker"
        accessibilityLabel="Focus"
        options={FOCUS_OPTIONS.map((f) => ({ value: f, label: FOCUS_LABELS[f] }))}
        value={focus}
        onChange={setFocus}
        open={openPicker === 'focus'}
        onOpenChange={(next) => setOpenPicker(next ? 'focus' : null)}
      />

      <Text style={styles.sectionLabel}>Effort</Text>
      <OptionPicker
        testID="effort-picker"
        accessibilityLabel="Effort"
        options={EFFORT_OPTIONS.map((e) => ({ value: e, label: EFFORT_LABELS[e] }))}
        value={effort}
        onChange={setEffort}
        open={openPicker === 'effort'}
        onOpenChange={(next) => setOpenPicker(next ? 'effort' : null)}
      />

      {/* A checkbox, not a card that changes its own label: with only the wording to go on it was
          not obvious this was an option you had *not* taken. The box states that directly. */}
      <Pressable
        testID="recovery-week-toggle"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: recoveryWeek }}
        accessibilityLabel="Recovery Workout"
        style={[styles.recoveryToggle, recoveryWeek && styles.recoveryToggleOn]}
        onPress={() => setRecoveryWeek((v) => !v)}
      >
        <Text
          testID="recovery-week-checkbox"
          style={[styles.checkbox, recoveryWeek && styles.checkboxOn]}
        >
          {recoveryWeek ? '\u2713' : ''}
        </Text>
        <View style={styles.recoveryToggleLabels}>
          <Text style={[styles.recoveryToggleText, recoveryWeek && styles.recoveryToggleTextOn]}>
            Recovery Workout
          </Text>
          <Text style={styles.recoveryToggleSubtitle}>Lighter loads, same consistency.</Text>
        </View>
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

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 12 },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  disclosureText: { fontSize: 15, fontWeight: '600', color: '#334155' },
  disclosureCount: { fontSize: 13, color: '#64748b' },
  anchorGroup: { gap: 2, marginTop: 4 },
  anchorGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 2,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    lineHeight: 23,
    textAlign: 'center',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    color: 'transparent',
    fontWeight: '700',
    overflow: 'hidden',
  },
  checkboxOn: { backgroundColor: '#111', borderColor: '#111', color: '#fff' },
  anchorLabels: { flex: 1 },
  anchorLabel: { fontSize: 15, color: '#0f172a' },
  anchorHint: { fontSize: 12, color: '#64748b' },
  recoveryToggle: {
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recoveryToggleLabels: { flex: 1, gap: 2 },
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
