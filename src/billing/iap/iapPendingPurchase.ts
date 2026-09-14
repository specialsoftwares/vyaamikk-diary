/**
 * UID-bound pending purchase cache.
 *
 * Exact key: vyd_pending_purchase_v1
 * Never persist purchaseToken, Apple JWS, appAccountToken, obfuscatedAccountId,
 * email, phone, GST, prices, or Purchase.id.
 */

import type {
  IapKeyValueStore,
  PendingPurchaseEnvelope,
  PendingPurchaseStage,
} from "./iapTypes";

export const PENDING_PURCHASE_CACHE_KEY = "vyd_pending_purchase_v1";
export const PENDING_PURCHASE_CACHE_VERSION = 1;

const SECRET_KEYS = [
  "purchaseToken",
  "signedTransactionInfo",
  "purchaseTokenAndroid",
  "appAccountToken",
  "obfuscatedAccountId",
  "obfuscatedAccountIdAndroid",
  "jws",
  "email",
  "phone",
  "gstin",
  "gst",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const STAGES: ReadonlySet<PendingPurchaseStage> = new Set([
  "intent_created",
  "store_pending",
  "verifying",
  "verified_unfinished_ios",
  "awaiting_recovery",
]);

export function pendingEnvelopeContainsSecrets(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return SECRET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key));
}

export function parsePendingPurchaseEnvelope(
  raw: unknown
): PendingPurchaseEnvelope | null {
  if (!isRecord(raw)) return null;
  if (pendingEnvelopeContainsSecrets(raw)) return null;
  if (raw.version !== PENDING_PURCHASE_CACHE_VERSION) return null;
  if (typeof raw.uid !== "string" || raw.uid.length === 0) return null;
  if (raw.platform !== "android" && raw.platform !== "ios") return null;
  if (typeof raw.canonicalSku !== "string" || !raw.canonicalSku.startsWith("vyd_")) {
    return null;
  }
  if (typeof raw.productId !== "string" || raw.productId.length === 0) return null;
  if (typeof raw.stage !== "string" || !STAGES.has(raw.stage as PendingPurchaseStage)) {
    return null;
  }
  if (typeof raw.initiatedAt !== "number" || !Number.isFinite(raw.initiatedAt)) {
    return null;
  }
  if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt)) {
    return null;
  }
  if (
    raw.androidBasePlanId != null &&
    raw.androidBasePlanId !== "monthly" &&
    raw.androidBasePlanId !== "quarterly" &&
    raw.androidBasePlanId !== "yearly"
  ) {
    return null;
  }
  return {
    version: 1,
    uid: raw.uid,
    platform: raw.platform,
    canonicalSku: raw.canonicalSku as PendingPurchaseEnvelope["canonicalSku"],
    productId: raw.productId,
    androidBasePlanId: raw.androidBasePlanId as PendingPurchaseEnvelope["androidBasePlanId"],
    stage: raw.stage as PendingPurchaseStage,
    initiatedAt: raw.initiatedAt,
    updatedAt: raw.updatedAt,
  };
}

async function safeRemove(store: IapKeyValueStore): Promise<void> {
  try {
    await store.removeItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    // ignore
  }
}

export async function readPendingPurchase(args: {
  store: IapKeyValueStore;
  uid: string | null;
}): Promise<PendingPurchaseEnvelope | null> {
  if (!args.uid) return null;
  let raw: string | null;
  try {
    raw = await args.store.getItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await safeRemove(args.store);
    return null;
  }
  const envelope = parsePendingPurchaseEnvelope(parsed);
  if (!envelope || envelope.uid !== args.uid) {
    if (envelope && envelope.uid !== args.uid) {
      return null;
    }
    await safeRemove(args.store);
    return null;
  }
  return envelope;
}

export async function writePendingPurchase(args: {
  store: IapKeyValueStore;
  envelope: PendingPurchaseEnvelope;
  expectedUid: string;
  generation: number;
  currentGeneration: () => number;
}): Promise<boolean> {
  if (args.envelope.uid !== args.expectedUid) return false;
  if (pendingEnvelopeContainsSecrets(args.envelope)) return false;
  if (args.currentGeneration() !== args.generation) return false;

  let existingRaw: string | null;
  try {
    existingRaw = await args.store.getItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    return false;
  }
  if (existingRaw) {
    try {
      const existing = parsePendingPurchaseEnvelope(JSON.parse(existingRaw));
      if (existing && existing.uid !== args.expectedUid) {
        return false;
      }
    } catch {
      // replace unparseable
    }
  }

  if (args.currentGeneration() !== args.generation) return false;
  try {
    await args.store.setItem(
      PENDING_PURCHASE_CACHE_KEY,
      JSON.stringify(args.envelope)
    );
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingPurchaseIfUid(
  store: IapKeyValueStore,
  uid: string
): Promise<void> {
  let raw: string | null;
  try {
    raw = await store.getItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await safeRemove(store);
    return;
  }
  const envelope = parsePendingPurchaseEnvelope(parsed);
  if (envelope && envelope.uid !== uid) return;
  try {
    raw = await store.getItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await safeRemove(store);
    return;
  }
  const again = parsePendingPurchaseEnvelope(parsed);
  if (again && again.uid !== uid) return;
  await safeRemove(store);
}

export async function clearPendingPurchase(store: IapKeyValueStore): Promise<void> {
  await safeRemove(store);
}
