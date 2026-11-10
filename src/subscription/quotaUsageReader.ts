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
  | {
      kind: "ok";
      monthKey: string;
      recordsThisMonth: number;
      /** Present when lifetime admission has written the free membership counter. */
      lifetimeAcceptedCount?: number;
    }
  | { kind: "malformed" }
  | { kind: "missing" }
  | { kind: "unavailable"; code: string };

export function parseQuotaUsageData(data: Record<string, unknown>): QuotaUsageRead {
  const monthKey = data.monthKey;
  const recordsThisMonth = data.recordsThisMonth;
  const lifetimeAcceptedCount = data.lifetimeAcceptedCount;
  const hasLifetime =
    typeof lifetimeAcceptedCount === "number" &&
    Number.isInteger(lifetimeAcceptedCount) &&
    lifetimeAcceptedCount >= 0;
  // Lifetime-only docs (post cutover) may omit monthly fields.
  if (hasLifetime && (monthKey == null || recordsThisMonth == null)) {
    return {
      kind: "ok",
      monthKey: typeof monthKey === "string" ? monthKey : "1970-01",
      recordsThisMonth:
        typeof recordsThisMonth === "number" && Number.isInteger(recordsThisMonth)
          ? recordsThisMonth
          : 0,
      lifetimeAcceptedCount,
    };
  }
  if (!isIstMonthKeyShape(monthKey)) return { kind: "malformed" };
  if (
    typeof recordsThisMonth !== "number" ||
    !Number.isInteger(recordsThisMonth) ||
    recordsThisMonth < 0
  ) {
    return { kind: "malformed" };
  }
  return {
    kind: "ok",
    monthKey,
    recordsThisMonth,
    ...(hasLifetime ? { lifetimeAcceptedCount } : {}),
  };
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
