import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_KEY = "vyaamikk:hasSeenIntroSplash";

function userKey(userId: string): string {
  return `vyaamikk:hasSeenIntroSplash:${userId}`;
}

/** @deprecated Use profile `onboardingIntroSeenAt` — kept for one-time migration. */
export async function hasSeenIntroSplashLegacy(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  return raw === "1";
}

export async function hasSeenIntroSplash(userId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(userKey(userId));
  return raw === "1";
}

export async function markIntroSplashSeen(userId: string): Promise<void> {
  await AsyncStorage.setItem(userKey(userId), "1");
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
}

/** Dev-only: show intro cards again on next onboarding pass. */
export async function resetIntroSplashSeen(userId: string): Promise<void> {
  await AsyncStorage.removeItem(userKey(userId));
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
}
