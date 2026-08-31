# Wave 5 — Motivation surfaces

**Track id:** `5-motivation` · **Status file:** `docs/handoff/STATUS-5-motivation.md`
**Spec sections to read:** §14 (all), §6.4, §6.7, §9.1–§9.4, §9.6–§9.10, §10.1. Do not read the
whole spec.

§9 is the app's stated thesis. §14: *"The dashboard's job is not to report. It is to make the
next workout feel worth doing."*

## The governing rule, which overrides convenience everywhere in this wave

**Every element either accumulates monotonically or points at a concrete next action. Nothing on
these screens can shame.** (§14, §1.1)

Concretely: no daily streaks — §9 says a broken streak is the single most common churn event in
consumer fitness, and this app's user has 14-hour flights. Untrained days are **neutral**, never
red or empty-looking. An OVER-WORKED flag is styled in the same register as everything else —
it explains a recommendation, it does not scold one. No guilt copy anywhere.

## Scope

| § | Element | Notes |
|---|---|---|
| 14.1.3, 6.4 | **Next Unlock** | *"Push-ups: 2 sessions from archer push-ups."* The most important motivational element in the app — the direct answer to "why open this tomorrow." |
| 14.1.4, 6.4 | **Progression board** | Every family, level badge, micro-ladder progress, next unlock. Maxed families get the §6.7 Mastery treatment, marked distinctly — never a "Level 9 of 9" that reads as a ceiling. |
| 9.1 | **Weekly targets** | Rolling 7-day window, `● ● ○` dots not a bar, never red. Week streak = consecutive weeks hit. After 4 weeks, *suggest* a new target (bounded 1–7), never apply silently; a declined suggestion waits 4 weeks. |
| 9.3 | **Travel days** | One tap "I'm in transit." Reduces that week's denominator by one, floor of 2. **Auto-suggested on device timezone change** — Wave 3 already records the tz-change signal; consume it. |
| 9.4 | **Comeback path** | Wired in Wave 3; surface the copy. *"Welcome back — let's ease in."* No mention of the gap's length, no apology requested. |
| 9.9 | **Recovery Week** | Mechanism is wired and tested (issue #12). **Build the missing auto-suggest trigger**: every 6–8 weeks of consistent training, plus a manual toggle in settings. Counts toward the weekly target as normal — credited, not penalized. |
| 9.6 | **Passport** | World map, pinned cities, city/country counts. Opt-in. City and country **strings only** — never coordinates, never continuous location. Offline completion queues the lookup and pins it against the session's `local_date`, not the resolution date. |
| 9.7, 6.4 | **Milestones & level-up** | Level-up is a celebrated, unmissable full-screen moment at completion, before anything else. Mastery best-set PRs are celebrated the same way. |
| 14.1.6 | **Calendar heatmap** | Trained days shaded by length, travel days marked, untrained days neutral. |
| 14.1.7, 14.3 | **Muscle balance** | Hard sets per muscle group over trailing 14 days, horizontal bars. This is the hero volume metric. |
| 14.1.8–9 | **Lifetime counters & estimate accuracy** | All monotonic, all permanent. *"Your sessions finish within 8% of the estimate."* |
| 9.5 | **Quick Session** | Wave 4 built the button; make sure it stays equal in prominence to the main CTA. |
| 9.8 | **Notifications** | Adaptive to the **observed** training window. Max one per day. Quiet hours, device tz. Never guilt-based; loss-aversion framing is allowed and preferred. Sunday weekly summary. |
| 9.10 | **Share cards** | One-tap native share sheet on level-up, milestones, passport, weekly summary. Built entirely from data already on screen — a render step, not a feature. Never auto-posts. |

## §14.2 cold start — a hard requirement

**The dashboard must never look empty.** With zero sessions it shows the full progression board at
starting levels, an explanation that the first sessions calibrate them, and the Today card. The
passport and calendar appear only once they have something to show. Test the zero-session state
explicitly; it is the state every new user sees first.

## Carried-forward issues assigned here

- **#11** — Recovery Week's ~20% volume cut currently runs as a post-generation pass in the store.
  Consider giving the engine an explicit volume-multiplier input instead, and promote to an ADR.
- **#12** — the Recovery Week auto-suggest heuristic (above).
- **#4** — `hamstring-curl`/`tke` are tagged `hip_extension` because §4.1's pattern enum has no
  knee-flexion bucket. Confirm harmless or fix.
- **#5** — conditioning finishers forced to `tier: fill`; confirm the engine treats them sensibly.

## Architecture

Read from the store's rolled-up stats (Wave 3 maintains them incrementally). **Do not recompute
over full history** — §11.3 flags read cost, and rolled-up reads are what keep the dashboard
instant offline. No business logic in components; no new persistence logic.

## Done criteria

- [ ] Every §14.1 element present, in order, working offline.
- [ ] Zero-session dashboard is meaningful and never empty-looking.
- [ ] Level-up and Mastery PR celebrations fire at completion; share cards export.
- [ ] Weekly target dots, travel days, comeback copy, Recovery Week suggestion all correct.
- [ ] Passport stores strings only; offline completion queues and pins to `local_date`.
- [ ] A grep for guilt copy, red styling on untrained days, or any daily-streak concept finds
      nothing.
- [ ] `npm run check` green; issues #4, #5, #11, #12 resolved or explicitly re-filed.
