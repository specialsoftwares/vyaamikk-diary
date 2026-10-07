import React, { useLayoutEffect, useState } from "react";

import {
  isGoodsEvidenceBlockedByStoreRuntime,
  isGoodsEvidenceEnabled,
} from "@/goodsEvidence/featureFlag";
import {
  advanceGrinLiveToken,
  persistGrinOwnerSession,
  getLiveGrinDispatchSession,
} from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";

export function isGrinFeatureAdmitted(): boolean {
  return !isGoodsEvidenceBlockedByStoreRuntime() && isGoodsEvidenceEnabled();
}

/**
 * RN-free admitted-session host.
 * Admission is decided before children mount.
 * In-memory live token flips synchronously during render. Sqlite begin/end
 * run in useLayoutEffect only after that flip, so A's origin fails before
 * B's sqlite session exists and cannot recapture B.
 */
export function GrinAdmittedSessionHost({
  ownerUid,
  children,
  renderBlocked,
  renderUnavailable,
}: {
  ownerUid: string | null;
  children: (session: GrinDispatchSession) => React.ReactNode;
  renderBlocked: () => React.ReactNode;
  renderUnavailable: () => React.ReactNode;
}): React.ReactElement {
  const storeBlocked = isGoodsEvidenceBlockedByStoreRuntime();
  const enabled = isGoodsEvidenceEnabled();
  const admitted = !storeBlocked && enabled && Boolean(ownerUid);
  const intendedUid = admitted ? ownerUid : null;

  advanceGrinLiveToken(intendedUid);

  const [, setEpoch] = useState(0);
  useLayoutEffect(() => {
    persistGrinOwnerSession();
    setEpoch((value) => value + 1);
  }, [intendedUid]);

  if (storeBlocked || !enabled || !ownerUid) {
    if (storeBlocked) return <>{renderBlocked()}</>;
    return <>{renderUnavailable()}</>;
  }

  const session = getLiveGrinDispatchSession();
  if (!session || session.ownerUid !== ownerUid) {
    return <></>;
  }
  return <>{children(session)}</>;
}
