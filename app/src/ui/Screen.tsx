/**
 * Screen root: `bg` background, safe-area padding for the chosen `edges`, the standard 20pt
 * gutter, optional scrolling, and an optional sticky `footer` (padded by the bottom inset).
 *
 * Under a native-stack header pass nothing (the header owns the top inset: default edges are
 * left/right). Screens with no header (tab screens, Workout) pass `edges={['top', 'left', 'right']}`;
 * tab screens also pass `safeBottom={false}` because the tab bar owns the bottom inset.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { gutter, makeStyles, space } from '../theme';
import { useInsets } from './useInsets';

export type Edge = 'top' | 'left' | 'right' | 'bottom';

export interface ScreenProps {
  scroll?: boolean;
  /** Lets a screen freeze the scroll view while a drag gesture owns the touch (Approval reorder). */
  scrollEnabled?: boolean;
  /** Scroll content up out of the keyboard's way (iOS `automaticallyAdjustKeyboardInsets`), for a
   *  screen with a text field low on the page. */
  adjustForKeyboard?: boolean;
  footer?: React.ReactNode;
  edges?: readonly Edge[];
  /** Apply the bottom inset (default true). Off when a tab bar sits below. */
  safeBottom?: boolean;
  /** Standard 20pt horizontal gutter (default true). */
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Ref to the scroll view (when `scroll`), for a screen that scrolls itself to a section. */
  scrollRef?: React.Ref<ScrollView>;
  testID?: string;
  children?: React.ReactNode;
}

export function Screen({
  scroll = false,
  scrollEnabled = true,
  adjustForKeyboard = false,
  footer,
  edges = ['left', 'right'],
  safeBottom = true,
  padded = true,
  contentStyle,
  style,
  refreshControl,
  scrollRef,
  testID,
  children,
}: ScreenProps): React.JSX.Element {
  const insets = useInsets();
  const styles = useStyles();
  const has = (e: Edge) => edges.includes(e);
  const side = padded ? gutter : 0;
  const bottomInset = safeBottom ? insets.bottom : 0;

  const inner: ViewStyle = {
    paddingLeft: side + (has('left') ? insets.left : 0),
    paddingRight: side + (has('right') ? insets.right : 0),
  };

  return (
    <View testID={testID} style={[styles.root, { paddingTop: has('top') ? insets.top : 0 }, style]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          scrollEnabled={scrollEnabled}
          automaticallyAdjustKeyboardInsets={adjustForKeyboard}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          refreshControl={refreshControl}
          contentContainerStyle={[
            inner,
            { paddingBottom: footer ? space.xxl : bottomInset + space.xxl },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, inner, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View
          testID={testID ? `${testID}-footer` : undefined}
          style={[styles.footer, inner, { paddingBottom: bottomInset + space.md }]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.colors.bg },
    flex: { flex: 1 },
    footer: {
      paddingTop: space.md,
      backgroundColor: t.colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.line,
    },
  }),
);
