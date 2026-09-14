/**
 * Google Play obfuscated-account + credential-fingerprint ownership (VYD-32).
 *
 * A valid purchase token is NOT sufficient to bind a purchase to the caller.
 * Binding is SHA-256("vyd-play-account-v1:" + uid) → `_playAccountIndex/{id}`.
 * Collision of the same obfuscated id onto a different uid fails closed.
 *
 * Out-of-app resubscribe may identify the user via:
 *   A. externalAccountIdentifiers.obfuscatedExternalAccountId
 *   B. outOfAppPurchaseContext.expiredExternalAccountIdentifiers
 *   C. outOfAppPurchaseContext.expiredPurchaseToken → fingerprint only
 *      → `_playCredentialIndex/{fingerprint}`
 *
 * Never call the Play API with expiredPurchaseToken merely to identify owner.
 */

import { createHash } from "node:crypto";

import { credentialFingerprint } from "../crypto";
import { BillingError } from "../errors";
import { playAccountIndexPath, playCredentialIndexPath } from "../paths";
import type { BillingStore } from "../store";
import type { PlayAccountIndexDoc, PlayCredentialIndexDoc } from "../types";
import { assertPurchaseToken } from "./playToken";
import type {
  GoogleExternalAccountIdentifiers,
  GoogleSubscriptionPurchaseV2,
} from "./playTypes";

export const PLAY_ACCOUNT_ID_PREFIX = "vyd-play-account-v1:";

export function obfuscatedAccountIdForUid(uid: string): string {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "missing_uid_for_play_account",
    });
  }
  return createHash("sha256").update(`${PLAY_ACCOUNT_ID_PREFIX}${uid}`, "utf8").digest("hex");
}

export async function ensurePlayAccountIndex(
  store: BillingStore,
  uid: string,
  nowMs: number
): Promise<{ obfuscatedAccountId: string }> {
  const obfuscatedAccountId = obfuscatedAccountIdForUid(uid);
  const path = playAccountIndexPath(obfuscatedAccountId);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      const doc: PlayAccountIndexDoc = { uid, createdAt: nowMs, updatedAt: nowMs };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return;
    }
    const existing = snap.data() as PlayAccountIndexDoc | undefined;
    if (!existing || existing.uid !== uid) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "play_account_index_collision",
      });
    }
    const next: PlayAccountIndexDoc = {
      uid,
      createdAt: existing.createdAt,
      updatedAt: nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
  });
  return { obfuscatedAccountId };
}

export async function ensurePlayCredentialIndex(
  store: BillingStore,
  fingerprint: string,
  uid: string,
  nowMs: number
): Promise<void> {
  if (typeof fingerprint !== "string" || fingerprint.length === 0) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "missing_credential_fingerprint",
    });
  }
  const path = playCredentialIndexPath(fingerprint);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      const doc: PlayCredentialIndexDoc = { uid, createdAt: nowMs, updatedAt: nowMs };
      tx.create(path, doc as unknown as Record<string, unknown>);
      return;
    }
    const existing = snap.data() as PlayCredentialIndexDoc | undefined;
    if (!existing || existing.uid !== uid) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "play_credential_index_collision",
      });
    }
    const next: PlayCredentialIndexDoc = {
      uid,
      createdAt: existing.createdAt,
      updatedAt: nowMs,
    };
    tx.set(path, next as unknown as Record<string, unknown>);
  });
}

export async function resolveUidFromObfuscatedAccountId(
  store: BillingStore,
  obfuscatedAccountId: string
): Promise<string | null> {
  if (typeof obfuscatedAccountId !== "string" || obfuscatedAccountId.length === 0) {
    return null;
  }
  const path = playAccountIndexPath(obfuscatedAccountId);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return null;
    const uid = (snap.data() as PlayAccountIndexDoc | undefined)?.uid;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  });
}

export async function resolveUidFromCredentialFingerprint(
  store: BillingStore,
  fingerprint: string
): Promise<string | null> {
  if (typeof fingerprint !== "string" || fingerprint.length === 0) {
    return null;
  }
  const path = playCredentialIndexPath(fingerprint);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) return null;
    const uid = (snap.data() as PlayCredentialIndexDoc | undefined)?.uid;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  });
}

function obfuscatedIdFrom(
  identifiers: GoogleExternalAccountIdentifiers | undefined
): string | null {
  const id = identifiers?.obfuscatedExternalAccountId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function expiredPurchaseTokenSignal(sub: GoogleSubscriptionPurchaseV2): unknown {
  return sub.outOfAppPurchaseContext?.expiredPurchaseToken;
}

function expiredPurchaseTokenPresent(sub: GoogleSubscriptionPurchaseV2): boolean {
  const raw = expiredPurchaseTokenSignal(sub);
  if (raw == null) return false;
  if (typeof raw === "string" && raw.length === 0) return false;
  return true;
}

export interface ResolvedPlayOwnership {
  uid: string;
  obfuscatedAccountId: string | null;
  source: "external_account" | "out_of_app_expired_account" | "expired_purchase_token";
}

interface OwnershipSignal {
  uid: string;
  source: ResolvedPlayOwnership["source"];
  obfuscatedAccountId: string | null;
}

async function resolveExpiredPurchaseTokenOwner(
  store: BillingStore,
  raw: unknown
): Promise<string | null> {
  const token = assertPurchaseToken(raw);
  const fingerprint = credentialFingerprint(token);
  return resolveUidFromCredentialFingerprint(store, fingerprint);
}

/**
 * Resolve Firebase uid from verified Google ownership identifiers.
 * Never guesses from email, device, order id, or the current caller.
 * Unknown obfuscated ids / unknown token fingerprints do not create mappings.
 * Conflicting resolved uids fail closed.
 */
export async function resolvePlayPurchaseOwner(
  store: BillingStore,
  sub: GoogleSubscriptionPurchaseV2
): Promise<ResolvedPlayOwnership> {
  const resolved: OwnershipSignal[] = [];

  const primary = obfuscatedIdFrom(sub.externalAccountIdentifiers);
  if (primary) {
    const uid = await resolveUidFromObfuscatedAccountId(store, primary);
    if (uid) {
      resolved.push({ uid, source: "external_account", obfuscatedAccountId: primary });
    }
  }

  const previous = obfuscatedIdFrom(
    sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
  );
  if (previous) {
    const uid = await resolveUidFromObfuscatedAccountId(store, previous);
    if (uid) {
      resolved.push({
        uid,
        source: "out_of_app_expired_account",
        obfuscatedAccountId: previous,
      });
    }
  }

  if (expiredPurchaseTokenPresent(sub)) {
    const uid = await resolveExpiredPurchaseTokenOwner(store, expiredPurchaseTokenSignal(sub));
    if (uid) {
      resolved.push({
        uid,
        source: "expired_purchase_token",
        obfuscatedAccountId: null,
      });
    }
  }

  const uniqueUids = new Set(resolved.map((s) => s.uid));
  if (uniqueUids.size > 1) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "play_ownership_signal_conflict",
    });
  }
  if (resolved.length === 0) {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "unresolved_play_account_owner",
      retryable: true,
    });
  }
  const uid = resolved[0].uid;
  const obfuscatedAccountId =
    resolved.find((s) => s.obfuscatedAccountId != null)?.obfuscatedAccountId ??
    primary ??
    previous ??
    null;
  return { uid, obfuscatedAccountId, source: resolved[0].source };
}

export function playOwnershipIdentifiersPresent(sub: GoogleSubscriptionPurchaseV2): boolean {
  const primary = obfuscatedIdFrom(sub.externalAccountIdentifiers);
  const previous = obfuscatedIdFrom(
    sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
  );
  return primary != null || previous != null || expiredPurchaseTokenPresent(sub);
}

export function assertOwnerMatchesCaller(resolvedUid: string, callerUid: string): void {
  if (resolvedUid !== callerUid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "play_account_owner_mismatch",
    });
  }
}
