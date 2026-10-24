/**
 * Production key store. Native builds use expo-secure-store.
 * Web and a failed native module are unavailable. They do not receive the key.
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` is the iOS keychain accessibility.
 * It is not Android backup policy. Android backup is the manifest
 * `allowBackup` value plus the SecureStore backup XML.
 * Physical-device execution of this adapter is still pending.
 */

import {
  createSecureLocalKeyStore,
  LOCAL_KEY_ACCESSIBILITY,
  type LegacyKeyReader,
  type LocalKeyStore,
} from "@/services/accountDeletion/localDataKey";

type SecureModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: unknown }): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: unknown;
};

let override: LocalKeyStore | null = null;

export function __setProductionLocalKeyStoreForTests(store: LocalKeyStore | null): void {
  override = store;
}

export function nativeSecureStoreAvailable(): boolean {
  try {
    const { Platform } = require("react-native") as { Platform: { OS: string } };
    return Platform.OS === "ios" || Platform.OS === "android";
  } catch {
    return false;
  }
}

export function loadNativeSecureModule(): SecureModule | null {
  if (!nativeSecureStoreAvailable()) return null;
  try {
    return require("expo-secure-store") as SecureModule;
  } catch {
    return null;
  }
}

export function createProductionLocalKeyStore(legacy: LegacyKeyReader | null): LocalKeyStore {
  if (override) return override;
  const secure = loadNativeSecureModule();
  if (!secure) {
    return createSecureLocalKeyStore({
      secure: {
        async getItem() {
          throw new Error("secure_store_unavailable");
        },
        async setItem() {
          throw new Error("secure_store_unavailable");
        },
        async deleteItem() {
          throw new Error("secure_store_unavailable");
        },
      },
      legacy,
      accessibility: LOCAL_KEY_ACCESSIBILITY,
    });
  }
  return createSecureLocalKeyStore({
    secure: {
      getItem: (key) => secure.getItemAsync(key),
      setItem: (key, value) =>
        secure.setItemAsync(key, value, {
          keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
      deleteItem: (key) => secure.deleteItemAsync(key),
    },
    legacy,
    accessibility: LOCAL_KEY_ACCESSIBILITY,
  });
}
