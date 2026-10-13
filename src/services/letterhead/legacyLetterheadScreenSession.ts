/**
 * Screen adapter for the legacy Letterhead reader and list.
 * Each check reads the process session. A session copied during render
 * cannot authorize a share, row open, or delete after that token retires.
 */

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  maskLegacyList,
  maskLegacyReader,
  type LegacyLetterheadListRuntime,
  type LegacyLetterheadReaderRuntime,
  type LegacyListSnapshot,
  type LegacyLiveSession,
  type LegacyReaderSnapshot,
  type LegacyReaderTarget,
  type LegacyReaderView,
  type LegacySharePress,
} from "./legacyLetterheadReadRuntime";

export function readLegacyScreenSession(authUid: string | null): LegacyLiveSession {
  const session = syncSessionOwnership.capture();
  if (!authUid || !session || authUid !== session.uid || !syncSessionOwnership.isCurrent(session)) {
    return { authUid, session: null };
  }
  return { authUid, session };
}

export function bindLegacyReaderFrame(
  runtime: LegacyLetterheadReaderRuntime,
  authUid: string | null,
  requested: LegacyReaderTarget
): {
  snap: LegacyReaderSnapshot;
  view: LegacyReaderView | null;
  sharePress: LegacySharePress | null;
  share: () => Promise<"shared" | "cancelled" | "refused" | "missing">;
} {
  const snap = maskLegacyReader(runtime.snapshot(), readLegacyScreenSession(authUid), requested);
  const view = snap.phase === "ready" ? snap.view : null;
  const sharePress =
    view?.kind === "letter" && view.pdfState === "present" && view.pdfUri ? runtime.admitShare() : null;
  return {
    snap,
    view,
    sharePress,
    share: () => (sharePress ? runtime.shareLoadedPdf(sharePress) : Promise.resolve("refused")),
  };
}

export function bindLegacyListFrame(
  runtime: LegacyLetterheadListRuntime,
  authUid: string | null
): { snap: LegacyListSnapshot } {
  return { snap: maskLegacyList(runtime.snapshot(), readLegacyScreenSession(authUid)) };
}

export function bindLegacyListRow(runtime: LegacyLetterheadListRuntime, recordId: string) {
  const press = runtime.admitRowDelete(recordId);
  return {
    open: () => (press ? runtime.openRow(press) : false),
    deleteStillCurrent: () => (press ? runtime.rowDeleteStillCurrent(press) : false),
  };
}
