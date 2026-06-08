/**
 * Public entry point for the auth service.
 *
 * Selector matrix (driven by `getActiveBackend()`):
 *
 *   ┌──────────────────────────┬─────────────────────────────────────────┐
 *   │ Mode + config            │ Implementation                          │
 *   ├──────────────────────────┼─────────────────────────────────────────┤
 *   │ prod + firebase ok       │ firebaseAuthService (real OTP + FStore) │
 *   │ prod + firebase missing  │ notConfiguredService (throws cleanly)   │
 *   │ dev + firebase ok        │ sharedDevAuthService (mock OTP + FStore)│
 *   │ dev + firebase missing   │ mockAuthService (mock OTP + AsyncStor.) │
 *   └──────────────────────────┴─────────────────────────────────────────┘
 *
 * The shared-dev row is what fixes cross-device profile sync during
 * development — it stores identity + profile in real Firestore while
 * still accepting the mock OTP `123456`.
 *
 * Screens import only from here; they never reach into a concrete adapter.
 */

import { getActiveBackend } from "@/config/env";
import { AppError } from "@/domain/errors";

import { mockAuthService } from "./mock";

import type { AuthService } from "./types";

/** Lazy adapters — avoids evaluating Firebase modules on local-mock startup. */
let cachedFirebaseAuth: AuthService | null = null;
let cachedSharedDevAuth: AuthService | null = null;

function firebaseAuthService(): AuthService {
  if (!cachedFirebaseAuth) {
    cachedFirebaseAuth = require("./firebase").firebaseAuthService as AuthService;
  }
  return cachedFirebaseAuth;
}

function sharedDevAuthService(): AuthService {
  if (!cachedSharedDevAuth) {
    cachedSharedDevAuth = require("./shared-dev").sharedDevAuthService as AuthService;
  }
  return cachedSharedDevAuth;
}

export type {
  AuthService,
  AuthResult,
  OtpChallenge,
  ProfilePatch,
} from "./types";

export function getAuthService(): AuthService {
  switch (getActiveBackend()) {
    case "firebase-production":
      return firebaseAuthService();
    case "firebase-shared-dev":
      return sharedDevAuthService();
    case "local-mock":
      return mockAuthService;
    case "not-configured":
    default:
      return notConfiguredService;
  }
}

const notConfiguredService: AuthService = {
  async startOtp() {
    throw new AppError("auth_not_configured", "Login service is not configured.");
  },
  async confirmOtp() {
    throw new AppError("auth_not_configured", "Login service is not configured.");
  },
  async signOut() {
    // no-op
  },
  async requestAccountDeletion() {
    throw new AppError("auth_not_configured", "Login service is not configured.");
  },
  async cancelAccountDeletion() {
    throw new AppError("auth_not_configured", "Login service is not configured.");
  },
  async updateProfile() {
    throw new AppError("auth_not_configured", "Login service is not configured.");
  },
  async startMobileChange() {
    throw new AppError(
      "auth_not_configured",
      "Mobile number change is support/admin-only and not available in the app."
    );
  },
  async confirmMobileChange() {
    throw new AppError(
      "auth_not_configured",
      "Mobile number change is support/admin-only and not available in the app."
    );
  },
};
