/**
 * Share an earned badge as a picture. The off-screen `BadgeShareCard` is captured to a temporary
 * PNG and handed to the native share sheet with the usual line of text; nothing is posted by the
 * app itself. If the capture fails (a view that has not laid out yet, a low-memory device) the
 * share still happens, as the text alone.
 */
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { BadgeDefinition } from '@roamfit/engine';
import { badgeShareText } from './badges';

export async function shareBadge(
  def: BadgeDefinition,
  card: RefObject<View | null>,
): Promise<void> {
  const message = badgeShareText(def);
  let url: string | null = null;
  if (card.current) {
    try {
      url = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
    } catch {
      url = null;
    }
  }
  await Share.share(url ? { url, message } : { message });
}
