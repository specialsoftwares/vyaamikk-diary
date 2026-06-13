import { doc, updateDoc } from "firebase/firestore";
import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { isPendingDeletionAccount } from "@/services/accountDeletion/accountStatus";
import { applyProfilePatch, normaliseUserProfile } from "@/services/auth/normalizeProfile";
import type { ProfilePatch } from "@/services/auth/types";
import { loadMockRegistry, saveMockRegistry } from "@/services/auth/mockRegistry";
import { createLogger } from "@/utils/logger";

import { cancelDeletionPatch } from "./pendingDeletion";

const log = createLogger("accountDeletion/cancel");

async function cancelMock(uid: string): Promise<UserProfile> {
  const registry = await loadMockRegistry();
  const existing = registry.users[uid];
  if (!existing) throw new AppError("not_found", "Account not found.");
  if (!isPendingDeletionAccount(existing)) {
    throw new AppError("permission_denied", "Account deletion is not in progress.");
  }
  const next = applyProfilePatch(existing, cancelDeletionPatch() as ProfilePatch);
  registry.users[uid] = next;
  await saveMockRegistry(registry);
  return next;
}

async function cancelFirestore(uid: string, prior: UserProfile): Promise<UserProfile> {
  const patch = cancelDeletionPatch();
  await updateDoc(doc(getFirebaseDb(), "users", uid), patch);
  return normaliseUserProfile(uid, { ...prior, ...patch });
}

export async function cancelAccountDeletion(profile: UserProfile): Promise<UserProfile> {
  if (!isPendingDeletionAccount(profile)) {
    throw new AppError("permission_denied", "Account deletion is not in progress.");
  }

  const backend = getActiveBackend();
  let next: UserProfile;
  if (backend === "local-mock") {
    next = await cancelMock(profile.uid);
  } else if (backend === "firebase-shared-dev") {
    next = await cancelFirestore(profile.uid, profile);
  } else if (backend === "firebase-production") {
    throw new AppError(
      "permission_denied",
      "Cancel deletion directly is not allowed. Use account reactivation with email verification."
    );
  } else {
    next = applyProfilePatch(profile, cancelDeletionPatch() as ProfilePatch);
  }

  log.info("cancelAccountDeletion", { uid: profile.uid });
  return next;
}
