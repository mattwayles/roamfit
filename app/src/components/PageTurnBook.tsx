/**
 * Track 39c - the page turn for the Passport book. `usePageTurn` owns the animation and the swipe;
 * `PageTurnLayers` draws the pages. The screen keeps owning `pageIndex` and hands in `onIndexChange`.
 *
 * Index timing: a button or contents-row turn commits the new index at the START (so the "Page N of
 * M" label, the disabled arrows and the tests settle at once) and animates the OUTGOING page as an
 * overlay. A swipe commits at the END, since the page follows the finger and may be let go of.
 * Either way `turn` ({from, to}) alone decides which pages are drawn, and input is ignored while a
 * turn runs. A jump of more than one page is one turn straight to the target, never a multi-flip.
 *
 * Forward: the `from` page (overlay) rotates away about its left (spine) edge, revealing `to`.
 * Backward: the `to` page (overlay) rotates back in over `from`. Both are one value `v` (0 = flat,
 * 1 = edge-on), so a drag can set it directly. Reduce Motion or a running screen reader: an instant
 * swap, no rotation. No new dependencies: plain `Animated` (native-driven) and `PanResponder`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { haptics } from '../lib/haptics';
import { useTheme } from '../theme';
import { useReduceMotion } from '../ui/useReduceMotion';

export const TURN_MS = 400;
/** A drag must be this clearly horizontal before the book claims the gesture (taps stay taps). */
export const SWIPE_CLAIM_DX = 10;
/** Fraction of the book width a drag must cover to turn on release. */
export const SWIPE_COMMIT_FRACTION = 0.3;
/** Release speed (px/ms) that turns the page regardless of distance. */
export const SWIPE_FLING_VX = 0.5;
const RUBBER_MAX = 28;

/** Claim the responder only on a clearly horizontal move. */
export function claimsSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_CLAIM_DX && Math.abs(dx) > Math.abs(dy);
}

export type SwipeDecision = 'next' | 'prev' | 'cancel' | 'bounce';

/** Drag left goes forward, right goes back. At an end the answer is `bounce`, never a turn. */
export function decideSwipe(a: {
  dx: number;
  vx: number;
  width: number;
  canNext: boolean;
  canPrev: boolean;
}): SwipeDecision {
  if (a.dx === 0) return 'cancel';
  const forward = a.dx < 0;
  const far = Math.abs(a.dx) / Math.max(1, a.width) >= SWIPE_COMMIT_FRACTION;
  const fling = Math.abs(a.vx) >= SWIPE_FLING_VX && a.vx < 0 === forward;
  if (!far && !fling)
    return forward ? (a.canNext ? 'cancel' : 'bounce') : a.canPrev ? 'cancel' : 'bounce';
  if (forward) return a.canNext ? 'next' : 'bounce';
  return a.canPrev ? 'prev' : 'bounce';
}

/** Resisted drag past the first/last page. */
export function rubberBand(dx: number): number {
  return Math.sign(dx) * Math.min(RUBBER_MAX, Math.abs(dx) * 0.3);
}

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      ?.then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

export interface TurnState {
  from: number;
  to: number;
}

export interface PageTurn {
  turn: TurnState | null;
  /** 0 = flat, 1 = edge-on. */
  v: Animated.Value;
  /** Sideways nudge for the rubber band at the first/last page. */
  rubber: Animated.Value;
  /** Turn (or, when `instant`, swap) to page `i`; ignored mid-turn and out of range. */
  goTo: (i: number) => void;
  panHandlers: object;
  onLayout: (e: LayoutChangeEvent) => void;
}

export function usePageTurn(opts: {
  index: number;
  last: number;
  onIndexChange: (i: number) => void;
}): PageTurn {
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReader();
  const instant = reduceMotion || screenReader;
  const v = useRef(new Animated.Value(0)).current;
  const rubber = useRef(new Animated.Value(0)).current;
  const [turn, setTurn] = useState<TurnState | null>(null);
  const busy = useRef(false); // an animated turn is running (drag release included)
  const drag = useRef<TurnState | null>(null); // a finger is turning the page
  const dragged = useRef(0); // how far (0..1) the finger has turned the page
  const width = useRef(320);
  const live = useRef(opts);
  const instantRef = useRef(instant);
  useEffect(() => {
    live.current = opts;
    instantRef.current = instant;
  });

  const finish = useCallback((to: number) => {
    live.current.onIndexChange(to);
    drag.current = null;
    busy.current = false;
    setTurn(null);
    haptics.selection();
  }, []);

  const animate = useCallback(
    (from: number, to: number, ms: number) => {
      busy.current = true;
      Animated.timing(v, {
        toValue: to > from ? 1 : 0,
        duration: ms,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => finish(to));
    },
    [v, finish],
  );

  const goTo = useCallback(
    (target: number) => {
      const { index, last, onIndexChange } = live.current;
      const to = Math.min(Math.max(target, 0), last);
      if (busy.current || drag.current || to === index) return;
      if (instantRef.current) {
        onIndexChange(to);
        return;
      }
      v.setValue(to > index ? 0 : 1);
      setTurn({ from: index, to });
      onIndexChange(to); // commit at the start; the outgoing page animates as an overlay
      animate(index, to, TURN_MS);
    },
    [v, animate],
  );

  const panResponder = useMemo(() => {
    const release = (g: PanResponderGestureState) => {
      const { index, last } = live.current;
      const d = drag.current;
      const decision = decideSwipe({
        dx: g.dx,
        vx: g.vx,
        width: width.current,
        canNext: index < last,
        canPrev: index > 0,
      });
      if (decision === 'bounce' || (decision === 'cancel' && !d)) {
        Animated.spring(rubber, { toValue: 0, useNativeDriver: true }).start();
        drag.current = null;
        return;
      }
      if (decision === 'next' || decision === 'prev') {
        const to = index + (decision === 'next' ? 1 : -1);
        if (!d) {
          // Reduce Motion / screen reader: the swipe just swaps.
          live.current.onIndexChange(to);
          haptics.selection();
          return;
        }
        drag.current = null;
        busy.current = true;
        animate(index, to, Math.max(120, TURN_MS * (1 - dragged.current)));
        return;
      }
      // cancel: let the page fall back where it came from.
      if (d) {
        busy.current = true;
        drag.current = null;
        Animated.timing(v, {
          toValue: d.to > d.from ? 0 : 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          busy.current = false;
          setTurn(null);
        });
      }
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !busy.current && claimsSwipe(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const { index, last } = live.current;
        const to = index + (g.dx < 0 ? 1 : -1);
        if (to < 0 || to > last) {
          rubber.setValue(rubberBand(g.dx));
          return;
        }
        rubber.setValue(0);
        if (instantRef.current) return;
        if (!drag.current || drag.current.to !== to) {
          drag.current = { from: index, to };
          setTurn({ from: index, to });
        }
        const p = Math.min(1, Math.abs(g.dx) / width.current);
        dragged.current = p;
        v.setValue(to > index ? p : 1 - p);
      },
      onPanResponderRelease: (_, g) => release(g),
      onPanResponderTerminate: () => release({ dx: 0, vx: 0 } as PanResponderGestureState),
    });
  }, [v, rubber, animate]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width || 320;
  }, []);

  return { turn, v, rubber, goTo, panHandlers: panResponder.panHandlers, onLayout };
}

/**
 * The pages for the current state: just `renderPage(index)` when idle, else the base page with the
 * turning page over it, both darkened a little by a plain animated-opacity `View`.
 */
export function PageTurnLayers({
  index,
  pageTurn,
  renderPage,
}: {
  index: number;
  pageTurn: PageTurn;
  renderPage: (i: number) => React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  const { turn, v, rubber } = pageTurn;
  const nudge = { transform: [{ translateX: rubber }] };
  if (!turn) {
    return <Animated.View style={[styles.fill, nudge]}>{renderPage(index)}</Animated.View>;
  }
  const forward = turn.to > turn.from;
  // Forward: `from` turns away over `to`. Backward: `to` turns in over `from`.
  const base = forward ? turn.to : turn.from;
  const over = forward ? turn.from : turn.to;
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;
  const rotateY = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });
  const overShade = v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });
  const baseShade = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });
  return (
    <Animated.View style={[styles.fill, nudge]}>
      <View style={styles.fill} {...(forward ? {} : hidden)}>
        {renderPage(base)}
        <Animated.View pointerEvents="none" style={[styles.shade, { opacity: baseShade }]} />
      </View>
      <Animated.View
        testID="passport-turn"
        {...(forward ? hidden : {})}
        style={[
          styles.over,
          { backgroundColor: theme.colors.surface },
          { transformOrigin: 'left center', transform: [{ perspective: 1400 }, { rotateY }] },
        ]}
      >
        {renderPage(over)}
        <Animated.View pointerEvents="none" style={[styles.shade, { opacity: overShade }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  over: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
  },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
});
