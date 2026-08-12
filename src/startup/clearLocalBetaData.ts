import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { forceClearAllSessions } from "@/services/session";
import { clearAuthWrapperProgress } from "@/auth-v2/authWrapperProgress";
import { DB_NAME } from "@/localDb/schema";
import { closeLocalDatabaseForTests } from "@/localDb/database";
import { resetLocalDatabaseInitStateForStartup } from "@/localDb/init";

/**
 * Clears application-local beta state only.
 * NEVER touches Firebase Auth users, Firestore, Storage, or remote records.
 */
export async function clearLocalBetaData(): Promise<void> {
  // Session (SecureStore + AsyncStorage mirrors)
  try {
    await forceClearAllSessions();
  } catch {
    // continue — best effort
  }

  try {
    await clearAuthWrapperProgress();
  } catch {
    // ignore
  }

  // Wizard / onboarding navigation caches (local only)
  const knownKeys = [
    "vyd_session_v1",
    "vyd_session_v2",
    "vyd_auth_wrapper_progress_v1",
    "vyd_onboarding_nav_v1",
    "vyd_wizard_nav_v1",
    "vyd_theme_mode",
    "vyd_language",
    "vyd_i18n_lang",
    "vyd_location_consent_v1",
    "vyd_intro_seen_v1",
    "EXPO_ROUTER_HISTORY",
  ];

  try {
    await AsyncStorage.multiRemove(knownKeys);
  } catch {
    // ignore
  }

  try {
    const all = await AsyncStorage.getAllKeys();
    const localOnly = all.filter(
      (k) =>
        k.startsWith("vyd_") ||
        k.startsWith("@vyd") ||
        k.includes("expo-router") ||
        k.includes("onboarding") ||
        k.includes("wizard")
    );
    if (localOnly.length > 0) {
      await AsyncStorage.multiRemove(localOnly);
    }
  } catch {
    // ignore
  }

  if (Platform.OS === "ios" || Platform.OS === "android") {
    for (const key of ["vyd_session_v1", "vyd_session_v2"]) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // ignore
      }
    }
  }

  // SQLite local DB file
  try {
    closeLocalDatabaseForTests();
    resetLocalDatabaseInitStateForStartup();
  } catch {
    // ignore
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite") as {
      deleteDatabaseAsync?: (name: string) => Promise<void>;
    };
    if (typeof SQLite.deleteDatabaseAsync === "function") {
      await SQLite.deleteDatabaseAsync(DB_NAME);
    }
  } catch {
    // ignore — reset still cleared session/caches
  }
}
