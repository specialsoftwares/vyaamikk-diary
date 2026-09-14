/**
 * UID-bound offline subscription cache (UX continuity only).
 *
 * Key is process-wide; the envelope uid must match the signed-in user
 * before any paid capability is hydrated.
 */

import {
  DEFAULT_CLIENT_SUBSCRIPTION,
  type ClientSubscriptionStatus,
} from "./types";
import { parseSubscriptionStatus } from "./parseSubscriptionStatus";
import { reduceCachedEntitlement } from "./reduceCachedEntitlement";

export const SUBSCRIPTION_CACHE_KEY = "vyd_sub_cache_v1";
export const SUBSCRIPTION_CACHE_VERSION = 1;

export interface SubscriptionCacheEnvelope {
  version: 1;
  uid: string;
  savedAt: number;
  status: ClientSubscriptionStatus;
}

export interface SubscriptionKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface HydratedSubscriptionCache {
  envelope: SubscriptionCacheEnvelope;
  status: ClientSubscriptionStatus;
  reduced: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function parseSubscriptionCacheEnvelope(raw: unknown): SubscriptionCacheEnvelope | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SUBSCRIPTION_CACHE_VERSION) return null;
  if (typeof raw.uid !== "string" || raw.uid.length === 0) return null;
  if (typeof raw.savedAt !== "number" || !Number.isFinite(raw.savedAt)) return null;
  if (!isRecord(raw.status)) return null;
  return {
    version: 1,
    uid: raw.uid,
    savedAt: raw.savedAt,
    status: parseSubscriptionStatus(raw.status),
  };
}

export async function readSubscriptionCache(args: {
  store: SubscriptionKeyValueStore;
  uid: string | null;
  nowMs: number;
}): Promise<HydratedSubscriptionCache | null> {
  const { store, uid, nowMs } = args;
  if (!uid) return null;

  let raw: string | null;
  try {
    raw = await store.getItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    await safeRemove(store);
    return null;
  }

  const envelope = parseSubscriptionCacheEnvelope(parsedJson);
  if (!envelope) {
    await safeRemove(store);
    return null;
  }

  if (envelope.uid !== uid) {
    await safeRemove(store);
    return null;
  }

  // Clock rollback relative to savedAt must not extend paid hydration.
  if (nowMs < envelope.savedAt) {
    return null;
  }

  const reduced = reduceCachedEntitlement(envelope.status, nowMs);
  return {
    envelope,
    status: reduced.status,
    reduced: reduced.reduced,
  };
}

/** Remove the global cache only when the envelope still belongs to `uid`. */
export async function clearSubscriptionCacheIfUid(
  store: SubscriptionKeyValueStore,
  uid: string
): Promise<void> {
  let raw: string | null;
  try {
    raw = await store.getItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    await safeRemove(store);
    return;
  }
  const envelope = parseSubscriptionCacheEnvelope(parsedJson);
  if (envelope && envelope.uid !== uid) return;
  try {
    raw = await store.getItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    await safeRemove(store);
    return;
  }
  const again = parseSubscriptionCacheEnvelope(parsedJson);
  if (again && again.uid !== uid) return;
  await safeRemove(store);
}

export async function writeSubscriptionCache(args: {
  store: SubscriptionKeyValueStore;
  uid: string;
  status: ClientSubscriptionStatus;
  nowMs: number;
}): Promise<void> {
  const envelope: SubscriptionCacheEnvelope = {
    version: 1,
    uid: args.uid,
    savedAt: args.nowMs,
    status: args.status,
  };
  try {
    await args.store.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // Cache is optional UX continuity.
  }
}

export async function clearSubscriptionCache(store: SubscriptionKeyValueStore): Promise<void> {
  await safeRemove(store);
}

async function safeRemove(store: SubscriptionKeyValueStore): Promise<void> {
  try {
    await store.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Signed-out callers must never receive a paid envelope. */
export function signedOutSubscriptionCache(): ClientSubscriptionStatus {
  return { ...DEFAULT_CLIENT_SUBSCRIPTION };
}
