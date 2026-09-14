/**
 * App Store appAccountToken ownership (VYD-33).
 *
 * Server generates/reuses one opaque UUID per Firebase uid. The client never
 * supplies the token. Bindings live in:
 *   `_appStoreAccountByUid/{uid}`
 *   `_appStoreAccountIndex/{appAccountToken}`
 * Creation of both documents is atomic. No email/phone.
 */

import { randomUUID } from "node:crypto";

import { BillingError } from "../errors";
import { appStoreAccountByUidPath, appStoreAccountIndexPath } from "../paths";
import type { BillingStore } from "../store";
import type { AppStoreAccountByUidDoc, AppStoreAccountIndexDoc } from "../types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertAppAccountToken(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "missing_ios_app_account_token",
    });
  }
  return value.toLowerCase();
}

export async function ensureIosBillingAccount(
  store: BillingStore,
  uid: string,
  nowMs: number
): Promise<{ appAccountToken: string }> {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new BillingError({
      clientCode: "not_entitled",
      causeCode: "unauthenticated",
    });
  }
  const byUidPath = appStoreAccountByUidPath(uid);
  return store.runTransaction(async (tx) => {
    const existingByUid = await tx.get(byUidPath);
    if (existingByUid.exists) {
      const doc = existingByUid.data() as AppStoreAccountByUidDoc | undefined;
      const token = doc?.appAccountToken;
      if (typeof token !== "string" || token.length === 0) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "ios_account_index_collision",
        });
      }
      const indexSnap = await tx.get(appStoreAccountIndexPath(token));
      const index = indexSnap.data() as AppStoreAccountIndexDoc | undefined;
      if (!indexSnap.exists || !index || index.uid !== uid) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "ios_account_index_collision",
        });
      }
      tx.set(byUidPath, {
        appAccountToken: token,
        createdAt: doc?.createdAt ?? nowMs,
        updatedAt: nowMs,
      } satisfies AppStoreAccountByUidDoc);
      tx.set(appStoreAccountIndexPath(token), {
        uid,
        createdAt: index.createdAt,
        updatedAt: nowMs,
      } satisfies AppStoreAccountIndexDoc);
      return { appAccountToken: token };
    }

    const appAccountToken = randomUUID();
    const indexPath = appStoreAccountIndexPath(appAccountToken);
    const indexSnap = await tx.get(indexPath);
    if (indexSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "ios_account_index_collision",
      });
    }
    const byUid: AppStoreAccountByUidDoc = {
      appAccountToken,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    const index: AppStoreAccountIndexDoc = {
      uid,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    tx.create(byUidPath, byUid as unknown as Record<string, unknown>);
    tx.create(indexPath, index as unknown as Record<string, unknown>);
    return { appAccountToken };
  });
}

export async function resolveUidFromAppAccountToken(
  store: BillingStore,
  appAccountToken: string
): Promise<string> {
  const token = assertAppAccountToken(appAccountToken);
  const path = appStoreAccountIndexPath(token);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    const uid = (snap.data() as AppStoreAccountIndexDoc | undefined)?.uid;
    if (!snap.exists || typeof uid !== "string" || uid.length === 0) {
      throw new BillingError({
        clientCode: "verification_failed",
        causeCode: "unresolved_ios_account_owner",
      });
    }
    return uid;
  });
}

export function assertIosOwnerMatchesCaller(resolvedUid: string, callerUid: string): void {
  if (resolvedUid !== callerUid) {
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "ios_account_owner_mismatch",
    });
  }
}
