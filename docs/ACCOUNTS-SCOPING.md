# User Accounts — Scoping Notes

Written 2026-10-18 from a read of the codebase, ahead of building account creation, login, and
logout on the existing Firebase setup. Nothing here has been built. Re-check the file and line
references before relying on them.

## Where things stand

- **Firebase is wired in code but not switched on.** `app/src/lib/firestoreSyncClient.ts` and
  `app/src/lib/llmProxyClient.ts` read six `EXPO_PUBLIC_FIREBASE_*` env vars. None are set
  anywhere in the repo, so `createFirestoreSyncClient()` returns `null` and nothing syncs. The
  Firebase project is `roamfit-11360` (`.firebaserc`).
- **Auth is anonymous only and does not persist.** `currentUid()` in `firestoreSyncClient.ts`
  calls `signInAnonymously` with no React Native persistence. Every cold start gets a new uid
  and orphans whatever was synced before. This is the "User Accounts" item in `BACKLOG.md`.
- **The app assumes one local user.** `USER_ID = 'local'` is hardcoded in
  `packages/store/src/repositories/users.ts` and `packages/store/src/sync/syncRows.ts`. The schema
  has `user_id` columns throughout, so multi-user is not a schema rewrite.
- **`firestore.rules` is already scoped per user** (`users/{uid}/...`, owner-only read and write).
  That model carries over unchanged. Only the collection list grows.

## Work required

### 1. Auth plumbing (small)

- Move auth out of `firestoreSyncClient.ts` into its own module: `initializeAuth` with
  `getReactNativePersistence(AsyncStorage)`, plus an auth-state hook or context for the UI.
- New dependency: `@react-native-async-storage/async-storage`. It is native, so the dev client
  must be rebuilt. Note it in the status file (CLAUDE.md rule).
- Set the `EXPO_PUBLIC_FIREBASE_*` vars (EAS secrets or a local env file, never committed) and
  enable the chosen providers in the Firebase console.
- This also closes the existing BACKLOG item about the anonymous session not persisting.

### 2. Sign-in method (open decision; it drives most of the native work)

| Method | Native work | Notes |
|---|---|---|
| Email/password | None (pure JS SDK) | Needs a forgot-password flow |
| Sign in with Apple | `expo-apple-authentication`, entitlement, rebuild | Best fit for an iOS-only app. Apple guideline 4.8 requires it if any third-party login is offered |
| Google | Native Google sign-in library | Probably not worth it on iOS only |

### 3. UI (small to medium)

- An Account section in `app/src/screens/SettingsScreen.tsx`: create account, sign in, sign out.
- **Delete account in the app.** Apple guideline 5.1.1(v) requires it for any app that offers
  account creation. Not optional.
- **Accounts stay optional. No login wall.** Gating the app on sign-in breaks invariant 1
  (offline is not a degradation mode). Copy follows invariant 4 (never punish): no nagging.
- Upgrade the existing anonymous user with `linkWithCredential` so the uid, and anything already
  synced, carries over. If the credential already belongs to another account, that is a sign-in
  to a different uid. See the account-switch guard below.

### 4. Data behaviour (the bulk of the work)

`packages/store/src/sync/firestoreSyncWorker.ts` currently covers only:

- `exercise_state`: push and pull, last-write-wins
- `rolled_up_stats`: push and pull, last-write-wins
- `sessions`: push only, header rows only
- `video` remote config: pull only

These tables are **not synced at all**:

- `progression_state` (the user's levels; the most important gap)
- `users` profile: bands, anchors, training and notification prefs
- `limitations` (injuries, pregnancy)
- `session_entries`, `set_logs`, `session_muscle_volume`
- `milestones`, `earned_badges`
- `manual_day_markers`, `spotify_playlists`

For "my training follows me to a new phone," the work is:

- Push and pull paths for each table above, with a conflict rule for each: last-write-wins for
  mutable state, append-only for logs.
- Matching collections in `firestore.rules`.
- **First-login merge**, for when the device and the cloud both hold data.
- **Account-switch guard.** Store the owning uid locally and reset `sync_cursor` when it changes.
  Without it, signing in as user B on user A's phone pushes A's history into B's account.
- Tests with each step, in the same commit (the existing `firestoreSyncWorker.test.ts` is the
  pattern).

**Logout semantics (open decision):**

- *Keep local data.* The account is effectively a cloud backup. Simple and safe.
- *Wipe the device.* Only makes sense once full restore (above) exists, or sign-out loses data.

**Privacy:** `limitations` is health data. Sending it to Firestore deserves a deliberate yes and a
line in the privacy policy.

### 5. Optional hardening

The `llmIntake`, `llmCoachVoice`, and `llmDistillFeedback` callables in `functions/src/index.ts`
never check `request.auth`. Once accounts exist, requiring at least an anonymous sign-in on them
is cheap.

## Sizing

| Scope | Contents | Lift |
|---|---|---|
| **A: Identity + backup** | Persistent auth, Apple and/or email sign-in, anonymous-to-account linking, Settings UI, sign-out keeps local data, delete account | About one track, 4–6 committed increments |
| **B: Cross-device restore** | Everything in A, plus full-table sync and pull, first-login merge, account-switch guard, rules, tests | 1–2 more tracks; the larger half |

Either scope needs a dev-client rebuild and a pass on a real device, which only the user can do.
The code and unit tests can be written without one.

## Decisions to make before starting

1. Sign-in method: Apple, email/password, or both?
2. Scope: A now, or A + B?
3. Sign-out: keep local data, or wipe the device?
