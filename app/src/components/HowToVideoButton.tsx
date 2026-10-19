/**
 * The button under an exercise's "How to" cue that opens a YouTube search for it. Opens the
 * link and nothing else: there is no player, no saved video, and no connectivity check — the
 * system browser says so itself if it is offline.
 */
import React from 'react';
import { Linking } from 'react-native';
import { Button } from '../ui';
import { youtubeSearchUrl } from '../lib/youtubeSearch';

export default function HowToVideoButton({
  exerciseName,
}: {
  exerciseName: string;
}): React.JSX.Element {
  return (
    <Button
      testID="how-to-video-link"
      label="Watch a video"
      variant="secondary"
      size="md"
      icon="external"
      iconRight
      fullWidth
      onPress={() => {
        Linking.openURL(youtubeSearchUrl(exerciseName)).catch(() => {});
      }}
    />
  );
}
