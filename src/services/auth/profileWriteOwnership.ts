import { AppError } from "@/domain/errors";
import { currentAuthMutationGeneration } from "./authSessionFence";

// A second sign-in for the same UID supersedes pending profile work without
// retiring the shared JS bridge. Sign-out also invalidates this epoch.
let sessionEpoch = 0;
export function advanceProfileSessionEpoch(): number { return ++sessionEpoch; }
export function currentProfileSessionEpoch(): number { return sessionEpoch; }

export type ProfileWriteOwnership = Readonly<{
  uid: string;
  generation: number;
  epoch: number;
}>;

export function captureProfileWriteOwnership(uid: string): ProfileWriteOwnership {
  return { uid, generation: currentAuthMutationGeneration(), epoch: sessionEpoch };
}

export function profileWriteStillOwned(owner: ProfileWriteOwnership, liveUid: string | null): boolean {
  return Boolean(liveUid) && liveUid === owner.uid &&
    currentAuthMutationGeneration() === owner.generation && sessionEpoch === owner.epoch;
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
