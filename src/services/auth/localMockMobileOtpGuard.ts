/**
 * Guarded local-mock mobile OTP environment — never a Firebase/shared bypass.
 */

import { AppError } from "@/domain/errors";
import { getActiveBackend, getResolvedEnvironment } from "@/config/env";
import { LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP } from "@/services/auth/mobileOtpConstants";

/**
 * All conditions required — never infer safety from `__DEV__` or Expo Go alone.
 * Requires explicit `EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP=1`.
 */
export function isApprovedLocalMockMobileOtpEnvironment(): boolean {
  const resolved = getResolvedEnvironment();
  if (resolved.getActiveBackend() !== "local-mock") return false;
  if (getActiveBackend() !== "local-mock") return false;
  if (resolved.effectiveAppMode !== "development") return false;
  if (resolved.bundledAppMode === "production") return false;
  if (resolved.isProduction) return false;
  if (process.env.EXPO_PUBLIC_LOCAL_MOCK_MOBILE_OTP !== "1") return false;
  return true;
}

export function assertDeterministicLocalMockMobileOtpAllowed(code: string): void {
  if (code.trim() !== LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP) return;
  if (!isApprovedLocalMockMobileOtpEnvironment()) {
    throw new AppError(
      "permission_denied",
      "This verification code cannot be used in this environment."
    );
  }
}

/** UI must never display the deterministic OTP — always false for product surfaces. */
export function shouldShowLocalMockMobileOtpHint(): boolean {
  return false;
}
