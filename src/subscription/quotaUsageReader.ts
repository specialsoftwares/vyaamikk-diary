/**
 * Owner-read of users/{uid}/subscription/usageCurrent. Missing or denied
 * documents are unavailable — never invent a used count. Prior-month
 * documents are returned as written; presentation compares monthKey.
 */

import { doc, getDoc } from "firebase/firestore";

import { isIstMonthKeyShape } from "@/billing/istMonthKey";
import { getFirebaseDb } from "@/config/firebase";
import { isFirebaseConfigured } from "@/config/env";

export type QuotaUsageRead =
  | { kind: "ok"; monthKey: string; recordsThisMonth: number }
  | { kind: "malformed" }
  | { kind: "missing" }
  | { kind: "unavailable"; code: string };

export function parseQuotaUsageData(data: Record<string, unknown>): QuotaUsageRead {
  const monthKey = data.monthKey;
  const recordsThisMonth = data.recordsThisMonth;
  if (!isIstMonthKeyShape(monthKey)) return { kind: "malformed" };
  if (
    typeof recordsThisMonth !== "number" ||
    !Number.isInteger(recordsThisMonth) ||
    recordsThisMonth < 0
  ) {
    return { kind: "malformed" };
  }
  return { kind: "ok", monthKey, recordsThisMonth };
}

export async function readOwnerQuotaUsage(uid: string): Promise<QuotaUsageRead> {
  if (!uid || !isFirebaseConfigured()) {
    return { kind: "unavailable", code: "not_configured" };
  }
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid, "subscription", "usageCurrent"));
    if (!snap.exists()) return { kind: "missing" };
    return parseQuotaUsageData(snap.data() as Record<string, unknown>);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    return { kind: "unavailable", code };
  }
}
