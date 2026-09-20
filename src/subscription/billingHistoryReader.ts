/**
 * Owner-read of users/{uid}/subscriptionBillingHistory. Collection is
 * server-written; clients must not write it.
 */

import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

import {
  parseBillingHistoryDoc,
  type SanitizedBillingHistoryRow,
} from "./billingHistoryPresentation";

export type BillingHistoryRead =
  | { kind: "ok"; rows: SanitizedBillingHistoryRow[] }
  | { kind: "unavailable"; code: string };

export async function readOwnerBillingHistory(
  uid: string,
  max = 12
): Promise<BillingHistoryRead> {
  if (!uid || !isFirebaseConfigured()) {
    return { kind: "unavailable", code: "not_configured" };
  }
  try {
    const ref = collection(getFirebaseDb(), "users", uid, "subscriptionBillingHistory");
    const q = query(ref, orderBy("occurredAt", "desc"), limit(max));
    const snap = await getDocs(q);
    const rows: SanitizedBillingHistoryRow[] = [];
    snap.forEach((docSnap) => {
      const parsed = parseBillingHistoryDoc(docSnap.id, docSnap.data());
      if (parsed) rows.push(parsed);
    });
    return { kind: "ok", rows };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    return { kind: "unavailable", code };
  }
}
