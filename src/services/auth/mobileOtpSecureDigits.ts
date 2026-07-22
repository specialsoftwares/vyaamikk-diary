/**
 * Narrow secure persistence for in-progress mobile OTP digits (resume after app close).
 * Never store digits in general AsyncStorage profile drafts.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { MOBILE_OTP_TTL_MS } from "@/services/auth/mobileOtpConstants";

const KEY = "vyd_mobile_otp_digits_v1";
const useSecure = Platform.OS === "ios" || Platform.OS === "android";

export interface MobileOtpDigitSnapshot {
  phoneE164: string;
  verificationId: string;
  digits: string;
  expiresAt: number;
  resendAvailableAt: number;
  savedAt: number;
}

async function setRaw(value: string): Promise<void> {
  if (useSecure) await SecureStore.setItemAsync(KEY, value);
  else await AsyncStorage.setItem(KEY, value);
}

async function getRaw(): Promise<string | null> {
  if (useSecure) return SecureStore.getItemAsync(KEY);
  return AsyncStorage.getItem(KEY);
}

async function delRaw(): Promise<void> {
  if (useSecure) await SecureStore.deleteItemAsync(KEY);
  else await AsyncStorage.removeItem(KEY);
}

export async function saveMobileOtpDigitSnapshot(
  snap: Omit<MobileOtpDigitSnapshot, "savedAt">
): Promise<void> {
  const payload: MobileOtpDigitSnapshot = { ...snap, savedAt: Date.now() };
  await setRaw(JSON.stringify(payload));
}

export async function loadMobileOtpDigitSnapshot(): Promise<MobileOtpDigitSnapshot | null> {
  try {
    const raw = await getRaw();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileOtpDigitSnapshot>;
    if (
      typeof parsed.phoneE164 !== "string" ||
      typeof parsed.verificationId !== "string" ||
      typeof parsed.digits !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.resendAvailableAt !== "number"
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      await clearMobileOtpDigitSnapshot();
      return null;
    }
    if (Date.now() - (parsed.savedAt ?? 0) > MOBILE_OTP_TTL_MS) {
      await clearMobileOtpDigitSnapshot();
      return null;
    }
    return {
      phoneE164: parsed.phoneE164,
      verificationId: parsed.verificationId,
      digits: parsed.digits.replace(/\D/g, "").slice(0, 6),
      expiresAt: parsed.expiresAt,
      resendAvailableAt: parsed.resendAvailableAt,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export async function clearMobileOtpDigitSnapshot(): Promise<void> {
  await delRaw();
}
