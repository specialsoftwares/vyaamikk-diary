/**
 * One-time migration: move legacy inline letterhead base64 from Firestore
 * into Firebase Storage. Idempotent — safe to run on every sign-in.
 */

import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";
import {
  isUserStorageAvailable,
  uploadLetterheadImage,
} from "@/services/storage/userStorage";

const log = createLogger("letterhead/storageMigration");

function configDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "config", "letterhead");
}

export async function runLetterheadStorageMigrationForUser(userId: string): Promise<void> {
  if (!userId || !isUserStorageAvailable()) return;

  try {
    const snap = await getDoc(configDocRef(userId));
    if (!snap.exists()) return;

    const data = snap.data() as Record<string, unknown>;
    const existingPath =
      typeof data.letterheadImageStoragePath === "string"
        ? data.letterheadImageStoragePath.trim()
        : "";
    if (existingPath) return;

    const legacyUri =
      typeof data.imageDataUri === "string" ? data.imageDataUri.trim() : "";
    if (!legacyUri) return;

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

    log.info("letterhead storage migration complete");
  } catch (e) {
    log.warn("letterhead storage migration failed", e);
  }
}
