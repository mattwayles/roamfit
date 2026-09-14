/**
 * Confetti for the session-completion screen (see SummaryScreen.tsx). Pure `Animated` API — no
 * new dependency, since the app has no confetti/lottie/reanimated library installed.
 *
 * Every piece is a tiny projectile: an origin, a launch velocity, and gravity. Its path is a real
 * parabola, sampled into an `interpolate` table over one 0→1 progress value, so the whole flight
 * still runs on the native driver (a transform, never a JS-thread layout tick). Three shapes of
 * burst come out of that one model:
 *   - `cannons` — two launchers at the bottom corners firing up and inward, the big opener;
 *   - `pop` — a radial explosion from one point (a level-up card landing, a tap on the headline);
 *   - `rain` — a slow drift down from above the top edge.
 * Each piece also flutters (a `rotateX` wobble) so it reads as paper catching air, not a falling
 * block. Fires once on mount; remount with a new `key` for another burst.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

const COLORS = [
  '#facc15',
  '#fb7185',
  '#38bdf8',
  '#4ade80',
  '#a78bfa',
  '#fb923c',
  '#f472b6',
  '#ffffff',
];
const SAMPLES = 12;

export type ConfettiVariant = 'cannons' | 'pop' | 'rain';

type Shape = 'rect' | 'circle' | 'streamer';

interface Piece {
  color: string;
  shape: Shape;
  size: number;
  x0: number;
  y0: number;
  /** px/s */
  vx: number;
  vy: number;
  /** px/s² */
  gravity: number;
  delay: number;
  duration: number;
  spin: number;
  flutters: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function basePiece(): Pick<Piece, 'color' | 'shape' | 'size' | 'spin' | 'flutters'> {
  const r = Math.random();
  return {
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: r < 0.5 ? 'rect' : r < 0.78 ? 'circle' : 'streamer',
    size: rand(6, 13),
    spin: rand(360, 1080) * (Math.random() < 0.5 ? -1 : 1),
    flutters: Math.round(rand(2, 6)),
  };
}

function makePieces(
  variant: ConfettiVariant,
  width: number,
  height: number,
  count: number,
  origin: { x: number; y: number } | undefined,
): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    if (variant === 'cannons') {
      const fromLeft = i % 2 === 0;
      const angle = (rand(58, 82) * Math.PI) / 180; // up and inward
      const speed = rand(height * 0.9, height * 1.55);
      return {
        ...basePiece(),
        x0: fromLeft ? rand(-10, 20) : width - rand(-10, 20),
        y0: height + 10,
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
        vy: -Math.sin(angle) * speed,
        gravity: height * 1.1,
        delay: rand(0, 220),
        duration: rand(2600, 3600),
      };
    }
    if (variant === 'pop') {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(180, 520);
      return {
        ...basePiece(),
        size: rand(5, 10),
        x0: origin?.x ?? width / 2,
        y0: origin?.y ?? height / 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 260,
        gravity: 900,
        delay: rand(0, 60),
        duration: rand(1400, 2100),
      };
    }
    return {
      ...basePiece(),
      x0: rand(0, width),
      y0: -30,
      vx: rand(-40, 40),
      vy: rand(40, 140),
      gravity: height * 0.12,
      delay: rand(0, 900),
      duration: rand(3000, 4400),
    };
  });
}

function ConfettiPiece({ piece }: { piece: Piece }): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);

  const { inputRange, xs, ys } = useMemo(() => {
    const seconds = piece.duration / 1000;
    const inputRange: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    for (let s = 0; s <= SAMPLES; s += 1) {
      const p = s / SAMPLES;
      const t = p * seconds;
      // Air drag on the horizontal so cannon shots slow and hang instead of flying off-screen.
      const drag = 1 - Math.exp(-2.2 * t);
      inputRange.push(p);
      xs.push((piece.vx / 2.2) * drag);
      ys.push(piece.vy * t + 0.5 * piece.gravity * t * t);
    }
    return { inputRange, xs, ys };
  }, [piece]);

  const translateX = progress.interpolate({ inputRange, outputRange: xs });
  const translateY = progress.interpolate({ inputRange, outputRange: ys });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${piece.spin}deg`],
  });
  const flutterInput = Array.from(
    { length: piece.flutters * 2 + 1 },
    (_, i) => i / (piece.flutters * 2),
  );
  const rotateX = progress.interpolate({
    inputRange: flutterInput,
    outputRange: flutterInput.map((_, i) => (i % 2 === 0 ? '0deg' : '75deg')),
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.02, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const dims =
    piece.shape === 'streamer'
      ? { width: piece.size * 0.35, height: piece.size * 2.6, borderRadius: 2 }
      : piece.shape === 'circle'
        ? { width: piece.size, height: piece.size, borderRadius: piece.size / 2 }
        : { width: piece.size, height: piece.size * 1.5, borderRadius: 2 };

  return (
    <Animated.View
      style={[
        styles.piece,
        dims,
        {
          left: piece.x0,
          top: piece.y0,
          backgroundColor: piece.color,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }, { rotateX }],
        },
      ]}
    />
  );
}

interface Props {
  variant?: ConfettiVariant;
  count?: number;
  /** Where a `pop` explodes from, in window coordinates. Ignored by the other variants. */
  origin?: { x: number; y: number };
  testID?: string;
}

export default function ConfettiBurst({
  variant = 'rain',
  count,
  origin,
  testID,
}: Props): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const pieceCount = count ?? (variant === 'cannons' ? 90 : variant === 'pop' ? 36 : 40);
  // Generated once per mount — a re-render (rotation, a parent state change) must never re-roll
  // pieces that are mid-flight.
  const [pieces] = useState(() => makePieces(variant, width, height, pieceCount, origin));

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
});
