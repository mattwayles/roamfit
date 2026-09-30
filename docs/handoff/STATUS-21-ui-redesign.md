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

### In progress
- Phase B (Active Workout, DESIGN.md §5.7 + the components it renders). Increment plan (each its
  own commit, `npm run check` green at each):
  - [x] B1 (0e05c27) shared components restyled to tokens (AnchorBadge, BandChip, BandPicker, FeedbackControls,
    PinnedNote, DemoMedia, SpotifyControls, AbandonSessionButton -> Sheet), + tiny ui extensions
    (Icon names anchor/music/previous/video/external, Pips `filled` may be boolean[], Chip
    `accessible` when labelled).
  - [x] B2 (this commit) WorkoutScreen shell: hide native header, own top bar + SegmentedBar + section chip, paused
    dim/PAUSED chip, paused-nudge Sheet, RootNavigator: legacyLightContent becomes opt-in per legacy
    screen (Workout opts out), goHome/reviewFromSummary tests move from header to screen.
  - B3 reps hero + toast/haptics (NOW: hero components below the shell are still old light-styled
    until B3-B5 land). B4 timed hero. B5 rest hero + Up next + Disclosure. B6 sweep
    (no raw hex/fontSize/glyphs), status + backlog.

### Next (sequential — each phase is one agent run, several small commits)
- **B. Active Workout** (§5.7) + the components it renders: AnchorBadge, BandChip, BandPicker,
  FeedbackControls, PinnedNote, DemoMedia, SpotifyControls, AbandonSessionButton (→ Sheet).
- **C. Today + Journey** (§5.1, §5.2, §5.11 disclaimer gate) — split HomeScreen, add Journey tab,
  move board/logbook/passport/muscle/lifetime tests to Journey.
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
safeBottom={false}>`. Workout keeps its native header for now (its Pause/Stop/Home controls are
`setOptions` header items) — phase B replaces it. **Un-migrated screens sit on the old light scene
color** via `legacyLightContent` (stack `contentStyle`) / `legacyLightScene` (tab `sceneStyle`) in
`navigation/screenOptions.ts` (`LEGACY_SCENE = '#f2f2f2'`). When a phase migrates a screen, give it
`<Screen>` and delete that override for it (phase G removes the constants once none remain).
