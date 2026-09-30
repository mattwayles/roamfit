## Track: 21 — "Golden Hour" UI redesign
Last updated: 2026-09-29

User request: a complete, themed UI rewrite of **every** page to make the app approachable,
exciting and motivating. Design is fixed in `docs/DESIGN.md` — read it in full before any phase.
Presentation-only: store/engine/data behavior is frozen (DESIGN.md §7).

### Done
- [x] Design spec written — `docs/DESIGN.md`
- [x] A1 deps installed via `npx expo install` (react-native-svg 15.15.4, @expo/vector-icons 15.0.2,
  @expo-google-fonts/barlow + barlow-condensed 0.4.1, @react-navigation/bottom-tabs 7.20.0) — eda9578
- [x] A2 theme tokens `app/src/theme/` (colors, typography, layout, fonts, navTheme) + tests — 590daee
- [x] A3 fonts via `useFonts` in App.tsx, app.json dark/splash/bg, `app/__mocks__/expo-font.js`, `lib/hypeCopy.ts` + tests — 9f59347
- [x] A4 ui primitives `app/src/ui/` + tests, `lib/haptics.ts`, `lib/seed.ts`, Jest mock for @expo/vector-icons — 0864abd
- [x] A5 navigation shell: root stack -> `Tabs` (Today/Field Guide, custom `TabBar`), `NavigatorScreenParams` /
  `CompositeScreenProps` types, `homeReset()`, dark nav theme, `StatusBar style="light"`; every
  `navigate/reset` to Home fixed + tests updated — 19dd1fb

- [x] B1 shared Workout components restyled to tokens (AnchorBadge, BandChip/Picker, FeedbackControls,
  PinnedNote, DemoMedia, SpotifyControls, AbandonSessionButton -> Sheet) + tiny ui extensions — 0e05c27
- [x] B2 Workout shell: own top bar, session SegmentedBar, section/paused/Progress chips, nudge Sheet,
  header hidden, legacy scene made opt-in per screen — f9c1b3c
- [x] B3-B5 reps hero, timed ring hero, lagoon rest hero + Up next, Disclosure/DemoMedia cards, coach
  toast, `WorkoutScreen.presentation.test.tsx` — 959dac4, polish a440480
- [x] C1 shared foundation: `lib/useDashboardData.ts`, `lib/dayMarkers.ts`, `weekContaining` + hero
  `progress` in `lib/dashboard.ts`, `sessionCompletionFraction`, `DayCell` / `RungTrack` /
  `EmptyState` / `IconBadge` / `SectionTitle` components, TabBar can hide itself — efeef13
- [x] C2 Journey tab (`screens/JourneyScreen.tsx`, `TAB_META` row, `<Tab.Screen>`, Journey tests) — dbd06ff
- [x] C3 HomeScreen -> Today (hero, tiles, week strip, next unlock, disclaimer gate), legacy light scene
  removed from Home, Home tests moved/rewritten, `open-exercises` retired — 08acf37

### In progress
- Phase D (Generate + Plan/Approval, DESIGN.md §5.5, §5.6). Not started. Phase C is complete and
  `npm run check` is green.

### Next (sequential — each phase is one agent run, several small commits)
- **D. Generate + Plan/Approval** (§5.5, §5.6) — replace OptionPicker usage.
- **E. Debrief + Completion** (§5.8, §5.9) + HighlightCard, AnimatedStatCounter, HypeHeadline,
  CelebrationBackdrop, ConfettiBurst.
- **F. Field Guide + Exercise detail + Settings** (§5.3, §5.4, §5.10).
- **G. Sweep** (§5.11, §7 "zero off-system surfaces") — grep for raw hex/fontSize/fontWeight/
  glyph icons outside theme/ui, empty + loading states, keyboard accessories, remove dead styles
  and OptionPicker if unused, BACKLOG updates (device rebuild owed, app icon art).

### Decisions / gotchas
- `react-native-svg` is native: the app needs a dev-client rebuild (`npm run ios`) after phase A.
  Everything else added is JS/asset-only (expo-font was already linked).
- Dark-only by design (DESIGN.md §1). No red anywhere (invariant 4).
- testIDs are an API — keep them; move tests with moved elements; update copy assertions in the
  same commit (DESIGN.md §7).
- Code comments record earlier user-requested behaviors (elapsed clock biggest on Workout, How-to
  open by default, next unlock's exercise never named, one-tap swap, pause keeps screen editable,
  difficulty chips use text labels). Keep those behaviors; restyle freely.

### Phase A reference (for phases B-G)

**Native rebuild owed.** `react-native-svg` is native: run `npm run ios` (dev-client rebuild + pod
install) before trying the redesign on a device/simulator. Not done in Phase A (Jest is the gate;
no native build was attempted). Fonts/icons/tabs are JS-only. `app.json` also gained
`userInterfaceStyle: dark`, `backgroundColor` and a `splash` block (bg `#0B0E13`) that only take
effect after `expo prebuild`/rebuild. `expo-splash-screen` is not installed (no new deps), so
`App.tsx` holds a blank `bg` `<View>` until `useFonts` resolves (a font *error* falls through to
system fonts instead of bricking launch).

**Imports.** Screens import tokens from `../theme` and components from `../ui` (one barrel each).
Haptics: `haptics.selection/light/medium/heavy/success()` from `lib/haptics.ts` (re-exported from
`ui`); `workoutAudio`'s `hapticX` helpers delegate to it. Seeded visuals/copy share `lib/seed.ts`
(`hashSeed`, `seededRng`).

**Theme (`app/src/theme`)**: `colors` (+ `ColorName`, `AccentName`), `tints.ember` etc. (+
`withAlpha(hex, a)`), semantic maps `section`, `focus`, `setState`, `dayMarker`, `trainedColor(focusKey)`,
`gradients` (+ `accentGradient`), `type` (TextStyles; `type.display` ...), `fontFamily`, `space`, `gutter`,
`radius`, `glow(color)`, `motion`, `navTheme`, `fontAssets`. Big numerals (`mega`/`hero`) get
`tabular-nums` and Txt caps their Dynamic Type at 1.3. Uppercase is baked into the variant style
(`display/h1/h2/eyebrow/button`), so navigation titles (native header, no textTransform) are
written in caps in the stack options.

**Primitives (`app/src/ui`)**: Txt{variant,color,upper,align}, Icon{name,size,color} (semantic
`iconMap`, decorative unless `accessibilityLabel`), Gradient{colors,angle,radius}, TopoPattern{seed,strength},
Screen{scroll,footer,edges,safeBottom,padded}, Card{variant,gradient|tone,seed,padding,onPress},
Button{label,variant,size,icon,iconRight,loading,disabled,fullWidth,haptic}, IconButton{icon,
accessibilityLabel,size,variant,tone,label}, PressableScale{haptic,scaleTo}, Chip{label,tone,selected,
icon,leading,size,onPress}, Eyebrow / SectionHeader{title,icon,tone,actionLabel,onAction},
ProgressRing{progress,size,stroke,gradient,trackColor,animate,children}, SegmentedBar{values,activeIndex,
color}, Pips{count,filled,current,color}, StatTile{value,label,icon,tone,size}, Stamp{title,subtitle,seed,
tone,size} (+ `stampSpec(seed)`), Switch{value,onValueChange}, Sheet{visible,onClose,title,dismissable},
Toast{message,triggerKey,duration,onDone}, Enter{index} (the `enter` motion, extra), `useReduceMotion()`.
testIDs: Sheet `sheet`/`sheet-backdrop`; Toast `toast`; ProgressRing `progress-ring`(`-arc`);
SegmentedBar `segmented-bar-segment-i`/`-fill-i`; Pips `pips-i`/`-dot`/`-ring`; all accept `testID`
overrides.

**Jest.** No svg mock was needed: react-native-svg renders `RNSVG*` host elements under jest-expo
(testIDs and props like `d`, `strokeDashoffset` are queryable). `app/__mocks__/expo-font.js` keeps the
real module but `useFonts` returns `[true, null]`. `app/__mocks__/@expo/vector-icons.js` renders a host
`<Text name=... />` (real one setStates asynchronously -> act() noise). RNTL v14 is fully async
(`await render/fireEvent/renderHook`); decorative icons are a11y-hidden, so query them with
`{ hidden: true }`. `ui/test-utils.ts` has `ready`, `flat`, `WAIT`.

**Navigation.** `RootStackParamList` = Tabs, Generate, Approval, Workout, Summary, Settings,
ExerciseDetail. `TabParamList` = Home, Exercises (route names unchanged; labels "Today"/"Field
Guide" live in `TAB_META` in `navigation/TabBar.tsx` — adding Journey = one `TabParamList` key, one
`TAB_META` row, one `<Tab.Screen>` in `Tabs.tsx`). Type pattern: flow screens use
`NativeStackScreenProps<RootStackParamList, 'X'>` (or `RootScreenProps<'X'>`); tab screens use
`TabScreenProps<'Home'>` (composite, so `navigate('Generate')` still type-checks). "Go home" =
`navigation.reset(homeReset())` or `navigate('Tabs', { screen: 'Home' })`; a bare `'Home'` no
longer resolves. `open-exercises` on Home still works (sibling tab navigate).

**Headers / backgrounds.** Stack + tab headers use `bg` fill, no shadow, `h2` face (not
`headerTransparent`, so content is not pushed under the header). Tab screens still get a tab-navigator
header (with the old titles in caps) so Home/Exercises keep their top inset; phases C/F set
`headerShown: false` and draw their own headers with `<Screen edges={['top','left','right']}
safeBottom={false}>`. **Workout is migrated (phase B): `headerShown: false`, no legacy scene.** **Un-migrated screens
sit on the old light scene color**: `legacyLightContent` (stack `contentStyle`) is now **opt-in per
screen** in `navigation/RootNavigator.tsx` (Generate, Approval, Summary, Settings, ExerciseDetail
spread it into their own `options`); `legacyLightScene` (tab `sceneStyle`) is still on the tabs.
When a phase migrates a screen, give it `<Screen>` and delete its spread (phase G removes the
constants once none remain).

### Phase B reference (Active Workout) — for phases C-G

**What the screen is now** (`WorkoutScreen.tsx`): `<Screen edges top/left/right padded={false}>` >
top bar (home `IconButton` `workout-home` | `hero` clock `workout-elapsed`, `adjustsFontSizeToFit` |
pause `pause-workout` + abandon `abandon-button`) > `SegmentedBar` (one segment per active entry,
filled by *completed* sets, glow + color = current section) > `ScrollView` `workout-scroll`
(Spotify pill, section `Chip` + PAUSED chip + Progress/Done `Chip` `view-progress`/`review-done`,
swap notice, PinnedNote, phase view, How-to `Disclosure` card, `DemoMedia` card) > `Toast` (absolute,
bottom). Section tones: warm-up gold, main ember, cool-down lagoon (`SECTION_TONE`). The header
`setOptions` wiring is gone; the goHome / review-from-Summary tests now find those controls on the
screen. The Progress/Done control is a sky `Chip` in the meta row, not a header item.

**Toast lives on the screen, not the set view.** A completed set swaps to the rest page in the same
tick, so anything the set view owned would unmount before it could be read. `announceCompletion()`
(in `commitSetAndRest`) picks the pool: the set *before* the session's final set -> `lastSet`
("Last set. Empty the tank." is a nudge for what's next, never said after the end); closing set of an
exercise -> `exerciseComplete`; else `setComplete`. Seed `${entry.id}:${setIndex}`. Rest line seed
is `${restingEntryId}:${restingSetIndex}` from the `rest` pool. Haptics: COMPLETE SET fires
`haptics.medium()` (closing set of an exercise: `success()`); the final-3-seconds light haptic on
hold and rest countdowns already comes from `workoutAudio.cueCount()` (audio + `hapticTick`), so
the new pulse is visual only (`usePulse`, dropped under Reduce Motion, stopped on unmount).

**Pips pop on the rest page, not the set page.** The pip for the set just done is rendered on the
rest hero (`rest-pips`), mounted unfilled and filled 150ms later so `Pips` pops it. `Pips` now takes
`filled: number | boolean[]`; the workout passes flags (only `completed` fills — a skipped set stays
an empty dot).

**Shared components — how they look/behave now (Approval/Summary/Detail/Home phases must account):**
- All still default exports with unchanged props + testIDs. They now import tokens and `../ui`.
- `BandChip`: dark `surface2` pill + a color **dot** (`band-chip-B2-dot` carries the tension color,
  `band-chip-B2` no longer has the band color as its background). `textColorOn`/`textToneOn` now
  return `ink`/`text` tokens. `NEUTRAL_BAND_COLOR` is the missing-record fallback.
- `BandPicker`: `compact` = chip + chevron; `field` (Approval's Sets/Reps/Rest row) keeps the
  band-color-filled 36pt trigger with a `caption` "BAND" label above; options stay filled swatches
  (selected = 3px `text` ring); the `field` dropdown is a `surface3` panel with a border (no shadow).
- `AnchorBadge`: sky `Chip` with the anchor (link) icon; `alignSelf: flex-start` (was centered).
- `FeedbackControls`: pill segment, selected fills lagoon / ember / summit with `ink` text; **no
  built-in label** — the caller adds "How did that set feel?" (Summary still needs its own).
- `PinnedNote`: gold-tinted card, compact single row while empty (pin, field, pencil), eyebrow appears
  once there's text, `surface2` well, keyboard accessory = `surface2` bar + ember "Done".
- `DemoMedia` and the Workout `Disclosure` are each their own `Card` (header row with chevron), so
  callers must not wrap them in another card. Offline `DemoMedia` still renders `null`.
- `SpotifyControls`: one compact `surface` pill; Spotify green survives only as the 28pt brand dot
  (`SPOTIFY_GREEN`, commented). Browse is now a `Sheet` (`spotify-browse-sheet`).
- `AbandonSessionButton`: **both** variants open a `Sheet` (`abandon-sheet`, content `abandon-confirm-row`);
  "Keep going" (`abandon-confirm-cancel`) is the primary button, "Discard" (`abandon-confirm-yes`) is
  secondary. The `text` variant is a `quiet` `Button` (used by Home and Approval, which are still on
  the light legacy scene — its `text2` label is low-contrast there until phases C/D migrate them).
  A Sheet unmounts after its exit animation: tests that assert "closed" must `waitFor`.
- `ui/` extensions made in phase B: `IconButton` size `xl` (64pt), `Pips` flag lists, `Chip`
  `accessible` when it has an `accessibilityLabel`, Icon names `anchor` `music` `previous` `video`
  `external`.

**Deviations from DESIGN.md §5.7** (all deliberate):
- The rep counter is `mega` (112) and is bigger than the `hero` (64) elapsed clock. The clock is the
  biggest thing in the top bar and the biggest header type; the numeral is the centerpiece by spec.
- Level chip reads `LVL 3/7 · HORIZONTAL PUSH` (kept the "of N" the old badge carried).
- PAUSED chip sits beside the section chip under the bar, not "next to the clock" (no room in a
  `hero`-clock bar).
- Set nav: Undo / Swap / Skip are the only prev/next controls (they carry the `rewind-set` /
  `swap-set` / `skip-set` testIDs); the spec's extra "prev/next set chevrons" in the set row would
  duplicate them, so the set row is just pips + "Set N of M". Forward reads "Next" when stepped back.
- Timed caption sits under the ring (spec), the flanking -/+ sit at the ring's lower corners (a
  240pt ring plus two 56pt buttons does not fit a 350pt card side by side).
- Rest hero also shows pips for the set just done (the place the "pip pop" can actually be seen).
- `SegmentedBar` fills on *completed* sets only, so skipped sets leave a segment quiet.

**Not verified on a device/simulator** (Jest only; `react-native-svg` still needs the dev-client
rebuild). Layout was reasoned, not seen: top-bar clock width, hero height vs the fold on a 6.1"
phone, flanking -/+ corner placement, hero dim. First thing to check after `npm run ios`.

### Phase C reference (Today + Journey) — for phases D-G

**Today (`HomeScreen.tsx`, route still `Home`)**: `Screen scroll` (top/left/right, `safeBottom={false}`),
tab header hidden, scene `bg` (Tabs.tsx overrides `legacyLightScene` for Home and Journey; Field Guide
still inherits it — phase F). Order: header (h1 ember wordmark + `today-greeting` + gear
`open-settings`), banners (`BannerCard`: `comeback-banner`, `travel-suggest-banner` with
`travel-suggest-accept/-dismiss` buttons, `recovery-week-banner`), hero `Card variant="hero"`
(`today-card`, or `resume-card` + `resume-progress` bar + `AbandonSessionButton`), two-up
`ActionTile`s (`quick-session-button`, `travel-day-button`), `week-strip` (`week-day-YYYY-MM-DD`,
`DayCell size=40`, tap -> Journey), `next-unlock-hero` (summit `ProgressRing` `next-unlock-ring`, tap ->
Journey; mastery state keeps its copy). Text on the sunrise hero is `ink`.
Loading / sync / notification / focus-effect logic is unchanged; the read moved into
`useDashboardData` and Today's `load()` wraps `reload()` + the notification reschedule.

**Journey (`JourneyScreen.tsx`)**: `journey-screen`; eyebrow + `display` "MILES SO FAR"; `lifetime-counters`
(3x2 `StatTile`, `lifetime-sessions` ... ); Trails (`progression-board`, `board-row-${id}`, `RungTrack`
`board-track-${id}`, `ProgressRing` `board-progress-${id}` with `board-sessions-left-${id}`, expander
`board-adjust-${id}` -> the unchanged level up/down controls and two-step confirms; expansion is
per-family and survives a level change so repeated taps need no re-expand); Logbook (`calendar-heatmap`,
`calendar-day-${date}` -> `day-marker-sheet` `Sheet`, `day-marker-option-${marker}`); Passport
(`passport-section` + `passport-stamp-${city}` + `share-passport`, `passport-opt-in`, `passport-empty`);
`muscle-balance` gradient bars; `estimate-accuracy`. Zero sessions: `journey-empty`, `logbook-empty`,
`passport-empty` encouraging empty states; Trails + `first-session-explanation` still render.
Reloads on focus.

**Shared**: `lib/useDashboardData.ts` (`loadDashboardData` + hook returning `{data, reload}`; `reload()`
returns the fresh data), `lib/dayMarkers.ts` (emoji + tint + labels shared by strip and logbook),
`components/DayCell` `RungTrack` `EmptyState` `IconBadge` `SectionTitle` (reusable by D-G).
`TabBar` returns null when the focused screen sets `tabBarStyle: { display: 'none' }` — Today does this
while the §13.3 disclaimer gate is up, so the gate really blocks (nothing else reachable behind it).

**Deviations from DESIGN.md §5.1/§5.2 (all deliberate)**:
- `open-exercises` (Home's "Exercises" text link) is gone: the Field Guide tab does that job. The two
  tests that used it (`ExercisesScreen`, `ExerciseDetailScreen`) now press `tab-Exercises`.
- The week strip is Sun-Sat (the Logbook's own week, from `buildCalendarWeeks`), not Mon-Sun, and shows
  blank cells for days that fall in the neighbouring month (BACKLOG has the fix).
- Copy: hero says "sessions to your next level" (spec) so the old "to next level" assertion moved to the
  Trails ring caption; mastery chip reads "Summit" (spec) while Today's all-mastery sentence keeps
  "Mastery"; `first-session-explanation` now says "tap Adjust on any of them" (the controls moved
  behind Adjust, the old text would have been wrong).
- Quick Session subtitle is "7 min · zero decisions" (spec); the generator still requests 15 target min.
- The In transit tile changes its subtitle to "Today's marked. Safe travels." after a tap, and is always
  available (the old button only existed once a first session was done).
- Zero sessions: one combined encouraging card replaces the lifetime tiles, plus one each for Logbook,
  Passport and (once a session exists but none in 14 days) muscle balance; the old code showed nothing.
- Day-marker `Sheet` title is "September 29" (month name + day) rather than the raw date, and marks the
  day's current marker with a check.

**Tests moved**: `HomeScreen.levelUp` -> `JourneyScreen.levelUp` (taps `board-adjust-${id}` first; the ADR
0014 hero assertion moved to `HomeScreen.nextUnlock`); `HomeScreen.dashboard` split into Today
(gate/hero/tiles/week strip) + `JourneyScreen.dashboard` (Trails, empty states); `HomeScreen.afterSession`
split into Today (week strip marker) + `JourneyScreen.afterSession` (lifetime, muscle balance,
calendar, day-marker sheet, passport opt-in + stamp + reload-on-focus). New: `HomeScreen.banners`.
