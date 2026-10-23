/**
 * Traffic stays closed until the outside restore authority matches the local
 * fence. Restoring an older user document does not clear that authority.
 * When the authority database is not configured, a local closed fence or an
 * erasure manifest still denies. Absence of both is the pre-authority
 * production state and is not a completed restore gate.
 */

import { decideRestoreTraffic, readConfiguredRestoreAuthority } from "./restoreAuthority";

export async function assertRestoreTrafficClosed(uid: string, purpose?: string): Promise<void> {
  const decision = await restoreTrafficDecisionForUid(uid, purpose);
  if (decision === "deny") {
    const { HttpsError } = await import("firebase-functions/v2/https");
    throw new HttpsError("failed-precondition", "restore_not_closed");
  }
}

export async function restoreTrafficDecisionForUid(uid: string, purpose?: string): Promise<"allow" | "deny"> {
  const { getAdminDb } = await import("../admin");
  const db = getAdminDb();
  let localWatermark: number | null = null;
  let closed = false;
  try {
    const fence = await db.doc("restoreControl/current").get();
    if (fence.exists) {
      const data = fence.data() ?? {};
      closed = data.closed === true;
      localWatermark = Number.isSafeInteger(data.watermark) ? Number(data.watermark) : null;
    }
  } catch {
    return "deny";
  }
  if (closed) return "deny";
  const authority = await readConfiguredRestoreAuthority();
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
