/**
 * A small Spotify glyph that opens the Spotify app and nothing else: no playback control, no
 * auth, no network call of ours. Falls back to open.spotify.com when the app isn't installed.
 * Spotify green is allowed only as this brand glyph.
 */
import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { PressableScale } from '../ui';
import { makeStyles } from '../theme';

const SPOTIFY_GREEN = '#1DB954';

export function openSpotify(): void {
  Linking.openURL('spotify://').catch(() => {
    Linking.openURL('https://open.spotify.com').catch(() => {});
  });
}

export default function SpotifyButton(): React.JSX.Element {
  const styles = useStyles();
  return (
    <PressableScale
      testID="open-spotify"
      onPress={openSpotify}
      accessibilityRole="button"
      accessibilityLabel="Open Spotify"
      hitSlop={8}
      style={styles.disc}
    >
      <FontAwesome name="spotify" size={20} color={SPOTIFY_GREEN} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    disc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
  }),
);
