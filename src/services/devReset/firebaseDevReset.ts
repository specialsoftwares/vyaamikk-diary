/**
 * DEV-ONLY Firestore cleanup for firebase-shared-dev.
 * Uses client SDK — may fail on locked indexes (phoneIndex/emailIndex/ueidIndex).
 * NOT for production Firebase projects.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  writeBatch,
} from "firebase/firestore";

import { env, getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { createLogger } from "@/utils/logger";

import { assertFirebaseDevResetAllowed } from "./guards";
import type { DevResetTarget } from "./resetLocalTargeted";

const log = createLogger("devReset/firebase");

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const EMAIL_INDEX = "emailIndex";
const UEID_INDEX = "ueidIndex";
const RETIRED_PHONES = "retiredPhones";
const DELETION_REQUESTS = "deletionRequests";

const SUBCOLLECTIONS = ["entries", "professionalPacks", "letterheadDocs"] as const;

export interface DevFirebaseResetResult {
  scope: "firebase_all" | "firebase_targeted";
  projectId: string;
  usersDeleted: number;
  warnings: string[];
}

async function deleteQueryBatch(
  colRef: ReturnType<typeof collection>,
  batchSize = 400
): Promise<number> {
  const snap = await getDocs(query(colRef, limit(batchSize)));
  if (snap.empty) return 0;
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function purgeUserFirestore(uid: string, warnings: string[]): Promise<void> {
  const db = getFirebaseDb();
  for (const name of SUBCOLLECTIONS) {
    try {
      let loops = 0;
      while (loops < 50) {
        loops += 1;
        const n = await deleteQueryBatch(collection(db, USERS, uid, name));
        if (n < 400) break;
      }
    } catch (e) {
      warnings.push(`subcollection ${name}/${uid}: ${String(e)}`);
    }
  }
  try {
    await deleteDoc(doc(db, USERS, uid, "config", "letterhead"));
  } catch {
    // optional
  }
  try {
    await deleteDoc(doc(db, USERS, uid));
  } catch (e) {
    warnings.push(`users/${uid}: ${String(e)}`);
  }
}

async function deleteIndexDoc(collectionName: string, id: string, warnings: string[]): Promise<void> {
  try {
    await deleteDoc(doc(getFirebaseDb(), collectionName, id));
  } catch (e) {
    warnings.push(`${collectionName}/${id}: ${String(e)}`);
  }
}

async function resolveFirestoreUser(target: DevResetTarget): Promise<UserProfile | null> {
  const db = getFirebaseDb();

  if (target.phone?.trim()) {
    const phone = normalizePhoneE164(target.phone.trim()) as PhoneE164;
    const phoneSnap = await getDoc(doc(db, PHONE_INDEX, phone));
    if (!phoneSnap.exists()) return null;
    const { uid } = phoneSnap.data() as { uid: string };
    const userSnap = await getDoc(doc(db, USERS, uid));
    if (!userSnap.exists()) return null;
    return userSnap.data() as UserProfile;
  }

  if (target.email?.trim()) {
    const hash = hashEmail(normalizeEmail(target.email));
    const emailSnap = await getDoc(doc(db, EMAIL_INDEX, hash));
    if (emailSnap.exists()) {
      const { userId } = emailSnap.data() as { userId: string };
      const userSnap = await getDoc(doc(db, USERS, userId));
      if (userSnap.exists()) return userSnap.data() as UserProfile;
    }
    return null;
  }

  if (target.ueid?.trim()) {
    const ueid = target.ueid.trim().toUpperCase() as UEID;
    const ueidSnap = await getDoc(doc(db, UEID_INDEX, ueid));
    if (!ueidSnap.exists()) return null;
    const { uid } = ueidSnap.data() as { uid: string };
    const userSnap = await getDoc(doc(db, USERS, uid));
    if (!userSnap.exists()) return null;
    return userSnap.data() as UserProfile;
  }

  return null;
}

async function deleteUserFromFirestore(profile: UserProfile, warnings: string[]): Promise<void> {
  await purgeUserFirestore(profile.uid, warnings);
  await deleteIndexDoc(PHONE_INDEX, profile.phoneE164, warnings);
  if (profile.emailHash) {
    await deleteIndexDoc(EMAIL_INDEX, profile.emailHash, warnings);
  }
  await deleteIndexDoc(UEID_INDEX, profile.ueid, warnings);
  await deleteIndexDoc(RETIRED_PHONES, profile.phoneE164, warnings);
  await deleteIndexDoc(DELETION_REQUESTS, profile.uid, warnings);
}

/** Best-effort count of Firestore `users` docs (shared-dev QA only). */
export async function countFirestoreDevUsers(): Promise<number | null> {
  const backend = getActiveBackend();
  if (backend !== "firebase-shared-dev") return null;
  try {
    const snap = await getDocs(collection(getFirebaseDb(), USERS));
    return snap.size;
  } catch (e) {
    log.warn("countFirestoreDevUsers failed", e);
    return null;
  }
}

/** Delete ALL users in Firestore — dev shared project wipe. Use with care. */
export async function resetAllFirebaseDevData(
  confirmation: string
): Promise<DevFirebaseResetResult> {
  assertFirebaseDevResetAllowed(confirmation, env.firebase.projectId);
  const warnings: string[] = [];
  const db = getFirebaseDb();

  const usersSnap = await getDocs(collection(db, USERS));
  let count = 0;
  for (const userDoc of usersSnap.docs) {
    const profile = userDoc.data() as UserProfile;
    profile.uid = userDoc.id;
    await deleteUserFromFirestore(profile, warnings);
    count += 1;
  }

  for (const indexCollection of [PHONE_INDEX, EMAIL_INDEX, UEID_INDEX, RETIRED_PHONES] as const) {
    try {
      let loops = 0;
      while (loops < 50) {
        loops += 1;
        const n = await deleteQueryBatch(collection(db, indexCollection));
        if (n < 400) break;
      }
    } catch (e) {
      warnings.push(`${indexCollection} sweep: ${String(e)}`);
    }
  }

  log.info("resetAllFirebaseDevData", { count, projectId: env.firebase.projectId });
  return {
    scope: "firebase_all",
    projectId: env.firebase.projectId,
    usersDeleted: count,
    warnings,
  };
}

export async function resetFirebaseDevDataForTarget(
  confirmation: string,
  target: DevResetTarget
): Promise<DevFirebaseResetResult> {
  assertFirebaseDevResetAllowed(confirmation, env.firebase.projectId);
  const warnings: string[] = [];

  const profile = await resolveFirestoreUser(target);
  if (!profile) {
    return {
      scope: "firebase_targeted",
      projectId: env.firebase.projectId,
      usersDeleted: 0,
      warnings: ["No matching user found in Firestore."],
    };
  }

  await deleteUserFromFirestore(profile, warnings);
  return {
    scope: "firebase_targeted",
    projectId: env.firebase.projectId,
    usersDeleted: 1,
    warnings,
  };
}
