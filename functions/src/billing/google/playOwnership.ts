/**
 * Google Play obfuscated-account ownership index (VYD-32 / future VYD-35).
 *
 * A valid purchase token is NOT sufficient to bind a purchase to the caller.
 * Binding is SHA-256("vyd-play-account-v1:" + uid) → `_playAccountIndex/{id}`.
 * Collision of the same obfuscated id onto a different uid fails closed.
 */

import { createHash } from "node:crypto";

import { BillingError } from "../errors";
import { playAccountIndexPath } from "../paths";
import type { BillingStore } from "../store";
import type { PlayAccountIndexDoc } from "../types";
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

function obfuscatedIdFrom(
  identifiers: GoogleExternalAccountIdentifiers | undefined
): string | null {
  const id = identifiers?.obfuscatedExternalAccountId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export interface ResolvedPlayOwnership {
  uid: string;
  obfuscatedAccountId: string;
  source: "external_account" | "out_of_app_expired_account";
}

/**
 * Resolve Firebase uid from verified Google ownership identifiers.
 * Never guesses from email, device, order id, or the current caller.
 * Unknown obfuscated ids do not create mappings.
 */
export async function resolvePlayPurchaseOwner(
  store: BillingStore,
  sub: GoogleSubscriptionPurchaseV2
): Promise<ResolvedPlayOwnership> {
  const primary = obfuscatedIdFrom(sub.externalAccountIdentifiers);
  if (primary) {
    const uid = await resolveUidFromObfuscatedAccountId(store, primary);
    if (uid) {
      return { uid, obfuscatedAccountId: primary, source: "external_account" };
    }
  }
  const previous = obfuscatedIdFrom(
    sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
  );
  if (previous) {
    const uid = await resolveUidFromObfuscatedAccountId(store, previous);
    if (uid) {
      return {
        uid,
        obfuscatedAccountId: previous,
        source: "out_of_app_expired_account",
      };
    }
  }
  throw new BillingError({
    clientCode: "temporary_unavailable",
    causeCode: "unresolved_play_account_owner",
    retryable: true,
  });
}

export function playOwnershipIdentifiersPresent(sub: GoogleSubscriptionPurchaseV2): boolean {
  const primary = obfuscatedIdFrom(sub.externalAccountIdentifiers);
  const previous = obfuscatedIdFrom(
    sub.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
  );
  return primary != null || previous != null;
}

export function assertOwnerMatchesCaller(resolvedUid: string, callerUid: string): void {
  if (resolvedUid !== callerUid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "play_account_owner_mismatch",
    });
  }
}
