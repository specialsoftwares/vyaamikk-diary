import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuthChallengePersistence, type AuthChallengeIdentity } from "@/services/auth/authChallengePersistence";

const EMAIL_PENDING_PREFIX = "vyd_auth_v2_email_pending_";
const CHALLENGE_KEY = "vyd_auth_v2_challenge";
const challengePersistence = createAuthChallengePersistence({
  read: () => AsyncStorage.getItem(CHALLENGE_KEY),
  write: (raw) => AsyncStorage.setItem(CHALLENGE_KEY, raw),
  remove: () => AsyncStorage.removeItem(CHALLENGE_KEY),
});
let progressTail: Promise<void> = Promise.resolve();
function changeProgress(work: () => Promise<void>): Promise<void> {
  const next = progressTail.then(work, work);
  progressTail = next.then(() => undefined, () => undefined);
  return next;
}

export interface AuthWrapperChallengeSnapshot {
  phoneE164: string;
  verificationId: string;
  devCodeHint: string | null;
}

export async function saveAuthWrapperChallenge(
  snapshot: AuthWrapperChallengeSnapshot,
  isCurrent: () => boolean = () => true
): Promise<void> {
  await challengePersistence.save(snapshot, isCurrent);
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

export async function clearAuthWrapperChallenge(
  expected?: AuthChallengeIdentity | null,
  isCurrent: () => boolean = () => true
): Promise<void> {
  await challengePersistence.clear(expected, isCurrent);
}

function emailPendingKey(uid: string): string {
  return `${EMAIL_PENDING_PREFIX}${uid}`;
}

export async function markAuthWrapperEmailPending(uid: string, isCurrent: () => boolean = () => true): Promise<void> {
  await changeProgress(async () => { if (isCurrent()) await AsyncStorage.setItem(emailPendingKey(uid), "1"); });
}

export async function isAuthWrapperEmailPending(uid: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(emailPendingKey(uid));
  return v === "1";
}

export async function markAuthWrapperEmailComplete(uid: string, isCurrent: () => boolean = () => true): Promise<void> {
  await changeProgress(async () => { if (isCurrent()) await AsyncStorage.removeItem(emailPendingKey(uid)); });
  // Challenge cleanup belongs to its initiating attempt. A boot/email marker
  // must not unconditionally delete a newer phone challenge.
}

export async function clearAuthWrapperProgress(uid?: string): Promise<void> {
  await clearAuthWrapperChallenge();
  if (uid) {
    await changeProgress(() => AsyncStorage.removeItem(emailPendingKey(uid)));
  }
}
