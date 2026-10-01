## Track: 22 — "Daylight" light mode
Last updated: 2026-09-30 — Phase 1 done; Phase 2A-2D running in parallel.

User request: Golden Hour is hard to see when exercising outdoors. Keep it as the dark mode and add
a light mode built for sunlight. Design authority was handed over in full ("full control, no
guardrails"); the design is `docs/DESIGN.md` §8 — **read §8 in full, plus §1–§3, before any phase.**

Presentation + one preference column. Engine/data behavior is frozen; the only store change is the
`theme_preference` column (migration 0022) and its `usersRepo` field.

### Done
- [x] Design: `docs/DESIGN.md` §8 (palette with measured contrast, gradients, elevation/glow/topo/
  stamp rules, mechanism, switch points), §1 "Dark only" rewritten as "Two lights, one system".
- [x] P1 step 2 store: migration 0022, usersRepo `themePreference` (afcda30).
- [x] P1 step 1 theme foundation: `theme/{palettes,buildTheme,ThemeContext}`, deprecated statics kept (see sha in git log).
- [x] P1 step 3: `state/ThemeProvider.tsx` (`ThemeProvider`, `useThemePreference`, `resolveScheme`) + App.tsx wiring + tests.
- [x] P1 step 4: `ui/` + `navigation/` fully on the theme hooks (no module-scope color reads), Daylight render tests in all four ui test files + navigation.test; `navigation/screenOptions.ts` deleted (use `theme.headerOptions`).
- [x] P1 step 5: `lib/dayMarkers.ts` `markerColor` -> `markerTone` (returns an `AccentName`, `DayCell` resolves it); `focusLabels.ts` already returned token names (comment only).

### In progress
- Phase 3 close-out, step 1: root cause of navigation.test failure is SettingsScreen's `useThemePreference()` (Settings is opened in that test, which has no ThemeProvider), not Workout. Fix: export `useOptionalThemePreference` from state/ThemeProvider.tsx, use in Workout (drop local copy), wrap navigation.test boot in ThemeProvider. Then steps 2-7 per the Phase 3 list.

### Next

**Phase 1 — foundation: DONE (see Done list).** Commit after each step; `npm run check` green at
every commit. Keep the old static exports (`colors`, `tints`, `gradients`, semantic maps, `glow`,
`navTheme`) alive and equal to the Golden Hour values throughout Phase 1 and 2, marked
`/** @deprecated use useTheme() */`, so unmigrated files still compile.
1. `theme/palettes.ts` (`goldenHour`, `daylight`, `Palette` type; add `fixedInk`, `fixedPaper`,
   `backdrop` to both), `theme/buildTheme.ts` (`Theme`, `buildTheme`, the two frozen instances,
   `onGradient`, `glow`, `elevation`, `topo`, `stamp`, `statusBar`, `navTheme`, `headerOptions`),
   `theme/ThemeContext.tsx` (`ThemeContext` defaulting to Golden Hour, `useTheme`, `makeStyles`).
   Tests: identical key sets; contrast assertions for Daylight (text ≥ 7 on bg, text2 ≥ 7, text3 ≥ 4.5
   on bg/surface/surface2; every accent except `sun` ≥ 4.5 on bg and surface;
   `sun` ≥ 3; `ink` ≥ 4.5 on every accent except `sun`; white ≥ 4.2 on every gradient stop); Golden
   Hour values unchanged; `makeStyles` caches per theme.
2. Store: migration `0022_theme_preference.sql` (+ `migrations/data.ts` entry, follow 0014 exactly),
   `schema.ts` column, `usersRepo` `themePreference: 'system' | 'light' | 'dark'` on `UserRecord` +
   `UserPatch` + `updateUser`. Store tests for default + round-trip.
3. `state/ThemeProvider.tsx` (needs `useStore`, so it lives in `state/`, not `theme/`): reads the
   user row once at mount, resolves with RN `useColorScheme()`, exposes `useTheme()` (via
   `ThemeContext`) and `useThemePreference()` → `{ preference, scheme, setPreference }` (setPreference
   writes through `usersRepo.updateUser` then updates state). Optional `initialPreference` prop for
   tests. Wire `App.tsx`: ThemeProvider inside StoreProvider; `NavigationContainer theme`,
   `StatusBar style` from the theme; the font-loading placeholder uses `Appearance` scheme's `bg`.
   Tests: system→follows color scheme; explicit overrides; setPreference persists and re-renders.
4. Migrate `ui/` (all of it: Txt, Icon, Card, Button, Chip, Gradient, TopoPattern, Screen, Sheet,
   Switch, Toast, Pips, ProgressRing, SegmentedBar, Stamp, StatTile, IconButton, PressableScale) and
   `navigation/` (TabBar, Tabs, screenOptions → `theme.headerOptions` used in RootNavigator via
   `useTheme`). Apply Daylight `elevation.card` to Card plain/accent, Sheet, StatTile, TabBar. Gradient's
   default = `theme.gradients.sunrise`. TopoPattern uses `topo.color`/`topo.strength`. Sheet backdrop
   = `colors.backdrop`. Add one light-mode test per primitive family file (render under a Daylight
   provider, assert e.g. `Screen` bg = `daylight.bg`, `Card` has the shadow, `Txt` default color =
   `daylight.text`). Existing tests must pass unchanged.
5. `lib/dayMarkers.ts`, `lib/focusLabels.ts`: return token names (or take a `Theme`) — no static colors.

**Phase 2 — screens (four agents in parallel, same working tree).** Each agent owns ONLY its files.
Pattern: `makeStyles` for themed styles, `useTheme()` for render-time values, no module-scope color
reads. Commit only your own paths: `git commit -m "..." -- <your paths>` (retry if `index.lock`).
Verify with jest on your own tests and `npx tsc --noEmit -p app` filtered to your files (other
agents' files may be mid-edit). Every existing test keeps passing; add at least one Daylight render
test per screen.
- **2A Workout:** `screens/WorkoutScreen.tsx`, `components/{SpotifyControls,BandPicker,BandChip,
  KeyboardDoneBar,PinnedNote,DemoMedia,AbandonSessionButton,AnchorBadge}.tsx`, plus the top-bar
  `theme-toggle` IconButton (§8.5) with tests. BandChip's `textToneOn` returns `fixedInk`/`fixedPaper`
  (band swatches are mode-invariant). `keyboardAppearance` on Workout/DemoMedia/PinnedNote inputs.
- **2B Summit:** `screens/SummaryScreen.tsx`, `components/{HypeHeadline,CelebrationBackdrop,
  ConfettiBurst,HighlightCard,AnimatedStatCounter,FeedbackControls}.tsx`. Headline uses `stamp.*`;
  confetti/orbs/sunburst use `vivid`. `keyboardAppearance` on Summary's input.
- **2C Basecamp + Ignition:** `screens/{HomeScreen,JourneyScreen,GenerateScreen,ApprovalScreen}.tsx`,
  `components/{DayCell,RungTrack,IconBadge,SectionTitle,EmptyState}.tsx`. Home's hero CTA `sun` text
  sits on the sunrise gradient: use `ink` in Daylight (sun on deep orange fails) — via a theme-aware
  choice, not a raw check of the scheme sprinkled around. `keyboardAppearance` on Approval's input.
- **2D Field Guide + Settings:** `screens/{ExercisesScreen,ExerciseDetailScreen,SettingsScreen}.tsx`.
  Detail's `heroInk` → `theme.onGradient(tone)`. Settings gets the **Appearance** group (§8.5) first,
  `SegmentedBar` testIDs `appearance-system` / `appearance-light` / `appearance-dark`, persisted via
  `useThemePreference`, with tests. `keyboardAppearance` on the search input.

**Phase 3 — close (one agent).**
1. Delete the deprecated static exports from `theme/`; fix every compile error that surfaces (that is
   the straggler list). Grep `app/src` outside `theme/` for raw hex/rgba — only `SPOTIFY_GREEN` may
   remain.
2. `app.json` `userInterfaceStyle: "automatic"`.
3. `npm run check` green. Docs: BACKLOG device-pass item for Daylight (checklist: every screen in
   both modes, outdoor glance test, the mid-workout toggle, status bar/keyboard/header follow,
   system-follow at the iOS appearance switch, Completion headline in Daylight); splash stays dark
   (add to the icon/splash art item). Close this file.

### Phase 1 API (what Phase 2 copies from)
Imports are all from `'../theme'` (index) except the provider:
- `useTheme(): Theme`, `makeStyles(factory): () => styles`, `ThemeContext` (default = Golden Hour).
- `Theme` fields: `scheme` ('light'|'dark'), `colors` (Palette: bg surface surface2 surface3 line lineStrong
  text text2 text3 ink fixedInk fixedPaper backdrop ember emberDeep gold sun lagoon sky summit rose),
  `vivid` (Golden Hour accent hexes, both themes), `tints`, `gradients` {sunrise golden lagoon summit night},
  `accentGradient`, `section`, `focus`, `setState`, `dayMarker`, `trainedColor(focusKey)`,
  `onGradient(tone)` (returns the token NAME 'ink'|'fixedPaper'), `glow(color?)`, `elevation.card`,
  `topo` {color,strength}, `stamp` {fill,shadow,glow|null}, `statusBar`, `navTheme`, `headerOptions`.
- Instances/helpers: `goldenHourTheme`, `daylightTheme`, `themeFor(scheme)`, `buildTheme(scheme)`,
  palettes `goldenHour` / `daylight` / `vivid`, `Palette`, `ColorName`, `AccentName`, `withAlpha`.
- `import { ThemeProvider, useThemePreference, resolveScheme } from '../state/ThemeProvider'`;
  `useThemePreference()` -> `{ preference: 'system'|'light'|'dark', scheme, setPreference(next) }`
  (setPreference writes `usersRepo.updateUser({ themePreference })` then re-renders live).
  `ThemeProvider` takes optional `initialPreference` (tests); it needs a `StoreProvider` above it.
- Store: `usersRepo.UserRecord.themePreference`, `UserPatch.themePreference`, type `ThemePreference`
  exported from `@roamfit/store`.
- Test helpers: `inDaylight(node)` in `ui/test-utils.ts` wraps a subtree in `ThemeContext` = Daylight.
  Tests that need the *provider* (OS scheme, persistence) see `state/ThemeProvider.test.tsx`
  (RN's `useColorScheme` is mocked via `jest.mock('react-native/Libraries/Utilities/useColorScheme')`;
  spying on `Appearance` does not reach it).

**Migrating a component (the one pattern):**
```tsx
import { makeStyles, useTheme } from '../theme';
const useStyles = makeStyles((t) => StyleSheet.create({
  card: { backgroundColor: t.colors.surface, borderColor: t.colors.line, ...t.elevation.card },
}));
export function Thing() {
  const theme = useTheme();            // only for render-time values (icon color, gradient, glow)
  const styles = useStyles();          // themed StyleSheet, cached per Theme instance
  return <View style={[styles.card, theme.glow(theme.colors.ember)]}><Txt color="ember">x</Txt></View>;
}
```
Delete the old `import { colors, glow, tints, ... } from '../theme'` statics from the file as you go. A
`StyleSheet.create` with no color in it stays module-level.

### Phase 1 gotchas for Phase 2
- Old statics (`colors`, `tints`, `gradients`, `section`, `focus`, `setState`, `dayMarker`,
  `trainedColor`, `accentGradient`, `glow`, `navTheme`) still exist, `@deprecated`, Golden Hour values.
  A screen that still imports them renders Golden Hour colors even in Daylight — that is the
  straggler signal. `withAlpha`, `accentNames`, `radius`, `space`, `motion`, `type` are NOT deprecated.
- Primitives now resolve defaults through the theme: `Pips`/`SegmentedBar` `color` default to the theme
  ember, `ProgressRing` gradient/track default to the theme, `Gradient` default is the theme sunrise.
  Pass `theme.colors.x` / `theme.gradients.x`, never a static, when overriding.
- `Card` `hero` cannot cast a shadow (it clips with `overflow: hidden`); `plain`/`accent` lift in Daylight.
- `Switch` thumb is `fixedPaper` + `elevation.card` (Daylight `text` is ink — a black thumb).
- `TabBar` root has `testID="tab-bar"`.
- `lib/dayMarkers.markerColor` is gone; use `markerTone(marker)` and resolve via `theme.colors[tone]`.
- Phase 1 verified with targeted jest + tsc + eslint per step and one full `npm run check` at the end
  (the full check is ~8 minutes).

### Decisions / gotchas
- **Default preference is `system`.** iOS Automatic appearance is light by day and dark after
  sunset — Golden Hour literally arrives at golden hour. An install on a light-mode phone will open
  in Daylight after this lands; that is intended.
- **Live switching, not reload.** That is why styles become hooks. Do not "simplify" to a mutable
  palette object + `reloadAsync` — the mid-workout toggle is the point of the feature.
- **`ink` = text on an accent fill**, white in Daylight. Don't replace `color="ink"` call sites.
  Use `fixedInk`/`fixedPaper` only where the background does not change with the theme.
- **`vivid` is for decoration with no text on it.** Never put text in a `vivid` color on paper.
- The ThemeContext default is Golden Hour so existing tests need no provider. That also means a
  forgotten provider fails *silently dark* — App.tsx has the provider; a test asserts it.
- Invariant 4 still holds: Daylight has no red/error color either; `rose` stays cardio-only.
