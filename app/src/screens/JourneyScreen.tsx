/**
 * §14.1 Journey — the long-term story, split out of the old Home (DESIGN.md §5.2): lifetime
 * totals, Trails (the progression board), the Logbook calendar, Passport stamps and muscle
 * balance. Today (HomeScreen) keeps the "what do I do now" half.
 *
 * §14.2 zero-session requirement: the Trails render before the user has ever generated a session
 * (`useDashboardData` runs the idempotent progression initializer), with an explanation of the
 * starting rung. The sections that only have something to show after a first session (lifetime,
 * logbook, passport, muscle balance) show an encouraging empty state instead of a blank.
 *
 * Governing rule (§14, §1.1): every element accumulates monotonically or points at a concrete
 * next action. No daily streaks, no red/empty styling on untrained days, no guilt copy — see the
 * wave brief's "grep for shame" done-criterion. The next unlock's *exercise* is never named
 * (ADR 0014 — that is the reveal); Trails carry the current exercise and how close you are.
 *
 * All state comes from `@roamfit/store` repositories and `@roamfit/engine` pure functions via
 * `useDashboardData`; the only "decisions" made here are layout and what to say about the outcome
 * of a level change.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  levelUpFamily,
  levelDownFamily,
  manualDayMarkersRepo,
  sessionsRepo,
  usersRepo,
} from '@roamfit/store';
import type { ProgressionFamilyId } from '@roamfit/data';
import { createRng, seedFromString } from '@roamfit/engine';
import type { TabScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import {
  buildCalendarWeeks,
  monthLabel,
  monthOfLocalDate,
  monthShortName,
  shiftMonth,
  WEEKDAY_LABELS,
  type CalendarDay,
  type DayMarker,
  type FamilyBoardEntry,
} from '../lib/dashboard';
import { DAY_MARKER_OPTIONS } from '../lib/dayMarkers';
import { buildSessionHistoryView, formatFullLocalDate } from '../lib/sessionHistory';
import { useDashboardData } from '../lib/useDashboardData';
import { useLogbookMonth } from '../lib/useLogbookMonth';
import { requestLocationPermission } from '../lib/geocode';
import { makeStyles, radius, space, useTheme } from '../theme';
import {
  Button,
  Card,
  Chip,
  Enter,
  Gradient,
  Icon,
  IconButton,
  PressableScale,
  ProgressRing,
  Screen,
  Sheet,
  Stamp,
  StatTile,
  Txt,
} from '../ui';
import { DayCell } from '../components/DayCell';
import { EmptyState } from '../components/EmptyState';
import { RungTrack } from '../components/RungTrack';
import { SectionTitle } from '../components/SectionTitle';

type Props = TabScreenProps<'Journey'>;

/** Sample stamps ghosted behind the Passport opt-in — decoration only, never the user's data. */
const SAMPLE_STAMPS = ['Lisbon, PRT', 'Bend, OR, USA', 'Cusco, PER'] as const;

/** The most a Journey list staggers by, so a long board never delays its own tail. */
const MAX_STAGGER = 9;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** One workout on the day sheet: what the card prints, built from the same view model as the
 *  history page it opens. */
interface DaySessionCard {
  sessionId: string;
  emoji: string;
  focusLabel: string;
  minutes: number;
  place: string | null;
  summary: string;
}

export default function JourneyScreen({ navigation }: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const { db, library, families } = useStore();
  /** ADR 0012 — one-line result of the last board level-up or level-down. Informational only:
   *  never blocks, never nags, replaced rather than stacked (invariant 4). */
  const [levelUpNotice, setLevelUpNotice] = useState<string | null>(null);
  /** Which family row is showing its "are you sure" step, if any. One at a time. */
  const [confirmingLevelUp, setConfirmingLevelUp] = useState<ProgressionFamilyId | null>(null);
  /** Same shape as `confirmingLevelUp`, for the symmetric "too hard — level down" button. */
  const [confirmingLevelDown, setConfirmingLevelDown] = useState<ProgressionFamilyId | null>(null);
  /** Trails rows whose Adjust panel is open. Collapsed by default: the board is for looking. */
  const [adjusting, setAdjusting] = useState<ReadonlySet<ProgressionFamilyId>>(new Set());
  /** §14.1.6 — the calendar day the marker sheet is editing (localDate). Kept after the sheet
   *  closes so its title doesn't blank out during the exit animation. */
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  /** The tapped day's workouts, loaded on tap (a few indexed reads) rather than for every cell. */
  const [dayCards, setDayCards] = useState<DaySessionCard[]>([]);
  /** The Logbook month being shown ('YYYY-MM'). Resets to the current month when the tab regains
   *  focus, except when coming back from a workout opened off this month's day sheet. */
  const [viewedMonth, setViewedMonth] = useState(() => monthOfLocalDate(nowEngineClock().today));
  const keepMonthOnFocus = useRef(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const { data, reload } = useDashboardData();
  const pastMonthDays = useLogbookMonth(viewedMonth, data);

  // Reload on every focus, exactly like Today: a level change, a marker or a passport toggle made
  // anywhere must show here immediately.
  useFocusEffect(
    useCallback(() => {
      reload();
      if (keepMonthOnFocus.current) keepMonthOnFocus.current = false;
      else setViewedMonth(monthOfLocalDate(nowEngineClock().today));
      setConfirmingLevelUp(null);
      setConfirmingLevelDown(null);
    }, [reload]),
  );

  /**
   * ADR 0012 — the user says a rung is below them, so raise it. One rung per tap and repeatable,
   * because the cold start is level 1 and someone already training taps until the exercise on the
   * board looks like something they would actually do.
   *
   * Everything real happens in `levelUpFamily` (which is the engine's work, via the store); this
   * only decides what to say about the outcome and reloads the board.
   */
  const handleLevelUp = (entry: FamilyBoardEntry) => {
    setConfirmingLevelUp(null);
    const result = levelUpFamily(
      db,
      {
        familyId: entry.familyId,
        library,
        families,
        clock: nowEngineClock(),
        rng: createRng(seedFromString(nowUtcInstant())),
      },
      nowUtcInstant(),
    );
    if (result.status === 'levelled_up') {
      setLevelUpNotice(`${entry.familyName}: now at ${result.exerciseName}.`);
    } else if (result.status === 'at_max') {
      setLevelUpNotice(`${entry.familyName} is already at the top of its ladder — nice.`);
    } else if (result.status === 'no_eligible_exercise') {
      setLevelUpNotice(`The next ${entry.familyName} level needs an anchor you don't have set up.`);
    }
    reload();
  };

  /**
   * The symmetric counterpart to `handleLevelUp` — the user says a rung is above them, so drop
   * it. Same shape, same reasoning, opposite direction: `levelDownFamily` is the engine's work
   * via the store, and this only decides what to say about the outcome and reloads the board.
   */
  const handleLevelDown = (entry: FamilyBoardEntry) => {
    setConfirmingLevelDown(null);
    const result = levelDownFamily(
      db,
      {
        familyId: entry.familyId,
        library,
        families,
        clock: nowEngineClock(),
        rng: createRng(seedFromString(nowUtcInstant())),
      },
      nowUtcInstant(),
    );
    if (result.status === 'levelled_down') {
      setLevelUpNotice(`${entry.familyName}: now at ${result.exerciseName}.`);
    } else if (result.status === 'at_min') {
      setLevelUpNotice(`${entry.familyName} is already at the bottom of its ladder.`);
    } else if (result.status === 'no_eligible_exercise') {
      setLevelUpNotice(
        `The prior ${entry.familyName} level needs an anchor you don't have set up.`,
      );
    }
    reload();
  };

  const toggleAdjust = (familyId: ProgressionFamilyId) => {
    const opening = !adjusting.has(familyId);
    setAdjusting((prev) => {
      const next = new Set(prev);
      if (opening) next.add(familyId);
      else next.delete(familyId);
      return next;
    });
    if (!opening) {
      if (confirmingLevelUp === familyId) setConfirmingLevelUp(null);
      if (confirmingLevelDown === familyId) setConfirmingLevelDown(null);
    }
  };

  /** §14.1.6 — a hand-set correction to one calendar day's marker: a workout that happened
   *  outside RoamFit, or a travel day that went unlogged at the time. Purely a display override —
   *  it never creates or edits a `sessions` row or a `travel_day` signal, so it can't be confused
   *  with a real logged workout anywhere else in the app. */
  const handleSetDayMarker = (localDate: string, marker: DayMarker) => {
    manualDayMarkersRepo.setManualDayMarker(db, localDate, marker, nowUtcInstant());
    setDaySheetOpen(false);
    reload();
  };

  const openDay = (day: CalendarDay) => {
    const cards: DaySessionCard[] = [];
    for (const id of day.sessionIds) {
      const session = sessionsRepo.getCompletedSessionDetail(db, id);
      if (!session) continue;
      const view = buildSessionHistoryView(session, library.exercises);
      cards.push({
        sessionId: id,
        emoji: view.emoji,
        focusLabel: view.focusLabel,
        minutes: view.minutes,
        place: view.place,
        summary: view.stats
          .filter((st) => st.key === 'exercises' || st.key === 'sets')
          .map((st) => st.label)
          .join(' · '),
      });
    }
    setDayCards(cards);
    setEditingDay(day.localDate);
    setDaySheetOpen(true);
  };

  const openSession = (sessionId: string) => {
    setDaySheetOpen(false);
    keepMonthOnFocus.current = true;
    navigation.navigate('SessionHistory', { sessionId });
  };

  const handleSharePassport = () => {
    if (!data) return;
    const { places, countries } = data.passport;
    void Share.share({
      message: `RoamFit — trained in ${places.length} ${places.length === 1 ? 'place' : 'places'} and ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}.`,
    });
  };

  const handlePassportOptIn = () => {
    usersRepo.updateUser(db, { passportEnabled: true }, nowUtcInstant());
    // Fire-and-forget — the queued `passport_geocode` jobs are what actually retry the lookup;
    // this just gives the very first one a granted permission to find instead of failing once
    // for free.
    void requestLocationPermission();
    reload();
  };

  if (data === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );
  }

  const { stats, user, board, passport, muscleBalance } = data;
  const calendarDays = pastMonthDays ?? data.calendarDays;
  const currentMonth = monthOfLocalDate(data.todayLocalDate);
  const firstMonth = data.earliestMonth ?? currentMonth;
  const atEarliest = viewedMonth <= firstMonth;
  const atCurrent = viewedMonth >= currentMonth;
  const pickerYears: number[] = [];
  for (let y = Number(currentMonth.slice(0, 4)); y >= Number(firstMonth.slice(0, 4)); y -= 1) {
    pickerYears.push(y);
  }
  const pickMonth = (ym: string) => {
    setViewedMonth(ym);
    setMonthPickerOpen(false);
  };
  const lifetime = data.lifetimeCounters;
  const hasSessions = stats.lifetimeSessionCount > 0;
  const isZeroSession = !hasSessions;
  const calendarWeeks = buildCalendarWeeks(calendarDays);
  const maxSets = muscleBalance[0]?.hardSets || 1;
  const editingTitle = editingDay !== null ? formatFullLocalDate(editingDay) : undefined;
  const editingCalendarDay = calendarDays.find((d) => d.localDate === editingDay);
  const editingCurrent = editingCalendarDay?.marker;
  const handMarkedOnly =
    dayCards.length === 0 &&
    editingCalendarDay?.manualMarker != null &&
    editingCalendarDay.manualMarker !== 'none';

  let stagger = 0;
  const next = () => Math.min(stagger++, MAX_STAGGER);

  return (
    <Screen
      scroll
      edges={['top', 'left', 'right']}
      safeBottom={false}
      testID="journey-screen"
      contentStyle={styles.content}
    >
      <Enter index={next()}>
        <Txt variant="eyebrow" color="gold">
          Your journey
        </Txt>
        <Txt variant="display">Journey Markers</Txt>
      </Enter>

      {/* §14.1.8 lifetime counters — monotonic, permanent. Two tones in a checkerboard (teal,
          fern, teal / fern, teal, fern) so neighbours alternate; the icon and label say what each counts. */}
      <Enter index={next()} style={styles.section}>
        {hasSessions ? (
          <View testID="lifetime-counters" style={styles.tiles}>
            <View style={styles.tileRow}>
              <StatTile
                testID="lifetime-sessions"
                style={styles.tile}
                value={lifetime.sessions}
                label="Sessions"
                icon="flame"
                tone="teal"
              />
              <StatTile
                testID="lifetime-sets"
                style={styles.tile}
                value={lifetime.totalSets}
                label="Sets completed"
                icon="barbell"
                tone="fern"
              />
              <StatTile
                testID="lifetime-personal-bests"
                style={styles.tile}
                value={lifetime.bestSets}
                label="Personal bests"
                icon="trophy"
                tone="teal"
              />
            </View>
            <View style={styles.tileRow}>
              <StatTile
                testID="lifetime-levels"
                style={styles.tile}
                value={lifetime.levelsGained}
                label="Levels gained"
                icon="trendingUp"
                tone="fern"
              />
              <StatTile
                testID="lifetime-places"
                style={styles.tile}
                value={lifetime.places}
                label="Places"
                icon="location"
                tone="teal"
              />
              <StatTile
                testID="lifetime-countries"
                style={styles.tile}
                value={lifetime.countries}
                label="Countries"
                icon="globe"
                tone="fern"
              />
            </View>
          </View>
        ) : (
          <EmptyState
            testID="journey-empty"
            icon="journey"
            tone="summit"
            title="Your story starts with one session"
            body="Finish a workout and your totals, logbook, passport stamps and muscle balance land right here."
          />
        )}
      </Enter>

      {/* Trails — the progression board (renamed in UI copy only; testIDs keep `board`). */}
      <View style={styles.section}>
        <Enter index={next()}>
          <SectionTitle
            title="Trails"
            icon="flag"
            tone="summit"
            caption="Every movement has a ladder. Here is where you are on each."
          />
        </Enter>
        {isZeroSession && (
          <View testID="first-session-explanation" style={styles.note}>
            <Icon name="sparkles" size={18} color="summit" style={styles.noteIcon} />
            <Txt variant="small" color="text" style={styles.noteText}>
              You&apos;re starting at the bottom of each trail — tap Adjust on any of them to move a
              level if it&apos;s too easy or too hard.
            </Txt>
          </View>
        )}
        <View testID="progression-board" style={styles.board}>
          {levelUpNotice != null && (
            <View testID="board-level-up-notice" style={styles.note}>
              <Icon name="trendingUp" size={18} color="summit" style={styles.noteIcon} />
              <Txt variant="small" color="text" style={styles.noteText}>
                {levelUpNotice}
              </Txt>
            </View>
          )}
          {board.map((entry, index) => {
            const open = adjusting.has(entry.familyId);
            const remaining = entry.sessionsToNextLevel;
            const total = entry.sessionsInLevel;
            const progress =
              total !== null && total > 0 && remaining !== null ? (total - remaining) / total : 0;
            return (
              <Enter key={entry.familyId} index={Math.min(3 + index, MAX_STAGGER)}>
                <Card testID={`board-row-${entry.familyId}`} padding="md" style={styles.trail}>
                  {/* Two columns: identity on the left, status on the right. How close you are is
                      the ring, the loudest thing on the row. */}
                  <View style={styles.trailTop}>
                    <View style={styles.trailIdentity}>
                      <Txt variant="h2">{entry.familyName}</Txt>
                      <Txt variant="small" color="text2">
                        {entry.exerciseName}
                      </Txt>
                    </View>
                    {/* ADR 0014 — how close you are, made the loudest thing on the row. The next
                        exercise is deliberately not named: the unlock is the reward, and printing
                        it here spends that for nothing. */}
                    {!entry.isMastery && remaining !== null ? (
                      <View style={styles.ringBlock}>
                        <ProgressRing
                          testID={`board-progress-${entry.familyId}`}
                          progress={progress}
                          size={56}
                          stroke={6}
                          gradient={theme.gradients.summit}
                          accessibilityLabel={`${remaining} ${plural(remaining, 'session', 'sessions')} to next level`}
                        >
                          <Txt variant="h2" testID={`board-sessions-left-${entry.familyId}`}>
                            {remaining}
                          </Txt>
                        </ProgressRing>
                        <Txt
                          variant="caption"
                          color="text3"
                          align="center"
                          style={styles.ringCaption}
                        >
                          {plural(remaining, 'session', 'sessions')} to next level
                        </Txt>
                      </View>
                    ) : null}
                  </View>

                  <RungTrack
                    testID={`board-track-${entry.familyId}`}
                    count={entry.ordinal.of}
                    current={entry.ordinal.n}
                    mastery={entry.isMastery}
                  />

                  <View style={styles.levelRow}>
                    <Txt variant="eyebrow" color={entry.isMastery ? 'gold' : 'summit'}>
                      Level {entry.ordinal.n} of {entry.ordinal.of}
                    </Txt>
                    {entry.isMastery ? (
                      <Chip label="Summit" tone="gold" icon="flag" size="sm" />
                    ) : null}
                  </View>

                  {entry.isMastery ? (
                    <Txt variant="caption" color="text2">
                      At the top of this ladder — micro-progression keeps running.
                    </Txt>
                  ) : null}

                  {/* ADR 0012 — raise or drop the rung from the board, before generating anything.
                      The board is where a ladder position is actually shown, and a level is a
                      property of the user rather than of any one session, so this is the place to
                      correct it. Collapsed behind Adjust: looking is the common case, adjusting is
                      occasional. Nothing to offer up at the top of a ladder (§6.7 Mastery) or down
                      at the bottom. */}
                  <View style={styles.trailActions}>
                    <Button
                      testID={`board-adjust-${entry.familyId}`}
                      label="Adjust"
                      variant="quiet"
                      size="sm"
                      icon={open ? 'chevronUp' : 'chevronDown'}
                      iconRight
                      accessibilityLabel={`Adjust ${entry.familyName} level`}
                      onPress={() => toggleAdjust(entry.familyId)}
                      style={styles.adjust}
                    />
                    <Button
                      testID={`board-trail-progress-${entry.familyId}`}
                      label="Progress"
                      variant="quiet"
                      size="sm"
                      icon="chevronRight"
                      iconRight
                      accessibilityLabel={`${entry.familyName} progress over time`}
                      onPress={() =>
                        navigation.navigate('TrailProgress', { familyId: entry.familyId })
                      }
                    />
                  </View>

                  {open ? (
                    <View style={styles.adjustPanel}>
                      {!entry.isMastery &&
                        confirmingLevelDown !== entry.familyId &&
                        (confirmingLevelUp === entry.familyId ? (
                          /* Two-step confirm, same shape as `AbandonSessionButton`'s. Warranted
                             because a level change resets this level's micro-progression to the
                             new rung's floor. Row-scoped, so only the row you tapped is ever in
                             this state. */
                          <View
                            style={styles.confirmBox}
                            testID={`board-level-up-confirm-${entry.familyId}`}
                          >
                            <Txt variant="small" color="text2">
                              Move {entry.familyName} up a level? The next rung is harder, and your
                              progress toward this unlock starts over.
                            </Txt>
                            <View style={styles.confirmButtons}>
                              <Button
                                testID={`board-level-up-cancel-${entry.familyId}`}
                                label="Not yet"
                                variant="secondary"
                                size="sm"
                                style={styles.flex}
                                onPress={() => setConfirmingLevelUp(null)}
                              />
                              <Button
                                testID={`board-level-up-confirm-yes-${entry.familyId}`}
                                label="Level up"
                                variant="primary"
                                size="sm"
                                style={styles.flex}
                                onPress={() => handleLevelUp(entry)}
                              />
                            </View>
                          </View>
                        ) : (
                          <Button
                            testID={`board-level-up-${entry.familyId}`}
                            label="Too easy — level up"
                            variant="secondary"
                            size="md"
                            icon="trendingUp"
                            fullWidth
                            accessibilityLabel={`${entry.exerciseName} is too easy — move up a level`}
                            onPress={() => setConfirmingLevelUp(entry.familyId)}
                          />
                        ))}

                      {/* Symmetric "too hard" control — same two-step confirm shape, opposite
                          direction. Never a punishing framing (invariant 4): dropping a rung is
                          exactly as neutral a correction as raising one, just phrased for the
                          other direction. */}
                      {!entry.isBaseLevel &&
                        confirmingLevelUp !== entry.familyId &&
                        (confirmingLevelDown === entry.familyId ? (
                          <View
                            style={styles.confirmBox}
                            testID={`board-level-down-confirm-${entry.familyId}`}
                          >
                            <Txt variant="small" color="text2">
                              Move {entry.familyName} down a level? The prior rung is easier, and
                              your progress toward this unlock starts over.
                            </Txt>
                            <View style={styles.confirmButtons}>
                              <Button
                                testID={`board-level-down-cancel-${entry.familyId}`}
                                label="Not yet"
                                variant="secondary"
                                size="sm"
                                style={styles.flex}
                                onPress={() => setConfirmingLevelDown(null)}
                              />
                              <Button
                                testID={`board-level-down-confirm-yes-${entry.familyId}`}
                                label="Level down"
                                variant="primary"
                                size="sm"
                                style={styles.flex}
                                onPress={() => handleLevelDown(entry)}
                              />
                            </View>
                          </View>
                        ) : (
                          <Button
                            testID={`board-level-down-${entry.familyId}`}
                            label="Too hard — level down"
                            variant="secondary"
                            size="md"
                            icon="arrowLeft"
                            fullWidth
                            accessibilityLabel={`${entry.exerciseName} is too hard — move down a level`}
                            onPress={() => setConfirmingLevelDown(entry.familyId)}
                          />
                        ))}
                    </View>
                  ) : null}
                </Card>
              </Enter>
            );
          })}
        </View>
      </View>

      {/* §14.1.6 Logbook — untrained days are neutral cells, never omitted or red. A trained day
          shows the emoji for its focus on a focus-colored tint; a travel day is sky-tinted. Today's
          cell gets a ring, not a color, so it never reads as a workout state. Every marker is
          hand-editable (tap opens the sheet below) so a workout logged outside RoamFit, or a
          travel day missed at the time, can still be reflected here. */}
      <Enter index={next()} style={styles.section}>
        <SectionTitle
          title="Logbook"
          icon="today"
          tone="teal"
          right={
            <View style={styles.monthNav}>
              <IconButton
                testID="logbook-prev"
                icon="back"
                size="sm"
                disabled={atEarliest}
                accessibilityLabel="Previous month"
                onPress={() => setViewedMonth(shiftMonth(viewedMonth, -1))}
              />
              <Chip
                testID="logbook-month-label"
                label={monthLabel(viewedMonth, currentMonth)}
                tone="teal"
                size="sm"
                accessibilityLabel={`${monthLabel(viewedMonth)} — choose a month`}
                onPress={() => setMonthPickerOpen(true)}
              />
              <IconButton
                testID="logbook-next"
                icon="chevronRight"
                size="sm"
                disabled={atCurrent}
                accessibilityLabel="Next month"
                onPress={() => setViewedMonth(shiftMonth(viewedMonth, 1))}
              />
            </View>
          }
        />
        {hasSessions ? (
          <View testID="calendar-heatmap" style={styles.calendar}>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label, i) => (
                <Txt key={i} variant="eyebrow" color="text3" align="center" style={styles.flex}>
                  {label}
                </Txt>
              ))}
            </View>
            {calendarWeeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.calendarRow}>
                {week.map((day, dayIndex) => (
                  <DayCell
                    key={day?.localDate ?? `blank-${weekIndex}-${dayIndex}`}
                    day={day}
                    isToday={day?.localDate === data.todayLocalDate}
                    testID={day ? `calendar-day-${day.localDate}` : undefined}
                    onPress={() => {
                      if (day) openDay(day);
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            testID="logbook-empty"
            icon="today"
            tone="teal"
            title="Every session leaves a mark"
            body="Your first workout lights up its day here — and you can log a workout from outside the app too."
          />
        )}
      </Enter>

      {/* §9.6 Passport — opt-in, strings only, one stamp per place (seeded by label, so a place always
          stamps the same way). Appears once there's something to pin (§14.2). */}
      <Enter index={next()} style={styles.section}>
        <SectionTitle
          title="Passport"
          icon="airplane"
          tone="sky"
          caption={
            user.passportEnabled && passport.places.length > 0
              ? `${passport.places.length} ${plural(passport.places.length, 'place', 'places')} · ${passport.countries.length} ${plural(passport.countries.length, 'country', 'countries')}`
              : undefined
          }
          right={
            user.passportEnabled && passport.places.length > 0 ? (
              <IconButton
                testID="share-passport"
                icon="share"
                accessibilityLabel="Share passport"
                onPress={handleSharePassport}
              />
            ) : undefined
          }
        />
        {user.passportEnabled && passport.places.length > 0 ? (
          <View testID="passport-section" style={styles.stamps}>
            {passport.places.map((place) => (
              <Stamp
                key={place}
                testID={`passport-stamp-${place}`}
                title={place}
                seed={place}
                size={96}
              />
            ))}
          </View>
        ) : !user.passportEnabled ? (
          hasSessions ? (
            <Card padding="md" style={styles.optIn}>
              <View style={styles.sampleStamps}>
                {SAMPLE_STAMPS.map((city) => (
                  <Stamp
                    key={city}
                    testID={`passport-sample-${city}`}
                    title={city}
                    seed={city}
                    size={72}
                    style={styles.ghost}
                  />
                ))}
              </View>
              <Txt variant="bodyStrong" align="center">
                Collect a stamp for every place you train
              </Txt>
              <Button
                testID="passport-opt-in"
                label="Turn on Passport"
                size="sm"
                onPress={handlePassportOptIn}
              />
            </Card>
          ) : (
            <EmptyState
              testID="passport-empty"
              icon="airplane"
              tone="sky"
              title="Stamps are waiting"
              body="Train somewhere new and a stamp for that place lands here."
            />
          )
        ) : (
          <EmptyState
            testID="passport-empty"
            icon="airplane"
            tone="sky"
            title="Passport is on"
            body="Train somewhere and your first stamp lands here."
          />
        )}
      </Enter>

      {/* §14.1.7 muscle balance — the hero volume metric, hard sets per muscle, trailing 14 days.
          OVER-WORKED is informational only, styled identically to every other row (§1.1). */}
      {hasSessions && (
        <Enter index={next()} style={styles.section}>
          <SectionTitle
            title="Muscle balance"
            icon="barbell"
            tone="teal"
            caption="Hard sets per muscle, trailing 14 days"
          />
          {muscleBalance.length > 0 ? (
            <View testID="muscle-balance" style={styles.muscles}>
              {muscleBalance.map((row) => (
                <View key={row.muscle} style={styles.muscleRow} testID={`muscle-row-${row.muscle}`}>
                  <Txt variant="small" color="text2" style={styles.muscleLabel} numberOfLines={1}>
                    {row.muscle}
                  </Txt>
                  <View style={styles.muscleTrack}>
                    <View
                      style={[
                        styles.muscleFill,
                        { width: `${Math.min(100, (row.hardSets / maxSets) * 100)}%` },
                      ]}
                    >
                      <Gradient colors={theme.gradients.trail} angle={90} radius={radius.pill} />
                    </View>
                  </View>
                  <Txt variant="small" color="text2" align="right" style={styles.muscleSets}>
                    {row.hardSets}
                    {row.overWorked ? ' · over-worked' : ''}
                  </Txt>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              testID="muscle-balance-empty"
              icon="barbell"
              tone="teal"
              title="Your balance builds as you train"
              body="Hard sets from the last two weeks show up here, muscle by muscle."
            />
          )}
        </Enter>
      )}

      <Sheet
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title="Go to month"
        testID="month-picker-sheet"
      >
        <ScrollView style={styles.daySheetScroll} showsVerticalScrollIndicator={false}>
          {pickerYears.map((year) => (
            <View key={year} style={styles.pickerYear}>
              <Txt variant="eyebrow" color="text3">
                {year}
              </Txt>
              <View style={styles.pickerMonths}>
                {Array.from({ length: 12 }, (_, i) => {
                  const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
                  const count = data.monthCounts.get(ym) ?? 0;
                  const future = ym > currentMonth;
                  return (
                    <PressableScale
                      key={ym}
                      testID={`month-option-${ym}`}
                      disabled={future}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: future, selected: ym === viewedMonth }}
                      accessibilityLabel={`${monthLabel(ym)}${count > 0 ? `, ${count} ${count === 1 ? 'workout' : 'workouts'}` : ''}`}
                      style={[
                        styles.pickerPill,
                        ym === viewedMonth && styles.markerOptionCurrent,
                        future && styles.pickerPillFuture,
                      ]}
                      onPress={() => pickMonth(ym)}
                    >
                      <Txt variant="bodyStrong" color={future ? 'text3' : 'text'}>
                        {monthShortName(i + 1)}
                      </Txt>
                      <Txt variant="caption" color="text2">
                        {count > 0 ? String(count) : ' '}
                      </Txt>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={daySheetOpen}
        onClose={() => setDaySheetOpen(false)}
        title={editingTitle}
        testID="day-marker-sheet"
      >
        <ScrollView style={styles.daySheetScroll} showsVerticalScrollIndicator={false}>
          {dayCards.map((card) => (
            <PressableScale
              key={card.sessionId}
              testID={`day-session-${card.sessionId}`}
              accessibilityRole="button"
              accessibilityLabel={`${card.focusLabel}, ${card.minutes} minutes — open workout`}
              style={styles.sessionCard}
              onPress={() => openSession(card.sessionId)}
            >
              <View style={styles.markerGlyph}>
                <Txt variant="h3">{card.emoji}</Txt>
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">
                  {card.focusLabel} · {card.minutes} min
                </Txt>
                <Txt variant="small" color="text2">
                  {card.place ? `${card.place} · ` : ''}
                  {card.summary}
                </Txt>
              </View>
              <Icon name="chevronRight" size={18} color="text3" />
            </PressableScale>
          ))}
          {handMarkedOnly ? (
            <Txt testID="day-hand-logged" variant="small" color="text2" style={styles.handLogged}>
              Logged by hand — no details recorded
            </Txt>
          ) : null}
          <Txt variant="eyebrow" color="text3" style={styles.markAs}>
            Mark this day as…
          </Txt>
          <View style={styles.markerOptions}>
            {DAY_MARKER_OPTIONS.map((option) => (
              <PressableScale
                key={option.marker}
                testID={`day-marker-option-${option.marker}`}
                accessibilityLabel={option.label}
                style={[
                  styles.markerOption,
                  editingCurrent === option.marker && styles.markerOptionCurrent,
                ]}
                onPress={() => editingDay != null && handleSetDayMarker(editingDay, option.marker)}
              >
                <View style={styles.markerGlyph}>
                  {option.emoji !== '' ? <Txt variant="h3">{option.emoji}</Txt> : null}
                </View>
                <Txt variant="bodyStrong" style={styles.flex}>
                  {option.label}
                </Txt>
                {editingCurrent === option.marker ? (
                  <Icon name="check" size={18} color="teal" />
                ) : null}
              </PressableScale>
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bg,
    },
    content: { paddingTop: space.lg, paddingBottom: space.huge + space.xxl, gap: space.xxxl },
    flex: { flex: 1 },
    section: { gap: space.lg },
    tiles: { gap: space.md },
    tileRow: { flexDirection: 'row', gap: space.md },
    tile: { flex: 1, minWidth: 0, paddingHorizontal: space.md },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.tints.summit,
      borderRadius: radius.md,
      padding: space.md,
    },
    noteIcon: { marginRight: space.sm, marginTop: 1 },
    noteText: { flex: 1 },
    board: { gap: space.md },
    trail: { gap: space.md },
    trailTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
    trailIdentity: { flex: 1, gap: 2 },
    ringBlock: { alignItems: 'center', width: 84 },
    ringCaption: { marginTop: space.xs },
    levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    trailActions: { flexDirection: 'row', alignItems: 'center', marginLeft: -space.sm },
    adjust: { alignSelf: 'flex-start' },
    adjustPanel: { gap: space.sm },
    confirmBox: {
      backgroundColor: t.colors.surface2,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.md,
    },
    confirmButtons: { flexDirection: 'row', gap: space.sm },
    calendar: { gap: 6 },
    weekdayRow: { flexDirection: 'row', gap: 6 },
    calendarRow: { flexDirection: 'row', gap: 6 },
    stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingVertical: space.sm },
    optIn: { alignItems: 'center', gap: space.md },
    sampleStamps: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
    ghost: { opacity: 0.3 },
    muscles: { gap: space.md },
    muscleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    muscleLabel: { width: 96, textTransform: 'capitalize' },
    muscleTrack: {
      flex: 1,
      height: 12,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surface2,
      overflow: 'hidden',
    },
    muscleFill: { height: '100%' },
    muscleSets: { minWidth: 56, maxWidth: 110 },
    monthNav: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    pickerYear: { gap: space.sm, marginBottom: space.lg },
    pickerMonths: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    pickerPill: {
      width: '23%',
      flexGrow: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    pickerPillFuture: { opacity: 0.4 },
    daySheetScroll: { flexGrow: 0 },
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginBottom: space.sm,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.teal,
    },
    handLogged: { marginBottom: space.sm },
    markAs: { marginTop: space.sm, marginBottom: space.sm },
    markerOptions: { gap: space.sm },
    markerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    markerOptionCurrent: { borderColor: t.colors.teal },
    markerGlyph: { width: 32, alignItems: 'center', marginRight: space.sm },
  }),
);
