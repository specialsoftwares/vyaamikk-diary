import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import type { PhoneE164, UEID } from "@/domain/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("accountDeletion/retired");

const LOCAL_RETIRED_KEY = "vyd_retired_phones_v1";
const FIRESTORE_RETIRED_COLLECTION = "retiredPhones";

interface RetiredPhoneRecord {
  phoneE164: PhoneE164;
  retiredUeid: UEID;
  deletedAt: number;
}

type LocalRetiredStore = Record<string, RetiredPhoneRecord>;

async function loadLocalRetired(): Promise<LocalRetiredStore> {
  const raw = await AsyncStorage.getItem(LOCAL_RETIRED_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as LocalRetiredStore;
  } catch {
    return {};
  }
}

async function saveLocalRetired(store: LocalRetiredStore): Promise<void> {
  await AsyncStorage.setItem(LOCAL_RETIRED_KEY, JSON.stringify(store));
}

/** Device cache — used by local-mock confirmOtp. */
export async function isPhoneRetiredLocally(phoneE164: PhoneE164): Promise<boolean> {
  const store = await loadLocalRetired();
  return store[phoneE164] != null;
}

export async function recordRetiredPhoneLocal(
  phoneE164: PhoneE164,
  retiredUeid: UEID
): Promise<void> {
  const store = await loadLocalRetired();
  store[phoneE164] = { phoneE164, retiredUeid, deletedAt: Date.now() };
  await saveLocalRetired(store);
  log.info("retired phone (local)", { phone: phoneE164, ueid: retiredUeid });
}

/** Firestore tombstone — blocks UEID resurrection on shared-dev / production. */
export async function recordRetiredPhoneFirestore(
  phoneE164: PhoneE164,
  retiredUeid: UEID,
  uid: string
): Promise<void> {
  const backend = getActiveBackend();
  if (backend !== "firebase-production" && backend !== "firebase-shared-dev") return;

  const db = getFirebaseDb();
  await setDoc(doc(db, FIRESTORE_RETIRED_COLLECTION, phoneE164), {
    phoneE164,
    retiredUeid,
    uid,
    deletedAt: Date.now(),
    status: "deleted",
  });
  log.info("retired phone (firestore)", { phone: phoneE164, ueid: retiredUeid });
}

export async function isPhoneRetiredFirestore(phoneE164: PhoneE164): Promise<boolean> {
  const backend = getActiveBackend();
  if (backend !== "firebase-production" && backend !== "firebase-shared-dev") {
    return isPhoneRetiredLocally(phoneE164);
  }
  try {
    const snap = await getDoc(doc(getFirebaseDb(), FIRESTORE_RETIRED_COLLECTION, phoneE164));
    return snap.exists();
  } catch (e) {
    log.warn("isPhoneRetiredFirestore", e);
    return isPhoneRetiredLocally(phoneE164);
  }
}

export async function recordRetiredPhone(
  phoneE164: PhoneE164,
  retiredUeid: UEID,
  uid: string
): Promise<void> {
  await recordRetiredPhoneLocal(phoneE164, retiredUeid);
  await recordRetiredPhoneFirestore(phoneE164, retiredUeid, uid);
}
