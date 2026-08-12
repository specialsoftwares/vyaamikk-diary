/**
 * Production identity operations via Firebase Callable Cloud Functions.
 *
 * Client must NOT write phoneIndex / ueidIndex / emailIndex in production.
 * Shared-dev and local-mock continue using client-side transactions.
 *
 * Uses @react-native-firebase/functions when native auth is active so the
 * callable carries the same ID token as @react-native-firebase/auth.
 *
 * CRITICAL: native `functions()` defaults to us-central1. All Vyaamikk Diary
 * callables are deployed in asia-south1 — always pass the configured region.
 */

import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

import { AppError } from "@/domain/errors";
import { getActiveBackend, env } from "@/config/env";
import { getFirebaseApp } from "@/config/firebase";
import type { PhoneE164, UserProfile } from "@/domain/types";
import { normaliseUserProfile } from "./normalizeProfile";
import { createLogger } from "@/utils/logger";
import { canonicalFunctionsRegion } from "./authFlowErrorPresentation";
import { ensureNativeAuthReadyForCallables } from "./nativeCallableAuthGate";

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

type NativeFunctionsInstance = import("@react-native-firebase/functions").FunctionsInstance;
type NativeFirebaseApp = {
  name: string;
  options?: { projectId?: string };
};

/**
 * Bind Functions to the SAME RNFirebase [DEFAULT] app as Auth, with asia-south1.
 * Prefer modular getFunctions(getApp(), region) when available; fall back to
 * namespaced functions(app, region) / functions(region).
 */
function tryNativeFunctionsForRegion(region: string): {
  fns: NativeFunctionsInstance;
  functionsAppName: string;
  functionsProjectId: string;
} | null {
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
    const appMod = require("@react-native-firebase/app") as {
      getApp?: () => NativeFirebaseApp;
      default?: { app: (name?: string) => NativeFirebaseApp };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fnsMod = require("@react-native-firebase/functions") as {
      getFunctions?: (app?: NativeFirebaseApp, region?: string) => NativeFunctionsInstance;
      default: (
        appOrRegion?: unknown,
        maybeRegion?: string
      ) => NativeFunctionsInstance & { app?: NativeFirebaseApp };
    };

    const app: NativeFirebaseApp =
      (typeof appMod.getApp === "function" ? appMod.getApp() : null) ||
      (typeof appMod.default?.app === "function" ? appMod.default.app() : null) ||
      ({ name: "[DEFAULT]", options: { projectId: env.firebase.projectId } } as NativeFirebaseApp);

    let fns: NativeFunctionsInstance & { app?: NativeFirebaseApp };
    if (typeof fnsMod.getFunctions === "function") {
      fns = fnsMod.getFunctions(app, region) as NativeFunctionsInstance & {
        app?: NativeFirebaseApp;
      };
    } else if (typeof fnsMod.default === "function") {
      fns = fnsMod.default(app, region);
    } else {
      return null;
    }

    const functionsAppName = String(fns.app?.name ?? app.name ?? "[DEFAULT]");
    const functionsProjectId = String(
      fns.app?.options?.projectId ?? app.options?.projectId ?? env.firebase.projectId ?? ""
    );
    return { fns, functionsAppName, functionsProjectId };
  } catch {
    return null;
  }
}

function functionsRegion(): string {
  return canonicalFunctionsRegion(env.firebase.functionsRegion);
}

function getJsCallableFunctions() {
  const app = getFirebaseApp();
  const region = functionsRegion();
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
  const region = functionsRegion();
  const attemptId = `fn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  let authSnap: Awaited<ReturnType<typeof ensureNativeAuthReadyForCallables>> | null = null;
  let functionsAppName = "";
  let functionsProjectId = "";
  let sameFirebaseApp: boolean | null = null;

  try {
    const nativeBundle = tryNativeFunctionsForRegion(region);
    const transport = nativeBundle ? "native" : "js";

    if (nativeBundle) {
      authSnap = await ensureNativeAuthReadyForCallables();
      functionsAppName = nativeBundle.functionsAppName;
      functionsProjectId = nativeBundle.functionsProjectId;
      sameFirebaseApp =
        authSnap.authAppName === functionsAppName &&
        (!authSnap.authProjectId ||
          !functionsProjectId ||
          authSnap.authProjectId === functionsProjectId);

      if (!sameFirebaseApp) {
        throw new AppError(
          "auth_failed",
          "Couldn't finish account setup due to a Firebase session mismatch. Please try again.",
          undefined,
          {
            authPhase: "post_auth",
            failureDomain: "functions",
            diagnosticCode: "AUTH_FUNCTIONS_APP_MISMATCH",
            callableName: name,
            functionsRegion: region,
            authAppName: authSnap.authAppName,
            functionsAppName,
            sameFirebaseApp: false,
            firebaseUserPresent: true,
            idTokenReady: authSnap.idTokenReady,
          }
        );
      }

      log.info("callable start", {
        attemptId,
        phase: "RESOLVE_OR_CREATE_START",
        callableName: name,
        functionsRegion: region,
        transport,
        authAppName: authSnap.authAppName,
        functionsAppName,
        sameFirebaseApp: true,
        firebaseUserPresent: true,
        idTokenReady: true,
        uidSuffix: authSnap.uidSuffix,
      });

      const callable = nativeBundle.fns.httpsCallable<TRequest, TResponse>(name);
      const result = await callable(data);
      log.info("callable ok", {
        attemptId,
        phase: "RESOLVE_OR_CREATE_RESPONSE",
        callableName: name,
        functionsRegion: region,
        transport,
      });
      return result.data;
    }

    log.info("callable start", {
      attemptId,
      phase: "RESOLVE_OR_CREATE_START",
      callableName: name,
      functionsRegion: region,
      transport,
    });
    const callable = httpsCallable<TRequest, TResponse>(getJsCallableFunctions(), name);
    const result = await callable(data);
    log.info("callable ok", {
      attemptId,
      phase: "RESOLVE_OR_CREATE_RESPONSE",
      callableName: name,
      functionsRegion: region,
      transport,
    });
    return result.data;
  } catch (e: unknown) {
    if (e instanceof AppError) throw e;

    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "unknown";
    log.error(`callable ${name} failed`, {
      attemptId,
      callableName: name,
      functionsRegion: region,
      code,
      firebaseUserPresent: authSnap?.uidPresent ?? null,
      idTokenReady: authSnap?.idTokenReady ?? null,
      sameFirebaseApp,
    });
    const message =
      e && typeof e === "object" && "message" in e
        ? String((e as { message: string }).message)
        : "Identity service unavailable.";
    const details = extractCallableDetails(e);
    const serverCode = typeof details?.code === "string" ? details.code : null;
    const baseDetails = {
      authPhase: "post_auth" as const,
      failureDomain: "functions" as const,
      callableName: name,
      functionsRegion: region,
      functionsErrorCode: code,
      diagnosticCode: `${code}:${region}:${name}`,
      firebaseUserPresent: authSnap?.uidPresent ?? null,
      idTokenReady: authSnap?.idTokenReady ?? null,
      authAppName: authSnap?.authAppName ?? null,
      functionsAppName: functionsAppName || null,
      sameFirebaseApp,
      uidSuffix: authSnap?.uidSuffix ?? null,
    };

    if (serverCode === "EMAIL_OTP_COOLDOWN" || code === "functions/resource-exhausted") {
      if (serverCode === "EMAIL_OTP_COOLDOWN" || details?.resendAvailableAt != null) {
        throw new AppError("email_otp_cooldown", message || "Resend is not available yet.", e, {
          ...baseDetails,
          resendAvailableAt:
            typeof details?.resendAvailableAt === "number" ? details.resendAvailableAt : null,
          retryAfterSeconds:
            typeof details?.retryAfterSeconds === "number" ? details.retryAfterSeconds : null,
        });
      }
    }
    if (code === "functions/unauthenticated") {
      throw new AppError(
        "auth_failed",
        "Your sign-in was verified, but we couldn't finish setting up your account. Please try again.",
        e,
        {
          ...baseDetails,
          diagnosticCode: `FN_UNAUTHENTICATED:${region}:${name}`,
          retryAccountSetup: true,
        }
      );
    }
    if (code === "functions/permission-denied") {
      throw new AppError("permission_denied", message, e, baseDetails);
    }
    if (code === "functions/not-found") {
      throw new AppError(
        "not_found",
        "Couldn't finish account setup. The identity service was not reached. Please try again.",
        e,
        {
          ...baseDetails,
          diagnosticCode: `FN_NOT_FOUND:${region}:${name}`,
        }
      );
    }
    if (code === "functions/failed-precondition") {
      const providerUnavailable =
        serverCode === "EMAIL_PROVIDER_UNAVAILABLE" ||
        /email delivery is temporarily unavailable/i.test(message);
      if (providerUnavailable) {
        throw new AppError(
          "otp_send_failed",
          message || "Email delivery is temporarily unavailable. Try again later.",
          e,
          {
            ...baseDetails,
            failureDomain: "email_delivery",
            diagnosticCode: "EMAIL_PROVIDER_UNAVAILABLE",
            phase: "email_send",
          }
        );
      }
      throw new AppError("permission_denied", message, e, baseDetails);
    }
    throw new AppError(
      "unknown",
      message || "Couldn't finish account setup. Please try again.",
      e,
      {
        ...baseDetails,
        retryAccountSetup: true,
      }
    );
  }
}

function extractCallableDetails(e: unknown): Record<string, unknown> | undefined {
  if (!e || typeof e !== "object") return undefined;
  const err = e as {
    details?: unknown;
    customData?: { details?: unknown };
  };
  if (err.details && typeof err.details === "object") {
    return err.details as Record<string, unknown>;
  }
  if (err.customData?.details && typeof err.customData.details === "object") {
    return err.customData.details as Record<string, unknown>;
  }
  return undefined;
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
    throw new AppError("unknown", "Identity service returned an invalid profile.", undefined, {
      authPhase: "post_auth",
      callableName: "resolveOrCreateUserByPhone",
      diagnosticCode: "IDENTITY_INVALID_PROFILE",
    });
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
    throw new AppError("unknown", "Auth bridge returned an empty token.", undefined, {
      authPhase: "post_auth",
      callableName: "mintClientAuthToken",
      diagnosticCode: "MINT_TOKEN_EMPTY",
    });
  }
  return data;
}

export interface StartEmailVerificationRequest {
  email: string;
}

export interface StartEmailVerificationResponse {
  sent: boolean;
  challengeId?: string;
  verificationId?: string;
  maskedEmail?: string;
  expiresAt?: number;
  resendAvailableAt?: number;
  version?: number;
  message?: string;
  devCodeHint?: string;
}

export interface VerifyAndBindEmailRequest {
  verificationId: string;
  challengeId?: string;
  code: string;
}

export interface VerifyAndBindEmailResponse {
  profile: Record<string, unknown>;
}

export async function callStartEmailVerification(
  email: string,
  idempotencyKey?: string
): Promise<StartEmailVerificationResponse> {
  return callFunction<
    { email: string; idempotencyKey?: string },
    StartEmailVerificationResponse
  >("startEmailVerification", { email, idempotencyKey });
}

export async function callResendEmailVerification(
  challengeId: string
): Promise<StartEmailVerificationResponse> {
  return callFunction<{ challengeId: string }, StartEmailVerificationResponse>(
    "resendEmailVerification",
    { challengeId }
  );
}

export async function callVerifyAndBindEmail(
  verificationId: string,
  code: string
): Promise<UserProfile> {
  const data = await callFunction<VerifyAndBindEmailRequest, VerifyAndBindEmailResponse>(
    "verifyAndBindEmail",
    { verificationId, code, challengeId: verificationId }
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

export interface EnsureDeletionJobResponse {
  ok: true;
  generation: number;
  graceExpiresAt: number;
  status: string;
}

/** Create/refresh server-owned deletionJobs/{uid} after pending_deletion is set. */
export async function callEnsureAccountDeletionJob(): Promise<EnsureDeletionJobResponse> {
  return callFunction<Record<string, never>, EnsureDeletionJobResponse>(
    "ensureAccountDeletionJob",
    {}
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
    throw new AppError("unknown", "Reactivation returned an invalid profile.", undefined, {
      authPhase: "post_auth",
      callableName: "completeAccountReactivation",
      diagnosticCode: "REACTIVATION_INVALID_PROFILE",
    });
  }
  return {
    profile: normaliseUserProfile(uid, data.profile),
    isNewUser: false,
  };
}

export interface PreflightVerifiedMobileChangeResponse {
  ok: true;
  operationId: string;
  noop?: boolean;
  ueid?: string;
}

export async function callPreflightVerifiedMobileContactChange(
  newerPhoneE164: PhoneE164,
  operationId?: string
): Promise<PreflightVerifiedMobileChangeResponse> {
  return callFunction<
    { newerPhoneE164: string; operationId?: string },
    PreflightVerifiedMobileChangeResponse
  >("preflightVerifiedMobileContactChange", {
    newerPhoneE164,
    ...(operationId ? { operationId } : {}),
  });
}

export interface ConfirmVerifiedMobileChangeResponse {
  ok: true;
  uid: string;
  ueid: string;
  phoneE164: string;
  alreadyComplete?: boolean;
  profile: Record<string, unknown>;
}

export async function callConfirmVerifiedMobileContactChange(args: {
  newerPhoneE164: PhoneE164;
  operationId?: string;
}): Promise<UserProfile> {
  const data = await callFunction<
    { newerPhoneE164: string; operationId?: string },
    ConfirmVerifiedMobileChangeResponse
  >("confirmVerifiedMobileContactChange", {
    newerPhoneE164: args.newerPhoneE164,
    ...(args.operationId ? { operationId: args.operationId } : {}),
  });
  const uid = String(data.profile?.uid ?? data.uid ?? "");
  if (!uid) {
    throw new AppError("unknown", "Mobile bind returned an invalid profile.", undefined, {
      authPhase: "post_auth",
      callableName: "confirmVerifiedMobileContactChange",
      diagnosticCode: "MOBILE_CHANGE_INVALID_PROFILE",
    });
  }
  return normaliseUserProfile(uid, {
    ...data.profile,
    uid,
    ueid: data.ueid ?? data.profile.ueid,
    phoneE164: data.phoneE164 ?? data.profile.phoneE164,
  });
}
