import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { protectionActive } from "./privilegedWorkerGuard";
import { readPublishedAuthorityDocument, restoreAuthorityConfiguration } from "./restoreAuthority";

/**
 * Returns the published watermark, never the erasure list.
 * A closed fence fails the call. A missing authority is unconfigured only
 * while protection is off; it is not an empty allow-list.
 */
export const readRestoreAuthorityWatermark = onCall({ region: "asia-south1" }, async (request) => {
  await assertAdmittedCallableUser(request);
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign-in is required.");
  const primary = getFirestore(getApp());
  const fence = await primary.doc("restoreControl/current").get();
  const fenceClosed = fence.exists && fence.data()?.closed === true;
  const configuration = restoreAuthorityConfiguration();
  const databaseId = configuration.databaseId;
  if (!databaseId) {
    const state = fenceClosed
      ? { state: "closed" as const }
      : protectionActive()
        ? { state: "unavailable" as const, reason: "missing" as const }
        : { state: "unconfigured" as const };
    if (state.state === "closed") throw new HttpsError("failed-precondition", "restore_fence_closed");
    if (state.state === "unavailable") throw new HttpsError("unavailable", state.reason);
    return state;
  }
  const state = await readPublishedAuthorityDocument(getFirestore(getApp(), databaseId), {
    protectionActive: protectionActive(),
    configured: configuration.configured,
    fenceClosed,
  });
  if (state.state === "closed") throw new HttpsError("failed-precondition", "restore_fence_closed");
  if (state.state === "unavailable") throw new HttpsError("unavailable", state.reason);
  return state;
});
