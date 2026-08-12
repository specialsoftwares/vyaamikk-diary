/**
 * Firebase Admin accessors for Cloud Functions.
 *
 * Eagerly initializes the default app at module load. Live asia-south1 logs
 * (2026-08-07) showed getFirestore() throwing `app/no-app` after a lazy
 * ensureApp() path — recover once by forcing a default app before retry.
 */
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";

function ensureDefaultApp(): void {
  if (getApps().length === 0) {
    initializeApp();
    return;
  }
  try {
    getApp();
  } catch {
    initializeApp();
  }
}

/** Module-load init for Cloud Functions Gen2 cold starts. */
ensureDefaultApp();

function isNoAppError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const info = (err as { errorInfo?: { code?: string }; code?: string }).errorInfo;
  const code = info?.code ?? (err as { code?: string }).code;
  return code === "app/no-app";
}

function withDefaultApp<T>(read: () => T): T {
  ensureDefaultApp();
  try {
    return read();
  } catch (err) {
    if (!isNoAppError(err)) throw err;
    logger.warn("admin_sdk_reinit_after_no_app", {
      appsBefore: getApps().length,
    });
    if (getApps().length === 0) {
      initializeApp();
    } else {
      try {
        getApp();
      } catch {
        initializeApp();
      }
    }
    return read();
  }
}

export function getAdminDb() {
  return withDefaultApp(() => getFirestore(getApp()));
}

export function getAdminAuth() {
  return withDefaultApp(() => getAuth(getApp()));
}

export function getAdminBucket() {
  return withDefaultApp(() => getStorage(getApp()).bucket());
}
