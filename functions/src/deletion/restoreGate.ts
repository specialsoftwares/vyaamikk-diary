/**
 * Traffic stays closed until the outside restore authority matches the local
 * fence. Restoring an older user document does not clear that authority.
 * When the authority database is not configured, a local closed fence or an
 * erasure manifest still denies. Absence of both is the pre-authority
 * production state and is not a completed restore gate.
 */

import { decideRestoreAdmission, decideRestoreTraffic, readConfiguredRestoreAuthority } from "./restoreAuthority";

/** Server admission for a custom token. Skip leaves the caller's other claims unchanged. */
export async function restoreAdmissionForUid(uid: string, purpose?: string): Promise<ReturnType<typeof decideRestoreAdmission>> {
  const { getAdminDb } = await import("../admin");
  const db = getAdminDb();
  let closed = false;
  let required = false;
  let reconciled = false;
  let localWatermark: number | null = null;
  try {
    const [fence, mode] = await Promise.all([
      db.doc("restoreControl/current").get(),
      db.doc("restoreControl/mode").get(),
    ]);
    closed = fence.exists && fence.data()?.closed === true;
    reconciled = fence.exists && fence.data()?.reconciled === true;
    localWatermark = fence.exists && Number.isSafeInteger(fence.data()?.watermark) ? Number(fence.data()?.watermark) : null;
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
  let reconciled = false;
  try {
    const fence = await db.doc("restoreControl/current").get();
    if (fence.exists) {
      const data = fence.data() ?? {};
      closed = data.closed === true;
      reconciled = data.reconciled === true;
      localWatermark = Number.isSafeInteger(data.watermark) ? Number(data.watermark) : null;
    }
  } catch {
    return "deny";
  }
  if (closed) return "deny";
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
