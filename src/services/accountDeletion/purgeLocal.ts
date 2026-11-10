import AsyncStorage from "@react-native-async-storage/async-storage";

import { deleteGrinLocalOwnerRows, deleteLocalOwnerRows } from "@/services/accountDeletion/localAccountBoundary";
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
import { beginDemographicAgePurge } from "@/onboarding/demographicAge";
import {
  removeAsyncStorageKeysForUser,
  type OwnerAsyncKeyStore,
} from "@/services/accountDeletion/ownerAsyncStorage";
import { createLogger } from "@/utils/logger";

export type { OwnerAsyncKeyStore };
export { removeAsyncStorageKeysForUser };

const log = createLogger("accountDeletion/purgeLocal");

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
    deleteLocalOwnerRows(db, userId);
    deleteGrinLocalOwnerRows(db, userId);
    db.runSync("DELETE FROM master_data_suggestions WHERE user_id = ?", [userId]);
  } catch (e) {
    log.warn("sqlite purge skipped", e);
  }
}

export async function purgeLocalAccountData(input: {
  userId: string;
  profileLogo?: ProfileLogoRef | null;
}): Promise<void> {
  const { userId, profileLogo } = input;
  beginDemographicAgePurge(userId);
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
  await removeAsyncStorageKeysForUser(userId, AsyncStorage);
  await clearPendingPurchaseIfUid(AsyncStorage, userId);
  await clearRecentSearches(userId);

  log.info("purge local done", { userId });
}
