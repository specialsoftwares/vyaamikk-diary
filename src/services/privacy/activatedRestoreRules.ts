/**
 * The activated rules are the control a Firestore data restore cannot remove.
 * A snapshot can delete restoreControl documents. It does not replace the
 * deployed rules text. Pre-activation rules stay in firestore.rules and
 * storage.rules so a project that has never written those documents still
 * admits current clients. These transforms are what activation deploys after
 * an open reconciled fence exists.
 */

const ACTIVATED_FIRESTORE_CLAIM = `function restoreClaimAllows() {
      let fence = /databases/$(database)/documents/restoreControl/current;
      let fenceData = exists(fence) ? get(fence).data : null;
      return request.auth.token.get('erased', false) != true
        && fenceData != null
        && fenceData.get('closed', false) == false
        && fenceData.get('reconciled', false) == true
        && fenceData.get('watermark', 0) is int
        && fenceData.get('watermark', 0) > 0
        && request.auth.token.keys().hasAny(['authorityWatermark'])
        && fenceData.get('watermark', 0) == request.auth.token.authorityWatermark;
    }

    `;

const ACTIVATED_STORAGE_CLAIM = `function restoreClaimAllows() {
      let fence = /databases/(default)/documents/restoreControl/current;
      let fenceData = firestore.exists(fence) ? firestore.get(fence).data : null;
      return request.auth.token.get('erased', false) != true
        && fenceData != null
        && fenceData.get('closed', false) == false
        && fenceData.get('reconciled', false) == true
        && fenceData.get('watermark', 0) is int
        && fenceData.get('watermark', 0) > 0
        && request.auth.token.keys().hasAny(['authorityWatermark'])
        && fenceData.get('watermark', 0) == request.auth.token.authorityWatermark;
    }

    `;

function replaceClaim(source: string, replacement: string): string {
  const start = source.indexOf("function restoreClaimAllows()");
  const end = source.indexOf("function isOwner(");
  if (start < 0 || end < start) throw new Error("restore_rules_anchor_missing");
  return source.slice(0, start) + replacement + source.slice(end);
}

export function activateFirestoreRestoreRules(source: string): string {
  return replaceClaim(source, ACTIVATED_FIRESTORE_CLAIM);
}

export function activateStorageRestoreRules(source: string): string {
  return replaceClaim(source, ACTIVATED_STORAGE_CLAIM);
}

export const RESTORE_INTERVAL_CONTROL =
  "Deployed security rules deny client Firestore and Storage reads while restoreControl/current is missing. A data restore does not roll those rules back.";
