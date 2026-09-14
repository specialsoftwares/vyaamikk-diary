/**
 * Firestore access for `users/{uid}/subscription/status`.
 *
 * Read / listen only. Client writes to this document are forbidden —
 * Rules deny them and the client is not entitlement authority.
 *
 * Snapshot provenance comes from Firestore `metadata.fromCache`, never from
 * NetInfo. Default `onSnapshot` can deliver SDK cache *and* server data.
 */

import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

export interface SubscriptionDocError {
  code: string;
}

export interface SubscriptionDocSnapshot {
  data: unknown | null;
  fromCache: boolean;
}

export interface SubscriptionDocObserver {
  next: (snapshot: SubscriptionDocSnapshot) => void;
  error: (err: SubscriptionDocError) => void;
}

export type SubscriptionDocListener = (
  uid: string,
  observer: SubscriptionDocObserver
) => () => void;

export type SubscriptionDocReader = (uid: string) => Promise<unknown | null>;

export function subscriptionStatusDoc(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "subscription", "status");
}

export const listenFirestoreSubscriptionStatus: SubscriptionDocListener = (uid, observer) => {
  if (!isFirebaseConfigured()) {
    observer.next({ data: null, fromCache: true });
    return () => {};
  }
  try {
    const ref = subscriptionStatusDoc(uid);
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        observer.next({
          data: snap.exists() ? snap.data() : null,
          fromCache: snap.metadata.fromCache,
        });
      },
      (err) => {
        observer.error({ code: typeof err.code === "string" ? err.code : "unknown" });
      }
    );
  } catch {
    observer.error({ code: "unavailable" });
    return () => {};
  }
};

export const readFirestoreSubscriptionStatus: SubscriptionDocReader = async (uid) => {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDocFromServer(subscriptionStatusDoc(uid));
  return snap.exists() ? snap.data() : null;
};
