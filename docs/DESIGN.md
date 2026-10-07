# RoamFit Design System — "Midnight"

The visual language for the whole app. Every screen is built from the tokens and primitives here;
a screen that reaches for a raw hex value, a raw font size, or a hand-rolled button is off-system.

## 1. The idea

RoamFit is for people who train in hostel courtyards, beach parks, Airbnb living rooms and hotel
stairwells, with a loop band in their backpack. The app should feel like **the best part of
travel**: the midnight when you step outside, the stamp in your passport, the trail you're
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

**Two lights, one system.** *Midnight* (dark) is the original: bright accents on a near-black
night sky, the most energetic read at dawn, dusk and indoors. *Daybreak* (light, §8) exists because
Midnight washes out in direct sun: it is the same app printed as a trail map — ink on warm paper,
accents deepened until they read in glare, white legends on saturated panels like a highway sign.
The user picks System / Daybreak / Midnight; System follows iOS, whose Automatic appearance
flips to Midnight at sunset. All text meets WCAG AA on its surface in both.

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
ink:       '#170B03'   // text ON bright accent fills (teal/gold/fern). Never white on teal.

// Accents
teal:     '#4FB8C4'   // primary (Midnight Green's light complement): action, work, "go"
tealDeep: '#2E8C98'
gold:      '#FFB938'   // warm-up, achievements, best sets, notes
fern:     '#68CF59'   // rest, recovery, cool-down, calm; hue 112.5 = middle of the gold-teal gap
sky:       '#5AA9FF'   // travel / in transit / passport
summit:    '#C77DFF'   // plum: progression, levels, ladders
rose:      '#FF5C93'   // cardio focus ONLY — never an error/negative state
```

**Semantic maps** (export these; screens use the semantic name, not the accent):

```ts
section:  { warmup: gold, main: teal, cooldown: fern }
focus:    { upper: teal, legs: summit, abs: gold, full: fern, cardio: rose }
setState: { completed: teal, skipped: text3 (outline only), not_reached: line (dashed) }
dayMarker:{ trained: <focus color>, travel: light gray, rest: light gray, quick: gold }
```

**Invariant 4 in color:** there is no red and no "error" color in this system. A skipped set is a
quiet outline, an untrained day is a neutral surface, "over-worked" is informational text in the
same style as every other row. `rose` exists only as the cardio identity color.

Each accent also exposes a `tint` (`theme.tints.teal`; Midnight `rgba(79,184,196,0.15)`, 8% alpha in Daybreak, §8.3) for chip
and badge backgrounds.

### Gradients (rendered with `react-native-svg`)

```ts
trail: ['#3FA9B6', '#62CBD5']   // THE primary CTA + Ignition hero. 135°.
golden:  ['#FFB938', '#FFD166']   // achievements, best sets
fern:   ['#50BF40', '#8DE481']   // rest ring, recovery
summit:  ['#A45CF0', '#D59BFF']   // level ups, progression rings
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
| `Button` | `variant: 'primary' | 'secondary' | 'ghost' | 'quiet'`, `size: 'lg' | 'md' | 'sm'`, optional `icon`, `loading`. Primary = `trail` gradient, `ink` text, glow, 64px tall at `lg`. Secondary = `surface2` + `line` border. |
| `IconButton` | Circular 44/56px, `surface2`, optional label below (caption). |
| `PressableScale` | The press animation + selection haptic, wraps any child. |
| `Chip` | Pill, eyebrow text, `tone` (accent name) → tint bg + accent text; `selected` → solid accent + ink text. |
| `Eyebrow` / `SectionHeader` | Eyebrow label + optional right-aligned action link. |
| `ProgressRing` | SVG ring: `progress 0..1`, `size`, `stroke`, `gradient`, track `surface2`, children centered. Animates progress changes. |
| `SegmentedBar` | N segments with gaps, each 0..1 filled, `activeIndex` glows. Session progress. |
| `Pips` | N dots, `filled` count, `current` index ring; `pop` animates newly filled. Set progress. |
| `StatTile` | Big `hero`/`h1` numeral + eyebrow label + optional icon, `tone`. |
| `Stamp` | Passport stamp: rounded-rect or circle (seeded), double inset border in the stamp color, condensed uppercase text, rotation −8°..8° seeded, 90% opacity "ink". `title`, `subtitle`, `seed`, `tone?`. |
| `Switch` | Custom pill toggle (teal when on) + selection haptic. |
| `Sheet` | Bottom sheet on `Modal` (fade backdrop + slide-up panel, radius `xl` top). Replaces ad-hoc centered dialogs. |
| `Toast` | Transient floating line (e.g. "Strong set.") that rises and fades; used by Workout. |

## 4. Navigation

- Root native stack: `Tabs`, `Generate`, `Approval`, `Workout`, `Summary`, `Settings`,
  `ExerciseDetail`. The flow screens (Generate → Approval → Workout → Summary) are full-screen, no
  tab bar.
- Bottom tabs (`@react-navigation/bottom-tabs`, JS-only): **Today** (flame), **Journey**
  (compass), **Field Guide** (book). Custom tab bar: `surface` with top hairline, active = teal
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
1. **Header row** — `ROAMFIT` wordmark (`h1`, teal) with a time-of-day greeting under it
   ("Good morning" / "Good afternoon" / "Good evening", `small`, text2). Gear `IconButton` right.
2. **Banners** (comeback / travel-suggest / recovery week) as compact `Card`s with a leading
   icon in a tinted circle (sky for travel, fern for recovery/comeback). Same copy & actions.
3. **Hero card** (`Card variant="hero"`, trail gradient + TopoPattern, ~220pt tall):
   - No pending session: eyebrow `TODAY`, `display` "READY TO MOVE?", `small` "Pick your time,
     focus and gear — we'll build the rest." and an embedded dark pill button
     "BUILD A SESSION →". Whole card is the `today-card` target.
   - Pending: eyebrow `RESUME` / `READY TO START`, title "{FOCUS} · {N} MIN", difficulty chip,
     and for an active session a thin ink progress bar showing sets done / total. `resume-card`.
     Abandon link sits just below the card as a `quiet` button.
4. **Two-up tiles**: **Quick Session** (bolt icon, gold, "7 min · zero decisions") and
   **In transit** (airplane, sky, "Mark today as travel"). Square-ish `Card`s, `PressableScale`.
5. **This week** — a 7-day strip (Mon–Sun containing today) of 40pt rounded cells using the same
   markers/emojis as the Journey logbook; today has a 2px teal ring. Tap → Journey tab.
6. **Next unlock** — `Card` with a `ProgressRing` (sky gradient, 64pt, matching the Trails it opens) on the left showing
   level progress, and "HORIZONTAL PUSH" (`h2`) + "2 sessions to your next level" on the right.
   All-mastery state keeps its existing copy. Tap → Journey tab.

### 5.2 Journey (new tab — was Home, bottom half)

The long-term story. Title `Journey Markers` in `display`, no eyebrow.
1. **Journey Markers** — 3×2 grid of `StatTile`s in a teal/fern checkerboard (Sets completed, Levels gained and Countries are `fern`, the rest `teal`): Sessions (flame),
   Sets completed (barbell), Personal bests (trophy), Levels gained (trending-up), Places
   (location), Countries (globe). The icon and label say what each counts. Numbers in
   `hero`-size condensed.
2. **Logbook** — the month calendar. Rounded 40pt cells on `surface`, focus-colored cell tint
   for trained days with the existing emoji markers, travel and planned rest days (🛌) light-gray-tinted, today with a teal
   ring, untrained days plain `surface` (neutral, never empty-looking-bad). Weekday header in
   `eyebrow`. Tap a day → the day-marker `Sheet` (same options).
3. **Trails** (the progression board, renamed in UI copy only). One card per family:
   - Left: family name (`h2`), current exercise (`small`, text2).
   - A **rung track**: N small nodes on a horizontal line, nodes below current filled sky,
     current node larger with glow, top node a flag icon (the summit). Label "LEVEL 3 OF 7".
     Mastery = whole track gold + "SUMMIT" chip.
   - Right: `ProgressRing` (56pt, sky gradient) with the sessions-to-next number inside and
     "to next level" caption beneath — still the loudest thing on the row.
   - **Chart** (`TrailProgressChart`): once the trail has a measured session, a 140pt
     `ProgressChart` sits under the level line with a small **Progress / Best set** `Chip` toggle
     (sky, `board-chart-mode-*`); Progress is the default. There is no separate trail page.
     - **One graph per level.** Two levels never share a line: moving up a rung means a harder
       exercise and fewer reps, which read as a regression even with a tick marking it. A pager
       row above the plot titles the page "Level 2 · Pull-up" (`h3`, anchor exercise) over
       "4 sessions · Jan 4 – Feb 1" (`caption`, `text3`), with plain `sm` ‹ › `IconButton`s
       (`board-level-prev/next-*`, disabled — `text3` — at either end, hidden when only one level
       has sessions). Pages are the levels with sessions, easiest → hardest; the card opens on
       the level of the latest session. The chosen mode carries across pages.
     - **Progress**: steps up this level (`ladderPosition().stepsInRung`: reps -> band -> tempo
       -> rest -> sets), zero-based, so a heavier band with fewer reps reads as a step forward.
       One colour, one line; tap readout "Rung 3 · B3 × 8 reps · 3 sets" (bodyweight: no band;
       timed: seconds). Unplaceable sessions are a gap, never a zero. It may dip if a session was
       performed lower and is drawn without any decline styling.
     - **Best set**: reps or seconds at this level. The line breaks and changes colour wherever
       the band (or sibling exercise) changes, with a legend per colour, a dashed tick labelled
       with the band ("B3", quieter text, drawn inside the plot), and a readout "8 reps @ B3".
     - The toggle is hidden (Best set only) on a level where no session can be placed on the
       ladder; a level with no counted sets says so in a `caption` instead of an empty plot.
   - An **Adjust** `quiet` button (`board-adjust-${familyId}`) expands the row to reveal the
     existing Too easy / Too hard controls and their two-step confirms, unchanged in behavior.
     Collapsed by default: the board is for looking; adjusting is occasional.
   - Zero-session explanation and level-up notice keep their copy, styled as a sky-tinted note. The whole Trails section (header, notes, rung
     track, rings, level line) is `sky`; plum `summit` stays on level-ups elsewhere.
4. **Passport** — the passport finally has a purpose: **collecting stamps.** Header "PASSPORT"
   with "4 places · 2 countries" and a Share icon button. Body is a wrapping
   grid of `Stamp`s, one per place, titled "Bend, OR, USA" (city, state/province abbreviation when the geocoder
   abbreviates it, country as a 3-letter code; parts missing on older pins are dropped). Seeded by
   that label, so each place always gets the same shape, color and tilt. Opt-in state: a `Card` with three ghosted sample stamps and "Collect a stamp
   for every place you train" + a primary `sm` button "TURN ON PASSPORT".
5. **Muscle balance** — rows with a rounded gradient bar (trail), trailing 14 days, same data.

### 5.3 Field Guide (Exercises list)

- Title "FIELD GUIDE" + live count ("142 moves").
- Filters: a horizontally scrolling chip row of the active/most-used filters plus a "Filters"
  chip with a count badge that opens a `Sheet` holding every filter group. Clear-all in the sheet
  and inline when any filter is active.
- Rows: 52pt rounded-square **avatar** tinted by the exercise's first focus color, with an icon
  for its movement pattern (push → arrow-forward, pull → arrow-back, squat/hinge → body, core →
  ellipse, carry/cardio → pulse…; one map in the file). Name `h3`, primary muscle `small` text2,
  right side a `×12` teal chip for times completed; no-video / disabled as muted `Chip`s.
  Disabled rows at 50% opacity.

### 5.4 Exercise detail

- **Header**: full-bleed hero band (~200pt) with the focus-color gradient + TopoPattern; name in
  `display`, subtitle and aliases beneath.
- Two `StatTile`s: Times completed, Last performed.
- Pinned note (gold-tinted sticky-note card).
- Sections as `Card`s with an icon + eyebrow header: How to, Demo, Progress (chart toggle
  **Progress / Best set / Total volume**, gain lines use `Chip`s), Details. Progress (ladder
  position, as on the Trail cards) leads only for an exercise on a progression family with
  placeable sessions; warm-ups and cool-downs have no ladder, so they hide it and open on Best set.
  Best set is band-aware here too (new colour and a band tick at each band change, "8 reps @ B3").
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
  explanation text in `small` text2 below. Swap notice shows as a fern toast/pill.
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

Spotify controls: a compact dark pill row directly under the bar. Its browse button opens a
bottom `Sheet` whose root level is a horizontally scrolling row of vibe `Chip`s (multi-select;
"Anything" and the genres are mutually exclusive) above a `SectionList`: **Favorites** (expanded),
**Recently played** (collapsed, header shows the count) and **Fresh picks** (refresh `IconButton`
in its header). Favorites/Recents headers are tappable rows with a chevron and are hidden when
empty. Every playlist row: tap plays, heart toggles favorite, chevron previews tracks.

**Exercise phase (reps)** — a hero `Card` with a 2px gradient border in the section's color:
- Level badge as a summit `Chip` ("LVL 3 · HORIZONTAL PUSH") top-left.
- Exercise name in `display`, up to 2 lines, `adjustsFontSizeToFit`.
- Set row: `Pips` for the sets + "SET 2 OF 4" eyebrow; existing prev/next set chevrons.
- Anchor badge + band picker as a row of chips. The band is the large swatch (`BandChip size="lg"`):
  the whole chip filled with the band's own colour, "BAND" caption + `h2` label in `textToneOn` ink,
  so which band to grab reads at arm's length. Approval and Summary keep the small dot chip.
- **The rep counter is the centerpiece**: `mega` numeral, with 64pt circular −/+ buttons on each
  side, "REPS" eyebrow above and "target 12" caption below. Tapping the numeral still edits it.
- **COMPLETE**: `Button lg primary`, full width, 72pt tall, check icon, label "COMPLETE SET".
  On press: `impactMedium`, the current pip pops, and a `Toast` rises from the button with a
  line from the set-complete pool (§6). Last set of an exercise → `notificationSuccess` and the
  "exercise done" pool.
- Secondary actions: a row of three labeled `IconButton`s — Undo (rewind), Swap, Skip.
- Pinned note above the hero (gold sticky card), How-to (open by default) and demo media below
  it, each a `Card`.

**Exercise phase (timed)** — same hero, but the centerpiece is a 240pt `ProgressRing` (trail
gradient on section color track) with the `mega` countdown inside and "SEC" eyebrow; caption
below ("Tap to start" / "Tap to finish early"). −/+ duration buttons flank the ring before it
starts. Final 3 seconds: ring and numeral `pulse`, light haptic each second.

**Rest phase** — the whole hero shifts to the **fern** mood (fern gradient border, fern
ring) so rest is unmistakable at a glance from across a room:
- Eyebrow `REST`, a line from the rest pool ("Shake it out.") in `h2`.
- 220pt fern `ProgressRing` with the countdown in `mega`.
- −15s / +15s / Skip as secondary pill buttons.
- "How did that set feel?" + FeedbackControls as a 3-segment control (text labels kept;
  Too easy = fern, Just right = teal, Too hard = summit when selected — no red).
- `Button lg primary` "NEXT".
- **Up next** `Card`: eyebrow `UP NEXT`, name `h2`, anchor chip + the large band swatch, How-to and demo (open).

**Paused**: the hero dims to 55% and a `Chip` "PAUSED" pulses gently next to the clock; the
paused-completion nudge becomes a `Sheet`.

### 5.8 Debrief (Summary, before FINISH) — Summit

Problem today: it's hard to read at a glance and wastes space. Fix: **one screen, one glance,
one button.**
- Header: eyebrow `DEBRIEF`, title "{FOCUS} · {N} MIN", and a row of three compact `StatTile`s
  computed from what's already on screen: Sets done, Exercises, Reps/holds logged (additive
  counts only — never "of planned").
- **Exercise rows** (dense): name `h3` on the left, a wrapping row of 30pt rounded set squares on
  the right: completed = teal fill with the rep/second count inside in `ink`; skipped = `text3`
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
**heavy purple theme**. So: this phase is a re-skin into Midnight, **not** a calming-down.
Every animation beat, sound, haptic, shake, re-burst-on-tap and Reduce Motion behavior stays
exactly as choreographed today (`completionTimeline.ts`). Do not remove, shorten or soften any of
them; if anything, the new palette should make them pop harder.

The purple comes from: the solid `#5b21b6` screen background, the violet level bar / level chip /
share-button text in `HighlightCard`, and the lilac stat labels in `AnimatedStatCounter`. All of
it goes. **No violet surfaces or violet-dominant elements on this page** — `summit` is not used
here at all.

- **Background**: `bg` night base with the drifting glow orbs recolored to **teal and
  gold** (two gold orbs; big, soft, ~35–45% opacity) so the whole screen reads as a warm sunset bloom, not a
  flat color. Optional third orb in fern at low opacity for depth.
- **Sunburst rays**: gold at two low opacities, still spinning.
- **Hype headline**: keeps the stamp-in, word-by-word slam and bounce. Barlow Condensed 800,
  `display`/`hero` scale, uppercase; words in `text` with the accent word in `gold` (`stamp.fill`), and a teal
  text-shadow glow so it looks stamped in light.
- "You just finished your 12th workout on RoamFit!" in `h2`, then "32 min · upper" in `small`.
- **Stat chips**: keep the tile-by-tile pop-in and count-up. 2×2 grid of `StatTile`-style
  chips: `surface` at ~85% opacity over the glow, 1px `line` border, numerals in `hero`
  condensed `text`, labels in `eyebrow` gold. Tighten vertical spacing so headline + stats +
  the first highlight are visible without scrolling on a 6.1" phone.
- **Highlights** (level ups / best sets): keep the stamped reveal beat with its own sound, haptic,
  shake and confetti pop. Card = `surface` with a 2px `golden` gradient border; a `Stamp`
  ("LEVEL UP" in teal / "BEST SET" in gold) on the left stamps in on the reveal; level bar
  fills with the `trail` gradient; share is an `IconButton` (share icon), not violet text.
- **Quiet milestones**: small gold `Chip`s, wrapping.
- **Confetti**: same physics, cannons and pops, palette → teal, tealDeep, gold, fern,
  sky, rose, `text` white. No violet.
- **"Heck yes! 💪"**: keeps its entrance and endless pulse, now `Button lg primary` (trail
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
  low opacity, `ROAMFIT` wordmark in `hero` teal, tagline "TRAIN ANYWHERE." in `eyebrow` gold,
  the disclaimer in a `Card`, and `Button lg primary` "I UNDERSTAND".
- **Loading states**: a centered teal `ActivityIndicator` on `bg` — never a white screen. Screen
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
  dark pill, Spotify green is allowed *only* as the logo/brand dot; its browse sheet is vibe chips
  over Favorites / Recently played / Fresh picks sections, with a heart on every playlist row), `FeedbackControls`,
  `HighlightCard`, `AnimatedStatCounter`, `HypeHeadline`, `CelebrationBackdrop`, `ConfettiBurst`
  (palette → teal/gold/summit/fern/sky), `OptionPicker` (restyle or delete if unused).
- **Keyboard accessories** (Summary "Done", Workout/Approval inputs): `surface2` bar with an
  teal "Done".
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

## 8. Daybreak — the light mode

Midnight is unreadable in direct sun: dim surfaces and mid-luminance text drown in glare.
Daybreak keeps everything that makes the app *RoamFit* — Barlow highway-sign type, the travel
motifs, the trail CTA, the three moods, the copy — and changes only the light it is seen in.

**The metaphor:** a paper trail map in your hand at noon. Warm paper ground, near-black ink, contour
lines printed in sepia, and accent panels with white legends — the way a highway sign (white on
green), a trailhead marker or a park sign is built to be read in full sun from arm's length.

### 8.1 Palette

Same token names as Midnight; only values change. Contrast ratios are measured and asserted in
`theme.test.ts`.

```ts
// Surfaces — warm map paper. Cards are lighter than the ground, and lift with a soft shadow.
bg:         '#F6F0E4'
surface:    '#FFFDF8'
surface2:   '#EFE7D8'   // wells, inputs, chips, nested cards
surface3:   '#E3D8C4'   // pressed / highlighted
line:       '#D6C9B2'
lineStrong: '#B3A288'

// Text — printer's ink, warm not blue
text:  '#1A130C'   // 16.2:1 on bg
text2: '#4A4036'   //  8.9:1
text3: '#6B6052'   //  5.4:1 — still AA, because "muted" outdoors is "invisible"

// Accents — deepened so each is ≥ 4.5:1 as text on bg AND carries a white legend as a fill
teal:     '#004C54'   // Midnight Green; 8.6:1 on bg; white on it 9.7:1
tealDeep: '#003A40'
gold:      '#8F5A00'   // brass — reads as gold on paper, unlike a yellow
fern:     '#217515'   // 5.8:1 white, 5.1:1 on bg, 4.6:1 on its own tint
sky:       '#1A5FC2'
summit:    '#7E2BB0'   // plum; 7.3:1 white, 6.5:1 on bg, 6.0:1 on surface2
rose:      '#BF1D63'   // still cardio-only, still never an error
```

**`ink` changes meaning slightly.** It was always "the text on an accent fill". In Midnight the
fills are bright, so it is near-black; in Daybreak the fills are deep, so it is **white
(`#FFFFFF`)**. Every `color="ink"` call site is therefore correct in both modes without change —
the "never white on teal" rule is a Midnight rule (bright teal); Daybreak's deep teal wants
white. Two **mode-invariant** tokens cover content on colors that do *not* change with the theme:
`fixedInk` (`#170B03`) and `fixedPaper` (`#F7F3EA`) — band swatches (real-world colors, user data),
anything over video/imagery.

**`vivid`** — the Midnight accent hexes, exported unchanged in *both* modes, for purely
decorative color with no text on it: confetti, celebration orbs, the sunburst, the headline's stamp
shadow. Deep confetti looks like dirt; vivid confetti on paper looks like a sunny day.

**`backdrop`** (Sheet scrim): Midnight `rgba(5,7,10,0.72)`, Daybreak `rgba(26,19,12,0.40)`.

### 8.2 Gradients

Deepened in the same proportion as the accents so white legends hold ≥ 4.2:1 at every stop (all
gradient text is large/bold):

```ts
trail: ['#003F46', '#0A5C66']
golden:  ['#8F5A00', '#A46D00']
fern:   ['#1C6911', '#248217']
summit:  ['#6A22A0', '#8E3BC4']
night:   ['#FFFDF8', '#F6F0E4']   // card sheen: surface -> bg
```

`onGradient(tone)` returns the legend color for a hero in the current mode: always `ink`
(near-black on Midnight, white on Daybreak). Midnight's plum summit gradient holds `ink` at >= 4.9:1
(paper would be 1.9:1 on its light end), so the old summit → `fixedPaper` exception is gone.

### 8.3 Depth, glow, texture

- **Elevation exists in Daybreak.** Shadows work on paper, and in glare a hairline alone vanishes
  (surface vs bg is only 1.12:1). `elevation.card` = `shadowColor '#5A4126'`, opacity 0.10,
  radius 12, offset y 4 — applied to `Card` (plain/accent), `Sheet`, `StatTile`, the tab bar.
  Midnight's `elevation.card` is `{}` (no drop shadows on dark, unchanged).
- **Where elevation does not apply.** Hero cards (`Card` `hero`) cast no shadow: they clip with
  `overflow: hidden`, and their gradient carries the depth. `Toast` takes `elevation.card`. The
  `Switch` thumb is `fixedPaper` plus `elevation.card` (Daybreak `text` is ink, which would make a
  black thumb).
- **Tints are 8% alpha in Daybreak** (15% on Midnight): at 15%, accent text on its own tint over
  `bg` falls to 3.9–4.3:1 for teal/gold/fern/sky/rose; at 8% every accent holds ≥ 4.5:1 over
  `surface` and `bg`. Asserted in `themes.test.ts`. Teal's Daybreak `#004C54` holds 7.5:1 on its own 8% tint over `bg`.
- **Calendar day cells fill with the vivid hue.** A deep accent washed over paper goes muddy (the
  Logbook read as greyed-out at 20%), so Daybreak `dayCell[tone]` = `vivid` at 40% alpha, bordered
  by the deep accent at 70%. The date numeral (`text`) stays >= 7:1 on every marker fill. Golden
  Hour is unchanged: the accent itself at 20%, border at 55%. Used by `DayCell` (Logbook and the
  Today week strip). Asserted in `themes.test.ts`.
- **Glow is tamed.** A colored 18pt bloom on paper reads as a smudge. Daybreak `glow(color)` =
  opacity 0.28, radius 10, offset y 4 — a colored lift, not a halo. Same call sites.
- **Topo contours are printed sepia.** `topo.color` `#3B2410` at `topo.strength` 1.3× the seeded
  opacity (Midnight: `text`, 1×). Sepia reads on both paper and the deep hero gradients.
- **Completion's stamped headline** (the screen the user loves) keeps its construction, swaps its
  inks: Midnight fill `gold` / hard shadow `tealDeep` / teal glow; Daybreak fill `teal` (deep) /
  hard shadow `vivid.gold` / no glow — a two-color screenprinted poster. Exposed as `stamp.fill`,
  `stamp.shadow`, `stamp.glow` (`null` = none).

### 8.4 Mechanism

- `theme/palettes.ts`: `midnight` and `daybreak`, each a complete `Palette` (identical key sets,
  asserted). `theme/buildTheme.ts`: `buildTheme(scheme)` → a frozen `Theme`:
  `{ scheme, colors, vivid, tints, gradients, accentGradient, section, focus, setState, dayMarker,
  dayCell, trainedColor, onGradient, heroCta, glow, elevation, topo, stamp, statusBar, navTheme,
  headerOptions }`. `onGradient(tone)` returns a color token *name* (`'ink' | 'fixedPaper'`), not a
  hex; `heroCta` is the token name of the Home hero pill's legend (Midnight `gold`, Daybreak
  `teal`). No scattered `scheme === ` color checks: add a
  Theme field instead.
  Two instances, built once at module load.
- `ThemeProvider` resolves a **preference** (`'system' | 'light' | 'dark'`) with RN's
  `useColorScheme()` and provides the `Theme`. `useTheme()` reads it; the context default is the
  Midnight theme, so a component rendered without a provider (most existing tests) behaves
  exactly as today.
- `makeStyles(factory)` → a hook. `const useStyles = makeStyles((t) => ({ ... }))` at module scope,
  `const styles = useStyles()` in the component. Cached per `Theme` instance, so each factory runs
  at most twice per app lifetime. This is the one pattern for themed styles — replace a module-level
  `StyleSheet.create` that reads colors with it; a `StyleSheet.create` with no color stays as is.
- `<Txt color>` / `<Icon color>` take token names and resolve them through `useTheme()`, so the
  hundreds of `color="teal"` props are themed for free.
- Switching is **live** — no reload. Every themed style is a hook, so a preference change re-renders
  the tree with the other palette, mid-workout included.
- **Persistence:** `users.theme_preference TEXT NOT NULL DEFAULT 'system'` (migration 0022), through
  `usersRepo` like every other setting (`themePreference` on `UserRecord` / `UserPatch`). Read
  synchronously at provider mount (op-sqlite is sync), so the first frame is already right.
- **Native chrome follows:** `StatusBar` style from `theme.statusBar`, `NavigationContainer` gets
  `theme.navTheme` (Daybreak built on React Navigation's `DefaultTheme`), stack `headerOptions`
  from the theme, `TextInput`s get `keyboardAppearance` from the scheme, `app.json`
  `userInterfaceStyle: "automatic"` (native — takes effect after a dev-client rebuild). The splash
  stays Midnight `bg` (one static image; noted in BACKLOG with the icon art).

### 8.5 Where you switch

- **Settings → Appearance** (first group, above Training): a three-way picker made of three `Chip`s (`SegmentedBar` is a progress bar, not a selector; testIDs `appearance-system|light|dark`) — *System* /
  *Daybreak* (sun icon) / *Midnight* (moon icon) — with the caption "Daybreak is built for
  training outdoors in full sun. System follows your iPhone, which can switch at sunset."
- **Active Workout top bar:** a sun/moon `IconButton` (`theme-toggle`). This is the point of the
  feature: you walk out into the courtyard mid-session and the screen is unreadable — one tap, no
  leaving the workout. It sits on the left beside Home so the clock and the pause/stop group keep
  their width. It sets an explicit `light`/`dark` preference (persisted). Accessibility label
  "Switch to Daybreak" / "Switch to Midnight".

### 8.6 Rules

- Never read a color at module scope. `colors`, `tints`, `gradients` and the semantic maps are no
  longer exported as statics (deleted at the end of track 22) — read them from `useTheme()`.
- Pure `lib/` code returns token *names* (`AccentName`, `ColorName`), not hex, and lets the
  component resolve them; where it must return a color it takes the `Theme` as an argument.
- Every new color decision is made for both palettes at once. A screen is not done until it has been
  looked at in both.
