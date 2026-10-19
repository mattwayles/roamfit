## Track: 41 — No setup re-run, no placement, free ladder moves, Today logo, settings everywhere
Last updated: 2026-10-18

User request:
1. Remove Settings → "Run setup again" (goal and limitations live in Settings). Setup runs on first
   launch only.
2. Remove Settings → Starting levels.
3. Manual ladder moves (Journey adjust) must never be blocked by equipment ("needs an anchor you
   don't have set up"). Equipment is only remembered selections for the next Generate.
4. Wanderlift logo on Today, right next to the Wanderlift title.
5. Settings icon on Journey and Field guide, like Today.

### Done
- [x] Steps 1+2: run-setup and Starting levels removed; OnboardingFlow is first-launch only;
  placeOnLadders / applyPlacement / PlacementPicker deleted with their tests — c7e3963
- [x] Step 3: levelUp.ts moves the rung with no hard-filter check; `no_eligible_exercise` and its
  Journey copy gone; levelUp.test.ts walks every ladder up and down with no equipment — 9db64fa
- [x] Step 4: Today title row has the logo (shared `app/src/lib/brand.ts`) — 521ef49
- [x] Step 5: Settings gear on Journey (`journey-open-settings`) and Field guide
  (`guide-open-settings`) — 527a8ac

### In progress
- Nothing. Device pass owed (BACKLOG, under the Track 40 item).

### Decisions / gotchas
- Limitations are also no longer checked on a manual move: the ladder position is not unsafe in
  itself, and generation still applies every hard filter (invariant 3) before any exercise is
  programmed.
- The gears have distinct testIDs: tab screens stay mounted once visited, so a shared
  `open-settings` id would collide in tests.
- Band/anchor uses in Approval/Workout swaps and band clamping are workout-time uses of the
  remembered selections and stay.
