## Track: 21 — "Golden Hour" UI redesign
Last updated: 2026-09-29

User request: a complete, themed UI rewrite of **every** page to make the app approachable,
exciting and motivating. Design is fixed in `docs/DESIGN.md` — read it in full before any phase.
Presentation-only: store/engine/data behavior is frozen (DESIGN.md §7).

### Done
- [x] Design spec written — `docs/DESIGN.md`
- [x] A1 deps installed via `npx expo install` (react-native-svg 15.15.4, @expo/vector-icons 15.0.2,
  @expo-google-fonts/barlow + barlow-condensed 0.4.1, @react-navigation/bottom-tabs 7.20.0)
- [x] A2 theme tokens `app/src/theme/` (colors, typography, layout, fonts, navTheme) + tests — 590daee
- [x] A3 fonts via `useFonts` in App.tsx, app.json dark/splash/bg, `app/__mocks__/expo-font.js`, `lib/hypeCopy.ts` + tests

### In progress
- Phase A (foundation), running as small commits: deps -> theme -> fonts/app.json -> hypeCopy ->
  ui primitives -> nav shell. Next action: ui primitives in `app/src/ui/` (after that: nav shell).

### Next (sequential — each phase is one agent run, several small commits)
- **A. Foundation** — deps (`npx expo install react-native-svg @expo/vector-icons
  @expo-google-fonts/barlow @expo-google-fonts/barlow-condensed @react-navigation/bottom-tabs`),
  `app/src/theme/` tokens (§2), `app/src/ui/` primitives (§3) with tests, font loading in
  `App.tsx`, `app/src/lib/hypeCopy.ts` (§6) with tests, navigation shell (§4: root stack + tabs
  Today/Field Guide — Journey tab is added in phase C), dark nav theme, StatusBar light,
  `app.json` dark + splash bg, jest mocks if svg/fonts/icons need them.
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
