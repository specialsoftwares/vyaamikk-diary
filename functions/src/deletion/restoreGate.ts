/**
 * Traffic stays closed until the outside restore authority matches the local
 * fence. Restoring an older user document does not clear that authority.
 * When the authority database is not configured, a local closed fence or an
 * erasure manifest still denies. Absence of both is the pre-authority
 * production state and is not a completed restore gate.
 */

import { decideRestoreAdmission, decideRestoreTraffic, readConfiguredRestoreAuthority } from "./restoreAuthority";
import {
  rememberInvocationValue,
  type InvocationRestoreReads,
  type RestoreFenceRead,
} from "./restoreInvocationCache";

export type { InvocationRestoreReads } from "./restoreInvocationCache";

async function readRestoreFence(
  db: {
    doc(path: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    };
  },
  scope?: InvocationRestoreReads
): Promise<RestoreFenceRead> {
  const load = async (): Promise<RestoreFenceRead> => {
    try {
      const fence = await db.doc("restoreControl/current").get();
      if (!fence.exists) return { ok: true, closed: false, reconciled: false, localWatermark: null };
      const data = fence.data() ?? {};
      return {
        ok: true,
        closed: data.closed === true,
        reconciled: data.reconciled === true,
        localWatermark: Number.isSafeInteger(data.watermark) ? Number(data.watermark) : null,
      };
    } catch {
      return { ok: false };
    }
  };
  if (!scope) return load();
  if (!scope.fence) scope.fence = {};
  return rememberInvocationValue(scope.fence, load);
}

/** Server admission for a custom token. Skip leaves the caller's other claims unchanged. */
export async function restoreAdmissionForUid(
  uid: string,
  purpose?: string,
  scope?: InvocationRestoreReads
): Promise<ReturnType<typeof decideRestoreAdmission>> {
  const { getAdminDb } = await import("../admin");
  const db = getAdminDb();
  let closed = false;
  let required = false;
  let reconciled = false;
  let localWatermark: number | null = null;
  const fence = await readRestoreFence(db, scope);
  if (!fence.ok) return { status: "unavailable" };
  closed = fence.closed;
  reconciled = fence.reconciled;
  localWatermark = fence.localWatermark;
  try {
    const mode = await db.doc("restoreControl/mode").get();
    required = mode.exists && mode.data()?.required === true;
  } catch {
    return { status: "unavailable" };
  }
  let authority: Awaited<ReturnType<typeof readConfiguredRestoreAuthority>>;
  try {
    authority = await readConfiguredRestoreAuthority();
  } catch {
    return { status: "unavailable" };
  }
  return decideRestoreAdmission({
    configured: authority.configured,
    authority: authority.snapshot,
    closed,
    required,
    reconciled,
    localWatermark,
    uid,
    purpose,
  });
}

export async function assertRestoreTrafficClosed(
  uid: string,
  purpose?: string,
  scope?: InvocationRestoreReads
): Promise<void> {
  const decision = await restoreTrafficDecisionForUid(uid, purpose, scope);
  if (decision === "deny") {
    const { HttpsError } = await import("firebase-functions/v2/https");
    throw new HttpsError("failed-precondition", "restore_not_closed");
  }
}

export async function restoreTrafficDecisionForUid(
  uid: string,
  purpose?: string,
  scope?: InvocationRestoreReads
): Promise<"allow" | "deny"> {
  const { getAdminDb } = await import("../admin");
  const db = getAdminDb();
  const fence = await readRestoreFence(db, scope);
  if (!fence.ok) return "deny";
  const localWatermark = fence.localWatermark;
  const closed = fence.closed;
  const reconciled = fence.reconciled;
  if (closed) return "deny";
  if (process.env.RESTORE_PROTECTION_ACTIVE === "true") {
    const { readDurableWorkerHold } = await import("./privilegedWorkerGuard");
    const hold = await readDurableWorkerHold();
    if (!hold || hold.traffic !== "open") return "deny";
  }
  let required = false;
  try {
    const mode = await db.doc("restoreControl/mode").get();
    required = mode.exists && mode.data()?.required === true;
  } catch {
    return "deny";
  }
  const authority = await readConfiguredRestoreAuthority();
  if (required) {
    if (!reconciled || localWatermark == null || !authority.configured) return "deny";
    return decideRestoreTraffic({
      authority: authority.snapshot,
      localWatermark,
      uid,
      purpose,
    });
  }
  if (authority.configured) {
    return decideRestoreTraffic({
      authority: authority.snapshot,
      localWatermark,
      uid,
      purpose,
    });
  }
  try {
    const manifest = await db.collection("erasureManifests").doc(uid).get();
    if (manifest.exists) return "deny";
  } catch {
    return "deny";
  }
  return "allow";
}
