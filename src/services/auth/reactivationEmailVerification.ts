/**
 * Email-code reactivation submit.
 * The code stays a six-character string. A timed-out wait does not cancel the
 * server transaction. A later attempt reads the account before it calls
 * completion again, and a retired attempt cannot publish or navigate.
 */

import type { UserProfile } from "@/domain/types";

export const REACTIVATION_VERIFY_BOUND_MS = 20_000;

export type ReactivationVerifyOutcome =
  | "verified"
  | "rejected"
  | "unknown"
  | "local_failed"
  | "stale"
  | "ignored";

export type ReactivationVerifyStage =
  | "handler"
  | "account"
  | "callable"
  | "session"
  | "navigation"
  | "cleanup";

export type ReactivationAccountView =
  | { status: "active"; profile: UserProfile }
  | { status: "pending_deletion" }
  | { status: "unknown" };

export type ReactivationVerifyView = {
  busy: boolean;
  error: string | null;
  clearCode: boolean;
  navigate: boolean;
  outcome: ReactivationVerifyOutcome;
  stage: ReactivationVerifyStage;
  apply: boolean;
};

export type ReactivationVerifyRecord = {
  attemptId: string;
  outcome: ReactivationVerifyOutcome;
  stage: ReactivationVerifyStage;
  elapsedMs: number;
};

type SubmitInput = {
  code: string;
  challengeId: string;
  online: boolean;
  isCurrent: () => boolean;
  complete: (challengeId: string, code: string) => Promise<UserProfile>;
  finish: (profile: UserProfile, stillCurrent: () => boolean) => Promise<unknown>;
  readAccount: () => Promise<ReactivationAccountView>;
  messageFor: (error: unknown) => string;
  offlineMessage: string;
  unknownMessage: string;
  localFailureMessage: string;
  timeoutMs?: number;
  now?: () => number;
  record?: (event: ReactivationVerifyRecord) => void;
};

function attemptId(): string {
  const bytes = new Uint8Array(8);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unknownWait(): Error {
  return Object.assign(new Error("result_unknown"), { reactivationOutcome: "unknown" as const });
}

function isUnknownWait(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { reactivationOutcome?: string }).reactivationOutcome === "unknown"
  );
}

function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(unknownWait()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function settled(input: {
  outcome: ReactivationVerifyOutcome;
  stage: ReactivationVerifyStage;
  error?: string | null;
  clearCode?: boolean;
  navigate?: boolean;
}): ReactivationVerifyView {
  return {
    busy: false,
    error: input.error ?? null,
    clearCode: input.clearCode ?? false,
    navigate: input.navigate ?? false,
    outcome: input.outcome,
    stage: input.stage,
    apply: true,
  };
}

export function createReactivationEmailVerification() {
  let generation = 0;
  let inFlight = false;
  let accepted: UserProfile | null = null;
  let awaitingReconciliation = false;

  return {
    retire(): void {
      generation += 1;
      inFlight = false;
      accepted = null;
      awaitingReconciliation = false;
    },
    async submit(input: SubmitInput): Promise<ReactivationVerifyView> {
      if (inFlight) {
        return {
          busy: true,
          error: null,
          clearCode: false,
          navigate: false,
          outcome: "ignored",
          stage: "handler",
          apply: false,
        };
      }
      const code = input.code;
      if (!/^[0-9]{6}$/.test(code) || input.challengeId.length === 0) {
        return settled({ outcome: "rejected", stage: "handler" });
      }
      if (!input.online) {
        return settled({ outcome: "rejected", stage: "handler", error: input.offlineMessage });
      }
      const ticket = ++generation;
      const still = () => ticket === generation && input.isCurrent();
      if (!still()) return settled({ outcome: "stale", stage: "handler" });

      inFlight = true;
      const started = (input.now ?? Date.now)();
      const id = attemptId();
      const timeoutMs = input.timeoutMs ?? REACTIVATION_VERIFY_BOUND_MS;
      let stage: ReactivationVerifyStage = "handler";
      const emit = (view: ReactivationVerifyView): ReactivationVerifyView => {
        input.record?.({
          attemptId: id,
          outcome: view.outcome,
          stage: view.stage,
          elapsedMs: Math.max(0, (input.now ?? Date.now)() - started),
        });
        return view;
      };
      const readBounded = async (): Promise<ReactivationAccountView> => {
        try {
          return await bounded(input.readAccount(), timeoutMs);
        } catch {
          return { status: "unknown" };
        }
      };
      const finishProfile = async (profile: UserProfile): Promise<ReactivationVerifyView> => {
        stage = "session";
        if (!still()) return emit(settled({ outcome: "stale", stage }));
        try {
          await bounded(input.finish(profile, still), timeoutMs);
        } catch (error) {
          if (!still()) return emit(settled({ outcome: "stale", stage }));
          awaitingReconciliation = true;
          return emit(settled({ outcome: "local_failed", stage, error: input.localFailureMessage }));
        }
        if (!still()) return emit(settled({ outcome: "stale", stage }));
        accepted = null;
        awaitingReconciliation = false;
        stage = "navigation";
        return emit(settled({ outcome: "verified", stage, clearCode: true, navigate: true }));
      };

      try {
        if (accepted || awaitingReconciliation) {
          stage = "account";
          const account = await readBounded();
          if (!still()) return emit(settled({ outcome: "stale", stage }));
          if (account.status === "active") return await finishProfile(account.profile);
          if (account.status === "unknown") {
            // A cached profile from an earlier complete is not authority to sign in.
            return emit(settled({ outcome: "unknown", stage, error: input.unknownMessage }));
          }
        }

        stage = "callable";
        let profile: UserProfile;
        try {
          profile = await bounded(input.complete(input.challengeId, code), timeoutMs);
        } catch (error) {
          if (!still()) return emit(settled({ outcome: "stale", stage }));
          if (!isUnknownWait(error)) {
            awaitingReconciliation = false;
            return emit(settled({ outcome: "rejected", stage, error: input.messageFor(error) }));
          }
          stage = "account";
          const account = await readBounded();
          if (!still()) return emit(settled({ outcome: "stale", stage }));
          if (account.status === "active") return await finishProfile(account.profile);
          awaitingReconciliation = true;
          return emit(settled({ outcome: "unknown", stage, error: input.unknownMessage }));
        }

        if (!still()) return emit(settled({ outcome: "stale", stage }));
        accepted = profile;
        return await finishProfile(profile);
      } finally {
        stage = "cleanup";
        if (generation === ticket) inFlight = false;
      }
    },
  };
}

export async function readAuthoritativeReactivationAccount(): Promise<ReactivationAccountView> {
  try {
    const { Platform } = await import("react-native");
    const { getNativeAuthUid } = await import("@/services/auth/nativePhoneAuth");
    const { authoritativeProfileWriteUid } = await import("@/services/auth/profileWriteOwnership");
    let jsUid: string | null = null;
    if (Platform.OS === "web") {
      try {
        const { getFirebaseAuth } = await import("@/config/firebase");
        jsUid = getFirebaseAuth().currentUser?.uid ?? null;
      } catch {
        jsUid = null;
      }
    }
    const uid = authoritativeProfileWriteUid({
      platform: Platform.OS,
      nativeUid: getNativeAuthUid(),
      jsUid,
    });
    if (!uid) return { status: "unknown" };
    const { ensureJsAuthSession } = await import("@/services/auth/jsAuthBridge");
    if (!(await ensureJsAuthSession())) return { status: "unknown" };
    const { doc, getDoc } = await import("firebase/firestore");
    const { getFirebaseDb } = await import("@/config/firebase");
    const snap = await getDoc(doc(getFirebaseDb(), "users", uid));
    if (!snap.exists()) return { status: "unknown" };
    const data = snap.data() as Record<string, unknown>;
    if (data.status === "pending_deletion") return { status: "pending_deletion" };
    if (data.status !== "active") return { status: "unknown" };
    const { normaliseUserProfile } = await import("@/services/auth/normalizeProfile");
    return { status: "active", profile: normaliseUserProfile(uid, { ...data, uid }) };
  } catch {
    return { status: "unknown" };
  }
}
