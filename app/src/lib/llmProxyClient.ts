/**
 * Issue #34 — §7.3/§11.3 LLM proxy client. Implements the `LlmProxyCaller` seam
 * `packages/store`'s `llmQueueWorker.ts` (`processLlmQueue`) is written against, calling the
 * deployed `functions/` Cloud Functions (`llmCoachVoice`, `llmDistillFeedback`) via the Firebase
 * `httpsCallable` client. `packages/store` never imports the `firebase` SDK or any HTTP client —
 * this file is the one place that bridges the two, exactly like `firestoreSyncClient.ts` bridges
 * `FirestoreSyncClient`. Same shape, deliberately: lazy-loaded modules (so importing this file
 * never throws under Jest, where `firebase/functions`'s native fetch/XHR dependencies aren't
 * available), degrading to `null` — "no caller available" — whenever the six
 * `EXPO_PUBLIC_FIREBASE_*` env vars aren't configured (this environment, CI, and any install that
 * hasn't been wired to a real Firebase project yet).
 *
 * **Never on the critical path (invariant 1).** Nothing in generate/approve/run/complete/log or
 * the dashboard calls this file. The only caller is `opportunisticSync.ts`'s
 * `runOpportunisticSync`, itself only ever invoked opportunistically (Home screen focus, same
 * trigger 6d already uses for Firestore/device-queue sync) and wrapped in its own try/catch so a
 * proxy that is unreachable, misconfigured, or simply not deployed yet can never block or throw
 * into the render path. A coach line arriving an hour late — or never, if the key is unset — is
 * an accepted, silent outcome; a blocked workout is not.
 */
import type { LlmProxyCaller } from '@roamfit/store';

// Same six public (non-secret) Firebase client config values `firestoreSyncClient.ts` reads —
// see that file's header for why these are safe to read from `process.env` and not "a key in
// the bundle" in the CLAUDE.md invariant-8/no-credentials sense.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

type FirebaseAppModule = typeof import('firebase/app');
type FunctionsModule = typeof import('firebase/functions');

interface FirebaseModules {
  app: FirebaseAppModule;
  functions: FunctionsModule;
}

let modulesCache: FirebaseModules | null | undefined;

function loadFirebaseModules(): FirebaseModules | null {
  if (modulesCache !== undefined) return modulesCache;
  try {
    if (!firebaseConfig.projectId) {
      modulesCache = null; // never configured in this environment — safe, expected default.
    } else {
      modulesCache = {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        app: require('firebase/app') as FirebaseAppModule,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        functions: require('firebase/functions') as FunctionsModule,
      };
    }
  } catch {
    modulesCache = null;
  }
  return modulesCache;
}

function getFunctionsInstance(mods: FirebaseModules) {
  const app =
    mods.app.getApps().length > 0 ? mods.app.getApp() : mods.app.initializeApp(firebaseConfig);
  return mods.functions.getFunctions(app);
}

interface CoachVoiceCallableResult {
  explanation: string;
  usedFallback: boolean;
}

interface DistillFeedbackCallableResult {
  suspectedLimitationTag: string | null;
  bandTooLightExerciseIds: string[];
  aversionExerciseIds: string[];
}

/** `null` in any environment where Firebase hasn't been configured (this one included) —
 *  `llmQueueWorker.ts`'s caller is only ever invoked from `opportunisticSync.ts`, which already
 *  skips calling `processLlmQueue` entirely when this returns `null` (see that file), so a
 *  missing config never even reaches a network attempt. */
export function createLlmProxyCaller(): LlmProxyCaller | null {
  const mods = loadFirebaseModules();
  if (!mods) return null;

  return {
    async coachVoice(input) {
      const functionsInstance = getFunctionsInstance(mods);
      const callable = mods.functions.httpsCallable<
        { deterministicExplanation: string; sessionExerciseIds: string[] },
        CoachVoiceCallableResult
      >(functionsInstance, 'llmCoachVoice');
      const result = await callable(input);
      return { explanation: result.data.explanation, usedFallback: result.data.usedFallback };
    },

    async distillFeedback(input) {
      const functionsInstance = getFunctionsInstance(mods);
      const callable = mods.functions.httpsCallable<
        { retrospectiveText: string; sessionExerciseIds: string[] },
        DistillFeedbackCallableResult
      >(functionsInstance, 'llmDistillFeedback');
      const result = await callable(input);
      return {
        suspectedLimitationTag: result.data.suspectedLimitationTag,
        bandTooLightExerciseIds: result.data.bandTooLightExerciseIds,
        aversionExerciseIds: result.data.aversionExerciseIds,
      };
    },
  };
}
