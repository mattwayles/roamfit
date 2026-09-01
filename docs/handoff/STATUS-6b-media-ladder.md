## Track: 6b-media-ladder — The three-tier media ladder (§11.4)
Last updated: 2026-08-31

### Status
In progress — just finished ramp-up, starting implementation.

### Done
- [x] Ramp-up: read CLAUDE.md, ORCHESTRATION.md, wave-06-network.md §2 scope, STATUS-6a-figures.md,
  spec §11.4/§11.2/§10.4/§10.5/§10.7/§10.8, `packages/data`'s `figureLibrary` export,
  `app/src/lib/workoutAudio.ts` (audio-session guard already built by Wave 4), `WorkoutScreen.tsx`
  structure (existing `Disclosure` component + `isFirstEverPerformance` + `recordDemoMediaExpanded`
  already wired for the "How to" section but demo media itself was never built).
- [x] HEAD confirmed `55bf665`, tree clean, before any edit.
- [x] New dependencies added via `npx expo install` (SDK-57-compatible versions, in
  `app/package.json`): `react-native-svg@15.15.4` (renders the tier-2 SVG figure —
  chosen over a WebView for tier 2 because it's a native vector renderer with no HTML/JS
  execution, no audio-session surface at all, and is the standard RN approach for bundled vector
  art), `react-native-webview@13.16.1` (hosts the tier-1 YouTube IFrame embed — a WebView is the
  only way to embed YouTube's official IFrame player in RN; there is no native "embed a YouTube
  video" Expo module), `expo-network@~57.0.1` (connectivity detection for the online/offline and
  metered-connection ladder rules).

### In progress / Next
- Add `packages/store` migration 0004: `exercise_state.video_flag_count` /
  `exercise_state.video_demoted_at`, local-only two-report demotion state (remote config /
  Firestore aggregation is track 6d's job, not started — this is the local half of the rule so the
  ladder works fully offline and before 6d exists).
- Add `video_flag_reported` to the `signal_events` type union (TS-only enum, no schema change
  needed — see migration 0001, `signal_events.type` has no SQL CHECK constraint).
- `app/src/lib/mediaLadder.ts` — pure tier-selection function + YouTube URL builders. Tests written
  to fail on the pre-fix (always-tier-2 / no-selection) stub first, per the project's verification
  standard, before the real logic is written.
- `app/src/lib/networkStatus.ts` — lazy `expo-network` wrapper, same guarded-lazy-require pattern
  as `workoutAudio.ts` (native module absent under Jest). Documented limitation up front: iOS does
  not expose a "Data Saver / Low Data Mode" flag to any Expo/RN API. "Metered connection" is
  approximated as `NetworkStateType.CELLULAR`, which is the closest available signal and errs
  toward skipping tier 1 more often than the literal spec requires, never less — consistent with
  invariant 1 (never a dead player). This approximation is a known gap, not a proven equivalence.
- `app/src/components/DemoMedia.tsx` — tier 2 figure always rendered as the floor; tier 1 embed
  layered on top when eligible (`youtube-nocookie.com`, muted, `fs=0`, `playsinline=1`,
  `mediaPlaybackRequiresUserAction`, no autoplay); tier 3 search link shown when online. "This
  video is wrong or broken" control under the player; WebView `onError`/`onHttpError` falls back
  to the figure silently and auto-flags.
- Wire into `WorkoutScreen.tsx` next to the existing "How to" `Disclosure`.
- `npm run check` at each commit boundary.

### Decisions / gotchas
- **Embed audio is muted by design.** The hard constraint is "must not hijack the audio session."
  `workoutAudio.ts`'s file header already documents the mitigation Wave 4 built (re-assert
  `duckOthers` session shape at workout start), but that only guards against the *session shape*,
  not a WebView `<video>` element actually acquiring iOS's audio route the instant the user taps
  play inside the embed — that acquisition happens beneath any JS we control. Muting the embed
  (`mute=1`) sidesteps the risk entirely rather than relying on an interaction that can only be
  verified on a real device. This is a real product/scope decision (silent demo video), not free —
  documented here rather than silently shipped.
- Two-report demotion counts **both** explicit user reports and automatic player-error flags
  against the same counter (source recorded, not two separate thresholds) — the spec's wording
  ("Two reports demote...automatically" for user taps, "reported back as an automatic flag" for
  player errors) doesn't explicitly say whether the two mechanisms share a threshold. Chose to
  share it: it's the more conservative reading (falls back to the safe tier-2 floor sooner) and
  avoids building two parallel counters for what the UI shows as one "flagged" state.
- Nothing here can be exercised end-to-end (no curated video ids exist yet — 6d/Firestore isn't
  built) — the curated-id parameter is plumbed as an explicit input so 6d only needs to supply a
  real value, never restructure this code.

### What will NOT be verified this track (be explicit at hand-off)
- Real WebView player errors, real metered-connection detection, real audio-session interaction
  under an actual video tap, real Metro/pod-install build. Jest cannot load native `expo-network`/
  `react-native-webview`/`react-native-svg` modules (no native module registered) — same
  Jest-vs-device gap `workoutAudio.ts` already documents. This track proves "the right calls
  happen, nothing throws, tier selection logic is correct," not "a tone plays" or "a video
  actually renders on a phone."
