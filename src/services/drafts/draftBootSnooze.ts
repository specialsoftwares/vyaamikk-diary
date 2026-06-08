import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "vyd_draft_boot_snooze_";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

export async function snoozeBootDraftPrompt(userId: string): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${userId}`, String(Date.now() + SNOOZE_MS));
}

export async function isBootDraftPromptSnoozed(userId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(`${PREFIX}${userId}`);
  if (!raw) return false;
  const until = parseInt(raw, 10);
  if (!Number.isFinite(until)) return false;
  if (Date.now() < until) return true;
  await AsyncStorage.removeItem(`${PREFIX}${userId}`);
  return false;
}
