import { createCountdownController, createStopwatchController } from './wallClockTimer';
import type { Clock } from './wallClockTimer';

/** A controllable fake clock — tests set `.value` directly rather than calling any timer API,
 *  so a "tick" in these tests is "time passed in the real world," not "a JS interval fired." */
function fakeClock(startMs: number): Clock & { value: number } {
  return {
    value: startMs,
    now() {
      return this.value;
    },
  };
}

describe('createCountdownController — wall-clock, not tick-based (§10.8)', () => {
  it('reflects a real 90s gap that elapsed with NO ticks in between (simulated suspension)', () => {
    const clock = fakeClock(0);
    const timer = createCountdownController(120_000, clock); // 2:00 rest
    timer.start();

    // One normal read shortly after starting — nothing suspicious yet.
    clock.value = 5_000;
    expect(timer.remainingMs()).toBe(115_000);

    // The device is now backgrounded/locked. In a real device, no JS timer callback fires at
    // all while suspended — there is no "tick" event to advance a counter. We model exactly
    // that: jump the clock forward by 90 real seconds in a single step, then ask for the
    // remaining time exactly once, as `AppState` becoming 'active' again would.
    clock.value = 5_000 + 90_000;
    expect(timer.remainingMs()).toBe(120_000 - 95_000); // 25_000 — correct despite zero ticks

    // A tick-counting implementation (decrementing once per interval callback) would have
    // logged zero decrements during the suspension and so would still show ~115_000 here —
    // this assertion is the one that would fail under that bug.
    expect(timer.remainingMs()).not.toBe(115_000);
  });

  it('a suspension longer than the remaining time clamps to zero, not negative', () => {
    const clock = fakeClock(0);
    const timer = createCountdownController(30_000, clock);
    timer.start();
    clock.value = 10_000_000; // absurdly long suspension
    expect(timer.remainingMs()).toBe(0);
    expect(timer.isComplete()).toBe(true);
  });

  it('+15s / -15s adjustments are wall-clock offsets, immune to the same suspension gap', () => {
    const clock = fakeClock(0);
    const timer = createCountdownController(60_000, clock);
    timer.start();
    clock.value = 50_000; // 10_000 left
    timer.addMs(15_000); // Skip/extend tap
    expect(timer.remainingMs()).toBe(25_000);
    expect(timer.extendCount()).toBe(1);

    // Suspend again for a real 20s with no ticks, then read.
    clock.value = 70_000;
    expect(timer.remainingMs()).toBe(5_000);

    timer.addMs(-15_000);
    expect(timer.remainingMs()).toBe(0); // clamped, not negative
  });

  it('pause/resume freezes the display and excludes paused time from the countdown', () => {
    const clock = fakeClock(0);
    const timer = createCountdownController(60_000, clock);
    timer.start();
    clock.value = 10_000; // 50_000 left
    timer.pause();
    expect(timer.isPaused()).toBe(true);
    expect(timer.remainingMs()).toBe(50_000);

    // Real time passes while paused (e.g. a phone call interrupts the workout) — must NOT
    // count against the rest period.
    clock.value = 40_000;
    expect(timer.remainingMs()).toBe(50_000); // still frozen

    timer.resume();
    expect(timer.remainingMs()).toBe(50_000); // unchanged immediately after resume
    clock.value = 45_000; // 5s of real countdown after resuming
    expect(timer.remainingMs()).toBe(45_000);

    expect(timer.pauseCount()).toBe(1);
    expect(timer.pausedDurationMs()).toBe(30_000); // §8.3 signal
  });

  it('never started reports the full duration', () => {
    const clock = fakeClock(0);
    const timer = createCountdownController(45_000, clock);
    expect(timer.remainingMs()).toBe(45_000);
    expect(timer.isRunning()).toBe(false);
  });
});

describe('createStopwatchController — timed-exercise "actual seconds held" (§10.5)', () => {
  it('records real elapsed time across a suspension gap, not tick count', () => {
    const clock = fakeClock(0);
    const stopwatch = createStopwatchController(clock);
    stopwatch.start();
    // Suspended for a real 12.4s with no ticks in between.
    clock.value = 12_400;
    const elapsed = stopwatch.stop();
    expect(elapsed).toBe(12_400);
    expect(stopwatch.isRunning()).toBe(false);
  });

  it('stop() is idempotent — returns the same frozen value on repeated calls', () => {
    const clock = fakeClock(0);
    const stopwatch = createStopwatchController(clock);
    stopwatch.start();
    clock.value = 5_000;
    expect(stopwatch.stop()).toBe(5_000);
    clock.value = 9_000; // time keeps moving in the world, but the watch is stopped
    expect(stopwatch.stop()).toBe(5_000);
    expect(stopwatch.elapsedMs()).toBe(5_000);
  });
});
