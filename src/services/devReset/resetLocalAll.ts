import { purgeLocalAccountData } from "@/services/accountDeletion/purgeLocal";
import {
  loadMockRegistry,
  saveMockRegistry,
  type RegistryShape,
} from "@/services/auth/mockRegistry";
import { forceClearAllSessions } from "@/services/session";
import { createLogger } from "@/utils/logger";

import { assertDevResetAllowed } from "./guards";
import {
  clearDevInMemoryCaches,
  clearDevLocalFiles,
  purgeAllSqliteDevData,
  removeAllDevAsyncStorageKeys,
} from "./purgeDevExtras";

const log = createLogger("devReset/localAll");

export interface DevLocalResetResult {
  scope: "local_all";
  usersPurged: number;
  asyncKeysRemoved: number;
  registryCleared: boolean;
  sessionCleared: boolean;
}

/**
 * Wipes ALL development data on this device.
 * NOT production Delete Account — no grace period, no user-facing policy.
 */
export async function resetAllLocalDevData(confirmation: string): Promise<DevLocalResetResult> {
  assertDevResetAllowed(confirmation);

  await forceClearAllSessions();

  const registry = await loadMockRegistry();
  const users = Object.values(registry.users);
  log.info("resetAllLocalDevData start", { userCount: users.length });

  for (const profile of users) {
    await purgeLocalAccountData({
      userId: profile.uid,
      profileLogo: profile.profileLogo,
    });
  }

  purgeAllSqliteDevData();
  const asyncKeysRemoved = await removeAllDevAsyncStorageKeys();
  await clearDevLocalFiles();
  clearDevInMemoryCaches();

  const emptyRegistry: RegistryShape = {
    phoneIndex: {},
    emailIndex: {},
    seenPhones: {},
    users: {},
  };
  await saveMockRegistry(emptyRegistry);
  await forceClearAllSessions();

  log.info("resetAllLocalDevData done", { usersPurged: users.length, asyncKeysRemoved });

  return {
    scope: "local_all",
    usersPurged: users.length,
    asyncKeysRemoved,
    registryCleared: true,
    sessionCleared: true,
  };
}
