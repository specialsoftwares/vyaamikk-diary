import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  markAppVisitBackground,
  openAppVisit,
  peekAppVisit,
  type OpenAppVisitInput,
  type PreviousVisitSnapshot,
} from "@/session/previousVisit";
import { useAuth } from "@/state/auth";

interface LiveVisitBinding {
  uid: string | null;
  fields: Pick<
    OpenAppVisitInput,
    "lastLoginAt" | "previousLoginAt" | "signedInAt" | "lastActiveAt"
  >;
  publish: ((snapshot: PreviousVisitSnapshot) => void) | null;
}

const live: LiveVisitBinding = {
  uid: null,
  fields: {},
  publish: null,
};

let appStateBound = false;

function ensureVisitAppState(): void {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener("change", (next) => {
    if (next === "background" || next === "inactive") {
      markAppVisitBackground(Date.now(), live.uid ?? undefined);
      return;
    }
    if (next !== "active") return;
    const uid = live.uid;
    if (!uid) return;
    void openAppVisit({ ownerUid: uid, ...live.fields }).then((snapshot) => {
      if (snapshot.ownerUid === uid) live.publish?.(snapshot);
    });
  });
}

/**
 * Device-local previous visit for the signed-in owner.
 * The read is asynchronous and is not part of startup.
 * A background longer than the visit gap rolls the session even if this
 * card is not on screen, after the watcher has been installed once.
 */
export function usePreviousVisit(ownerUid: string | null | undefined): PreviousVisitSnapshot | null {
  const { user, session } = useAuth();
  const uid = ownerUid && user?.uid === ownerUid ? ownerUid : null;
  const [snapshot, setSnapshot] = useState<PreviousVisitSnapshot | null>(() =>
    uid ? peekAppVisit(uid) : null
  );
  const mountedRef = useRef(true);

  const fields: LiveVisitBinding["fields"] = {
    lastLoginAt: user?.lastLoginAt ?? null,
    previousLoginAt: user?.previousLoginAt ?? null,
    signedInAt: session?.signedInAt ?? null,
    lastActiveAt: user?.lastActiveAt ?? session?.lastActiveAt ?? null,
  };

  live.uid = uid;
  live.fields = fields;
  live.publish = (next) => {
    if (mountedRef.current && next.ownerUid === uid) setSnapshot(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    ensureVisitAppState();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setSnapshot(null);
      return;
    }
    setSnapshot(peekAppVisit(uid));
    let cancelled = false;
    void openAppVisit({ ownerUid: uid, ...live.fields }).then((next) => {
      if (!cancelled && next.ownerUid === uid) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, session?.signedInAt]);

  return uid ? snapshot : null;
}
