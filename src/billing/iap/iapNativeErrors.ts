/**
 * expo-iap 5.6.0 error normalization.
 * User cancellation uses ErrorCode.UserCancelled ("user-cancelled").
 * Message regex is fallback only.
 */

import { EXPO_IAP_USER_CANCELLED } from "./iapNativeCodes";

export function isUserCancelledError(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = String(error.code ?? "");
  if (code === EXPO_IAP_USER_CANCELLED || code === "user-cancelled") return true;
  if (code.endsWith("/user-cancelled") || code.endsWith(".user-cancelled")) return true;
  return /user-cancelled|user cancelled/i.test(String(error.message ?? ""));
}

export function isNativeDisconnectError(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = String(error.code ?? "");
  return (
    code === "service-disconnected" ||
    code === "not-prepared" ||
    code === "connection-closed" ||
    code === "init-connection"
  );
}

export function thrownPurchaseError(error: unknown): {
  code: string;
  message: string;
} {
  if (error && typeof error === "object") {
    const rec = error as { code?: unknown; message?: unknown };
    return {
      code: typeof rec.code === "string" ? rec.code : "",
      message: typeof rec.message === "string" ? rec.message : "Purchase didn't complete.",
    };
  }
  return { code: "", message: "Purchase didn't complete." };
}
