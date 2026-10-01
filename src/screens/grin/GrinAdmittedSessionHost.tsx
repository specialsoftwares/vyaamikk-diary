/**
 * RN-free admitted-session host.
 * Admission is decided before children mount, so hooks inside children cannot
 * open the repository, read protected data, or enqueue work when GRIN is off.
 * Session start/retirement happens during render (not an effect) so a stale
 * callback cannot queue after B is current.
 */

import React from "react";

import {
  isGoodsEvidenceBlockedByStoreRuntime,
  isGoodsEvidenceEnabled,
} from "@/goodsEvidence/featureFlag";
import {
  retireGrinOwnerSession,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";

export function isGrinFeatureAdmitted(): boolean {
  return !isGoodsEvidenceBlockedByStoreRuntime() && isGoodsEvidenceEnabled();
}

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

  if (storeBlocked || !enabled || !ownerUid) {
    retireGrinOwnerSession();
    if (storeBlocked) return <>{renderBlocked()}</>;
    return <>{renderUnavailable()}</>;
  }

  const session = startGrinOwnerSession(ownerUid);
  return <>{children(session)}</>;
}
