import AsyncStorage from "@react-native-async-storage/async-storage";

import { todayLocalBusinessDateKey } from "@/utils/date";

const PREFIX = "vyd_statutory_prompt_day_";

/** At most one auto statutory sheet per local calendar day per user. */
export async function shouldAutoShowStatutoryPrompt(userId: string): Promise<boolean> {
  const today = todayLocalBusinessDateKey();
  const key = `${PREFIX}${userId}`;
  const last = await AsyncStorage.getItem(key);
  return last !== today;
}

export async function markStatutoryPromptShownToday(userId: string): Promise<void> {
  const today = todayLocalBusinessDateKey();
  await AsyncStorage.setItem(`${PREFIX}${userId}`, today);
}
