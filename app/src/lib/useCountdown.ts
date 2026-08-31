/**
 * Thin React binding over `createCountdownController` (see wallClockTimer.ts for why the
 * controller itself is wall-clock-derived and drift-proof). This hook only adds two things a
 * pure controller can't have: (1) a `setInterval` to force a re-render while the countdown is
 * visibly running, and (2) an `AppState` listener so the displayed number snaps to the correct
 * value the instant the app comes back to the foreground, rather than waiting for the next
 * interval tick (which itself would already be correct — this just makes it *feel* instant).
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createCountdownController, systemClock } from './wallClockTimer';
import type { Clock, CountdownController } from './wallClockTimer';

export interface UseCountdownResult {
  remainingMs: number;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  controller: CountdownController;
}

export function useCountdown(totalMs: number, clock: Clock = systemClock): UseCountdownResult {
  const controllerRef = useRef<CountdownController | undefined>(undefined);
  if (!controllerRef.current) {
    controllerRef.current = createCountdownController(totalMs, clock);
  }
  const controller = controllerRef.current;
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') forceTick((n) => n + 1);
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  // Deliberately re-derived on every render (the interval/AppState listener above forces
  // exactly that) — remainingMs must always reflect clock.now() at render time, not a memoized
  // stale value, so this is intentionally not wrapped in useMemo.
  return {
    remainingMs: controller.remainingMs(),
    isRunning: controller.isRunning(),
    isPaused: controller.isPaused(),
    isComplete: controller.isComplete(),
    controller,
  };
}
