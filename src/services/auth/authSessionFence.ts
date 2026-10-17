/**
 * Serializes shared auth mutations and retires in-flight bridge work.
 *
 * A generation bump is synchronous. Queued work reads the generation after
 * every await and must not sign a newer session out.
 */

export type AuthSdkCleanupResult = {
  jsCleared: boolean;
  nativeCleared: boolean;
  skippedBecauseNewerSession: boolean;
};

let generation = 0;
let tail: Promise<void> = Promise.resolve();
let bridgeTargetUid: string | null = null;

export function currentAuthMutationGeneration(): number {
  return generation;
}

/** Drops private cloud admission for every attempt already in progress. */
export function retireJsAuthBridge(): number {
  generation += 1;
  bridgeTargetUid = null;
  return generation;
}

/**
 * Bumps the generation when the native identity changes so an in-flight
 * mint for the previous uid cannot publish into the new one.
 */
export function noteNativeAuthIdentity(nativeUid: string | null): void {
  if (bridgeTargetUid && nativeUid && nativeUid !== bridgeTargetUid) {
    generation += 1;
  }
  if (nativeUid) bridgeTargetUid = nativeUid;
}

export function enqueueAuthMutation<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function cleanBothAuthSdks(
  retiredGeneration: number,
  ports: {
    signOutJs: () => Promise<void>;
    signOutNative: () => Promise<void>;
  }
): Promise<AuthSdkCleanupResult> {
  return enqueueAuthMutation(async () => {
    if (generation !== retiredGeneration) {
      return {
        jsCleared: false,
        nativeCleared: false,
        skippedBecauseNewerSession: true,
      };
    }
    const [jsResult, nativeResult] = await Promise.all([
      ports.signOutJs().then(
        () => true,
        () => false
      ),
      ports.signOutNative().then(
        () => true,
        () => false
      ),
    ]);
    return {
      jsCleared: jsResult,
      nativeCleared: nativeResult,
      skippedBecauseNewerSession: false,
    };
  });
}

/**
 * Masks private UI and retires admission before either SDK cleanup await.
 * The profile-cache step must not wipe drafts or owner outbox rows.
 */
export async function runLocalDeviceSignOut(steps: {
  maskPrivateUi: () => void;
  retireCloudAdmission: () => void;
  cleanAuthSdks: () => Promise<unknown>;
  clearLocalProfileCache: () => Promise<void>;
}): Promise<void> {
  steps.maskPrivateUi();
  steps.retireCloudAdmission();
  await steps.cleanAuthSdks();
  await steps.clearLocalProfileCache();
}

export function __resetAuthSessionFenceForTests(): void {
  generation = 0;
  tail = Promise.resolve();
  bridgeTargetUid = null;
}
