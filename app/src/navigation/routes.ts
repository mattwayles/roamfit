/**
 * Navigation state helpers shared by the flow screens. Home lives inside the `Tabs` route now, so
 * "go home" is `Tabs -> Home`, never a bare `Home`.
 */

/** `navigation.reset(homeReset())` — wipe the flow stack, land on Today. */
export function homeReset() {
  return { index: 0, routes: [{ name: 'Tabs' as const, params: { screen: 'Home' as const } }] };
}
