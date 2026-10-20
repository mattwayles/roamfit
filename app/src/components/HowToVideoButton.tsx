/**
 * The button under an exercise's "How to" cue that opens a YouTube search for it. Opens the
 * link and nothing else: there is no player and no saved video. Hidden while offline (a search
 * link is a dead end without a connection); it returns when connectivity does.
 */
import React from 'react';
import { Linking } from 'react-native';
import { Button } from '../ui';
import { youtubeSearchUrl } from '../lib/youtubeSearch';
import { useIsOnline } from '../lib/networkStatus';

export default function HowToVideoButton({
  exerciseName,
}: {
  exerciseName: string;
}): React.JSX.Element | null {
  const online = useIsOnline();
  if (!online) return null;
  return (
    <Button
      testID="how-to-video-link"
      label="Watch a demo"
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
