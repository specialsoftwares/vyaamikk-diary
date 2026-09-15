import AsyncStorage from "@react-native-async-storage/async-storage";

import { getLocalDatabase } from "@/localDb/database";
import type { ProfileLogoRef } from "@/domain/types";
import { getDiaryRepository } from "@/services/diary";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { removeAllCustomerPhotos } from "@/services/customerCredit/customerPhotoService";
import { purgeBusinessInsightsForUser } from "@/services/insights/businessInsightRepository";
import { removeFyRecapsForUser } from "@/services/insights/fyRecapService";
import { removeMovementInsightsForUser } from "@/services/insights/movementInsightRepository";
import { invalidateMasterInsightsCache } from "@/services/insights/masterInsightsSummary";
import { notificationsService } from "@/services/notifications";
import { removeProfileLogoFile } from "@/services/profileLogo/storage";
import { clearMasterDataSessionCache, masterDataRepository } from "@/services/masterData";
import { clearLocationFootprintPreferences } from "@/services/location/locationFootprintPreferences";
import { clearRecentSearches } from "@/services/search/recentSearches";
import { clearPendingPurchaseIfUid } from "@/billing/iap/iapPendingPurchase";
import { createLogger } from "@/utils/logger";

const log = createLogger("accountDeletion/purgeLocal");

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

async function cancelScheduledReminders(userId: string): Promise<void> {
  try {
    const entries = await getDiaryRepository().list(userId, {
      includeDeleted: true,
      limit: 5000,
    });
    for (const entry of entries) {
      const id = entry.reminder?.notificationId;
      if (id) await notificationsService.cancel(id);
    }
  } catch (e) {
    log.warn("cancel reminders", e);
  }
  try {
    const creditRecords = await getCustomerCreditRepository().list(userId, {
      includeDeleted: true,
      limit: 5000,
    });
    for (const record of creditRecords) {
      if (record.reminderNotificationId) {
        await notificationsService.cancel(record.reminderNotificationId);
      }
    }
  } catch (e) {
    log.warn("cancel credit reminders", e);
  }
}

function purgeSqliteUserData(userId: string): void {
  try {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM form_drafts WHERE user_id = ?", [userId]);
    db.runSync("DELETE FROM entries_local WHERE user_id = ?", [userId]);
    db.runSync("DELETE FROM sync_queue WHERE user_id = ?", [userId]);
    db.runSync("DELETE FROM active_route WHERE user_id = ?", [userId]);
    db.runSync("DELETE FROM master_data_suggestions WHERE user_id = ?", [userId]);
  } catch (e) {
    log.warn("sqlite purge skipped", e);
  }
}

async function removeAsyncStorageKeysForUser(userId: string): Promise<void> {
  const all = await AsyncStorage.getAllKeys();
  const exact = [
    `${DIARY_V2}${userId}`,
    `${DIARY_V1}${userId}`,
    `${PRO_PACK}${userId}`,
    `${LETTERHEAD}${userId}`,
    `${LETTERHEAD_DOCS}${userId}`,
    `${PURCHASE_ORDER}${userId}`,
    `${PURCHASE_ORDER_SERIAL}${userId}`,
    `${CUSTOMER_CREDIT}${userId}`,
    `${CUSTOMER_CREDIT_SERIAL}${userId}`,
  ];
  const prefixed = all.filter(
    (k) =>
      exact.includes(k) || k.startsWith(`${PRO_PACK_DRAFT_PREFIX}${userId}_`)
  );
  if (prefixed.length > 0) {
    await AsyncStorage.multiRemove(prefixed);
  }
}

/**
 * Wipes all account-linked data on this device for `userId`.
 * Safe to call before server deletion; idempotent.
 */
export async function purgeLocalAccountData(input: {
  userId: string;
  profileLogo?: ProfileLogoRef | null;
}): Promise<void> {
  const { userId, profileLogo } = input;
  log.info("purge local start", { userId });

  await cancelScheduledReminders(userId);
  await removeProfileLogoFile(profileLogo ?? null);
  await removeAllCustomerPhotos(userId).catch(() => undefined);
  await removeMovementInsightsForUser(userId);
  purgeBusinessInsightsForUser(userId);
  await removeFyRecapsForUser(userId);
  invalidateMasterInsightsCache();
  purgeSqliteUserData(userId);
  masterDataRepository.purgeUser(userId);
  clearMasterDataSessionCache();
  await clearLocationFootprintPreferences(userId);
  await removeAsyncStorageKeysForUser(userId);
  await clearPendingPurchaseIfUid(AsyncStorage, userId);
  await clearRecentSearches();

  log.info("purge local done", { userId });
}
