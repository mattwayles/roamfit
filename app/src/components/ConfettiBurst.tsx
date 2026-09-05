/**
 * A one-shot confetti burst for the session-completion screen (see SummaryScreen.tsx). Pure
 * `Animated` API — no new dependency, since the app has no confetti/lottie/reanimated library
 * installed and this is a single celebratory moment, not something that warrants adding one.
 *
 * Fires once on mount: every piece starts stacked at the top and falls to past the bottom of the
 * screen with a random horizontal drift and spin, each on its own delay so the burst reads as
 * continuous rather than a single synchronized drop.
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

const COLORS = ['#facc15', '#fb7185', '#38bdf8', '#4ade80', '#a78bfa', '#fb923c', '#f472b6'];
const PIECE_COUNT = 40;

interface Piece {
  color: string;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
}

function makePieces(width: number): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => ({
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    left: Math.random() * width,
    size: 6 + Math.random() * 8,
    delay: Math.random() * 600,
    duration: 2200 + Math.random() * 1400,
    drift: (Math.random() - 0.5) * 120,
    spin: 360 + Math.random() * 720 * (Math.random() < 0.5 ? -1 : 1),
  }));
}

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }): React.JSX.Element {
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

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, height + 40],
  });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${piece.spin}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.left,
          width: piece.size,
          height: piece.size * 1.6,
          backgroundColor: piece.color,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

export default function ConfettiBurst(): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => makePieces(width), [width]);

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti-burst">
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} height={height} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, borderRadius: 2 },
});
