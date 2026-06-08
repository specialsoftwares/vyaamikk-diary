import { doc, updateDoc } from "firebase/firestore";
import { getActiveBackend } from "@/config/env";
import { getFirebaseDb } from "@/config/firebase";
import type { AccountDeletionResult, AccountDeletionScope } from "@/domain/accountDeletion";
import type { UserProfile } from "@/domain/types";
import { loadMockRegistry, saveMockRegistry } from "@/services/auth/mockRegistry";
import { emailIndexStatusPatch } from "@/services/auth/emailLink";
import { applyProfilePatch, normaliseUserProfile } from "@/services/auth/normalizeProfile";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { createLogger } from "@/utils/logger";

import { pendingDeletionPatch } from "./pendingDeletion";

const log = createLogger("accountDeletion/pending");

async function markPendingMock(profile: UserProfile): Promise<UserProfile> {
  const registry = await loadMockRegistry();
  const patch = pendingDeletionPatch(profile);
  const existing = registry.users[profile.uid];
  if (!existing) throw new Error("Mock user not found.");
  const phone = normalizePhoneE164(profile.phoneE164);
  const next: UserProfile = { ...existing, ...patch };
  registry.users[profile.uid] = next;
  registry.phoneIndex[phone] = profile.uid;
  registry.seenPhones[phone] = true;
  const indexPatch = emailIndexStatusPatch(next, "pending_deletion");
  if (indexPatch) {
    registry.emailIndex[indexPatch.emailHash] = indexPatch;
  }
  await saveMockRegistry(registry);
  return next;
}

async function markPendingFirestore(profile: UserProfile): Promise<UserProfile> {
  const db = getFirebaseDb();
  const patch = pendingDeletionPatch(profile);
  await updateDoc(doc(db, "users", profile.uid), patch);
  return normaliseUserProfile(profile.uid, {
    ...profile,
    ...patch,
  });
}

/**
 * Start deletion grace period — account stays in registry; login blocked until
 * completion or cancel.
 */
export async function markAccountPendingDeletion(
  profile: UserProfile
): Promise<{ profile: UserProfile; scope: AccountDeletionScope }> {
  const scope: AccountDeletionScope =
    getActiveBackend() === "local-mock" ? "device_only" : "device_and_server";
  const backend = getActiveBackend();

  let next: UserProfile;
  if (backend === "local-mock") {
    next = await markPendingMock(profile);
  } else if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    next = await markPendingFirestore(profile);
  } else {
    next = applyProfilePatch(profile, pendingDeletionPatch(profile));
  }

  log.info("markAccountPendingDeletion", {
    uid: profile.uid,
    scheduledFor: next.deletionScheduledFor,
  });

  return { profile: next, scope };
}

export async function requestDeletionGraceResult(
  profile: UserProfile
): Promise<AccountDeletionResult> {
  const { scope } = await markAccountPendingDeletion(profile);
  return {
    scope,
    localPurged: false,
    serverDeletion: scope === "device_only" ? "not_applicable" : "pending",
    serverDetailKey: "pending",
  };
}
