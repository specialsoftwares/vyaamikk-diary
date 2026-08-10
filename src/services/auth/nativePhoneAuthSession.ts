/**
 * Secure, TTL-bound persistence for Firebase Phone Auth verification IDs.
 * Survives Custom Tab / reCAPTCHA return and JS remount. Never stores OTP codes.
 */

import type { PhoneE164 } from "@/domain/types";

const KEY = "vyd_native_phone_auth_session_v1";

export interface NativePhoneAuthPersistedSession {
  /** Firebase Auth verificationId (not an app-local opaque key). */
  firebaseVerificationId: string;
  phoneE164: PhoneE164;
  expiresAt: number;
  attemptId: string;
  savedAt: number;
}

type Kv = {
  setItemAsync?: (k: string, v: string) => Promise<void>;
  getItemAsync?: (k: string) => Promise<string | null>;
  deleteItemAsync?: (k: string) => Promise<void>;
  setItem?: (k: string, v: string) => Promise<void>;
  getItem?: (k: string) => Promise<string | null>;
  removeItem?: (k: string) => Promise<void>;
};

const memory = new Map<string, string>();

function memoryStore(): { kind: "memory"; api: Kv } {
  return {
    kind: "memory",
    api: {
      setItem: async (k, v) => {
        memory.set(k, v);
      },
      getItem: async (k) => memory.get(k) ?? null,
      removeItem: async (k) => {
        memory.delete(k);
      },
    },
  };
}

function getStore(): { kind: "secure" | "async" | "memory"; api: Kv } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    if (Platform.OS === "web" || Platform.OS === "node") return memoryStore();
    if (Platform.OS === "ios" || Platform.OS === "android") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require("expo-secure-store") as Kv;
      return { kind: "secure", api: SecureStore };
    }
  } catch {
    // Node unit tests — never pull AsyncStorage (needs window).
    return memoryStore();
  }
  return memoryStore();
}

async function setRaw(value: string): Promise<void> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.setItemAsync) await api.setItemAsync(KEY, value);
  else if (api.setItem) await api.setItem(KEY, value);
}

async function getRaw(): Promise<string | null> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.getItemAsync) return api.getItemAsync(KEY);
  if (api.getItem) return api.getItem(KEY);
  return null;
}

async function delRaw(): Promise<void> {
  const { kind, api } = getStore();
  if (kind === "secure" && api.deleteItemAsync) await api.deleteItemAsync(KEY);
  else if (api.removeItem) await api.removeItem(KEY);
}

export async function saveNativePhoneAuthSession(
  snap: Omit<NativePhoneAuthPersistedSession, "savedAt">
): Promise<void> {
  const payload: NativePhoneAuthPersistedSession = { ...snap, savedAt: Date.now() };
  await setRaw(JSON.stringify(payload));
}

export async function loadNativePhoneAuthSession(): Promise<NativePhoneAuthPersistedSession | null> {
  try {
    const raw = await getRaw();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativePhoneAuthPersistedSession>;
    if (
      typeof parsed.firebaseVerificationId !== "string" ||
      !parsed.firebaseVerificationId ||
      typeof parsed.phoneE164 !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.attemptId !== "string"
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      await clearNativePhoneAuthSession();
      return null;
    }
    return {
      firebaseVerificationId: parsed.firebaseVerificationId,
      phoneE164: parsed.phoneE164 as PhoneE164,
      expiresAt: parsed.expiresAt,
      attemptId: parsed.attemptId,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export async function clearNativePhoneAuthSession(): Promise<void> {
  await delRaw();
}
