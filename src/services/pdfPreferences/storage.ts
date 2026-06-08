import AsyncStorage from "@react-native-async-storage/async-storage";

import { PDF_CLOUD_BACKUP_ENABLED } from "@/constants/pdfPrivacy";

const KEY = "vyd_pdf_cloud_backup_v1";

/** User preference — default OFF; not functional until PDF_CLOUD_BACKUP_ENABLED. */
export async function getPdfCloudBackupEnabled(): Promise<boolean> {
  if (!PDF_CLOUD_BACKUP_ENABLED) return false;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function setPdfCloudBackupEnabled(enabled: boolean): Promise<void> {
  if (!PDF_CLOUD_BACKUP_ENABLED) return;
  await AsyncStorage.setItem(KEY, enabled ? "1" : "0");
}
