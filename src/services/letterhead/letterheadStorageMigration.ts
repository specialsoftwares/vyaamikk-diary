/**
 * One-time migration: move legacy inline letterhead base64 from Firestore
 * into Firebase Storage. Idempotent and versioned per user.
 *
 * Runs in the background only — never gates navigation or feature actions.
 * Skips entirely in local-mock (no Firebase reads/writes).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";

import { getActiveBackend, isFirebaseConfigured } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";
import {
  isUserStorageAvailable,
  uploadLetterheadImage,
} from "@/services/storage/userStorage";
import {
  LETTERHEAD_STORAGE_MIGRATION_VERSION,
  letterheadMigrationStorageKey,
  shouldRunLetterheadStorageMigration,
} from "@/services/letterhead/letterheadMigrationPolicy";

const log = createLogger("letterhead/storageMigration");

function configDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "config", "letterhead");
}

async function hasCompletedMigration(userId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(letterheadMigrationStorageKey(userId));
  return raw === String(LETTERHEAD_STORAGE_MIGRATION_VERSION);
}

async function markMigrationComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(
    letterheadMigrationStorageKey(userId),
    String(LETTERHEAD_STORAGE_MIGRATION_VERSION)
  );
}

/**
 * Background-only. Safe to call after sign-in; callers must not await this
 * on the interaction/navigation path.
 */
export async function runLetterheadStorageMigrationForUser(userId: string): Promise<void> {
  const backend = getActiveBackend();
  const alreadyCompleted = userId ? await hasCompletedMigration(userId) : true;

  if (
    !shouldRunLetterheadStorageMigration({
      userId,
      backend,
      firebaseConfigured: isFirebaseConfigured(),
      storageAvailable: isUserStorageAvailable(),
      alreadyCompletedForVersion: alreadyCompleted,
    })
  ) {
    if (__DEV__ && backend === "local-mock") {
      log.info("letterhead storage migration skipped (local-mock)");
    }
    return;
  }

  try {
    const snap = await getDoc(configDocRef(userId));
    if (!snap.exists()) {
      await markMigrationComplete(userId);
      return;
    }

    const data = snap.data() as Record<string, unknown>;
    const existingPath =
      typeof data.letterheadImageStoragePath === "string"
        ? data.letterheadImageStoragePath.trim()
        : "";
    if (existingPath) {
      await markMigrationComplete(userId);
      return;
    }

    const legacyUri =
      typeof data.imageDataUri === "string" ? data.imageDataUri.trim() : "";
    if (!legacyUri) {
      await markMigrationComplete(userId);
      return;
    }

    const migratedAt = Date.now();
    const fileName = `letterhead-migrated-${migratedAt}.png`;
    const uploaded = await uploadLetterheadImage(userId, legacyUri, fileName);

    await updateDoc(configDocRef(userId), {
      letterheadImageStoragePath: uploaded.storagePath,
      letterheadImageDownloadUrl: uploaded.downloadUrl ?? null,
      letterheadImageUpdatedAt: migratedAt,
      letterheadStorageMigratedAt: migratedAt,
      imageDataUri: deleteField(),
    });

    await markMigrationComplete(userId);
    log.info("letterhead storage migration complete", {
      version: LETTERHEAD_STORAGE_MIGRATION_VERSION,
    });
  } catch (e) {
    // permission-denied and network errors are recoverable — never mark success.
    log.warn("letterhead storage migration failed", e);
  }
}
