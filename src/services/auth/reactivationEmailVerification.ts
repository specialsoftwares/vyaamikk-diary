/**
 * Email-code reactivation submit.
 * The code stays a six-character string. A timed-out wait does not cancel the
 * server transaction. A later attempt reads the account before it calls
 * completion again, and a retired attempt cannot publish or navigate.
 */

import type { UserProfile } from "@/domain/types";
import { PHONE_AUTH_USER_BOUND_MS } from "@/auth-v2/phoneAuthOperation";

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
  /** Bumps the publication claim when local preparation or finish times out. */
  retireClaim?: () => void;
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

function bounded<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  if (ms <= 0) {
    onTimeout?.();
    void work.then(
      () => undefined,
      () => undefined
    );
    return Promise.reject(unknownWait());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(unknownWait());
    }, ms);
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
      const overallDeadline = started + PHONE_AUTH_USER_BOUND_MS;
      const id = attemptId();
      const timeoutMs = input.timeoutMs ?? REACTIVATION_VERIFY_BOUND_MS;
      const stageLimit = (requested: number) => {
        const remaining = Math.max(0, overallDeadline - (input.now ?? Date.now)());
        return Math.min(requested, remaining);
      };
      let stage: ReactivationVerifyStage = "handler";
      let publicationRetired = false;
      const retirePublication = () => {
        if (publicationRetired) return;
        publicationRetired = true;
        if (generation === ticket) generation += 1;
        input.retireClaim?.();
      };
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
          return await bounded(input.readAccount(), stageLimit(timeoutMs));
        } catch {
          return { status: "unknown" };
        }
      };
      const finishProfile = async (profile: UserProfile): Promise<ReactivationVerifyView> => {
        stage = "session";
        if (!still()) return emit(settled({ outcome: "stale", stage }));
        try {
          await bounded(input.finish(profile, still), stageLimit(timeoutMs), retirePublication);
        } catch (error) {
          if (isUnknownWait(error)) {
            awaitingReconciliation = true;
            return emit(settled({ outcome: "unknown", stage, error: input.unknownMessage }));
          }
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
          profile = await bounded(input.complete(input.challengeId, code), stageLimit(timeoutMs));
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
        if (generation === ticket || (publicationRetired && generation === ticket + 1)) inFlight = false;
      }
    },
  };
}

export type ReactivationServerRead =
  | {
      source: "server" | "cache";
      exists: boolean;
      uid: string;
      data: Record<string, unknown> | null;
    }
  | "unavailable";

let reactivationServerReadForTests: (() => Promise<ReactivationServerRead>) | null = null;

/** Test seam. Production reads with getDocFromServer when this is null. */
export function __setReactivationServerReadForTests(
  read: (() => Promise<ReactivationServerRead>) | null
): void {
  reactivationServerReadForTests = read;
}

export async function reactivationAccountFromServerRead(
  read: ReactivationServerRead
): Promise<ReactivationAccountView> {
  if (read === "unavailable" || read.source !== "server" || !read.exists || !read.data) {
    return { status: "unknown" };
  }
  if (read.data.status === "pending_deletion") return { status: "pending_deletion" };
  if (read.data.status !== "active") return { status: "unknown" };
  const { normaliseUserProfile } = await import("@/services/auth/normalizeProfile");
  return { status: "active", profile: normaliseUserProfile(read.uid, { ...read.data, uid: read.uid }) };
}

export async function readAuthoritativeReactivationAccount(): Promise<ReactivationAccountView> {
  try {
    if (reactivationServerReadForTests) {
      return await reactivationAccountFromServerRead(await reactivationServerReadForTests());
    }
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
    const { doc, getDocFromServer } = await import("firebase/firestore");
    const { getFirebaseDb } = await import("@/config/firebase");
    const snap = await getDocFromServer(doc(getFirebaseDb(), "users", uid));
    return await reactivationAccountFromServerRead({
      source: snap.metadata.fromCache ? "cache" : "server",
      exists: snap.exists(),
      uid,
      data: snap.exists() ? (snap.data() as Record<string, unknown>) : null,
    });
  } catch {
    return { status: "unknown" };
  }
}
