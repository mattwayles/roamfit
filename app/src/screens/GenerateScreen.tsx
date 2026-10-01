/**
 * §10.2 Generate, now "Ignition" (DESIGN.md §5.5): choosing a session should feel like choosing an
 * adventure. Focus is a grid of tiles, time a row of big numeral chips, intensity a flame segment,
 * equipment a collapsible card of toggle rows, and the two extras are `Switch` rows; a sticky footer
 * carries the live recap and the BUILD MY SESSION button. The drop-down `OptionPicker` this replaced
 * is gone — every option is one tap, and each keeps a stable `${pickerTestID}-option-${value}` id.
 *
 * Original notes follow. ADR 0002: no
 * sub-15-minute option in this picker — Quick Session (Home screen) is the only supported short
 * path. Anchors default from the user's sticky `anchorsAvailable` (§5.3) and any change here
 * persists back through `usersRepo.updateUser`, never a local-only edit.
 *
 * "Pre-filled with the recommendation" (smart generation as the default): this build pre-fills
 * sensible fixed defaults (full/medium/30min) rather than inventing a recommendation heuristic
 * of its own — the engine/store do not yet expose a "recommended next focus" query, and
 * fabricating one here would put a selection decision in the UI layer, which this wave's
 * ground rule forbids. Flagged in STATUS-4-loop.md as a follow-up once such a query exists.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Anchor, Focus } from '@roamfit/data';
import { createRng, seedFromString } from '@roamfit/engine';
import type { Difficulty } from '@roamfit/engine';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { getNetworkStatus } from '../lib/networkStatus';
import { DIFFICULTY_LABELS, FOCUS_LABELS, FOCUS_TONE } from '../lib/focusLabels';
import { IconBadge } from '../components/IconBadge';
import { gutter, makeStyles, radius, space, useTheme, withAlpha, type AccentName } from '../theme';
import {
  Button,
  Card,
  Enter,
  Icon,
  PressableScale,
  Screen,
  Switch,
  Txt,
  type IconName,
} from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Generate'>;

const TIME_OPTIONS = [15, 20, 30, 45, 60, 90, 120]; // ADR 0002 floor, ADR 0013 ceiling
// Cardio last: it's the newest, least-habitual choice, and putting it after the four
// muscle-group focuses keeps their relative order (and therefore existing muscle memory for
// where a focus sits in the picker) unchanged.
const FOCUS_OPTIONS: Focus[] = ['upper', 'abs', 'legs', 'full', 'cardio'];
/** Tile icon + one-line flavor per focus (DESIGN.md §5.5). Color comes from the semantic `focus`
 *  map; `FOCUS_TONE` (lib/focusLabels) is the same mapping by accent name. */
const FOCUS_FLAVOR: Record<Focus, { icon: IconName; flavor: string }> = {
  upper: { icon: 'barbell', flavor: 'Push, pull, press' },
  abs: { icon: 'core', flavor: 'Anti-everything core' },
  legs: { icon: 'walk', flavor: 'Squats, lunges, hinges' },
  full: { icon: 'body', flavor: 'Head to toe' },
  cardio: { icon: 'pulse', flavor: 'Heart rate up' },
};
const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'medium', 'hard'];
/** Flames shown over each intensity label (text labels stay: emoji-alone was rejected earlier). */
const DIFFICULTY_FLAMES: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
/**
 * §5.3 available equipment, as a grouped checklist rather than a wrap of chips.
 *
 * Bodyweight exercises and band exercises that need no fixed point (self-low, stance, feet,
 * thigh-loop) are always eligible for a workout and are not shown here at all — there is
 * nothing the user could lack, so there is nothing to ask. Only equipment the engine actually
 * needs to gate on appears: a band anchored to a low/mid/high point, or a bar/bench.
 *
 * Two problems with the old presentation, all fixed here:
 *  - the labels were raw enum values (`self-low`, `thigh-loop`, `anchor-mid`), which mean nothing
 *    to a user standing in a car park deciding what they can tie a band to;
 *  - multi-select chips looked identical to the single-select Time/Focus/Difficulty controls above,
 *    so nothing signalled that these behave differently (those are now scrolling pickers, which
 *    separates the two kinds of choice further still).
 *
 * Track 14 adds a second group, "Cardio gear", for gear that isn't a fixed point at all (a jump
 * rope). The list is no longer only anchors in the literal sense, so each group carries its own
 * title rather than the checklist having one; "Needs something to anchor to" still describes the
 * first group correctly on its own.
 */
const ANCHOR_GROUPS: {
  title: string;
  anchors: { value: Anchor; label: string; hint?: string }[];
}[] = [
  {
    title: 'Needs something to anchor to',
    anchors: [
      {
        value: 'anchor-low',
        label: 'Low Band Anchor Point',
        hint: 'door base, post, heavy furniture',
      },
      {
        value: 'anchor-mid',
        label: 'Mid Band Anchor Point',
        hint: 'rail, handle, waist-height fixing',
      },
      { value: 'anchor-high', label: 'High Band Anchor Point', hint: 'bar, beam, top of a door' },
      { value: 'low-bar', label: 'Waist-height bar', hint: 'picnic table, RV ladder, low branch' },
      { value: 'pullup-bar', label: 'Pull-up bar', hint: 'takes your full hanging weight' },
      { value: 'body-support', label: 'Bench or step', hint: 'something to dip or press off' },
    ],
  },
  {
    title: 'Cardio gear',
    anchors: [{ value: 'jump-rope', label: 'Jump rope', hint: 'for rope skipping moves' }],
  },
];

const ANCHOR_COUNT = ANCHOR_GROUPS.reduce((n, g) => n + g.anchors.length, 0);
const VISIBLE_ANCHOR_VALUES: readonly Anchor[] = ANCHOR_GROUPS.flatMap((g) =>
  g.anchors.map((a) => a.value),
);

export default function GenerateScreen({ navigation, route }: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const { db, library, families } = useStore();
  const [minutes, setMinutes] = useState(30);
  const [focus, setFocus] = useState<Focus>('full');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  // Collapsed by default: anchors are sticky user state (§5.3), set once and rarely revisited, so
  // they should not cost eleven rows of the picker on every generation.
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  // §9.9 — pre-filled by an accepted Recovery Week auto-suggestion (Home), or toggled manually
  // here. Either way it's just a request flag until the user taps Generate — never applied
  // silently, per the brief's "always available as a manual toggle" requirement.
  const [recoveryWeek, setRecoveryWeek] = useState(route.params?.recoveryWeek ?? false);
  // Track 19 — weave a few cardio moves through a strength workout. The Cardio Only focus is
  // already all cardio, so the box is disabled (and reads unticked) there; the choice itself is
  // kept, so switching back to a strength focus restores it.
  const [cardioAddOn, setCardioAddOn] = useState(false);
  const cardioAddOnDisabled = focus === 'cardio';
  const cardioAddOnActive = cardioAddOn && !cardioAddOnDisabled;
  // §15 "offline share" instrumentation only — never read by generation logic itself, and never
  // awaited on the critical path (invariant 1): a best-effort background reading, undefined until
  // it resolves, in which case `generate()` simply logs nothing for this session (see
  // `generation.ts`'s `online` doc comment) rather than blocking or guessing.
  const [online, setOnline] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const user = usersRepo.ensureUser(db, nowUtcInstant());
    // Older profiles may still carry now-always-eligible values (bodyweight/no-fixed-point band
    // anchors) from before that group was removed from this picker. Trim them so the "N of
    // ANCHOR_COUNT selected" summary stays meaningful, and persist the trim so it only happens
    // once per profile.
    const filtered = user.anchorsAvailable.filter((a) => VISIBLE_ANCHOR_VALUES.includes(a));
    setAnchors(filtered);
    if (filtered.length !== user.anchorsAvailable.length) {
      usersRepo.updateUser(db, { anchorsAvailable: filtered }, nowUtcInstant());
    }
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
        request: { focus, difficulty, targetMinutes: minutes, cardioAddOn: cardioAddOnActive },
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
  }, [
    db,
    library,
    families,
    focus,
    difficulty,
    minutes,
    recoveryWeek,
    cardioAddOnActive,
    online,
    navigation,
  ]);

  const recap = [
    `${minutes} min`,
    FOCUS_LABELS[focus],
    DIFFICULTY_LABELS[difficulty],
    ...(cardioAddOnActive ? ['+ cardio'] : []),
    ...(recoveryWeek ? ['recovery'] : []),
  ].join(' · ');

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Txt
            testID="generate-recap"
            variant="eyebrow"
            color="text2"
            align="center"
            numberOfLines={1}
          >
            {recap}
          </Txt>
          <Button
            testID="generate-button"
            label={generating ? 'Scouting your route…' : 'Build my session'}
            icon="bolt"
            size="lg"
            haptic="medium"
            loading={generating}
            onPress={handleGenerate}
          />
        </View>
      }
    >
      <Enter index={0} style={styles.titleBlock}>
        <Txt variant="eyebrow" color="ember">
          New session
        </Txt>
        <Txt variant="display" accessibilityRole="header">
          What are we training?
        </Txt>
      </Enter>

      {/* Focus: the big decision, so it gets the big tiles. Cardio is full-width and last (the
          newest, least-habitual choice — see FOCUS_OPTIONS). */}
      <Enter index={1} style={styles.section}>
        <Txt variant="eyebrow" color="text3">
          Focus
        </Txt>
        <View
          testID="focus-picker"
          accessibilityRole="radiogroup"
          accessibilityLabel="Focus"
          style={styles.tileGrid}
        >
          {FOCUS_OPTIONS.map((f) => {
            const selected = focus === f;
            const tone = FOCUS_TONE[f];
            const accent = theme.focus[f];
            return (
              <PressableScale
                key={f}
                testID={`focus-picker-option-${f}`}
                accessibilityRole="radio"
                accessibilityLabel={FOCUS_LABELS[f]}
                accessibilityState={{ selected }}
                onPress={() => setFocus(f)}
                style={[
                  styles.tile,
                  f === 'cardio' && styles.tileWide,
                  selected && { borderColor: accent, backgroundColor: withAlpha(accent, 0.15) },
                  selected && theme.glow(accent),
                ]}
              >
                <IconBadge icon={FOCUS_FLAVOR[f].icon} tone={tone} size={36} />
                <View>
                  <Txt variant="h2">{FOCUS_LABELS[f]}</Txt>
                  <Txt variant="caption" color="text2">
                    {FOCUS_FLAVOR[f].flavor}
                  </Txt>
                </View>
                {selected && (
                  <View style={[styles.tileCheck, { backgroundColor: accent }]}>
                    <Icon name="check" size={14} color="ink" />
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>
      </Enter>

      {/* Time: numerals big enough to read at arm's length. Seven chips run wider than a phone, so
          the row scrolls, bleeding off the gutter to say so. */}
      <Enter index={2} style={styles.section}>
        <Txt variant="eyebrow" color="text3">
          Time
        </Txt>
        <ScrollView
          testID="time-picker"
          accessibilityRole="radiogroup"
          accessibilityLabel="Session length"
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.timeRow}
        >
          {TIME_OPTIONS.map((m) => {
            const selected = minutes === m;
            return (
              <PressableScale
                key={m}
                testID={`time-picker-option-${m}`}
                accessibilityRole="radio"
                accessibilityLabel={`${m} minutes`}
                accessibilityState={{ selected }}
                onPress={() => setMinutes(m)}
                style={[
                  styles.timeChip,
                  selected && styles.timeChipOn,
                  selected && theme.glow(theme.colors.ember),
                ]}
              >
                <Txt variant="h1" color={selected ? 'ink' : 'text'}>
                  {m}
                </Txt>
                <Txt variant="eyebrow" color={selected ? 'ink' : 'text3'}>
                  min
                </Txt>
              </PressableScale>
            );
          })}
        </ScrollView>
      </Enter>

      {/* Intensity: three segments, each showing its flames over its (kept) text label. */}
      <Enter index={3} style={styles.section}>
        <Txt variant="eyebrow" color="text3">
          Intensity
        </Txt>
        <View
          testID="difficulty-picker"
          accessibilityRole="radiogroup"
          accessibilityLabel="Difficulty"
          style={styles.segments}
        >
          {DIFFICULTY_OPTIONS.map((d) => {
            const selected = difficulty === d;
            return (
              <PressableScale
                key={d}
                testID={`difficulty-picker-option-${d}`}
                accessibilityRole="radio"
                accessibilityLabel={DIFFICULTY_LABELS[d]}
                accessibilityState={{ selected }}
                onPress={() => setDifficulty(d)}
                style={[styles.segment, selected && styles.segmentOn]}
              >
                <View style={styles.flames}>
                  {Array.from({ length: DIFFICULTY_FLAMES[d] }, (_, i) => (
                    <Icon key={i} name="flame" size={20} color={selected ? 'ink' : 'text3'} />
                  ))}
                </View>
                <Txt variant="eyebrow" color={selected ? 'ink' : 'text2'}>
                  {DIFFICULTY_LABELS[d]}
                </Txt>
              </PressableScale>
            );
          })}
        </View>
      </Enter>

      {/* Equipment: collapsed by default (see `anchorsOpen`). */}
      <Enter index={4}>
        <Card padding="md" style={styles.equipment}>
          <PressableScale
            testID="anchors-disclosure"
            accessibilityRole="button"
            accessibilityLabel="Available equipment"
            accessibilityState={{ expanded: anchorsOpen }}
            onPress={() => setAnchorsOpen((v) => !v)}
            style={styles.disclosure}
          >
            <IconBadge icon="anchor" tone="sky" size={36} />
            <View style={styles.disclosureLabels}>
              <Txt variant="h3">Available equipment</Txt>
              <Txt testID="anchors-summary" variant="caption" color="text2">
                {anchors.length} of {ANCHOR_COUNT} selected
              </Txt>
            </View>
            <Icon name={anchorsOpen ? 'chevronUp' : 'chevronDown'} size={20} color="text2" />
          </PressableScale>

          {anchorsOpen &&
            ANCHOR_GROUPS.map((group) => (
              <View key={group.title} style={styles.anchorGroup}>
                <Txt variant="eyebrow" color="text3">
                  {group.title}
                </Txt>
                {group.anchors.map((a) => {
                  const selected = anchors.includes(a.value);
                  return (
                    <PressableScale
                      key={a.value}
                      testID={`anchor-${a.value}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={a.label}
                      style={[styles.anchorRow, selected && styles.anchorRowOn]}
                      onPress={() => toggleAnchor(a.value)}
                    >
                      <View style={[styles.anchorCheck, selected && styles.anchorCheckOn]}>
                        {selected && <Icon name="check" size={16} color="ink" />}
                      </View>
                      <View style={styles.anchorLabels}>
                        <Txt variant="bodyStrong" color={selected ? 'text' : 'text2'}>
                          {a.label}
                        </Txt>
                        {a.hint != null && (
                          <Txt variant="caption" color="text3">
                            {a.hint}
                          </Txt>
                        )}
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            ))}
        </Card>
      </Enter>

      {/* Extras. The switch is the state: with only wording to go on it was once unclear these were
          options you had *not* taken. Whole row toggles, not just the switch. */}
      <Enter index={5} style={styles.extras}>
        <ToggleRow
          testID="cardio-addon-toggle"
          switchTestID="cardio-addon-checkbox"
          icon="pulse"
          tone="rose"
          title="Cardio add-on"
          subtitle={
            cardioAddOnDisabled
              ? 'Not needed for a Cardio Only workout.'
              : 'Cardio moves spaced through your strength work.'
          }
          value={cardioAddOnActive}
          disabled={cardioAddOnDisabled}
          onChange={setCardioAddOn}
        />
        <ToggleRow
          testID="recovery-week-toggle"
          switchTestID="recovery-week-checkbox"
          icon="leaf"
          tone="lagoon"
          title="Recovery Workout"
          subtitle="Lighter loads, same consistency."
          value={recoveryWeek}
          onChange={setRecoveryWeek}
        />
      </Enter>
    </Screen>
  );
}

/** A `Switch` row: tinted icon, title, subtitle. The row itself is the toggle (`testID`), the
 *  switch carries its own id (`switchTestID`) so its state can be read directly. */
function ToggleRow({
  testID,
  switchTestID,
  icon,
  tone,
  title,
  subtitle,
  value,
  disabled = false,
  onChange,
}: {
  testID: string;
  switchTestID: string;
  icon: IconName;
  tone: AccentName;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[
        styles.toggleRow,
        value && { backgroundColor: theme.tints[tone] },
        disabled && styles.disabled,
      ]}
    >
      <IconBadge icon={icon} tone={tone} size={40} />
      <View style={styles.toggleLabels}>
        <Txt variant="h3">{title}</Txt>
        <Txt variant="caption" color="text2">
          {subtitle}
        </Txt>
      </View>
      <Switch
        testID={switchTestID}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={title}
      />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { paddingTop: space.sm, gap: space.xxl },
    titleBlock: { gap: space.xs },
    section: { gap: space.md },
    footer: { gap: space.sm },

    // -- focus tiles
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
    tile: {
      flexBasis: '45%',
      flexGrow: 1,
      minHeight: 104,
      justifyContent: 'space-between',
      gap: space.sm,
      padding: space.md,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
    },
    tileWide: { flexBasis: '100%' },
    tileCheck: {
      position: 'absolute',
      top: space.sm,
      right: space.sm,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // -- time chips (bleed off the gutter so the scroll reads as a scroll)
    bleed: { marginHorizontal: -gutter },
    timeRow: { paddingHorizontal: gutter, gap: space.sm },
    timeChip: {
      width: 76,
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
    },
    timeChipOn: { backgroundColor: t.colors.ember, borderColor: t.colors.ember },

    // -- intensity segments
    segments: {
      flexDirection: 'row',
      padding: space.xs,
      gap: space.xs,
      borderRadius: radius.md,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    segment: {
      flex: 1,
      minHeight: 68,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      borderRadius: radius.md - space.xs,
    },
    segmentOn: { backgroundColor: t.colors.ember },
    flames: { flexDirection: 'row', height: 22, alignItems: 'center' },

    // -- equipment
    equipment: { gap: space.md },
    disclosure: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
    disclosureLabels: { flex: 1 },
    anchorGroup: { gap: space.sm, marginTop: space.sm },
    anchorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 52,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    anchorRowOn: { borderColor: t.colors.ember, backgroundColor: t.tints.ember },
    anchorCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.lineStrong,
    },
    anchorCheckOn: { backgroundColor: t.colors.ember, borderColor: t.colors.ember },
    anchorLabels: { flex: 1 },

    // -- extras
    extras: { gap: space.md },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 72,
      padding: space.md,
      borderRadius: radius.lg,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    toggleLabels: { flex: 1, gap: 2 },
    disabled: { opacity: 0.5 },
  }),
);
