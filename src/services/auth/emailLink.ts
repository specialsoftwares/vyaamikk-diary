/**
 * Email ↔ UEID bonding policy and index operations.
 *
 * LOCAL MODE: email uniqueness enforced on-device via mock registry `emailIndex`.
 * FIREBASE: client writes mirror phoneIndex pattern; production requires Cloud
 * Function / Admin SDK transaction for race-safe global uniqueness (see HANDOVER).
 */

import { AppError } from "@/domain/errors";
import type { EmailIndexEntry } from "@/domain/types";
import type { EmailStatus, UserProfile } from "@/domain/types";
import { resolveAccountStatus } from "@/services/accountDeletion/accountStatus";
import type { ProfilePatch } from "./types";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";
import { isEmailVerificationAvailable } from "./emailVerificationService";

export const EMAIL_DUPLICATE_ACTIVE_MESSAGE =
  "This email is already linked to another Vyaamikk account. Please use a different email or verify the existing account.";

export const EMAIL_SAME_ACCOUNT_MESSAGE =
  "This email is already linked to your Vyaamikk account.";

export const EMAIL_PENDING_DELETION_MESSAGE =
  "This email belongs to an account scheduled for deletion. It cannot be reused until deletion is complete.";

export type EmailLinkResult =
  | { kind: "noop"; hint: "same_account" }
  | {
      kind: "link";
      profileFields: Pick<
        UserProfile,
        | "businessEmail"
        | "normalizedEmail"
        | "emailHash"
        | "emailStatus"
        | "emailLinkedAt"
        | "emailVerifiedAt"
      >;
      indexUpsert: EmailIndexEntry;
      indexRemoveHash: string | null;
    };

function resolveEmailStatusForNewLink(): EmailStatus {
  if (isEmailVerificationAvailable()) return "verification_pending";
  return "unverified";
}

/** Pure policy: decide whether an email may be linked to this account. */
export function evaluateBusinessEmailLink(
  user: UserProfile,
  rawEmail: string | null | undefined,
  existingIndex: EmailIndexEntry | null
): EmailLinkResult {
  const normalized = rawEmail?.trim() ? normalizeEmail(rawEmail) : null;
  const currentNormalized = user.normalizedEmail ?? user.businessEmail?.trim().toLowerCase() ?? null;

  if (!normalized) {
    if (!currentNormalized) return { kind: "noop", hint: "same_account" };
    throw new AppError("save_failed", "A valid email address is required.");
  }

  if (normalized === currentNormalized) {
    return { kind: "noop", hint: "same_account" };
  }

  const emailHash = hashEmail(normalized);
  const accountStatus = resolveAccountStatus(user);

  if (
    existingIndex &&
    existingIndex.userId !== user.uid &&
    existingIndex.emailStatus === "verified"
  ) {
    if (existingIndex.status === "pending_deletion") {
      throw new AppError("email_pending_deletion", EMAIL_PENDING_DELETION_MESSAGE);
    }
    if (existingIndex.status === "active") {
      throw new AppError("email_already_linked", EMAIL_DUPLICATE_ACTIVE_MESSAGE);
    }
    if (existingIndex.status !== "deleted") {
      throw new AppError("email_already_linked", EMAIL_DUPLICATE_ACTIVE_MESSAGE);
    }
  }

  const now = Date.now();
  const emailStatus = resolveEmailStatusForNewLink();

  return {
    kind: "link",
    profileFields: {
      businessEmail: normalized,
      normalizedEmail: normalized,
      emailHash,
      emailStatus,
      emailLinkedAt: now,
      emailVerifiedAt: null,
    },
    indexUpsert: {
      emailHash,
      userId: user.uid,
      ueid: user.ueid,
      status: accountStatus,
      emailStatus,
      linkedAt: now,
      verifiedAt: null,
    },
    indexRemoveHash:
      user.emailHash && user.emailHash !== emailHash ? user.emailHash : null,
  };
}

export function emailIndexEntryForUser(user: UserProfile): EmailIndexEntry | null {
  const hash = user.emailHash;
  const email = user.normalizedEmail ?? user.businessEmail?.trim().toLowerCase();
  if (!hash || !email) return null;
  return {
    emailHash: hash,
    userId: user.uid,
    ueid: user.ueid,
    status: resolveAccountStatus(user),
    emailStatus: user.emailStatus ?? "unverified",
    linkedAt: user.emailLinkedAt ?? user.updatedAt,
    verifiedAt: user.emailVerifiedAt ?? null,
  };
}

/** Sync index status when account enters pending deletion or is deleted. */
export function emailIndexStatusPatch(
  user: UserProfile,
  status: EmailIndexEntry["status"]
): EmailIndexEntry | null {
  const base = emailIndexEntryForUser(user);
  if (!base) return null;
  return { ...base, status };
}

/** Apply email bonding policy when `businessEmail` is in the patch. Mutates index via callback. */
export async function enrichPatchWithEmailLink(
  user: UserProfile,
  patch: ProfilePatch,
  lookup: (emailHash: string) => Promise<EmailIndexEntry | null>,
  commit: (ops: { upsert?: EmailIndexEntry; removeHash?: string | null }) => Promise<void>
): Promise<ProfilePatch> {
  if (patch.businessEmail === undefined) return patch;

  const normalized = patch.businessEmail?.trim()
    ? normalizeEmail(patch.businessEmail)
    : null;
  const hash = normalized ? hashEmail(normalized) : null;
  const existingIndex = hash ? await lookup(hash) : null;

  const result = evaluateBusinessEmailLink(user, patch.businessEmail, existingIndex);
  if (result.kind === "noop") {
    return patch;
  }

  if (result.indexUpsert.emailStatus === "verified") {
    await commit({
      upsert: result.indexUpsert,
      removeHash: result.indexRemoveHash,
    });
  } else if (result.indexRemoveHash) {
    await commit({ removeHash: result.indexRemoveHash });
  }

  return { ...patch, ...result.profileFields };
}
