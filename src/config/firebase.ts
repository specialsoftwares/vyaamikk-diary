/**
 * Firebase initialization.
 *
 * We only construct the Firebase app when running in production mode AND
 * a full config is present. The auth/db services use these getters and
 * throw a clear error if the config is missing, so the app surfaces a
 * "Firebase not configured" state rather than crashing in low-level SDK code.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import * as firebaseAuthModule from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { env, isFirebaseConfigured } from "./env";

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let cachedStorage: FirebaseStorage | null = null;

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* in your .env."
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  if (!isFirebaseConfigured()) throw new FirebaseNotConfiguredError();

  const existing = getApps();
  cachedApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: env.firebase.apiKey,
          authDomain: env.firebase.authDomain,
          projectId: env.firebase.projectId,
          storageBucket: env.firebase.storageBucket,
          messagingSenderId: env.firebase.messagingSenderId,
          appId: env.firebase.appId,
        });
  return cachedApp;
}

function isNativePlatform(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS === "ios" || Platform.OS === "android";
  } catch {
    return false;
  }
}

/**
 * React Native persistence for the JS SDK auth session.
 *
 * Third-party typing boundary: `getReactNativePersistence` exists at runtime
 * in the React Native build of firebase/auth (selected via package exports),
 * but the browser type declarations that TypeScript resolves do not declare
 * it, so we read it off the module namespace with an explicit shape.
 */
function tryReactNativePersistence(): Persistence | null {
  if (!isNativePlatform()) return null;
  try {
    const authModule = firebaseAuthModule as unknown as {
      getReactNativePersistence?: (storage: unknown) => Persistence;
    };
    if (typeof authModule.getReactNativePersistence !== "function") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorage = require("@react-native-async-storage/async-storage") as {
      default: unknown;
    };
    return authModule.getReactNativePersistence(asyncStorage.default);
  } catch {
    return null;
  }
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  const persistence = tryReactNativePersistence();
  if (persistence) {
    try {
      // Persist the bridged custom-token session across app restarts.
      cachedAuth = initializeAuth(app, { persistence });
    } catch {
      // Auth was already initialized for this app instance.
      cachedAuth = getAuth(app);
    }
  } else {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export function getFirebaseDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getFirebaseApp());
  return cachedDb;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (cachedStorage) return cachedStorage;
  cachedStorage = getStorage(getFirebaseApp());
  return cachedStorage;
}
