## Track: 14 — Cardio focus, increment 5 (App), run in a worktree

Last updated: 2026-09-13

This file is the increment-5 sub-log the lead asked for, kept separate from
`STATUS-14-cardio-focus.md` (owned by the increment-4/orchestrating agent on `master`)
to avoid a merge conflict on that file. The lead should fold the "Done" section below
into the main status file's increment 5 entry once this branch is merged.

Branch: `worktree-agent-a34e489a1da46cfe0` (worktree at
`.claude/worktrees/agent-a34e489a1da46cfe0`), based on `master` at `29a9906` (fast-forward
merge — `git merge master` was a no-op ff, no merge commit) so increments 1–3's real
`isCardioExercise`/`cardio` Focus/`conditioning` Pattern/`jump-rope` Anchor were available
to build against, rather than the increment-1 compile-only stopgaps this increment replaces.

### Done
- [x] Step 1 (`ff97025`) — GenerateScreen.tsx: `cardio` added to `FOCUS_OPTIONS` (placed last,
  after the four muscle-group focuses); "Cardio gear" added as a second `ANCHOR_GROUPS` entry
  holding `jump-rope` (hint "for rope skipping moves"); `VISIBLE_ANCHOR_VALUES`/`ANCHOR_COUNT`/the
  profile-trim effect pick it up automatically, as designed. Verified (did not touch):
  `DEFAULT_ANCHORS_AVAILABLE` in `packages/engine/src/filters/hardFilters.ts` excludes
  `jump-rope`, so it starts unchecked for every profile. Updated the file's header doc comment on
  `ANCHOR_GROUPS` since "one group, one implicit title" no longer described the list once a second
  group existed. Dropped the increment-1 stopgap comments on `FOCUS_LABELS.cardio` (real picker
  entry now exists). Tests added to `GenerateScreen.test.tsx`: cardio is selectable and the closed
  field reads "Cardio"; the Cardio gear group renders with jump rope unticked by default; ticking
  persists through `usersRepo.updateUser` and unticking removes it again. 17/17 existing +
  new tests pass.

- [x] Step 2 (`ffa5523`) — HomeScreen.tsx: added `{ marker: 'cardio', label: 'Cardio workout' }` to
  `DAY_MARKER_OPTIONS`. `FOCUS_LETTER.cardio = 'C'` had already landed as increment 1's stopgap on
  `master`; verified no clash with the other letters (F/U/A/L) or the Quick Session `Q` marker, and
  dropped the now-stale stopgap comment above it. Checked (no code changes needed):
  `app/src/lib/dashboard.ts`'s calendar/marker building is generic over `Focus`, no hardcoded list;
  `packages/store/src/repositories/manualDayMarkers.ts`'s `DayMarker` type is `'none' | 'travel' |
  'quick' | Focus` — derives from the type, so it already accepted `'cardio'` before this commit;
  `packages/store/src/schema.ts`'s `manual_day_markers.marker` and `sessions.focus` columns are
  both plain unconstrained `text()`, no CHECK, no migration needed (confirmed by reading
  `schema.ts` directly, not just the comment). quickSession.ts: `ALL_FOCI` now includes `'cardio'`,
  replacing the increment-1 stopgap `Record` entries with real ones (no functional change to the
  Records themselves, since they were already keyed by the full `Focus` union — only `ALL_FOCI`
  changes behavior). Tests added to `quickSession.test.ts`: cardio picked when it's the only
  untrained focus; a cardio-vs-everything tie-break case; a cardio case for
  `pickQuickSessionDifficulty`. Had to touch one existing test ("breaks a tied lowest count...")
  to add a cardio record dated most-recent, since leaving cardio untrained made it tie for the
  win and silently flip the expected answer — this is a real coupling, not a workaround: any
  five-way-tie test now needs all five foci accounted for.

- [x] Step 3 (`5aa061d`) — ApprovalScreen.tsx "Add exercise": added an exported pure helper
  `scopeMainCandidatesToFocus(candidates, focus, section)`, following the same "exported pure
  function co-located in the screen file, tested in its own file" pattern `estimateMinutes` already
  established (see `ApprovalScreen.estimate.test.ts`). It mirrors the engine pipeline's MAIN-pool
  scoping exactly (`pipeline.ts`'s `mainPool`/`mainPoolIgnoringEquipment`, Track 14 increment 3):
  MAIN-section candidates for a cardio session are `isCardioExercise` only; for every other focus
  they exclude `isCardioExercise`; warmup/cooldown are untouched (deliberate no-op), matching the
  pipeline leaving those pools unscoped so a cardio move can still open a strength day and a
  strength stretch can still close a cardio one. Wired into `candidatesFor` right after the
  existing role/already-in-session filtering. New test file
  `ApprovalScreen.candidates.test.ts` (4 cases: cardio MAIN keeps only conditioning, every other
  focus excludes it, no-op for warmup, no-op for cooldown).

  Also checked and confirmed unchanged (item 6 of the brief): both `WorkoutScreen.tsx`'s
  mid-workout swap and `ApprovalScreen.tsx`'s own swap call the engine's `alternativesForSlot`
  directly with the entry's real `pattern`, which already same-pattern-scopes alternatives
  end-to-end (built in increment 3). Neither builds a parallel candidate list that could bypass
  it — no code changes needed there.

- [x] Item 5 sweep (folded into the above commits, no separate commit) — grepped `app/src` for
  other focus-keyed `Record<Focus,...>`/hardcoded focus arrays/`switch`es: found exactly the three
  sites the brief named (`GenerateScreen.FOCUS_LABELS`, `HomeScreen.FOCUS_LETTER`,
  `quickSession.ALL_FOCI`/`counts`/`lastSeenIndex`), all handled above. No `switch`/`case` on
  `focus` anywhere in `app/src`. Checked `exerciseCatalog.ts`'s `formatToken` and
  `ExerciseDetailScreen.tsx`'s anchor/pattern rendering: both are already fully generic
  (`formatToken('jump-rope')` -> "Jump rope", `formatToken('conditioning')` -> "Conditioning") —
  no special-casing needed or added, confirming the plan's prediction. Checked `SummaryScreen.tsx`:
  it renders raw `session.focus` in two places, same as every other focus today (not capitalized,
  not looked up in a label table) — 'cardio' behaves identically, not a regression, not fixed
  (pre-existing style inconsistency, out of this increment's scope). `celebrationShareText` is
  family/exercise-name driven, not focus-keyed — nothing to do. `SettingsScreen.tsx` has no
  focus-keyed content at all.

### In progress
- None. All of increment 5's listed work items are done.

### Next (not done here, left for the lead / a later increment)
- The lead's increment 6 (backlog: park "interval-circuit cardio format", fold this file's "Done"
  section into `STATUS-14-cardio-focus.md`, delete this file once folded).
- Increment 4 (library additions, ~30 new cardio records + coverage validator rules) was running
  in parallel on `master`/main tree per the plan — not touched here, out of this increment's file
  scope (`app/` only). This worktree's `HEAD` was fast-forwarded to `master`'s tip as of `29a9906`
  (increment 3 complete); if increment 4 has landed more commits on `master` since, the lead should
  merge those into `master` after taking this branch, then re-run `npm run check` once more for the
  combined result (per the plan's own merge order).
- Minor stale-doc-comment found and left alone (in scope was `app/`, not `packages/engine`):
  `packages/engine/src/filters/hardFilters.ts`'s comment above `DEFAULT_ANCHORS_AVAILABLE` says
  "Every option the 'Available Equipment' picker offers is checked by default" — no longer quite
  true now that the picker offers Cardio gear (jump rope), which is intentionally NOT checked by
  default. The code itself is correct and was verified, not changed; just flagging the comment for
  whoever next touches that file.

### Decisions / gotchas (increment-5-specific; don't re-litigate)
- `HEAD` was fast-forwarded straight onto `master`'s tip via `git merge master` before any edits —
  this worktree's branch had no commits of its own yet, so it was a clean ff, not a real merge.
  `npm install` was run first (node_modules was empty in the worktree) and left one small
  incidental `package-lock.json` diff (`better-sqlite3` gained `"hasInstallScript": true` from a
  newer local npm) — left uncommitted deliberately, since it's unrelated to this increment's scope
  and not worth a commit of its own; the lead can decide whether to pick it up.
- Cardio's position in `FOCUS_OPTIONS`/`ALL_FOCI`: last, after `full`/`upper`/`abs`/`legs`, in both
  files, so the existing four keep their relative order and only one new option is appended.
- `npm run check` is green at every commit boundary (typecheck + lint + all 5 workspaces' test
  suites + engine-purity check). 71 app test suites / 429 app tests as of the last commit.

### Full approved plan's "App and store" section (for reference — copied verbatim from the brief)
- `app/src/screens/GenerateScreen.tsx`
  - Add `cardio` to `FOCUS_OPTIONS` with the label "Cardio".
  - Add a new `ANCHOR_GROUPS` group, "Cardio gear", holding `{ value: 'jump-rope', label: 'Jump
    rope' }`. `VISIBLE_ANCHOR_VALUES` and `ANCHOR_COUNT` pick it up automatically.
  - Persistence already goes through `usersRepo.updateUser`, and the profile-default trim is
    unaffected.
- `app/src/screens/HomeScreen.tsx`: add `FOCUS_LETTER.cardio = 'C'` and a "Cardio workout" entry in
  `DAY_MARKER_OPTIONS`.
- `app/src/lib/quickSession.ts`: add `cardio` to `ALL_FOCI` and to the `counts`/`lastSeenIndex`
  records, and extend `quickSession.test.ts`.
- `app/src/screens/ApprovalScreen.tsx` "Add exercise" (around line 331): scope candidates to the
  session's focus with `isCardioExercise`, the same scoping as the pipeline.
- Store: `focus` and the day marker are plain TEXT, so no migration is needed (verify
  `manualDayMarkers.ts`/`sessions.ts` have no CHECK list). `users.anchorsAvailable` defaults come
  from `DEFAULT_ANCHORS_AVAILABLE`, which stays rope-free.
- `exerciseCatalog.ts` filters are built from library data, so the Cardio and conditioning chips
  appear on their own. Check `formatToken` output.
