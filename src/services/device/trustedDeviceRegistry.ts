/**
 * Trusted-device registry — account security / session continuity only.
 *
 * Privacy: uses app-generated `deviceInstallationId` (SecureStore), never IMEI,
 * hardware serial, or advertising ID. Not used for cross-app tracking.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import type { UserProfile } from "@/domain/types";
import { createLogger } from "@/utils/logger";

import { getOrCreateDeviceInstallationId } from "./deviceInstallationId";

const log = createLogger("device/trusted");

export type TrustedDeviceStatus = "active" | "revoked";

export interface TrustedDeviceRecord {
  userId: string;
  ueid: string;
  deviceInstallationId: string;
  platform: "ios" | "android" | "other";
  appVersion: string | null;
  buildNumber: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  lastLoginAt: number;
  status: TrustedDeviceStatus;
  pushToken?: string | null;
}

function platformLabel(): TrustedDeviceRecord["platform"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "other";
}

/** Record or refresh this install on successful sign-in (best-effort, non-blocking). */
export async function recordTrustedDeviceLogin(user: UserProfile): Promise<void> {
  const backend = getActiveBackend();
  if (backend !== "firebase-production" && backend !== "firebase-shared-dev") {
    return;
  }

  try {
    const deviceInstallationId = await getOrCreateDeviceInstallationId();
    const now = Date.now();
    const ref = doc(
      getFirebaseDb(),
      "users",
      user.uid,
      "trustedDevices",
      deviceInstallationId
    );
    const existing = await getDoc(ref);
    const firstSeenAt = existing.exists()
      ? Number((existing.data() as { firstSeenAt?: number }).firstSeenAt ?? now)
      : now;

    const payload: TrustedDeviceRecord = {
      userId: user.uid,
      ueid: user.ueid,
      deviceInstallationId,
      platform: platformLabel(),
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber:
        Constants.expoConfig?.ios?.buildNumber?.toString() ??
        Constants.expoConfig?.android?.versionCode?.toString() ??
        null,
      firstSeenAt,
      lastSeenAt: now,
      lastLoginAt: now,
      status: "active",
    };

    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    log.warn("trusted device record failed");
    if (__DEV__) log.warn(String(e));
  }
}

/** Refresh lastSeenAt on foreground without treating as a new login. */
export async function touchTrustedDevice(user: UserProfile): Promise<void> {
  const backend = getActiveBackend();
  if (backend !== "firebase-production" && backend !== "firebase-shared-dev") {
    return;
  }

  try {
    const deviceInstallationId = await getOrCreateDeviceInstallationId();
    const now = Date.now();
    const ref = doc(
      getFirebaseDb(),
      "users",
      user.uid,
      "trustedDevices",
      deviceInstallationId
    );
    await setDoc(
      ref,
      {
        lastSeenAt: now,
        status: "active",
      },
      { merge: true }
    );
  } catch {
    // best-effort
  }
}
