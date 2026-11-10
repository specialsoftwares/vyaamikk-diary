/**
 * Owner-scoped AsyncStorage keys removed on account deletion.
 * Ordinary sign-out does not call this. Another owner's keys stay.
 */

import { beginDemographicAgePurge, demographicAgeStorageKey } from "@/onboarding/demographicAge";

const DIARY_V2 = "vyd_diary_v2_";
const DIARY_V1 = "vyd_diary_v1_";
const PRO_PACK = "vyd_pro_pack_v1_";
const LETTERHEAD = "vyd_letterhead_v1_";
const LETTERHEAD_DOCS = "vyd_letterhead_docs_v1_";
const PRO_PACK_DRAFT_PREFIX = "vyd_pro_pack_draft_";
const PURCHASE_ORDER = "vyd_po_v1_";
const PURCHASE_ORDER_SERIAL = "vyd_po_serial_v1_";
const CUSTOMER_CREDIT = "vyd_credit_v1_";
const CUSTOMER_CREDIT_SERIAL = "vyd_credit_serial_v1_";

export type OwnerAsyncKeyStore = {
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: string[]): Promise<void>;
};

/**
 * Deletes one owner's AsyncStorage keys, including the device age band.
 * Closes in-flight demographic writes for this owner before the keys are listed.
 */
export async function removeAsyncStorageKeysForUser(
  userId: string,
  storage: OwnerAsyncKeyStore
): Promise<void> {
  beginDemographicAgePurge(userId);
  const all = await storage.getAllKeys();
  const exact = new Set([
    `${DIARY_V2}${userId}`,
    `${DIARY_V1}${userId}`,
    `${PRO_PACK}${userId}`,
    `${LETTERHEAD}${userId}`,
    `${LETTERHEAD_DOCS}${userId}`,
    `${PURCHASE_ORDER}${userId}`,
    `${PURCHASE_ORDER_SERIAL}${userId}`,
    `${CUSTOMER_CREDIT}${userId}`,
    `${CUSTOMER_CREDIT_SERIAL}${userId}`,
    demographicAgeStorageKey(userId),
  ]);
  const prefixed = all.filter(
    (key) => exact.has(key) || key.startsWith(`${PRO_PACK_DRAFT_PREFIX}${userId}_`)
  );
  if (prefixed.length > 0) {
    await storage.multiRemove([...prefixed]);
  }
}
