/**
 * "Send feedback" — the standard mobile route for an app with no backend: open the user's mail
 * app on a pre-addressed draft. The subject names the version, and the body leaves room to write
 * first with a short device footer below (iOS and app version, the two things a bug report needs),
 * so nothing is sent from the app itself and no account or network service is involved.
 */
import { Linking, Platform } from 'react-native';
import { appVersionLabel } from './appInfo';

/** Where feedback goes — the developer's inbox. */
export const FEEDBACK_EMAIL = 'mattwayles@gmail.com';

export function buildFeedbackUrl(): string {
  const subject = `Wanderlift feedback (v${appVersionLabel()})`;
  const body = `\n\n\n— — —\nWanderlift ${appVersionLabel()}\niOS ${String(Platform.Version)}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens the draft. False when this phone has no mail app set up, so the caller can say so. */
export async function openFeedbackEmail(): Promise<boolean> {
  try {
    await Linking.openURL(buildFeedbackUrl());
    return true;
  } catch {
    return false;
  }
}
