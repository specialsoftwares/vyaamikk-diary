/**
 * Firestore-backed letterhead repository (shared-dev / production).
 *
 * Document layout:
 *   users/{uid}/config/letterhead
 *
 * The letterhead image is stored as a base64 data URI inside the
 * Firestore document. Firestore document size limit is 1 MB. Typical
 * letterhead PNG/JPEG files compress well below that; large/PDF
 * letterheads would need Firebase Storage, which is left as a future
 * upgrade and documented in the brief's known-limits section.
 */

import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

import type { LetterheadConfig, LetterheadRepository } from "./types";

const log = createLogger("letterhead/firebase");

const APPROX_DOC_LIMIT_BYTES = 950_000; // leave headroom under the 1 MB cap

function configDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "config", "letterhead");
}

export const firebaseLetterheadRepository: LetterheadRepository = {
  async get(userId) {
    if (!userId) return null;
    const snap = await getDoc(configDocRef(userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<LetterheadConfig>;
    if (!data.imageDataUri) return null;
    return {
      userId,
      imageWidth: Number(data.imageWidth ?? 0),
      imageHeight: Number(data.imageHeight ?? 0),
      imageDataUri: String(data.imageDataUri),
      margins: data.margins ?? { topPct: 25, bottomPct: 15, leftPct: 12, rightPct: 12 },
      signatureDataUri: data.signatureDataUri ?? null,
      stampDataUri: data.stampDataUri ?? null,
      defaultSenderName: data.defaultSenderName ?? null,
      defaultSenderTitle: data.defaultSenderTitle ?? null,
      defaultComplimentaryClose: data.defaultComplimentaryClose ?? null,
      repeatTemplateAllPages: data.repeatTemplateAllPages ?? true,
      createdAt: Number(data.createdAt ?? Date.now()),
      updatedAt: Number(data.updatedAt ?? Date.now()),
    };
  },

  async save(userId, patch) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    // Approximate the serialized size; reject early with a typed error so
    // the UI can show a clean message instead of an opaque Firestore one.
    // Includes the optional signature/stamp assets, which share this doc.
    const approxSize =
      patch.imageDataUri.length +
      (patch.signatureDataUri?.length ?? 0) +
      (patch.stampDataUri?.length ?? 0) +
      256;
    if (approxSize > APPROX_DOC_LIMIT_BYTES) {
      throw new AppError(
        "save_failed",
        "Letterhead image is too large. Try a smaller image (under ~700 KB)."
      );
    }
    const now = Date.now();
    const existing = await this.get(userId);
    // Firestore rejects `undefined` — coerce optional asset/default fields to
    // null so a partial patch never throws an opaque serialization error.
    const next: LetterheadConfig = {
      ...patch,
      signatureDataUri: patch.signatureDataUri ?? null,
      stampDataUri: patch.stampDataUri ?? null,
      defaultSenderName: patch.defaultSenderName ?? null,
      defaultSenderTitle: patch.defaultSenderTitle ?? null,
      defaultComplimentaryClose: patch.defaultComplimentaryClose ?? null,
      repeatTemplateAllPages: patch.repeatTemplateAllPages ?? true,
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await setDoc(configDocRef(userId), next, { merge: false });
    log.info("letterhead saved (firebase)");
    return next;
  },

  async remove(userId) {
    if (!userId) return;
    try {
      await deleteDoc(configDocRef(userId));
      log.info("letterhead removed (firebase)");
    } catch (e) {
      log.warn("remove failed", e);
      throw new AppError("delete_failed", "Could not remove letterhead.");
    }
  },
};
