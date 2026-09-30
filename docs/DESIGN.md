# RoamFit Design System — "Golden Hour"

The visual language for the whole app. Every screen is built from the tokens and primitives here;
a screen that reaches for a raw hex value, a raw font size, or a hand-rolled button is off-system.

## 1. The idea

RoamFit is for people who train in hostel courtyards, beach parks, Airbnb living rooms and hotel
stairwells, with a loop band in their backpack. The app should feel like **the best part of
travel**: the golden hour when you step outside, the stamp in your passport, the trail you're
halfway up. Not a spreadsheet. Not a gym membership.

Three moods, one system:

| Mood | Where | Feel |
| --- | --- | --- |
| **Basecamp** | Today, Journey, Field Guide, Settings | Warm, calm, dark night-sky surfaces with golden accents. Invites you in. |
| **Ignition** | Generate, Plan, Active Workout | High energy. Sunrise gradients, giant condensed numerals, haptics, motion. Gets you pumped. |
| **Summit** | Debrief, Completion | Celebration. Gold, violet, stamps, confetti. You made it up the hill. |

Travel motifs are used as *texture and metaphor*, lightly: topographic contour lines on hero
cards, passport stamps for places and milestones, a boarding-pass header on the plan, trails and
summits for progression ladders. Never kitsch — one motif per surface.

**Dark only.** Deliberate: a training app is used at arm's length, sweaty, often at dawn/dusk;
bright accents on a near-black surface give the highest-contrast, most energetic read. All text
meets WCAG AA on its surface.

## 2. Tokens (`app/src/theme/`)

### Color

```ts
// Surfaces — night sky, bluish-black, never pure black
bg:        '#0B0E13'   // screen background
surface:   '#141922'   // cards
surface2:  '#1C2330'   // raised: inputs, wells, chips, nested cards
surface3:  '#263042'   // pressed / highlighted surface
line:      '#2A3342'   // hairlines, card borders
lineStrong:'#3A4558'

// Text — warm paper white, not blue-white
text:      '#F7F3EA'
text2:     '#B4BCC8'   // secondary
text3:     '#7C8696'   // muted / captions / disabled
ink:       '#170B03'   // text ON bright accent fills (ember/gold/lagoon). Never white on ember.

// Accents
ember:     '#FF6B35'   // primary: action, work, "go"
emberDeep: '#E8491D'
gold:      '#FFB938'   // warm-up, achievements, best sets, notes
sun:       '#FFD166'   // highlights inside gold moments
lagoon:    '#2DD4BF'   // rest, recovery, cool-down, calm
sky:       '#5AA9FF'   // travel / in transit / passport
summit:    '#8E7BFF'   // progression, levels, ladders
rose:      '#FF5C93'   // cardio focus ONLY — never an error/negative state
```

**Semantic maps** (export these; screens use the semantic name, not the accent):

```ts
section:  { warmup: gold, main: ember, cooldown: lagoon }
focus:    { upper: ember, legs: summit, abs: gold, full: lagoon, cardio: rose }
setState: { completed: ember, skipped: text3 (outline only), not_reached: line (dashed) }
dayMarker:{ trained: <focus color>, travel: sky, quick: gold }
```

**Invariant 4 in color:** there is no red and no "error" color in this system. A skipped set is a
quiet outline, an untrained day is a neutral surface, "over-worked" is informational text in the
same style as every other row. `rose` exists only as the cardio identity color.

Each accent also exports a 15%-alpha `tint` (e.g. `emberTint: 'rgba(255,107,53,0.15)'`) for chip
and badge backgrounds.

### Gradients (rendered with `react-native-svg`)

```ts
sunrise: ['#FF5E3A', '#FF9F1C']   // THE primary CTA + Ignition hero. 135°.
golden:  ['#FFB938', '#FFD166']   // achievements, best sets
lagoon:  ['#14B8A6', '#38BDF8']   // rest ring, recovery
summit:  ['#7B5CFF', '#C084FC']   // level ups, progression rings
night:   ['#1C2330', '#0B0E13']   // subtle card sheen, top→bottom
```

### Typography

Two families from the same designer, loaded with `expo-font` (already linked — no native rebuild):

- **Barlow Condensed** — display, numerals, eyebrows, buttons. Barlow was drawn from California
  highway signage, which is exactly the road-trip voice we want.
- **Barlow** — body copy.

| Token | Family / weight | Size / line | Case | Use |
| --- | --- | --- | --- | --- |
| `mega` | Condensed 800 | 112 / 112 | — | rep counter, rest/hold countdown |
| `hero` | Condensed 800 | 64 / 64 | — | elapsed clock, completion stats |
| `display` | Condensed 800 | 40 / 42 | UPPER | exercise name, screen hero titles |
| `h1` | Condensed 700 | 30 / 34 | UPPER | screen titles |
| `h2` | Condensed 700 | 22 / 26 | UPPER | card titles |
| `h3` | Barlow 700 | 17 / 22 | — | list item titles |
| `body` | Barlow 400 | 16 / 23 | — | paragraphs |
| `bodyStrong` | Barlow 600 | 16 / 23 | — | emphasis |
| `small` | Barlow 500 | 14 / 19 | — | secondary |
| `caption` | Barlow 500 | 12 / 16 | — | captions |
| `eyebrow` | Condensed 700 | 13 / 16, letterSpacing 1.6 | UPPER | section labels, chips |
| `button` | Condensed 800 | 20 / 24, letterSpacing 1.2 | UPPER | primary buttons |

Export as ready-made `TextStyle` objects (`type.display`, …) and a `<Txt variant="display">`
primitive. Numerals that tick (timers) get `fontVariant: ['tabular-nums']` and a fixed-width
container so they don't jitter.

### Space, radius, elevation, motion

- Space (4-pt): `xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32, huge 48`. Screen gutter = 20.
- Radius: `sm 10, md 16, lg 24, xl 32, pill 999`.
- Elevation: no drop shadows on dark (they vanish). Depth comes from surface steps + a 1px `line`
  border. Accent elements get a **glow**: `shadowColor: accent, shadowOpacity: 0.45,
  shadowRadius: 18, shadowOffset: {0, 6}` — reserved for the one primary thing on a screen.
- Motion (built-in `Animated`, native driver where possible):
  - `press`: scale → 0.96, 90ms, spring back. Every tappable card/button (`PressableScale`).
  - `enter`: opacity 0→1 + translateY 14→0, spring, staggered 45ms per item on first mount.
  - `pop`: scale 0.6→1.12→1 for set pips filling, badges landing.
  - `pulse`: 1→1.06 loop for the final 3 seconds of any countdown.
  - All loops and shakes are dropped under Reduce Motion (`useReduceMotion()` hook).
- Haptics (`expo-haptics`): selection tick on every picker/chip change; `impactMedium` on set
  complete; `notificationSuccess` on last set of an exercise and on START; `impactLight` on each
  of the final 3 countdown seconds.

### Icons

`@expo/vector-icons` (Ionicons set), wrapped in a single `<Icon name=… />` so the name map lives
in one place. Replaces every unicode glyph currently used as an icon (❚❚ ▶ ⇄ ✕ ⠿ ▸▸ ✈).

## 3. Primitives (`app/src/ui/`)

Each is small, typed, tested for render + press, and styled only from tokens.

| Component | Notes |
| --- | --- |
| `Txt` | `variant` from the type scale, `color` from tokens, `upper` auto for display/h1/h2/eyebrow/button. |
| `Gradient` | Absolute-fill SVG linear gradient; props `colors`, `angle`, `radius`. |
| `TopoPattern` | Absolute-fill SVG of 5–7 organic contour loops, deterministic from a `seed` string, stroke `text` at 6–9% opacity. The travel-map texture for hero cards. |
| `Screen` | SafeArea + `bg` + optional ScrollView + standard gutter + bottom inset for a sticky footer. |
| `Card` | `surface`, radius `lg`, 1px `line` border, padding 16–20. `variant: 'plain' | 'hero' | 'accent'` (hero = gradient fill + TopoPattern; accent = 2px gradient border). |
| `Button` | `variant: 'primary' | 'secondary' | 'ghost' | 'quiet'`, `size: 'lg' | 'md' | 'sm'`, optional `icon`, `loading`. Primary = `sunrise` gradient, `ink` text, glow, 64px tall at `lg`. Secondary = `surface2` + `line` border. |
| `IconButton` | Circular 44/56px, `surface2`, optional label below (caption). |
| `PressableScale` | The press animation + selection haptic, wraps any child. |
| `Chip` | Pill, eyebrow text, `tone` (accent name) → tint bg + accent text; `selected` → solid accent + ink text. |
| `Eyebrow` / `SectionHeader` | Eyebrow label + optional right-aligned action link. |
| `ProgressRing` | SVG ring: `progress 0..1`, `size`, `stroke`, `gradient`, track `surface2`, children centered. Animates progress changes. |
| `SegmentedBar` | N segments with gaps, each 0..1 filled, `activeIndex` glows. Session progress. |
| `Pips` | N dots, `filled` count, `current` index ring; `pop` animates newly filled. Set progress. |
| `StatTile` | Big `hero`/`h1` numeral + eyebrow label + optional icon, `tone`. |
| `Stamp` | Passport stamp: rounded-rect or circle (seeded), double inset border in the stamp color, condensed uppercase text, rotation −8°..8° seeded, 90% opacity "ink". `title`, `subtitle`, `seed`, `tone?`. |
| `Switch` | Custom pill toggle (ember when on) + selection haptic. |
| `Sheet` | Bottom sheet on `Modal` (fade backdrop + slide-up panel, radius `xl` top). Replaces ad-hoc centered dialogs. |
| `Toast` | Transient floating line (e.g. "Strong set.") that rises and fades; used by Workout. |

## 4. Navigation

- Root native stack: `Tabs`, `Generate`, `Approval`, `Workout`, `Summary`, `Settings`,
  `ExerciseDetail`. The flow screens (Generate → Approval → Workout → Summary) are full-screen, no
  tab bar.
- Bottom tabs (`@react-navigation/bottom-tabs`, JS-only): **Today** (flame), **Journey**
  (compass), **Field Guide** (book). Custom tab bar: `surface` with top hairline, active = ember
  icon + eyebrow label, inactive = `text3`.
- Settings is a gear `IconButton` on Today's header.
- Stack headers: transparent over `bg`, title in `h2`, tint `text`, no hairline. The Workout
  screen hides the native header and draws its own top bar.
- Navigation theme: React Navigation `DarkTheme` with our tokens (so no white flashes between
  screens). `StatusBar style="light"`.

## 5. Screens

Existing code comments record decisions the user asked for (e.g. the elapsed clock is the largest
thing on the workout screen; "How to" is open by default; the next unlock's exercise is never
named in advance; pause keeps the workout editable; swap is one tap; difficulty chips use text
labels, not emoji alone). **Keep those behaviors and information decisions.** The spec below
changes how things look and where they sit, not what the app decides.

### 5.1 Today (was Home, top half)

Top to bottom:
1. **Header row** — `ROAMFIT` wordmark (`h1`, ember) with a time-of-day greeting under it
   ("Good morning" / "Good afternoon" / "Good evening", `small`, text2). Gear `IconButton` right.
2. **Banners** (comeback / travel-suggest / recovery week) as compact `Card`s with a leading
   icon in a tinted circle (sky for travel, lagoon for recovery/comeback). Same copy & actions.
3. **Hero card** (`Card variant="hero"`, sunrise gradient + TopoPattern, ~220pt tall):
   - No pending session: eyebrow `TODAY`, `display` "READY TO MOVE?", `small` "Pick your time,
     focus and gear — we'll build the rest." and an embedded dark pill button
     "BUILD A SESSION →". Whole card is the `today-card` target.
   - Pending: eyebrow `RESUME` / `READY TO START`, title "{FOCUS} · {N} MIN", difficulty chip,
     and for an active session a thin ink progress bar showing sets done / total. `resume-card`.
     Abandon link sits just below the card as a `quiet` button.
4. **Two-up tiles**: **Quick Session** (bolt icon, gold, "7 min · zero decisions") and
   **In transit** (airplane, sky, "Mark today as travel"). Square-ish `Card`s, `PressableScale`.
5. **This week** — a 7-day strip (Mon–Sun containing today) of 40pt rounded cells using the same
   markers/emojis as the Journey logbook; today has a 2px ember ring. Tap → Journey tab.
6. **Next unlock** — `Card` with a `ProgressRing` (summit gradient, 64pt) on the left showing
   level progress, and "HORIZONTAL PUSH" (`h2`) + "2 sessions to your next level" on the right.
   All-mastery state keeps its existing copy. Tap → Journey tab.

### 5.2 Journey (new tab — was Home, bottom half)

The long-term story. Eyebrow `YOUR JOURNEY`, title `h1`.
1. **Lifetime** — 3×2 grid of `StatTile`s: Sessions (flame, ember), Minutes (time, gold),
   Levels gained (trending-up, summit), Best sets (trophy, sun), Cities (location, sky),
   Countries (globe, lagoon). Numbers in `hero`-size condensed.
2. **Trails** (the progression board, renamed in UI copy only). One card per family:
   - Left: family name (`h2`), current exercise (`small`, text2).
   - A **rung track**: N small nodes on a horizontal line, nodes below current filled summit,
     current node larger with glow, top node a flag icon (the summit). Label "LEVEL 3 OF 7".
     Mastery = whole track gold + "SUMMIT" chip.
   - Right: `ProgressRing` (56pt, summit gradient) with the sessions-to-next number inside and
     "to next level" caption beneath — still the loudest thing on the row.
   - An **Adjust** `quiet` button (`board-adjust-${familyId}`) expands the row to reveal the
     existing Too easy / Too hard controls and their two-step confirms, unchanged in behavior.
     Collapsed by default: the board is for looking; adjusting is occasional.
   - Zero-session explanation and level-up notice keep their copy, styled as a summit-tinted note.
3. **Logbook** — the month calendar. Rounded 40pt cells on `surface`, focus-colored cell tint
   for trained days with the existing emoji markers, travel days sky-tinted, today with an ember
   ring, untrained days plain `surface` (neutral, never empty-looking-bad). Weekday header in
   `eyebrow`. Tap a day → the day-marker `Sheet` (same options).
4. **Passport** — the passport finally has a purpose: **collecting stamps.** Header "PASSPORT"
   with "4 cities · 2 countries · 9 sessions abroad" and a Share icon button. Body is a wrapping
   grid of `Stamp`s, one per city (seeded by city name, so each city always gets the same shape,
   color and tilt). Opt-in state: a `Card` with three ghosted sample stamps and "Collect a stamp
   for every city you train in" + a primary `sm` button "TURN ON PASSPORT".
5. **Muscle balance** — rows with a rounded gradient bar (sunrise), trailing 14 days, same data.
6. Estimate-accuracy line, `caption`, text3, at the bottom.

### 5.3 Field Guide (Exercises list)

- Title "FIELD GUIDE" + live count ("142 moves").
- Filters: a horizontally scrolling chip row of the active/most-used filters plus a "Filters"
  chip with a count badge that opens a `Sheet` holding every filter group. Clear-all in the sheet
  and inline when any filter is active.
- Rows: 52pt rounded-square **avatar** tinted by the exercise's first focus color, with an icon
  for its movement pattern (push → arrow-forward, pull → arrow-back, squat/hinge → body, core →
  ellipse, carry/cardio → pulse…; one map in the file). Name `h3`, primary muscle `small` text2,
  right side a `×12` ember chip for times completed; no-video / disabled as muted `Chip`s.
  Disabled rows at 50% opacity.

### 5.4 Exercise detail

- **Header**: full-bleed hero band (~200pt) with the focus-color gradient + TopoPattern; name in
  `display`, subtitle and aliases beneath.
- Two `StatTile`s: Times completed, Last performed.
- Pinned note (gold-tinted sticky-note card).
- Sections as `Card`s with an icon + eyebrow header: How to, Demo, Progress (chart bars use the
  sunrise gradient, gain lines use `Chip`s), Details.
- **Details** as a 2-column spec grid of small `surface2` tiles (eyebrow label, `bodyStrong`
  value) instead of a long label/value list. Library id stays last, `caption`.
- Enable/disable as a `Switch` row at the bottom with its existing explanatory subtext.

### 5.5 Generate ("New session") — Ignition

Should feel like choosing your adventure.
- Eyebrow `NEW SESSION`, title `display` "WHAT ARE WE TRAINING?".
- **Focus**: grid of tiles (2 columns; Cardio full-width last), each ~96pt: icon + name +
  one-line flavor ("Push, pull, press", "Squats, lunges, hinges", "Anti-everything core",
  "Head to toe", "Heart rate up"). Unselected = `surface` with the focus color on the icon;
  selected = focus-color 2px border + tint fill + glow + check badge.
- **Time**: horizontal row of big numeral chips (`h1` numerals, "MIN" caption) — 15 … 120.
- **Intensity**: 3-segment control, each segment shows 1/2/3 flame icons over the label
  (Easy / Medium / Hard).
- **Equipment**: collapsible `Card` ("AVAILABLE EQUIPMENT · 5 selected"), groups of toggle chips
  with a check icon when on. Hints stay as `caption`.
- **Extras**: "Add cardio" and "Recovery week" as `Switch` rows with their subtitles.
- **Sticky footer**: a live recap line ("45 MIN · UPPER · HARD") over a `Button lg primary`
  "BUILD MY SESSION" (bolt icon). Loading label: "SCOUTING YOUR ROUTE…".
- OptionPicker drop-downs are replaced by these direct controls. Every option keeps a stable
  testID `${pickerTestID}-option-${value}` so tests still address options by value.

### 5.6 Plan (Approval) — "Your route"

- **Boarding-pass header** `Card`: left column big `display` focus name; right columns `eyebrow`
  labels over `h1` values — MIN (the live estimate), LEVEL (difficulty), MOVES (exercise count).
  A dashed perforation line with half-circle notches cut into both card edges, then the §5.8
  explanation text in `small` text2 below. Swap notice shows as a lagoon toast/pill.
- **Route timeline**: each section (Warm-up / Main / Cool-down) gets a section chip in its
  section color; its exercises hang off a 2px vertical rail in that color with a node dot per
  card. Cards keep every existing control (drag handle, swap, remove, sets/reps/duration/rest
  inputs, band picker) — restyled: icon buttons, inputs as `surface2` wells with eyebrow labels.
- "+ Add exercise" as a dashed-outline ghost row at the end of each section's rail.
- **Sticky footer**: Regenerate as a secondary icon button (refresh) + `Button lg primary`
  "LET'S GO" (start). Abandon as a `quiet` button at the end of the scroll content.

### 5.7 Active Workout — Ignition, turned all the way up

This is the screen the whole app exists for. It should feel like a coach on your shoulder, not a
form. Hides the native header; draws its own.

**Top bar** (one row, as today): centered elapsed clock in `hero` numerals; pause and stop as
`IconButton`s on the right; the Home affordance on the left as an `IconButton` (home icon),
replacing the header's back item. Under it, a **`SegmentedBar`** — one segment per exercise,
filled by that exercise's completed sets, current segment glowing in the current section color.
The section name sits as a `Chip` in that color between the bar and the hero.

Spotify controls: a compact dark pill row directly under the bar.

**Exercise phase (reps)** — a hero `Card` with a 2px gradient border in the section's color:
- Level badge as a summit `Chip` ("LVL 3 · HORIZONTAL PUSH") top-left.
- Exercise name in `display`, up to 2 lines, `adjustsFontSizeToFit`.
- Set row: `Pips` for the sets + "SET 2 OF 4" eyebrow; existing prev/next set chevrons.
- Anchor badge + band picker as a row of chips.
- **The rep counter is the centerpiece**: `mega` numeral, with 64pt circular −/+ buttons on each
  side, "REPS" eyebrow above and "target 12" caption below. Tapping the numeral still edits it.
- **COMPLETE**: `Button lg primary`, full width, 72pt tall, check icon, label "COMPLETE SET".
  On press: `impactMedium`, the current pip pops, and a `Toast` rises from the button with a
  line from the set-complete pool (§6). Last set of an exercise → `notificationSuccess` and the
  "exercise done" pool.
- Secondary actions: a row of three labeled `IconButton`s — Undo (rewind), Swap, Skip.
- Pinned note above the hero (gold sticky card), How-to (open by default) and demo media below
  it, each a `Card`.

**Exercise phase (timed)** — same hero, but the centerpiece is a 240pt `ProgressRing` (sunrise
gradient on section color track) with the `mega` countdown inside and "SEC" eyebrow; caption
below ("Tap to start" / "Tap to finish early"). −/+ duration buttons flank the ring before it
starts. Final 3 seconds: ring and numeral `pulse`, light haptic each second.

**Rest phase** — the whole hero shifts to the **lagoon** mood (lagoon gradient border, lagoon
ring) so rest is unmistakable at a glance from across a room:
- Eyebrow `REST`, a line from the rest pool ("Shake it out.") in `h2`.
- 220pt lagoon `ProgressRing` with the countdown in `mega`.
- −15s / +15s / Skip as secondary pill buttons.
- "How did that set feel?" + FeedbackControls as a 3-segment control (text labels kept;
  Too easy = lagoon, Just right = ember, Too hard = summit when selected — no red).
- `Button lg primary` "NEXT".
- **Up next** `Card`: eyebrow `UP NEXT`, name `h2`, anchor + band chips, How-to and demo (open).

**Paused**: the hero dims to 55% and a `Chip` "PAUSED" pulses gently next to the clock; the
paused-completion nudge becomes a `Sheet`.

### 5.8 Debrief (Summary, before FINISH) — Summit

Problem today: it's hard to read at a glance and wastes space. Fix: **one screen, one glance,
one button.**
- Header: eyebrow `DEBRIEF`, title "{FOCUS} · {N} MIN", and a row of three compact `StatTile`s
  computed from what's already on screen: Sets done, Exercises, Reps/holds logged (additive
  counts only — never "of planned").
- **Exercise rows** (dense): name `h3` on the left, a wrapping row of 30pt rounded set squares on
  the right: completed = ember fill with the rep/second count inside in `ink`; skipped = `text3`
  outline; not reached = dashed `line` outline. The feedback label (if any) is a tiny colored dot
  under its square, and the full labeled chip shows in the edit sheet. Tap square → jump to that
  set in Workout (unchanged); long-press or the dot → the feedback edit `Sheet`.
  A one-line legend under the header ("● done ○ skipped ◌ not reached").
- Retrospective as a "TRAIL NOTES" `Card` with placeholder "What felt great? Anything to tweak
  next time?".
- **Sticky footer**: `Button lg primary` "FINISH" + `quiet` "Back to workout".

### 5.9 Completion (Summary, after FINISH)

**User direction (verbatim intent):** this is the one page that already has the energy the rest
of the app lacks, and it must stay *highly* exciting, interactive and animated. The user
specifically loves: the **stamped-on hype headline** ("BEAST MODE ACTIVATED" slamming in word by
word), the **stat chips** counting up, the **confetti cannons and radial sunburst**, the
**pulsating "Heck yes!" button**, and **all the haptics**. The one thing they dislike is the
**heavy purple theme**. So: this phase is a re-skin into Golden Hour, **not** a calming-down.
Every animation beat, sound, haptic, shake, re-burst-on-tap and Reduce Motion behavior stays
exactly as choreographed today (`completionTimeline.ts`). Do not remove, shorten or soften any of
them; if anything, the new palette should make them pop harder.

The purple comes from: the solid `#5b21b6` screen background, the violet level bar / level chip /
share-button text in `HighlightCard`, and the lilac stat labels in `AnimatedStatCounter`. All of
it goes. **No violet surfaces or violet-dominant elements on this page** — `summit` is not used
here at all.

- **Background**: `bg` night base with the drifting glow orbs recolored to **ember, gold and
  sun** (big, soft, ~35–45% opacity) so the whole screen reads as a warm sunset bloom, not a
  flat color. Optional third orb in lagoon at low opacity for depth.
- **Sunburst rays**: gold/sun at low opacity, still spinning.
- **Hype headline**: keeps the stamp-in, word-by-word slam and bounce. Barlow Condensed 800,
  `display`/`hero` scale, uppercase; words in `text` with the accent word in `sun`, and an ember
  text-shadow glow so it looks stamped in light.
- "You just finished your 12th workout on RoamFit!" in `h2`, then "32 min · upper" in `small`.
- **Stat chips**: keep the tile-by-tile pop-in and count-up. 2×2 grid of `StatTile`-style
  chips: `surface` at ~85% opacity over the glow, 1px `line` border, numerals in `hero`
  condensed `text`, labels in `eyebrow` gold. Tighten vertical spacing so headline + stats +
  the first highlight are visible without scrolling on a 6.1" phone.
- **Highlights** (level ups / best sets): keep the stamped reveal beat with its own sound, haptic,
  shake and confetti pop. Card = `surface` with a 2px `golden` gradient border; a `Stamp`
  ("LEVEL UP" in ember / "BEST SET" in gold) on the left stamps in on the reveal; level bar
  fills with the `sunrise` gradient; share is an `IconButton` (share icon), not violet text.
- **Quiet milestones**: small gold `Chip`s, wrapping.
- **Confetti**: same physics, cannons and pops, palette → ember, emberDeep, gold, sun, lagoon,
  sky, rose, `text` white. No violet.
- **"Heck yes! 💪"**: keeps its entrance and endless pulse, now `Button lg primary` (sunrise
  gradient, `ink` text, glow) — the pulse should also breathe the glow.

### 5.10 Settings — Basecamp

Grouped iOS-style list on `bg`, reordered so what people change most comes first:
1. **Header**: title `h1` "SETTINGS".
2. **Training** group — Timer sounds (`Switch`, volume icon, gold), with its explanation as
   `caption` under the row.
3. **Motivation** group — Daily motivation (`Switch`, sparkles icon), Quiet hours (`Switch`,
   moon icon). The motivation times become time "pills": each row shows the time in `h2`
   condensed numerals between circular −/+ `IconButton`s, with a trailing remove icon button;
   "+ Add a time" is a dashed ghost row.
4. **Travel & privacy** group — Passport (`Switch`, airplane icon, sky) with the privacy copy as
   `caption`s beneath the group.
5. **Apple Health** group — write workouts (`Switch`, heart icon).
6. **Medical disclaimer** — its own `Card` with a shield icon, disclaimer text in `small` text2.
7. **Advanced** group (collapsed behind a disclosure row, since these are rare): Diagnostics
   ("Load diagnostics" as a secondary `sm` button; output lines in a `surface2` well, monospace
   is fine here) and Reset progression sessions (secondary button, with its confirm as a
   `Sheet`).
Every row: 52pt min height, leading 32pt icon tile tinted in its group's accent, `h3` label,
`Switch` or chevron on the right, hairline separators inset past the icon. `surface` group
cards, radius `lg`. Group eyebrows above each card. Footer: small `ROAMFIT` wordmark + version in
`caption` text3 — a quiet sign-off.

### 5.11 Every other surface

Nothing ships on the old look. Beyond the screens above, the redesign covers:

- **Disclaimer gate** (first launch, on Home): full-screen `bg` with the TopoPattern texture at
  low opacity, `ROAMFIT` wordmark in `hero` ember, tagline "TRAIN ANYWHERE." in `eyebrow` gold,
  the disclaimer in a `Card`, and `Button lg primary` "I UNDERSTAND".
- **Loading states**: a centered ember `ActivityIndicator` on `bg` — never a white screen. Screen
  bodies that load synchronously fade in with `enter`.
- **Empty states** (e.g. no exercises match filters, no progress yet on a detail page, zero
  sessions on Journey): an icon in a tinted circle, one `h3` line, one `small` line, optionally a
  button. Encouraging, never "nothing here".
- **Every modal / confirm** — `AbandonSessionButton` (both variants), the calendar day-marker
  popup, Summary's feedback-edit dialog, the paused-completion nudge, OptionPicker's drop-down (if
  anything still uses it), the Settings reset confirm — becomes a `Sheet`. Destructive-ish
  confirms (abandon, reset) use a secondary button for the action and primary for "keep going":
  the safe choice is the loud one. Still no red.
- **Shared components** restyled to tokens: `AnchorBadge`, `BandChip`, `BandPicker` (band colors
  keep their real-world tension colors — they're information, shown as a color dot on a dark
  chip), `DemoMedia` (dark card, rounded video, restyled fallback/link states), `PinnedNote` (gold
  sticky-note card with a pin icon, edit mode as a `surface2` well), `SpotifyControls` (compact
  dark pill, Spotify green is allowed *only* as the logo/brand dot), `FeedbackControls`,
  `HighlightCard`, `AnimatedStatCounter`, `HypeHeadline`, `CelebrationBackdrop`, `ConfettiBurst`
  (palette → ember/gold/sun/summit/lagoon/sky), `OptionPicker` (restyle or delete if unused).
- **Keyboard accessories** (Summary "Done", Workout/Approval inputs): `surface2` bar with an
  ember "Done".
- **Native chrome**: `app.json` `userInterfaceStyle: "dark"`, splash `backgroundColor` = `bg`,
  `StatusBar style="light"`, React Navigation dark theme with our tokens. (The app icon image
  itself is out of scope — it needs an artist; noted in BACKLOG.)

## 6. Voice

Coach on your shoulder: short, warm, a little swagger, never guilt. Travel metaphors at most
once per screen. No streaks, no "you missed", no counts of what didn't happen.

Put these pools in `app/src/lib/hypeCopy.ts` (pure, tested, deterministic pick by seed so tests
are stable):

- **Set complete**: "Strong set.", "Nailed it.", "Clean reps.", "That's the one.", "Keep that
  energy.", "Smooth.", "Money.", "You're rolling."
- **Exercise complete**: "Exercise done. On to the next.", "Checked off.", "That one's in the
  bank.", "Another one down."
- **Last set of the session**: "Last set. Empty the tank."
- **Rest**: "Shake it out.", "Breathe it in.", "Sip some water.", "Loosen up.", "Next one's
  yours.", "Good work. Reset."
- **Greeting**: by time of day as in §5.1.

## 7. Engineering rules for the redesign

- **Done means zero off-system surfaces.** The final phase greps `app/src` for raw hex colors,
  `fontSize:` literals and `fontWeight:` outside `theme/` and `ui/`, and for unicode glyph icons;
  every hit is migrated or has a one-line comment saying why it's intentional (e.g. band tension
  colors, which are real-world data).

- Styling only in `app/src/theme` tokens + `app/src/ui` primitives. No raw hex / font sizes in
  screens once a screen is migrated.
- **Behavior is frozen.** No changes to `@roamfit/store`, `@roamfit/engine`, `@roamfit/data`, or
  to what a screen reads/writes. This is a presentation rewrite.
- **testIDs are an API.** Keep every existing testID on the element that plays the same role. If
  an element moves (e.g. board → Journey), move its tests with it. If an interaction gains a
  step (e.g. Adjust before level-up), update the test to take it. Copy changes update their
  assertions in the same commit.
- Accessibility: every icon-only control has `accessibilityLabel`; hit targets ≥ 44pt; honor
  Reduce Motion; `allowFontScaling` stays on for body text (cap `maxFontSizeMultiplier` at 1.3
  on `mega`/`hero` numerals).
- New dependencies (all installed with `npx expo install` for SDK-matched versions):
  `react-native-svg` (**native — requires a dev-client rebuild**, `npm run ios`),
  `@expo/vector-icons`, `@expo-google-fonts/barlow`, `@expo-google-fonts/barlow-condensed`,
  `@react-navigation/bottom-tabs` (JS-only).
