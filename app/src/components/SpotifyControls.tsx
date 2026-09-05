/**
 * Transport controls for whatever Spotify is playing, on the active workout screen. Asked for
 * directly: "so I don't have to swap between apps during a workout."
 *
 * All the reasoning about *how* this talks to Spotify lives in `../lib/spotifyRemote` — this file
 * only renders what that hook reports and calls back into it. Notably it never learns whether the
 * native module exists; `available` is just false, and the component returns `null`. A user with
 * no Spotify (or a build made before `expo prebuild` ran with a client ID) sees no trace of this
 * feature rather than a button that cannot work.
 *
 * **Shape: one row, 44pt targets.** It sits directly under the elapsed timer, above the exercise
 * hero, and the hero is what §10.4 says must dominate this screen — so this cannot grow into a
 * player. It is three transport buttons and a line of text, sized like the pause/mute/stop group
 * it sits beneath, and it never takes more than one row plus an error line.
 *
 * **Why the whole thing is one tap away rather than always live.** Connecting can foreground the
 * Spotify app (see `connectSpotify` — waking a suspended Spotify is the ordinary path, not an
 * edge case), so this must never happen on mount. Mid-set is precisely the wrong moment to be
 * thrown into another app. The user taps once, at a moment of their choosing.
 *
 * **Skip buttons gate on Spotify's own restrictions**, not on our optimism: an advert, or some
 * radio contexts, genuinely cannot be skipped, and a button that silently does nothing is worse
 * than one that is visibly unavailable.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSpotifyPlayer } from '../lib/spotifyRemote';

export default function SpotifyControls(): React.JSX.Element | null {
  const {
    available,
    connectionState,
    track,
    isPlaying,
    canSkipNext,
    canSkipPrevious,
    lastError,
    connect,
    togglePlay,
    skipNext,
    skipPrevious,
  } = useSpotifyPlayer();

  // No native module: this feature does not exist in this build, so it does not exist on screen.
  if (!available) return null;

  const error = lastError ? (
    <Text testID="spotify-error" style={styles.error}>
      {lastError}
    </Text>
  ) : null;

  if (connectionState !== 'connected') {
    const connecting = connectionState === 'connecting';
    return (
      <View testID="spotify-controls" style={styles.block}>
        <Pressable
          testID="spotify-connect"
          accessibilityRole="button"
          accessibilityLabel="Connect Spotify"
          accessibilityState={{ disabled: connecting }}
          disabled={connecting}
          style={[styles.connectButton, connecting && styles.connectButtonBusy]}
          onPress={connect}
        >
          <Text style={styles.connectText}>
            {connecting ? 'Connecting to Spotify…' : '♫  Connect Spotify'}
          </Text>
        </Pressable>
        {error}
      </View>
    );
  }

  return (
    <View testID="spotify-controls" style={styles.block}>
      <View style={styles.row}>
        {/* Flexible and clipped rather than wrapping: a long title must not be allowed to push
            the transport buttons off the row or grow this block to two rows. */}
        <View style={styles.trackBox}>
          <Text testID="spotify-track" style={styles.trackName} numberOfLines={1}>
            {track?.name ?? 'Connected to Spotify'}
          </Text>
          {track != null && (
            <Text testID="spotify-artist" style={styles.trackArtist} numberOfLines={1}>
              {track.artist}
            </Text>
          )}
        </View>

        <Pressable
          testID="spotify-previous"
          accessibilityRole="button"
          accessibilityLabel="Previous track"
          accessibilityState={{ disabled: !canSkipPrevious }}
          disabled={!canSkipPrevious}
          style={[styles.iconButton, !canSkipPrevious && styles.iconButtonDisabled]}
          onPress={skipPrevious}
        >
          <Text style={[styles.iconText, !canSkipPrevious && styles.iconTextDisabled]}>⏮</Text>
        </Pressable>

        <Pressable
          testID="spotify-play-pause"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause Spotify' : 'Play Spotify'}
          style={[styles.iconButton, styles.playButton]}
          onPress={togglePlay}
        >
          <Text style={[styles.iconText, styles.playText]}>{isPlaying ? '❚❚' : '▶'}</Text>
        </Pressable>

        <Pressable
          testID="spotify-next"
          accessibilityRole="button"
          accessibilityLabel="Next track"
          accessibilityState={{ disabled: !canSkipNext }}
          disabled={!canSkipNext}
          style={[styles.iconButton, !canSkipNext && styles.iconButtonDisabled]}
          onPress={skipNext}
        >
          <Text style={[styles.iconText, !canSkipNext && styles.iconTextDisabled]}>⏭</Text>
        </Pressable>
      </View>
      {error}
    </View>
  );
}

/** Spotify's brand green, used only as an accent on the two controls that are about Spotify
 *  specifically (connect, and play/pause). The rest of the row stays in this screen's slate
 *  palette — the exercise is the subject of this page, not the music. */
const SPOTIFY_GREEN = '#1db954';

const styles = StyleSheet.create({
  block: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // flexShrink with a zero basis, not flex: 1 — the buttons are fixed-width and must win every
  // contest for space; this box takes exactly what is left.
  trackBox: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  trackName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  trackArtist: { fontSize: 12, color: '#64748b' },
  connectButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  connectButtonBusy: { borderColor: '#cbd5e1' },
  connectText: { fontSize: 14, fontWeight: '700', color: '#166534' },
  // Same 44pt footprint as the session icon buttons on the timer row above, so the two groups
  // read as one control area rather than two competing ones.
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 16, fontWeight: '800', color: '#334155', lineHeight: 20 },
  playButton: { backgroundColor: SPOTIFY_GREEN },
  playText: { color: '#fff' },
  // Visibly unavailable rather than absent: nothing shifts under a thumb already reaching for it
  // when an advert ends and skipping becomes possible again.
  iconButtonDisabled: { backgroundColor: '#f1f5f9' },
  iconTextDisabled: { color: '#cbd5e1' },
  error: { fontSize: 12, color: '#64748b' },
});
