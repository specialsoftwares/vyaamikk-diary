import { doc, getDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import type { PhoneE164 } from "@/domain/types";
import type { UserProfile } from "@/domain/types";
import { normaliseUserProfile } from "@/services/auth/normalizeProfile";
import { openBusinessCloud } from "@/services/privacy/businessCloudSeal";
import { normalizePhoneE164 } from "@/utils/mobileHash";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";

/** Resolve profile via canonical phone index (Firestore backends). */
export async function loadProfileByPhoneFirestore(
  phoneE164: PhoneE164
): Promise<UserProfile | null> {
  const phone = normalizePhoneE164(phoneE164);
  const db = getFirebaseDb();
  const phoneSnap = await getDoc(doc(db, PHONE_INDEX, phone));
  if (!phoneSnap.exists()) return null;
  const { uid } = phoneSnap.data() as { uid: string };
  const userSnap = await getDoc(doc(db, USERS, uid));
  if (!userSnap.exists()) return null;
  const raw = userSnap.data() as Record<string, unknown>;
  return (await openBusinessCloud(
    "users",
    normaliseUserProfile(uid, raw) as unknown as Record<string, unknown>,
    raw
  )) as unknown as UserProfile;
}

/**
 * Resolve the signed-in user's own profile directly by uid.
 *
 * Production rules lock phoneIndex down (`allow read: if false`), so the
 * phone-index path above only works with permissive dev rules. Owners can
 * always read users/{uid}, which is what production session revalidation
 * must use.
 */
export async function loadProfileByUidFirestore(
  uid: string
): Promise<UserProfile | null> {
  const db = getFirebaseDb();
  const userSnap = await getDoc(doc(db, USERS, uid));
  if (!userSnap.exists()) return null;
  const raw = userSnap.data() as Record<string, unknown>;
  return (await openBusinessCloud(
    "users",
    normaliseUserProfile(uid, raw) as unknown as Record<string, unknown>,
    raw
  )) as unknown as UserProfile;
}
