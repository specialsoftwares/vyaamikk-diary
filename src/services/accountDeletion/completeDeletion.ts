import { getActiveBackend } from "@/config/env";
import type {
  AccountDeletionResult,
  AccountDeletionScope,
} from "@/domain/accountDeletion";
import type { UserProfile } from "@/domain/types";
import { removeMockRegistryUser } from "@/services/auth/mockRegistry";
import { retireLocalEmailIndex } from "@/services/auth/emailIndexLocal";
import { sessionStore } from "@/services/session";
import { createLogger } from "@/utils/logger";

import { executeFirebaseServerDeletion } from "./firebaseServerDeletion";
import { purgeLocalAccountData } from "./purgeLocal";
import { recordRetiredPhone } from "./retiredIdentity";

const log = createLogger("accountDeletion/complete");

function deletionScopeForBackend(): AccountDeletionScope {
  const backend = getActiveBackend();
  return backend === "local-mock" ? "device_only" : "device_and_server";
}

/**
 * Final account deletion after grace period or immediate completion path.
 * Purges local data, retires UEID / phone index, best-effort server erasure.
 */
export async function completeAccountDeletion(
  profile: UserProfile
): Promise<AccountDeletionResult> {
  const scope = deletionScopeForBackend();
  const backend = getActiveBackend();

  log.info("completeAccountDeletion start", {
    uid: profile.uid,
    backend,
    scope,
  });

  await purgeLocalAccountData({
    userId: profile.uid,
    profileLogo: profile.profileLogo,
  });

  await recordRetiredPhone(profile.phoneE164, profile.ueid, profile.uid);

  if (backend === "local-mock") {
    if (profile.emailHash) {
      await retireLocalEmailIndex(profile.emailHash);
    }
    await removeMockRegistryUser(profile.uid, profile.phoneE164);
    await sessionStore.clear();
    return {
      scope,
      localPurged: true,
      serverDeletion: "not_applicable",
    };
  }

  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    const serverDeletion = await executeFirebaseServerDeletion(profile);
    await sessionStore.clear();
    return {
      scope,
      localPurged: true,
      serverDeletion,
      serverDetailKey:
        serverDeletion === "pending"
          ? "pending"
          : serverDeletion === "failed"
            ? "failed"
            : undefined,
    };
  }

  await sessionStore.clear();
  return {
    scope,
    localPurged: true,
    serverDeletion: "not_applicable",
  };
}
