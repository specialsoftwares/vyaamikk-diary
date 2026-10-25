/**
 * Session persistence layer (V2).
 *
 * SecureStore on native, AsyncStorage on web. Saves and logout deletes share
 * the queue in sessionPersistence.ts.
 *
 * V1 wrote a tiny `{uid, ueid, phoneE164, signedInAt}` shape under
 * `vyd_session_v1`. V2 keeps the full profile so boot can restore whether
 * the user has completed the profile step.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  installSessionStorage,
  LEGACY_SESSION_KEY,
  SESSION_KEY,
  sessionStore,
} from "@/services/sessionPersistence";

export {
  __setSessionStorageForTests,
  clearSessionForRetirement,
  sessionStore,
  type AuthSession,
} from "@/services/sessionPersistence";

const isSecureStoreAvailable = Platform.OS === "ios" || Platform.OS === "android";

installSessionStorage({
  getItem: (key) =>
    isSecureStoreAvailable ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key),
  setItem: (key, value) =>
    isSecureStoreAvailable ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value),
  deleteItem: (key) =>
    isSecureStoreAvailable ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key),
});

/**
 * DEV / reset helper — clears session from SecureStore AND AsyncStorage, then verifies gone.
 * Ordinary logout does not call this. Reloading the app does NOT clear session.
 */
export async function forceClearAllSessions(): Promise<void> {
  await sessionStore.clear();
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
    await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore
  }
  if (isSecureStoreAvailable) {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
    } catch {
      // ignore
    }
  }
  const remaining = await sessionStore.load();
  if (remaining) {
    throw new Error("Session could not be cleared. Please try again.");
  }
}
