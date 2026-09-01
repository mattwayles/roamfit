/**
 * §7.3 — "Key never ships in the bundle." This file is the *only* place in this Cloud Function
 * that is allowed to read `ANTHROPIC_API_KEY`, and it reads it from the runtime environment only
 * — never a literal, never a repo file, never a test fixture. `app/` and `packages/*` must never
 * import from this package.
 *
 * Operator setup (documented here because there is nowhere else for it to live):
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 * then bind the secret to the function in `src/index.ts` (`runWith({ secrets: [...] })` / the v2
 * `secrets: [...]` option). Locally, export ANTHROPIC_API_KEY in your shell before running the
 * emulator — never write it to a committed `.env`.
 */
export function getApiKeyOrThrow(env: Record<string, string | undefined> = process.env): string {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Configure it as a Cloud Functions runtime secret ' +
        '(`firebase functions:secrets:set ANTHROPIC_API_KEY`) — it must never be committed to ' +
        'the repo, hardcoded, or shipped in the app bundle.',
    );
  }
  return key;
}
