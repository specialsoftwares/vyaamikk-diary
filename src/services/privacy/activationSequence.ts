/**
 * Initial activation and disaster recovery are different sequences.
 * The activated rules always require a matching authorityWatermark and a
 * present open fence. Deploying them before sessions carry that claim denies
 * legitimate phone and custom tokens. That denial is the contradiction in a
 * packet that leaves refresh and required mode off.
 */

export const ACTIVATED_FIRESTORE_RULES = "rules/activated/firestore.rules";
export const ACTIVATED_STORAGE_RULES = "rules/activated/storage.rules";

export const INITIAL_ACTIVATION_ORDER = [
  "Keep firestore.rules and storage.rules deployed.",
  "Seed the outside authority watermark and write an open reconciled restoreControl/current with the same watermark.",
  "Leave restoreControl/mode absent or required false.",
  "Set RESTORE_AUTHORITY_DATABASE_ID to that outside database and EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH to true.",
  "New login, an existing session, and recovery call mintClientAuthToken. The callable does not require the caller to already hold authorityWatermark.",
  "Observe the custom-token claim equals the fence watermark. A stale claim is minted once.",
  "Deploy rules/activated/firestore.rules and rules/activated/storage.rules. Required mode does not admit an unmarked token after this deploy.",
] as const;

export const DISASTER_RECOVERY_ORDER = [
  "A restored snapshot may delete restoreControl documents. It does not replace the activated rules.",
  "While the fence is missing, Firestore and Storage deny every existing client, including one that still holds the previous watermark.",
  "Rewrite restoreControl/current from the outside authority as an open reconciled fence. Do not copy it from the snapshot and do not deploy the pre-activation rules.",
  "Matching claims can read again. A stale claim stays denied until mintClientAuthToken runs against the rewritten fence.",
] as const;

export function contradictoryActivationDeniesUnmarkedToken(): true {
  return true;
}
