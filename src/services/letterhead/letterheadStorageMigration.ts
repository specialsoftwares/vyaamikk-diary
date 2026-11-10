/**
 * One-time migration: move legacy inline letterhead base64 from Firestore
 * into Firebase Storage. Idempotent and versioned per user.
 *
 * Runs in the background only — never gates navigation or feature actions.
 * Skips entirely in local-mock (no Firebase reads/writes).
 */

import type { ActiveBackend } from "@/config/runtimeEnvironment";
import {
  LETTERHEAD_STORAGE_MIGRATION_VERSION,
  letterheadMigrationStorageKey,
  shouldRunLetterheadStorageMigration,
} from "@/services/letterhead/letterheadMigrationPolicy";
import { mayIssueRemoteWork, syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";

async function note(level: "info" | "warn", message: string, extra?: unknown): Promise<void> {
  try {
    const { createLogger } = await import("@/utils/logger");
    const log = createLogger("letterhead/storageMigration");
    if (level === "info") log.info(message, extra);
    else log.warn(message, extra);
  } catch {
    // A test host that cannot parse React Native still runs the migration decision.
  }
}

type LetterheadConfigRead =
  | { exists: false }
  | { exists: true; data: Record<string, unknown> };

export type LetterheadMigrationIo = {
  backend: ActiveBackend;
  firebaseConfigured: boolean;
  storageAvailable: boolean;
  readCompleted: (userId: string) => Promise<boolean>;
  markCompleted: (userId: string) => Promise<void>;
  readConfig: (userId: string) => Promise<LetterheadConfigRead>;
  writeConfig: (
    userId: string,
    uploaded: { storagePath: string; downloadUrl?: string },
    migratedAt: number
  ) => Promise<void>;
  upload: (
    userId: string,
    imageUri: string,
    fileName: string | undefined,
    session: SyncSessionToken | null
  ) => Promise<{ storagePath: string; downloadUrl?: string }>;
};

async function productionLetterheadMigrationIo(): Promise<LetterheadMigrationIo> {
  const [{ getActiveBackend, isFirebaseConfigured }, { getFirebaseDb }, { deleteField, doc, getDoc, updateDoc }, { isUserStorageAvailable, uploadLetterheadImage }, { default: AsyncStorage }] =
    await Promise.all([
      import("@/config/env"),
      import("@/config/firebase"),
      import("firebase/firestore"),
      import("@/services/storage/userStorage"),
      import("@react-native-async-storage/async-storage"),
    ]);
  const configDoc = (userId: string) => doc(getFirebaseDb(), "users", userId, "config", "letterhead");
  return {
    backend: getActiveBackend(),
    firebaseConfigured: isFirebaseConfigured(),
    storageAvailable: isUserStorageAvailable(),
    async readCompleted(userId) {
      const raw = await AsyncStorage.getItem(letterheadMigrationStorageKey(userId));
      return raw === String(LETTERHEAD_STORAGE_MIGRATION_VERSION);
    },
    async markCompleted(userId) {
      await AsyncStorage.setItem(letterheadMigrationStorageKey(userId), String(LETTERHEAD_STORAGE_MIGRATION_VERSION));
    },
    async readConfig(userId) {
      const snap = await getDoc(configDoc(userId));
      if (!snap.exists()) return { exists: false };
      return { exists: true, data: snap.data() as Record<string, unknown> };
    },
    async writeConfig(userId, uploaded, migratedAt) {
      await updateDoc(configDoc(userId), {
        letterheadImageStoragePath: uploaded.storagePath,
        letterheadImageDownloadUrl: uploaded.downloadUrl ?? null,
        letterheadImageUpdatedAt: migratedAt,
        letterheadStorageMigratedAt: migratedAt,
        imageDataUri: deleteField(),
      });
    },
    upload: (userId, imageUri, fileName, session) => uploadLetterheadImage(userId, imageUri, fileName, session),
  };
}

/**
 * Background-only. Safe to call after sign-in; callers must not await this
 * on the interaction/navigation path. The session is the one current at entry.
 * A replacement session does not publish the migrated path.
 */
export async function runLetterheadStorageMigrationForUser(
  userId: string,
  io?: LetterheadMigrationIo
): Promise<void> {
  const session = syncSessionOwnership.capture();
  const ports = io ?? (await productionLetterheadMigrationIo());
  const backend = ports.backend;
  const alreadyCompleted = userId ? await ports.readCompleted(userId) : true;

  if (
    !shouldRunLetterheadStorageMigration({
      userId,
      backend,
      firebaseConfigured: ports.firebaseConfigured,
      storageAvailable: ports.storageAvailable,
      alreadyCompletedForVersion: alreadyCompleted,
    })
  ) {
    if (__DEV__ && backend === "local-mock") {
      await note("info", "letterhead storage migration skipped (local-mock)");
    }
    return;
  }
  if (!mayIssueRemoteWork(session, userId)) return;

  try {
    const config = await ports.readConfig(userId);
    if (!mayIssueRemoteWork(session, userId)) return;
    if (!config.exists) {
      await ports.markCompleted(userId);
      return;
    }

    const data = config.data;
    const existingPath =
      typeof data.letterheadImageStoragePath === "string"
        ? data.letterheadImageStoragePath.trim()
        : "";
    if (existingPath) {
      await ports.markCompleted(userId);
      return;
    }

    const legacyUri =
      typeof data.imageDataUri === "string" ? data.imageDataUri.trim() : "";
    if (!legacyUri) {
      await ports.markCompleted(userId);
      return;
    }

    const migratedAt = Date.now();
    const fileName = `letterhead-migrated-${migratedAt}.png`;
    if (!mayIssueRemoteWork(session, userId)) return;
    const uploaded = await ports.upload(userId, legacyUri, fileName, session);
    if (!mayIssueRemoteWork(session, userId)) return;
    await ports.writeConfig(userId, uploaded, migratedAt);
    if (!mayIssueRemoteWork(session, userId)) return;
    await ports.markCompleted(userId);
    await note("info", "letterhead storage migration complete", {
      version: LETTERHEAD_STORAGE_MIGRATION_VERSION,
    });
  } catch (e) {
    // permission-denied and network errors are recoverable — never mark success.
    await note("warn", "letterhead storage migration failed", e);
  }
}
