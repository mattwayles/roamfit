/**
 * Passport stamp. Shape (circle / rounded rect), tilt (-8..8 deg) and — unless `tone` is given —
 * color are all derived from `seed`, so a given city or milestone always stamps the same way.
 * Double inset border in the ink color, condensed uppercase text, 90% opacity like real ink.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { seededRng } from '../lib/seed';
import { colors, radius, type AccentName } from '../theme';
import { Txt } from './Txt';

const INKS: readonly AccentName[] = ['ember', 'gold', 'sky', 'summit', 'lagoon'];

export interface StampSpec {
  shape: 'circle' | 'rect';
  /** Degrees, -8..8, one decimal. */
  rotation: number;
  tone: AccentName;
}

/** Pure, deterministic look for a seed (exported for tests and for callers that need the tone). */
export function stampSpec(seed: string, tone?: AccentName): StampSpec {
  const rng = seededRng(`stamp:${seed}`);
  const shape = rng() < 0.5 ? 'circle' : 'rect';
  const rotation = Math.round((rng() * 16 - 8) * 10) / 10;
  const seededTone = INKS[Math.floor(rng() * INKS.length)]!;
  return { shape, rotation, tone: tone ?? seededTone };
}

export interface StampProps {
  title: string;
  subtitle?: string;
  seed: string;
  tone?: AccentName;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Stamp({
  title,
  subtitle,
  seed,
  tone,
  size = 112,
  style,
  testID = 'stamp',
}: StampProps): React.JSX.Element {
  const spec = stampSpec(seed, tone);
  const ink = colors[spec.tone];
  const width = spec.shape === 'circle' ? size : Math.round(size * 1.25);
  const height = spec.shape === 'circle' ? size : Math.round(size * 0.86);
  const outerRadius = spec.shape === 'circle' ? size / 2 : radius.sm;
  const inset = 4;
  const innerRadius = Math.max(outerRadius - inset, 4);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[
        styles.outer,
        {
          width,
          height,
          borderRadius: outerRadius,
          borderColor: ink,
          opacity: 0.9,
          transform: [{ rotate: `${spec.rotation}deg` }],
        },
        style,
      ]}
    >
      <View style={[styles.inner, { margin: inset, borderRadius: innerRadius, borderColor: ink }]}>
        <Txt
          variant="h2"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          align="center"
          style={{
            color: ink,
            fontSize: Math.round(size * 0.19),
            lineHeight: Math.round(size * 0.21),
          }}
        >
          {title}
        </Txt>
        {subtitle ? (
          <Txt
            variant="eyebrow"
            align="center"
            numberOfLines={1}
            style={[styles.sub, { color: ink }]}
          >
            {subtitle}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { borderWidth: 2, alignItems: 'stretch', justifyContent: 'center' },
  inner: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sub: { marginTop: 2, fontSize: 11, letterSpacing: 1.2 },
});
