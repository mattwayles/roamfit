## Track: 39 — Passport book

Last updated: 2026-10-18

Stamps move off the bottom of Journey into their own Passport screen that looks and reads like a
passport book, with a page turn. Badges stay on their own screen; the two meet only on the
Passport's "Endorsements" page (the travel badges). This file is both the plan and the running
log. Sub-tracks run **in order**, one agent each: 39a → 39b → 39c → 39d.

### Done

- [x] Plan written (this file), branch `track-39-passport`
- [x] 39a data (57a981a): see exports below
- [x] 39b screen (bc44dd1 page model, 7f9f523 screen/route/opt-in card)

### In progress

- 39c not started.

### Next

1. ~~39a data~~ done.
2. ~~39b screen~~ done.
3. **39c page turn** — the flip animation, Reduce Motion, VoiceOver paging.
4. **39d wiring** — Journey teaser card replaces the stamp grid; Completion's new-stamp card opens
   the Passport at that stamp's page.

---

## Design

### Decisions (made with the user — do not re-litigate)

- **Separate Passport screen; Badges is not merged in.** Badges are goals with progress and locked
  states; stamps are a pure record of places. Mixing them turns the souvenir into a to-do list
  (invariant 4) and would bury badges behind the location opt-in.
- **The one bridge:** the travel badges (`series: 'cities'` and `series: 'countries'` in
  `packages/engine/src/badges/catalog.ts`) appear on an "Endorsements" page in the Passport, each
  tapping through to the Badges screen.
- **No new dependencies.** There is no Reanimated, gesture-handler or pager-view in the app. The
  page turn uses React Native's own `Animated` + `PanResponder` (or a paging `ScrollView`).
- **No migration.** Everything is derived from existing session rows (place fields + `local_date`).

### Book structure (page order)

1. **Cover** — "PASSPORT" / "Wanderlift", embossed look in the theme's colours.
2. **Bio page** — training since (first session's local date), places count, countries count,
   first stamp, most recent stamp.
3. **Contents** — countries, each with its place count, tapping jumps to that country's first
   visa page. Lets a 40-place passport stay navigable.
4. **Visa pages** — stamps in order of first visit, **6 per page**, each stamp showing its place
   label and entry date (first `local_date` there). Tapping a stamp shows a small detail (first
   visit, last visit, session count).
5. **Endorsements** — the cities and countries badge series, earned and in progress, using
   `BadgeEmblem`; neutral progress copy only.

### Rules

- **Never punish (invariant 4).** No "you haven't travelled" copy, no empty slots drawn as failures.
  An unfilled last visa page simply ends.
- **`local_date` for all dates (invariant 6).** Entry dates come from the session's `local_date`,
  never a UTC timestamp.
- **Opt-in respected.** Passport off → the screen shows the existing opt-in (sample ghost stamps +
  "Turn on Passport"), not an empty book.
- **Reduce Motion** → page change is a plain cross-fade or instant, no 3D turn.
- **VoiceOver** → each page is reachable without the swipe (accessibility actions or visible
  ‹ › page buttons), and announces "Page N of M".
- Both themes (Midnight, Daybreak). Match existing `ui/` components (`Screen`, `Txt`, `Card`,
  `Stamp`, `Sheet`, `IconButton`) and `makeStyles` theming.

### Key files

- `app/src/lib/dashboard.ts` — `PassportSummary` / `buildPassportSummary` (line ~157), `formatPlace`
- `app/src/lib/useDashboardData.ts` — `DashboardData.passport`
- `app/src/screens/JourneyScreen.tsx` — the Passport section (~line 801) and opt-in handler
- `app/src/ui/Stamp.tsx` — the stamp visual
- `app/src/screens/BadgesScreen.tsx`, `app/src/components/BadgeEmblem.tsx` — badge visuals
- `app/src/navigation/RootNavigator.tsx`, `app/src/navigation/types.ts` — routes
- `app/src/screens/SummaryScreen.tsx`, `app/src/components/NewStampCard.tsx` — Completion stamp

### Decisions / gotchas

- The user has **uncommitted changes in `docs/BACKLOG.md` and `package-lock.json`** that are not
  part of this track. Never stage them: commit with explicit paths, never `git add -A` / `git add .`
  / `git commit -a`. The orchestrator handles BACKLOG at the end.
- 39a exports, all in `app/src/lib/dashboard.ts`: `PassportEntry` {label, country, firstLocalDate,
  lastLocalDate, sessionCount}; `PassportCountryGroup` {country, placeCount, firstEntryIndex};
  `PassportSummary` now also has `entries` (first visit asc, ties by label), `trainingSince`,
  `countryGroups` (ordered by first entry; country-less places are NOT in groups, but are in
  entries); `PASSPORT_STAMPS_PER_PAGE` (6); `passportVisaPages(entries, perPage=6)` (0 entries = 0
  pages); `passportPageForLabel(entries, label, perPage=6)` returns the 0-based index among visa
  pages only (add the cover/bio/contents offset in the UI), or null. `local_date` was already
  `DashboardSessionSummary.localDate`; no data-path change was needed, and `useDashboardData`'s
  `passport` already returns the extended summary.

### 39b notes (for 39c and 39d)

- `app/src/lib/passportBook.ts`: `buildPassportBook(summary, shelf)` -> `PassportBookPage[]` (union:
  cover | bio | contents | visa | endorsements); `bookPageForLabel(summary, label)` and
  `bookPageForCountry(summary, country)` give absolute indexes (or null); `visaPageOffset`,
  `travelBadges`, `TRAVEL_BADGE_SERIES`. Contents only with 2+ country groups; endorsements only
  when the shelf has cities/countries badges (the shelf omits them while Passport is off).
- `app/src/screens/PassportScreen.tsx`: the screen owns `pageIndex` (state, `null` until the user
  pages, so the `stampLabel` start page applies once data loads) and `goTo(i)` (clamped). `index` is
  the derived current page. `<PassportPage page onOpenStamp onSelectCountry onOpenBadges />` is an
  exported, stateless renderer of one page; the book frame is `<View testID="passport-book">`
  (spine + the page). 39c: wrap the `PassportPage` in that frame in an animated view keyed on
  `index`, and keep the previous page rendered during the turn (hold a `prevIndex`). The prev/next
  `IconButton`s (`passport-prev`, `passport-next`) and the "Page N of M" label (live region) already
  exist; reuse them for the VoiceOver / Reduce Motion path.
- The empty (Passport on, no places) and off (opt-in) states render instead of the book; no paging.
- `components/PassportOptInCard.tsx` exports `PassportOptInCard`, `enablePassport(db)` and
  `SAMPLE_STAMPS`. JourneyScreen still has its own copy (handler ~line 314, card ~line 838, own
  `SAMPLE_STAMPS`); 39d should swap it for the card and delete the duplicates.
- Tests mock `useDashboardData` (`jest.mock`) with `buildPassportSummary` + `buildBadgeShelf`
  fixtures from `lib/passportBook.fixtures.ts`. With this RNTL, `await fireEvent.press(...)` is
  needed, or act() calls overlap and state updates are lost.
- Stamp captions use a short date (`Sep 3, 2026`); bio and the stamp sheet use `formatFullLocalDate`.
- Visuals not verified on a simulator (guilloche lines, emboss shadow, spacing, light theme).
