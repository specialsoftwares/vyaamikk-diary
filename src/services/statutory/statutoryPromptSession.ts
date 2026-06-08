import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "vyd_statutory_prompt_day_";

/** At most one auto statutory sheet per local calendar day per user. */
export async function shouldAutoShowStatutoryPrompt(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${PREFIX}${userId}`;
  const last = await AsyncStorage.getItem(key);
  return last !== today;
}

export async function markStatutoryPromptShownToday(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await AsyncStorage.setItem(`${PREFIX}${userId}`, today);
}
