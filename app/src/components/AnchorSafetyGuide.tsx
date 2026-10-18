/**
 * Track 37d — the anchor safety guide, rendered from `lib/anchorSafety.ts`: an intro, then one card
 * per section with its points as a bulleted list. Shared by Settings → Learn → Anchor safety and
 * the onboarding step. Each section title is a VoiceOver header so the guide can be skimmed by
 * heading; the bullets are decorative and hidden, each point is read as its own line.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ANCHOR_SAFETY_INTRO, ANCHOR_SAFETY_SECTIONS } from '../lib/anchorSafety';
import { makeStyles, space } from '../theme';
import { Card, Txt } from '../ui';

export function AnchorSafetyGuide(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID="anchor-safety-guide">
      <Txt variant="body" color="text2">
        {ANCHOR_SAFETY_INTRO}
      </Txt>
      {ANCHOR_SAFETY_SECTIONS.map((section) => (
        <Card key={section.id} padding="md" style={styles.card} testID={`safety-${section.id}`}>
          <Txt variant="h3" accessibilityRole="header">
            {section.title}
          </Txt>
          {section.points.map((point) => (
            <View key={point} style={styles.point}>
              <Txt
                variant="body"
                color="teal"
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                •
              </Txt>
              <Txt variant="body" color="text2" style={styles.pointText}>
                {point}
              </Txt>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { gap: space.lg },
    card: { gap: space.sm },
    point: { flexDirection: 'row', gap: space.sm },
    pointText: { flex: 1, flexShrink: 1 },
  }),
);
