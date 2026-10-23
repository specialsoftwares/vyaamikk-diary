/**
 * An erasure manifest lives outside the user document. Restoring that document
 * does not remove the manifest, so content calls stop until a later maintenance
 * action deletes the manifest. This function does not delete anything.
 */

export function restoreTrafficDecision(manifestExists: boolean): "allow" | "deny" {
  return manifestExists ? "deny" : "allow";
}

export async function assertRestoreTrafficClosed(uid: string): Promise<void> {
  const { getAdminDb } = await import("../admin");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const manifest = await getAdminDb().collection("erasureManifests").doc(uid).get();
  if (restoreTrafficDecision(manifest.exists) === "deny") {
    throw new HttpsError("failed-precondition", "restore_not_closed");
  }
}
