/**
 * Single wrapper over Ionicons so the semantic-name -> glyph map lives in one place. Screens ask
 * for `<Icon name="bolt" />`, never an Ionicons glyph string. Decorative unless given a label.
 */
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type ColorName } from '../theme';

type Glyph = React.ComponentProps<typeof Ionicons>['name'];

export const iconMap = {
  // navigation / chrome
  today: 'flame',
  journey: 'compass',
  guide: 'book',
  home: 'home',
  settings: 'settings-sharp',
  back: 'chevron-back',
  close: 'close',
  chevronRight: 'chevron-forward',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  arrowRight: 'arrow-forward',
  arrowLeft: 'arrow-back',
  // actions
  add: 'add',
  remove: 'remove',
  check: 'checkmark',
  checkCircle: 'checkmark-circle',
  refresh: 'refresh',
  swap: 'swap-horizontal',
  undo: 'arrow-undo',
  skip: 'play-skip-forward',
  pause: 'pause',
  play: 'play',
  stop: 'stop',
  drag: 'reorder-three',
  edit: 'pencil',
  trash: 'trash',
  share: 'share-outline',
  filter: 'options',
  search: 'search',
  // meaning
  bolt: 'flash',
  flame: 'flame',
  airplane: 'airplane',
  time: 'time',
  timer: 'stopwatch',
  trendingUp: 'trending-up',
  trophy: 'trophy',
  location: 'location',
  globe: 'globe',
  flag: 'flag',
  pin: 'pin',
  volume: 'volume-high',
  moon: 'moon',
  sparkles: 'sparkles',
  heart: 'heart',
  shield: 'shield-checkmark',
  info: 'information-circle',
  star: 'star',
  medal: 'medal',
  barbell: 'barbell',
  leaf: 'leaf',
  water: 'water',
  // movement patterns (Field Guide avatars)
  body: 'body',
  pulse: 'pulse',
  dot: 'ellipse',
  push: 'arrow-forward',
  pull: 'arrow-back',
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof iconMap;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorName;
  style?: StyleProp<TextStyle>;
  testID?: string;
  /** Set when the icon carries meaning on its own; otherwise it is hidden from VoiceOver. */
  accessibilityLabel?: string;
}

export function Icon({
  name,
  size = 20,
  color = 'text',
  style,
  testID,
  accessibilityLabel,
}: IconProps): React.JSX.Element {
  return (
    <Ionicons
      name={iconMap[name]}
      size={size}
      color={colors[color]}
      style={style}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
      importantForAccessibility={accessibilityLabel != null ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel == null}
    />
  );
}
