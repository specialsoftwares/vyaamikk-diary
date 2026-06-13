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
import { getAuth, type Auth } from "firebase/auth";
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

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
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
