import { Platform } from "react-native";

/**
 * Best-effort full refresh after language change.
 * Dev/Expo Go: React Native DevSettings.reload().
 * Production: caller should remount the tree via mount key (see I18nProvider).
 */
export async function reloadAppAfterLanguageChange(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevSettings } = require("react-native") as {
      DevSettings?: { reload?: () => void };
    };
    if (__DEV__ && DevSettings?.reload) {
      DevSettings.reload();
      return true;
    }
  } catch {
    // Fall through to remount-only path.
  }
  return false;
}
