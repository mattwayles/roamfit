/** Track 37d — Settings → Learn → Anchor safety. Read-only; the same guide onboarding shows. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { AnchorSafetyGuide } from '../components/AnchorSafetyGuide';
import { space } from '../theme';
import { Screen, Txt } from '../ui';

export default function AnchorSafetyScreen(): React.JSX.Element {
  return (
    <Screen scroll testID="anchor-safety-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Anchor safety
      </Txt>
      <AnchorSafetyGuide />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, gap: space.xl },
});
