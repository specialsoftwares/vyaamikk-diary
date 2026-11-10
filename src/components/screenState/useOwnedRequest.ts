import { useCallback, useEffect, useRef, useState } from "react";

import { presentPublicError } from "@/domain/publicErrors";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";

import {
  captureLoadClaim,
  emptyOwnedLoad,
  runOwnedLoad,
  type OwnedLoad,
  type RequestClaim,
} from "./resolveScreenState";

export { captureLoadClaim };

function initialLoad<T>(uid: string | null): OwnedLoad<T> {
  return { ...emptyOwnedLoad<T>(), loading: Boolean(uid) };
}

/**
 * One owned read at a time. The latest uid, epoch, and generation win.
 * A same-account refresh keeps the previous value. A different uid or epoch does not.
 */
export function useOwnedRequest<T>(uid: string | null) {
  const ref = useRef<OwnedLoad<T>>(initialLoad<T>(uid));
  const [load, setLoad] = useState<OwnedLoad<T>>(ref.current);
  const [seenUid, setSeenUid] = useState(uid);
  const generation = useRef(0);
  const uidRef = useRef(uid);
  const readRef = useRef<((ownerUid: string) => Promise<T>) | null>(null);
  const epoch = currentSessionCommitEpoch();
  const epochSeen = useRef(epoch);
  const lastUid = useRef(uid);
  uidRef.current = uid;

  if (uid !== seenUid) {
    const reset = initialLoad<T>(uid);
    ref.current = reset;
    setSeenUid(uid);
    setLoad(reset);
  }

  const publish = useCallback((next: OwnedLoad<T>) => {
    ref.current = next;
    setLoad(next);
  }, []);

  const run = useCallback(
    async (read: (ownerUid: string) => Promise<T>) => {
      readRef.current = read;
      const liveUid = uidRef.current;
      if (!liveUid) {
        const cleared = emptyOwnedLoad<T>();
        publish(cleared);
        return cleared;
      }
      const claim = captureLoadClaim(liveUid, ++generation.current);
      return runOwnedLoad({
        claim,
        read: () => read(liveUid),
        readState: () => ref.current,
        writeState: publish,
        presentError: (error) => presentPublicError(error),
      });
    },
    [publish]
  );

  useEffect(() => {
    const uidChanged = lastUid.current !== uid;
    const epochChanged = epochSeen.current !== epoch;
    lastUid.current = uid;
    epochSeen.current = epoch;
    if (!uid || (!uidChanged && !epochChanged)) return;
    const read = readRef.current;
    if (read) void run(read);
  }, [epoch, uid, run]);

  return { load, run };
}

/**
 * For screens whose load writes many fields. `owns` gates success and failure.
 * `ownsGeneration` gates finally: an older generation must not clear a newer
 * request's loading flag. A newer epoch is a different claim even when the
 * uid matches, because capture reads the live epoch.
 */
export function useRequestOwner(uid: string | null) {
  const generation = useRef(0);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const capture = useCallback((): RequestClaim | null => {
    const liveUid = uidRef.current;
    if (!liveUid) return null;
    generation.current += 1;
    return captureLoadClaim(liveUid, generation.current);
  }, []);

  const owns = useCallback((claim: RequestClaim | null): boolean => {
    if (!claim) return false;
    return (
      uidRef.current === claim.uid &&
      currentSessionCommitEpoch() === claim.epoch &&
      generation.current === claim.generation
    );
  }, []);

  const ownsGeneration = useCallback((claim: RequestClaim | null): boolean => {
    if (!claim) return false;
    return generation.current === claim.generation;
  }, []);

  return { capture, owns, ownsGeneration };
}
