/**
 * §10.8 — "Timers are wall-clock based, not tick-based... backgrounding, locking, and
 * suspension must never drift the count." A `setInterval` tick counter drifts the moment the JS
 * thread is suspended (backgrounded/locked): if you decrement a counter once per tick, any
 * ticks the OS didn't let fire are simply lost, and the displayed time is wrong on resume.
 *
 * This controller is deliberately pure (no React, no timers of its own, no I/O) so it's
 * unit-testable in plain node exactly like `packages/engine` — the only design that lets a test
 * actually simulate suspension: jump the injected clock forward by a large amount *between two
 * calls*, with no tick in between, and assert `remainingMs()` still comes out right. It holds
 * one fact of state — an absolute target instant (`endAt`, in the clock's own units) — and every
 * read re-derives "how much is left" from `endAt - clock.now()`. However long the JS thread was
 * actually suspended between two reads, the arithmetic is correct the instant it runs again;
 * there is no per-tick counter to lose ticks from.
 */

export interface Clock {
  now(): number; // milliseconds, monotonic-enough (Date.now() semantics)
}

export const systemClock: Clock = { now: () => Date.now() };

export interface CountdownController {
  /** Milliseconds remaining right now (0 once expired). While paused, returns the frozen
   *  remaining value rather than continuing to count down. */
  remainingMs(): number;
  isRunning(): boolean;
  isPaused(): boolean;
  isComplete(): boolean;
  start(): void;
  pause(): void;
  resume(): void;
  /** `+15s`/`−15s` (§10.7). Positive extends, negative shortens; clamped at 0. */
  addMs(deltaMs: number): void;
  /** §8.3 pause signal — total ms spent paused so far, for `set_logs.paused_duration_sec`. */
  pausedDurationMs(): number;
  /** §8.3 pause signal — how many times this timer was paused, for `set_logs.pause_count`. */
  pauseCount(): number;
  /** §8.3 — how many `+15s` taps occurred, for `set_logs.rest_extended_count`. Only positive
   *  `addMs` calls count; a `−15s` tap does not. */
  extendCount(): number;
}

export function createCountdownController(totalMs: number, clock: Clock): CountdownController {
  let endAt: number | null = null;
  let running = false;
  let paused = false;
  let pausedAt: number | null = null;
  let totalPausedMs = 0;
  let pauseCountVal = 0;
  let extendCountVal = 0;
  let remainingAtPause = totalMs;

  function liveRemaining(): number {
    if (endAt === null) return totalMs;
    return Math.max(0, endAt - clock.now());
  }

  return {
    remainingMs() {
      if (!running) return totalMs;
      if (paused) return remainingAtPause;
      return liveRemaining();
    },
    isRunning: () => running && !paused,
    isPaused: () => paused,
    isComplete() {
      if (!running) return false;
      return this.remainingMs() <= 0;
    },
    start() {
      endAt = clock.now() + totalMs;
      running = true;
      paused = false;
    },
    pause() {
      if (!running || paused) return;
      remainingAtPause = liveRemaining();
      paused = true;
      pauseCountVal += 1;
      pausedAt = clock.now();
    },
    resume() {
      if (!running || !paused) return;
      totalPausedMs += clock.now() - (pausedAt as number);
      endAt = clock.now() + remainingAtPause;
      paused = false;
      pausedAt = null;
    },
    addMs(deltaMs: number) {
      if (deltaMs > 0) extendCountVal += 1;
      if (paused) {
        remainingAtPause = Math.max(0, remainingAtPause + deltaMs);
        return;
      }
      if (endAt === null) return;
      endAt = Math.max(clock.now(), endAt + deltaMs);
    },
    pausedDurationMs: () => totalPausedMs + (paused && pausedAt ? clock.now() - pausedAt : 0),
    pauseCount: () => pauseCountVal,
    extendCount: () => extendCountVal,
  };
}

/** A count-*up* stopwatch for timed exercises (§10.5 "End early records actual seconds held") —
 *  same wall-clock-derivation principle, just counting away from a start instant instead of
 *  toward an end instant. */
export interface StopwatchController {
  elapsedMs(): number;
  isRunning(): boolean;
  start(): void;
  /** Stops the clock and returns the final elapsed ms — the "actual seconds held" to record. */
  stop(): number;
}

export function createStopwatchController(clock: Clock): StopwatchController {
  let startedAt: number | null = null;
  let stoppedElapsed: number | null = null;

  return {
    elapsedMs() {
      if (stoppedElapsed !== null) return stoppedElapsed;
      if (startedAt === null) return 0;
      return Math.max(0, clock.now() - startedAt);
    },
    isRunning: () => startedAt !== null && stoppedElapsed === null,
    start() {
      startedAt = clock.now();
      stoppedElapsed = null;
    },
    stop() {
      if (stoppedElapsed !== null) return stoppedElapsed;
      if (startedAt === null) return 0;
      const elapsed = Math.max(0, clock.now() - startedAt);
      stoppedElapsed = elapsed;
      return elapsed;
    },
  };
}
