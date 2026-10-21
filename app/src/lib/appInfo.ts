/** The installed app's version, as the App Store shows it: "1.0.0 (12)". Native values only — in
 *  a test or a dev shell without them it falls back to the version in `app.json`'s shape. */
import * as Application from 'expo-application';

export function appVersion(): string {
  return Application.nativeApplicationVersion ?? '1.0.0';
}

export function appBuild(): string | null {
  return Application.nativeBuildVersion ?? null;
}

export function appVersionLabel(): string {
  const build = appBuild();
  return build ? `${appVersion()} (${build})` : appVersion();
}
