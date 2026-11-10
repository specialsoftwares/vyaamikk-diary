import { AppError } from "@/domain/errors";
import { currentAuthMutationGeneration, currentSessionCommitEpoch, beginSessionCommit } from "./authSessionFence";
import type { ProfileWriteClaim } from "./types";

// A second sign-in for the same UID supersedes pending profile work without
// retiring the shared JS bridge. Sign-out also invalidates this epoch.
export const advanceProfileSessionEpoch = beginSessionCommit;
export const currentProfileSessionEpoch = currentSessionCommitEpoch;

export type ProfileWriteOwnership = Readonly<{
  uid: string;
  generation: number;
  epoch: number;
  isCurrent?: () => boolean;
}>;

/**
 * A confirm that throws still belongs to the epoch it advanced. A later
 * sign-out or same-UID replacement must not surface the original error.
 */
export function confirmFailureForOwnedEpoch(input: {
  ownedEpoch: number;
  currentEpoch: number;
  error: unknown;
}): unknown {
  if (input.currentEpoch !== input.ownedEpoch) {
    return new AppError("permission_denied", "session_changed");
  }
  return input.error;
}

export function captureProfileWriteOwnership(uid: string): ProfileWriteOwnership {
  return { uid, generation: currentAuthMutationGeneration(), epoch: currentSessionCommitEpoch() };
}

export type ProfileWriteLive = { uid: string | null; generation: number; epoch?: number };
export function profileWriteStillOwned(owner: ProfileWriteClaim, live: ProfileWriteLive | string | null): boolean {
  const state = typeof live === "object" && live !== null
    ? live
    : { uid: live, generation: currentAuthMutationGeneration(), epoch: currentSessionCommitEpoch() };
  return (owner.isCurrent?.() ?? true) && Boolean(state.uid) && state.uid === owner.uid && state.generation === owner.generation &&
    (owner.epoch == null || state.epoch === owner.epoch);
}

export function assertProfileWriteOwnership(owner: ProfileWriteOwnership, liveUid: string | null): void {
  if (!profileWriteStillOwned(owner, liveUid)) throw new AppError("permission_denied", "session_changed");
}

/** A stale JS bridge is never an identity fallback on native. */
export function readPlatformProfileUid(ports: {
  platform: () => string;
  nativeUid: () => string | null;
  jsUid: () => string | null;
}): string | null {
  try {
    const platform = ports.platform();
    if (platform === "android" || platform === "ios") return ports.nativeUid();
    if (platform === "web") return ports.jsUid();
    return null;
  } catch { return null; }
}

export function readLiveProfileUid(): string | null {
  return readPlatformProfileUid({
    platform: () => require("react-native").Platform.OS as string,
    nativeUid: () => require("./nativePhoneAuth").getNativeAuthUid() as string | null,
    jsUid: () => require("@/config/firebase").getFirebaseAuth().currentUser?.uid ?? null,
  });
}

/** Shared publication path: ownership must survive bridge and local-key/storage awaits. */
export async function publishOwnedProfileSession<T>(input: {
  profileUid: string;
  owner: ProfileWriteOwnership;
  liveUid: () => string | null;
  prepare: () => Promise<unknown>;
  save: (isCurrent: () => boolean) => Promise<T>;
  publish: (session: T) => void;
}): Promise<T> {
  const isCurrent = () => input.profileUid === input.owner.uid &&
    profileWriteStillOwned(input.owner, input.liveUid());
  const assertCurrent = () => {
    if (!isCurrent()) throw new AppError("permission_denied", "session_changed");
  };
  assertCurrent();
  await input.prepare();
  assertCurrent();
  const session = await input.save(isCurrent);
  assertCurrent();
  input.publish(session);
  return session;
}

export function authoritativeProfileWriteUid(input: { platform: string | null; nativeUid: string | null; jsUid: string | null }): string | null {
  if (!input.platform) return null;
  if (input.platform === "web") return input.jsUid;
  if (input.platform === "android" || input.platform === "ios") return input.nativeUid;
  return null;
}

export async function issueProfileDocumentIfOwned(input: {
  claim: ProfileWriteClaim; readLive: () => ProfileWriteLive;
  prepare: () => Promise<void>; setDoc: () => Promise<void>;
}): Promise<void> {
  await input.prepare();
  if (!profileWriteStillOwned(input.claim, input.readLive())) throw new AppError("permission_denied", "session_changed");
  await input.setDoc();
}
