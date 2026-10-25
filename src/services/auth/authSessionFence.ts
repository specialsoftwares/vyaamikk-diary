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

export type LocalSignOutResult = {
  /** Generation returned by this logout's retirement, not the pre-logout value. */
  ownedGeneration: number;
  superseded: boolean;
  profileCleared: boolean;
};

let generation = 0;
let tail: Promise<void> = Promise.resolve();
let bridgeTargetUid: string | null = null;
const generationListeners = new Set<() => void>();

export function currentAuthMutationGeneration(): number {
  return generation;
}

export function subscribeAuthMutationGeneration(listener: () => void): () => void {
  generationListeners.add(listener);
  return () => {
    generationListeners.delete(listener);
  };
}

function bumpGeneration(): number {
  generation += 1;
  generationListeners.forEach((listener) => listener());
  return generation;
}

/** Drops private cloud admission for every attempt already in progress. */
export function retireJsAuthBridge(): number {
  bridgeTargetUid = null;
  return bumpGeneration();
}

/**
 * Bumps the generation when the native identity changes so an in-flight
 * mint for the previous uid cannot publish into the new one.
 */
export function noteNativeAuthIdentity(nativeUid: string | null): void {
  if (!nativeUid) return;
  if (bridgeTargetUid === nativeUid) return;
  // The first identity on a fresh fence is not a replacement. After
  // retireJsAuthBridge clears the target, the next login claims a new
  // generation so an in-flight logout can see it.
  if (bridgeTargetUid === null && generation === 0) {
    bridgeTargetUid = nativeUid;
    return;
  }
  bridgeTargetUid = nativeUid;
  bumpGeneration();
}

export function authRetirementOwns(ownedGeneration: number): boolean {
  return generation === ownedGeneration;
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
    if (generation !== retiredGeneration) {
      return {
        jsCleared: false,
        nativeCleared: false,
        skippedBecauseNewerSession: true,
      };
    }
    return {
      jsCleared: jsResult,
      nativeCleared: nativeResult,
      skippedBecauseNewerSession: false,
    };
  });
}

/**
 * Profile-cache delete for one retirement. prepare is the awaited cache
 * work. The persisted session is removed only if this retirement still
 * owns the generation after that await.
 */
export async function clearPersistedProfileIfOwned(
  ownedGeneration: number,
  steps: {
    prepare: () => Promise<void>;
    removePersistedProfile: () => Promise<void>;
  }
): Promise<boolean> {
  await steps.prepare();
  if (!authRetirementOwns(ownedGeneration)) return false;
  await steps.removePersistedProfile();
  return authRetirementOwns(ownedGeneration);
}

/**
 * Masks private UI and retires admission before either SDK cleanup await.
 * The profile-cache step must not wipe drafts or owner outbox rows.
 */
export async function runLocalDeviceSignOut(steps: {
  maskPrivateUi: () => void;
  retireCloudAdmission: () => void;
  cleanAuthSdks: (ownedGeneration: number) => Promise<unknown>;
  clearLocalProfileCache: (ownedGeneration: number) => Promise<void>;
}): Promise<LocalSignOutResult> {
  steps.maskPrivateUi();
  steps.retireCloudAdmission();
  const ownedGeneration = generation;
  await steps.cleanAuthSdks(ownedGeneration);
  if (!authRetirementOwns(ownedGeneration)) {
    return { ownedGeneration, superseded: true, profileCleared: false };
  }
  await steps.clearLocalProfileCache(ownedGeneration);
  const superseded = !authRetirementOwns(ownedGeneration);
  return { ownedGeneration, superseded, profileCleared: !superseded };
}

export function __resetAuthSessionFenceForTests(): void {
  generation = 0;
  tail = Promise.resolve();
  bridgeTargetUid = null;
}
