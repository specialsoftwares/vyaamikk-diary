/**
 * Firestore access for `users/{uid}/subscription/status`.
 *
 * Read / listen only. Client writes to this document are forbidden —
 * Rules deny them and the client is not entitlement authority.
 */

import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

export interface SubscriptionDocError {
  code: string;
}

export interface SubscriptionDocObserver {
  next: (data: unknown | null) => void;
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
    observer.next(null);
    return () => {};
  }
  try {
    const ref = subscriptionStatusDoc(uid);
    return onSnapshot(
      ref,
      (snap) => {
        observer.next(snap.exists() ? snap.data() : null);
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
