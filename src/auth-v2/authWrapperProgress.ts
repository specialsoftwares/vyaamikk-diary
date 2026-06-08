import AsyncStorage from "@react-native-async-storage/async-storage";

const EMAIL_PENDING_PREFIX = "vyd_auth_v2_email_pending_";
const CHALLENGE_KEY = "vyd_auth_v2_challenge";

export interface AuthWrapperChallengeSnapshot {
  phoneE164: string;
  verificationId: string;
  devCodeHint: string | null;
}

export async function saveAuthWrapperChallenge(
  snapshot: AuthWrapperChallengeSnapshot
): Promise<void> {
  await AsyncStorage.setItem(CHALLENGE_KEY, JSON.stringify(snapshot));
}

export async function loadAuthWrapperChallenge(): Promise<AuthWrapperChallengeSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CHALLENGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthWrapperChallengeSnapshot>;
    if (
      typeof parsed.phoneE164 !== "string" ||
      typeof parsed.verificationId !== "string"
    ) {
      return null;
    }
    return {
      phoneE164: parsed.phoneE164,
      verificationId: parsed.verificationId,
      devCodeHint:
        typeof parsed.devCodeHint === "string" ? parsed.devCodeHint : null,
    };
  } catch {
    return null;
  }
}

export async function clearAuthWrapperChallenge(): Promise<void> {
  await AsyncStorage.removeItem(CHALLENGE_KEY);
}

function emailPendingKey(uid: string): string {
  return `${EMAIL_PENDING_PREFIX}${uid}`;
}

export async function markAuthWrapperEmailPending(uid: string): Promise<void> {
  await AsyncStorage.setItem(emailPendingKey(uid), "1");
}

export async function isAuthWrapperEmailPending(uid: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(emailPendingKey(uid));
  return v === "1";
}

export async function markAuthWrapperEmailComplete(uid: string): Promise<void> {
  await AsyncStorage.removeItem(emailPendingKey(uid));
  await clearAuthWrapperChallenge();
}

export async function clearAuthWrapperProgress(uid?: string): Promise<void> {
  await clearAuthWrapperChallenge();
  if (uid) {
    await AsyncStorage.removeItem(emailPendingKey(uid));
  }
}
