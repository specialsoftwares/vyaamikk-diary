/**
 * Production identity operations via Firebase Callable Cloud Functions.
 *
 * Client must NOT write phoneIndex / ueidIndex / emailIndex in production.
 * Shared-dev and local-mock continue using client-side transactions.
 *
 * Uses @react-native-firebase/functions when native auth is active so the
 * callable carries the same ID token as @react-native-firebase/auth.
 */

import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

import { AppError } from "@/domain/errors";
import { getActiveBackend, env } from "@/config/env";
import { getFirebaseApp } from "@/config/firebase";
import type { PhoneE164, UserProfile } from "@/domain/types";
import { normaliseUserProfile } from "./normalizeProfile";
import { createLogger } from "@/utils/logger";

import type { AuthResult } from "./types";
import {
  routeResolveByPhoneResponse,
  type DeletionPendingResponse,
  type ResolveByPhoneResponse,
} from "./reactivationRouting";

const log = createLogger("auth/identityCallable");

let emulatorConnected = false;

function isNativePhoneAuthLinked(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isNativePhoneAuthAvailable } = require("./nativePhoneAuth") as {
      isNativePhoneAuthAvailable: () => boolean;
    };
    return isNativePhoneAuthAvailable();
  } catch {
    return false;
  }
}

function tryNativeFunctions():
  | (() => import("@react-native-firebase/functions").FunctionsInstance)
  | null {
  let isWeb = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    isWeb = Platform.OS === "web";
  } catch {
    isWeb = false;
  }
  if (isWeb || !isNativePhoneAuthLinked()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/functions") as {
      default: () => import("@react-native-firebase/functions").FunctionsInstance;
    };
    return mod.default;
  } catch {
    return null;
  }
}

function getJsCallableFunctions() {
  const app = getFirebaseApp();
  const region = env.firebase.functionsRegion;
  const fns = getFunctions(app, region || undefined);
  if (__DEV__ && process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST && !emulatorConnected) {
    const [host, portStr] = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST.split(":");
    const port = Number(portStr ?? "5001");
    try {
      connectFunctionsEmulator(fns, host, port);
      emulatorConnected = true;
      log.info("connected functions emulator");
    } catch (e) {
      log.warn("functions emulator connect failed", e);
    }
  }
  return fns;
}

async function callFunction<TRequest, TResponse>(
  name: string,
  data: TRequest
): Promise<TResponse> {
  try {
    const nativeFns = tryNativeFunctions();
    if (nativeFns) {
      const callable = nativeFns().httpsCallable<TRequest, TResponse>(name);
      const result = await callable(data);
      return result.data;
    }
    const callable = httpsCallable<TRequest, TResponse>(getJsCallableFunctions(), name);
    const result = await callable(data);
    return result.data;
  } catch (e: unknown) {
    log.error(`callable ${name} failed`, e);
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "unknown";
    const message =
      e && typeof e === "object" && "message" in e
        ? String((e as { message: string }).message)
        : "Identity service unavailable.";
    if (code === "functions/unauthenticated") {
      throw new AppError("permission_denied", "Sign in again to continue.");
    }
    if (code === "functions/permission-denied") {
      throw new AppError("permission_denied", message);
    }
    if (code === "functions/not-found") {
      throw new AppError("not_found", message);
    }
    if (code === "functions/failed-precondition") {
      throw new AppError("permission_denied", message);
    }
    throw new AppError("unknown", message);
  }
}

export function useIdentityCallables(): boolean {
  return getActiveBackend() === "firebase-production";
}

interface ResolveByPhoneRequest {
  phoneE164: PhoneE164;
}

export type { DeletionPendingResponse, ResolveByPhoneResponse } from "./reactivationRouting";

/** Post-OTP identity resolve — server writes indexes via Admin SDK. */
export async function callResolveOrCreateUserByPhone(
  phoneE164: PhoneE164
): Promise<AuthResult> {
  const raw = await callFunction<ResolveByPhoneRequest, ResolveByPhoneResponse>(
    "resolveOrCreateUserByPhone",
    { phoneE164 }
  );
  const data = routeResolveByPhoneResponse(raw);
  const uid = String(data.profile.uid ?? "");
  if (!uid) {
    throw new AppError("unknown", "Identity service returned an invalid profile.");
  }
  return {
    profile: normaliseUserProfile(uid, data.profile),
    isNewUser: Boolean(data.isNewUser),
  };
}

export interface MintClientAuthTokenResponse {
  token: string;
}

/**
 * Mint a custom token for the native-auth uid so the firebase JS SDK
 * (Firestore/Storage) can sign in as the same user. Must be called over
 * the native functions SDK so request.auth carries the native session.
 */
export async function callMintClientAuthToken(): Promise<MintClientAuthTokenResponse> {
  const data = await callFunction<Record<string, never>, MintClientAuthTokenResponse>(
    "mintClientAuthToken",
    {}
  );
  if (!data?.token) {
    throw new AppError("unknown", "Auth bridge returned an empty token.");
  }
  return data;
}

export interface StartEmailVerificationRequest {
  email: string;
}

export interface StartEmailVerificationResponse {
  sent: boolean;
  verificationId?: string;
  message?: string;
}

export async function callStartEmailVerification(
  email: string
): Promise<StartEmailVerificationResponse> {
  return callFunction<StartEmailVerificationRequest, StartEmailVerificationResponse>(
    "startEmailVerification",
    { email }
  );
}

export interface VerifyAndBindEmailRequest {
  verificationId: string;
  code: string;
}

export interface VerifyAndBindEmailResponse {
  profile: Record<string, unknown>;
}

export async function callVerifyAndBindEmail(
  verificationId: string,
  code: string
): Promise<UserProfile> {
  const data = await callFunction<VerifyAndBindEmailRequest, VerifyAndBindEmailResponse>(
    "verifyAndBindEmail",
    { verificationId, code }
  );
  const uid = String(data.profile.uid ?? "");
  return normaliseUserProfile(uid, data.profile);
}

export interface CompleteDeletionRequest {
  uid: string;
}

export interface CompleteDeletionResponse {
  ok: boolean;
  detail?: string;
}

export async function callCompleteAccountDeletion(uid: string): Promise<CompleteDeletionResponse> {
  return callFunction<CompleteDeletionRequest, CompleteDeletionResponse>(
    "completeAccountDeletion",
    { uid }
  );
}

export interface StartAccountReactivationResponse {
  verificationId: string;
  maskedEmail: string;
  requiresEmailVerification: true;
}

export async function callStartAccountReactivation(): Promise<StartAccountReactivationResponse> {
  return callFunction<Record<string, never>, StartAccountReactivationResponse>(
    "startAccountReactivation",
    {}
  );
}

export interface CompleteAccountReactivationResponse {
  profile: Record<string, unknown>;
  isNewUser: false;
}

export async function callCompleteAccountReactivation(): Promise<AuthResult> {
  const data = await callFunction<
    Record<string, never>,
    CompleteAccountReactivationResponse
  >("completeAccountReactivation", {});
  const uid = String(data.profile.uid ?? "");
  if (!uid) {
    throw new AppError("unknown", "Reactivation returned an invalid profile.");
  }
  return {
    profile: normaliseUserProfile(uid, data.profile),
    isNewUser: false,
  };
}
