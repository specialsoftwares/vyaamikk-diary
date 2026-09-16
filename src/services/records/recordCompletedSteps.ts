/**
 * Persist completedSteps on base record documents (Firestore arrayUnion / mock dedup).
 *
 * Coordination metadata must not bump content `updatedAt`. Diary CAS compares
 * that field; a steps-only write would otherwise make a later PDF UPDATE
 * look like a remote content edit.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  arrayUnion,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";

import { mergeCompletedSteps, type SaveStepName } from "./saveLockTypes";
import type { RecordSaveKind } from "./saveIdempotency";

const log = createLogger("save/completedSteps");

/** Audit clock for step coordination — not the diary content version. */
export const COMPLETED_STEPS_AT_FIELD = "completedStepsUpdatedAt" as const;

type RecordCollection =
  | "entries"
  | "professionalPacks"
  | "purchaseOrders"
  | "customerCreditRecords"
  | "letterheadDocs";

let firestoreForTests: Firestore | null = null;

/** Node/CI seam. Production still uses getFirebaseDb(). */
export function setCompletedStepsFirestoreForTests(db: Firestore | null): void {
  firestoreForTests = db;
}

function collectionForKind(kind: RecordSaveKind): RecordCollection | null {
  switch (kind) {
    case "business_entry":
    case "draft_convert":
      return "entries";
    case "professional_pack":
      return "professionalPacks";
    case "purchase_order":
      return "purchaseOrders";
    case "customer_credit":
    case "customer_credit_closure":
    case "customer_credit_payment":
      return "customerCreditRecords";
    case "letterhead_doc":
      return "letterheadDocs";
    default:
      return null;
  }
}

function usesFirestore(): boolean {
  if (firestoreForTests) return true;
  const backend = getActiveBackend();
  return backend === "firebase-shared-dev" || backend === "firebase-production";
}

function firestoreDb(): Firestore {
  return firestoreForTests ?? getFirebaseDb();
}

function mockStorageKey(userId: string, collection: RecordCollection, recordId: string): string {
  return `vyd_steps_v1_${userId}_${collection}_${recordId}`;
}

/**
 * Primary and fallback Firestore payloads. Never includes content `updatedAt`.
 */
export function completedStepsCoordinationPatch(
  completedStepsValue: unknown,
  now = Date.now()
): Record<string, unknown> {
  return {
    completedSteps: completedStepsValue,
    [COMPLETED_STEPS_AT_FIELD]: now,
  };
}

export async function fetchRecordCompletedSteps(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string
): Promise<string[]> {
  const collection = collectionForKind(recordKind);
  if (!userId || !recordId || !collection) return [];
  try {
    if (usesFirestore()) {
      const ref = doc(firestoreDb(), "users", userId, collection, recordId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const steps = (snap.data() as { completedSteps?: unknown }).completedSteps;
      return Array.isArray(steps) ? steps.map(String) : [];
    }
    const raw = await AsyncStorage.getItem(mockStorageKey(userId, collection, recordId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendRecordCompletedStep(
  userId: string,
  recordKind: RecordSaveKind,
  recordId: string,
  step: SaveStepName
): Promise<string[]> {
  const collection = collectionForKind(recordKind);
  if (!userId || !recordId || !collection) return [];
  try {
    if (usesFirestore()) {
      const ref = doc(firestoreDb(), "users", userId, collection, recordId);
      await updateDoc(ref, completedStepsCoordinationPatch(arrayUnion(step)));
      return fetchRecordCompletedSteps(userId, recordKind, recordId);
    }
    const key = mockStorageKey(userId, collection, recordId);
    const existing = await fetchRecordCompletedSteps(userId, recordKind, recordId);
    const next = mergeCompletedSteps(existing, step);
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch (e) {
    log.warn("append step failed", { step, recordKind });
    try {
      if (usesFirestore()) {
        const ref = doc(firestoreDb(), "users", userId, collection, recordId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const merged = mergeCompletedSteps(
            Array.isArray(data.completedSteps) ? (data.completedSteps as string[]) : [],
            step
          );
          await setDoc(ref, completedStepsCoordinationPatch(merged), { merge: true });
          return merged;
        }
      }
    } catch {
      // non-fatal
    }
    return fetchRecordCompletedSteps(userId, recordKind, recordId);
  }
}
