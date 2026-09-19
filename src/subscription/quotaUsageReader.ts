/**
 * Owner-read of users/{uid}/subscription/usageCurrent. Missing or denied
 * documents are unavailable — never invent a used count.
 */

import { doc, getDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

export type QuotaUsageRead =
  | { kind: "ok"; monthKey: string; recordsThisMonth: number }
  | { kind: "missing" }
  | { kind: "unavailable"; code: string };

export async function readOwnerQuotaUsage(uid: string): Promise<QuotaUsageRead> {
  if (!uid || !isFirebaseConfigured()) {
    return { kind: "unavailable", code: "not_configured" };
  }
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid, "subscription", "usageCurrent"));
    if (!snap.exists()) return { kind: "missing" };
    const data = snap.data() as Record<string, unknown>;
    const monthKey = typeof data.monthKey === "string" ? data.monthKey : "";
    const recordsThisMonth =
      typeof data.recordsThisMonth === "number" && Number.isFinite(data.recordsThisMonth)
        ? data.recordsThisMonth
        : null;
    if (!monthKey || recordsThisMonth == null) {
      return { kind: "unavailable", code: "malformed" };
    }
    return { kind: "ok", monthKey, recordsThisMonth };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    return { kind: "unavailable", code };
  }
}
