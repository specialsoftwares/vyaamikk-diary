import * as SecureStore from "expo-secure-store";

import { shortId } from "@/utils/id";

const STORAGE_KEY = "vyd_device_installation_id_v1";

/**
 * App-generated installation ID for this device install (not hardware IMEI/serial).
 * Stored in SecureStore — used for trusted-device registry only.
 */
export async function getOrCreateDeviceInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(STORAGE_KEY);
  if (existing) return existing;
  const id = shortId("dev");
  await SecureStore.setItemAsync(STORAGE_KEY, id);
  return id;
}
