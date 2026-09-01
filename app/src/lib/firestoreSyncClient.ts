/**
 * §11.3 Firestore sync — the `sync/firestoreSyncWorker.ts` (`@roamfit/store`) `FirestoreSyncClient`
 * seam, implemented against the `firebase` JS modular SDK (chosen over `@react-native-firebase`
 * specifically because it needs no native linking/config plugin — this environment cannot run
 * `pod install` or build for a real device, so a client that at least *typechecks and mounts*
 * without a native rebuild is the more useful deliverable here).
 *
 * **Firestore is a sync target only, never a read dependency** (CLAUDE.md invariant). Nothing in
 * this file is called from the core loop — only `runFirestoreSync`, itself only ever called
 * opportunistically (see the trigger wired into `HomeScreen.tsx`).
 *
 * v1 uses **anonymous Auth** — there is no login UI in scope (single local user, §4.3). Every
 * document is scoped under `users/{uid}/...` per `firestore.rules`. Known, documented gap: this
 * implementation does not wire React Native AsyncStorage persistence for the Auth session (that
 * needs `@react-native-firebase`-style native persistence or an extra
 * `@react-native-async-storage/async-storage` dependency neither of which this track adds) — a
 * cold app restart re-runs anonymous sign-in and gets a **new** uid, meaning synced documents
 * from a prior install session become orphaned. Fine for a first pass (nothing here is a read
 * dependency, so a lost sync history has zero product-loop impact), but a real limitation to fix
 * before this is relied on for actual cross-device continuity. Flagged in
 * STATUS-6d-sync-health.md.
 */
import type {
  FirestoreSyncClient,
  RemoteVersionedDoc,
  RemoteVideoConfigEntry,
} from '@roamfit/store';

// Populated by the operator via `app.config.js`/EAS secrets, never committed (CLAUDE.md hard
// constraint — no API key of any kind in the repo). A Firebase *client* config (apiKey here is
// a public, non-secret project identifier per Firebase's own docs, not a credential) still isn't
// hardcoded, so this file works unmodified in every environment including this one, where it's
// simply never configured and the client below degrades to "sync unavailable."
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

type FirebaseAppModule = typeof import('firebase/app');
type FirestoreModule = typeof import('firebase/firestore');
type AuthModule = typeof import('firebase/auth');

interface FirebaseModules {
  app: FirebaseAppModule;
  firestore: FirestoreModule;
  auth: AuthModule;
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
        firestore: require('firebase/firestore') as FirestoreModule,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        auth: require('firebase/auth') as AuthModule,
      };
    }
  } catch {
    modulesCache = null;
  }
  return modulesCache;
}

let uidPromise: Promise<string> | null = null;

async function currentUid(mods: FirebaseModules): Promise<string> {
  if (!uidPromise) {
    const app = mods.app.initializeApp(firebaseConfig);
    const auth = mods.auth.getAuth(app);
    uidPromise = mods.auth.signInAnonymously(auth).then((credential) => credential.user.uid);
  }
  return uidPromise;
}

function getDb(mods: FirebaseModules) {
  const app =
    mods.app.getApps().length > 0 ? mods.app.getApp() : mods.app.initializeApp(firebaseConfig);
  return mods.firestore.getFirestore(app);
}

/** `null` in any environment where Firebase hasn't been configured (this one included) — the
 *  worker's own per-entity try/catch already treats a thrown error as "sync unavailable right
 *  now," so a caller with every method throwing is a correct, safe default. */
export function createFirestoreSyncClient(): FirestoreSyncClient | null {
  const mods = loadFirebaseModules();
  if (!mods) return null;

  return {
    async pullDoc<T>(collection: 'exercise_state' | 'rolled_up_stats', id: string) {
      const uid = await currentUid(mods);
      const db = getDb(mods);
      const ref = mods.firestore.doc(db, 'users', uid, collection, id);
      const snap = await mods.firestore.getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as { updatedAt: string } & Record<string, unknown>;
      return { data: data as T, updatedAt: data.updatedAt } satisfies RemoteVersionedDoc<T>;
    },

    async pushDoc<T>(
      collection: 'exercise_state' | 'rolled_up_stats' | 'sessions',
      id: string,
      data: T,
      updatedAt: string,
    ) {
      const uid = await currentUid(mods);
      const db = getDb(mods);
      const ref = mods.firestore.doc(db, 'users', uid, collection, id);
      await mods.firestore.setDoc(ref, { ...(data as object), updatedAt });
    },

    async pullVideoConfigDelta(sinceUpdatedAt: string | null): Promise<RemoteVideoConfigEntry[]> {
      const db = getDb(mods);
      const videoCollection = mods.firestore.collection(db, 'video');
      const q =
        sinceUpdatedAt === null
          ? mods.firestore.query(videoCollection)
          : mods.firestore.query(
              videoCollection,
              mods.firestore.where('updatedAt', '>', sinceUpdatedAt),
            );
      const snap = await mods.firestore.getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data() as {
          videoId: string | null;
          videoVerifiedAt: string | null;
          videoFlagCount: number;
          updatedAt: string;
        };
        return {
          exerciseId: d.id,
          videoId: data.videoId ?? null,
          videoVerifiedAt: data.videoVerifiedAt ?? null,
          videoFlagCount: data.videoFlagCount ?? 0,
          updatedAt: data.updatedAt,
        };
      });
    },
  };
}
