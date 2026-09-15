/**
 * UID-bound pending purchase cache.
 *
 * Exact key: vyd_pending_purchase_v1
 * Never persist purchaseToken, Apple JWS, appAccountToken, obfuscatedAccountId,
 * email, phone, GST, prices, or Purchase.id.
 *
 * All mutating operations share one per-store serialization gate for the
 * decide/commit step. Admission of a call is distinct from the accepted
 * cache state that delayed I/O must converge to. A retired/rejected/no-op
 * request must not replace a newer accepted write or clear. Releasing an
 * attempt lock does not revoke a successfully accepted stored state.
 * Storage I/O itself runs outside that lock so a delayed
 * getItem/setItem/removeItem cannot deadlock a newer attempt. After every
 * awaited mutation the accepted state is re-applied:
 *   - a stale A write must not remain as B-session state
 *   - a stale A clear must not delete B
 */

import { getClientCatalogEntry, isCanonicalSku } from "./iapCatalog";
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

const STAGES: ReadonlySet<PendingPurchaseStage> = new Set([
  "intent_created",
  "store_pending",
  "verifying",
  "verified_unfinished_ios",
  "awaiting_recovery",
]);

export interface PendingMutationAuth {
  expectedUid: string;
  generation: number;
  currentGeneration: () => number;
  currentUid: () => string | null;
  expectedAttempt?: number | null;
  currentAttempt?: () => number | null;
  expectedRevision?: number | null;
  currentRevision?: () => number | null;
}

type LatestIntent =
  | {
      op: "write";
      seq: number;
      envelope: PendingPurchaseEnvelope;
      auth: PendingMutationAuth;
    }
  | {
      op: "clear-uid";
      seq: number;
      uid: string;
      auth?: PendingMutationAuth;
    }
  | {
      op: "clear-envelope";
      seq: number;
      envelope: PendingPurchaseEnvelope;
      auth: PendingMutationAuth;
      onlyNonDurable: boolean;
    }
  | { op: "clear-all"; seq: number }
  | { op: "reconcile"; seq: number; auth: PendingMutationAuth }
  | { op: "scrub-malformed"; seq: number };

type MutationPlan =
  | { action: "noop" }
  | { action: "set"; value: string }
  | { action: "remove" };

type AcceptedCacheState =
  | {
      kind: "set";
      seq: number;
      envelope: PendingPurchaseEnvelope;
      uid: string;
      generation: number;
      currentGeneration: () => number;
      currentUid: () => string | null;
    }
  | {
      kind: "clear";
      seq: number;
      uid: string | null;
      generation: number;
      onlyNonDurable: boolean;
      allUids: boolean;
    }
  | {
      kind: "reconcile";
      seq: number;
      uid: string;
      generation: number;
      currentGeneration: () => number;
      currentUid: () => string | null;
    };

interface MutationGate {
  queue: Promise<unknown>;
  latest: LatestIntent | null;
  accepted: AcceptedCacheState | null;
  seq: number;
}

const mutationGates = new WeakMap<object, MutationGate>();

function gateFor(store: IapKeyValueStore): MutationGate {
  const existing = mutationGates.get(store);
  if (existing) return existing;
  const created: MutationGate = { queue: Promise.resolve(), latest: null, accepted: null, seq: 0 };
  mutationGates.set(store, created);
  return created;
}

export function enqueuePendingMutation<T>(
  store: IapKeyValueStore,
  op: () => Promise<T> | T
): Promise<T> {
  const gate = gateFor(store);
  const run = gate.queue.then(() => op());
  gate.queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function pendingEnvelopeContainsSecrets(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return SECRET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key));
}

export function isDurablePendingStage(stage: PendingPurchaseStage): boolean {
  return stage === "store_pending" || stage === "verified_unfinished_ios";
}

function envelopeMatchesCatalog(envelope: {
  platform: PendingPurchaseEnvelope["platform"];
  canonicalSku: PendingPurchaseEnvelope["canonicalSku"];
  productId: string;
  androidBasePlanId?: PendingPurchaseEnvelope["androidBasePlanId"];
}): boolean {
  const entry = getClientCatalogEntry(envelope.canonicalSku);
  if (envelope.platform === "android") {
    return (
      envelope.productId === entry.android.productId &&
      envelope.androidBasePlanId === entry.android.basePlanId
    );
  }
  return envelope.productId === entry.ios.productId && envelope.androidBasePlanId == null;
}

export function parsePendingPurchaseEnvelope(
  raw: unknown
): PendingPurchaseEnvelope | null {
  if (!isRecord(raw)) return null;
  if (pendingEnvelopeContainsSecrets(raw)) return null;
  if (raw.version !== PENDING_PURCHASE_CACHE_VERSION) return null;
  if (typeof raw.uid !== "string" || raw.uid.length === 0) return null;
  if (raw.platform !== "android" && raw.platform !== "ios") return null;
  if (typeof raw.canonicalSku !== "string" || !isCanonicalSku(raw.canonicalSku)) {
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
  const candidate: PendingPurchaseEnvelope = {
    version: 1,
    uid: raw.uid,
    platform: raw.platform,
    canonicalSku: raw.canonicalSku,
    productId: raw.productId,
    androidBasePlanId: raw.androidBasePlanId as PendingPurchaseEnvelope["androidBasePlanId"],
    stage: raw.stage as PendingPurchaseStage,
    initiatedAt: raw.initiatedAt,
    updatedAt: raw.updatedAt,
  };
  if (!envelopeMatchesCatalog(candidate)) return null;
  return candidate;
}

export function authStillOwns(auth: PendingMutationAuth, envelopeUid: string): boolean {
  return (
    auth.currentGeneration() === auth.generation &&
    auth.currentUid() === auth.expectedUid &&
    envelopeUid === auth.expectedUid
  );
}

export function authStillOwnsAttempt(auth: PendingMutationAuth): boolean {
  if (auth.expectedRevision != null && auth.currentRevision) {
    if (auth.currentRevision() !== auth.expectedRevision) return false;
  }
  if (auth.expectedAttempt == null) return true;
  if (!auth.currentAttempt) return true;
  return auth.currentAttempt() === auth.expectedAttempt;
}

function operationStillLive(auth: PendingMutationAuth): boolean {
  return authStillOwnsAttempt(auth);
}

function isUidSwitchCleanup(auth: PendingMutationAuth, targetUid: string): boolean {
  return (
    auth.currentGeneration() === auth.generation &&
    auth.expectedUid === targetUid &&
    auth.currentUid() !== targetUid
  );
}

function shouldAcceptIntent(intent: LatestIntent): boolean {
  if (intent.op === "clear-all" || intent.op === "scrub-malformed") return true;
  if (intent.op === "write") {
    return authStillOwns(intent.auth, intent.envelope.uid) && operationStillLive(intent.auth);
  }
  if (intent.op === "clear-envelope") {
    if (authStillOwns(intent.auth, intent.envelope.uid) && operationStillLive(intent.auth)) {
      return true;
    }
    return isUidSwitchCleanup(intent.auth, intent.envelope.uid);
  }
  if (intent.op === "clear-uid") {
    if (!intent.auth) return true;
    if (authStillOwns(intent.auth, intent.uid) && operationStillLive(intent.auth)) return true;
    return isUidSwitchCleanup(intent.auth, intent.uid);
  }
  if (intent.op === "reconcile") {
    return authStillOwns(intent.auth, intent.auth.expectedUid) && operationStillLive(intent.auth);
  }
  return false;
}

function toAcceptedState(intent: LatestIntent): AcceptedCacheState {
  if (intent.op === "write") {
    return {
      kind: "set",
      seq: intent.seq,
      envelope: intent.envelope,
      uid: intent.envelope.uid,
      generation: intent.auth.generation,
      currentGeneration: intent.auth.currentGeneration,
      currentUid: intent.auth.currentUid,
    };
  }
  if (intent.op === "clear-envelope") {
    return {
      kind: "clear",
      seq: intent.seq,
      uid: intent.envelope.uid,
      generation: intent.auth.generation,
      onlyNonDurable: intent.onlyNonDurable,
      allUids: false,
    };
  }
  if (intent.op === "clear-uid") {
    return {
      kind: "clear",
      seq: intent.seq,
      uid: intent.uid,
      generation: intent.auth?.generation ?? 0,
      onlyNonDurable: false,
      allUids: false,
    };
  }
  if (intent.op === "reconcile") {
    return {
      kind: "reconcile",
      seq: intent.seq,
      uid: intent.auth.expectedUid,
      generation: intent.auth.generation,
      currentGeneration: intent.auth.currentGeneration,
      currentUid: intent.auth.currentUid,
    };
  }
  return {
    kind: "clear",
    seq: intent.seq,
    uid: null,
    generation: 0,
    onlyNonDurable: false,
    allUids: true,
  };
}

function admitIntent(store: IapKeyValueStore, intent: LatestIntent) {
  const gate = gateFor(store);
  gate.seq += 1;
  intent.seq = gate.seq;
  gate.latest = intent;
  if (shouldAcceptIntent(intent)) {
    gate.accepted = toAcceptedState(intent);
  }
}

export function samePurchaseIntent(
  left: PendingPurchaseEnvelope | null,
  right: PendingPurchaseEnvelope
): boolean {
  if (!left) return false;
  return (
    left.uid === right.uid &&
    left.platform === right.platform &&
    left.canonicalSku === right.canonicalSku &&
    left.productId === right.productId &&
    left.androidBasePlanId === right.androidBasePlanId &&
    left.initiatedAt === right.initiatedAt
  );
}

function captureAuth(auth: PendingMutationAuth): PendingMutationAuth {
  return {
    expectedUid: auth.expectedUid,
    generation: auth.generation,
    currentGeneration: auth.currentGeneration,
    currentUid: auth.currentUid,
    expectedAttempt: auth.expectedAttempt,
    currentAttempt: auth.currentAttempt,
    expectedRevision: auth.expectedRevision,
    currentRevision: auth.currentRevision,
  };
}

async function readRaw(store: IapKeyValueStore): Promise<string | null> {
  try {
    return await store.getItem(PENDING_PURCHASE_CACHE_KEY);
  } catch {
    return null;
  }
}

async function parseStored(store: IapKeyValueStore): Promise<{
  raw: string | null;
  envelope: PendingPurchaseEnvelope | null;
  malformed: boolean;
}> {
  const raw = await readRaw(store);
  if (!raw) return { raw: null, envelope: null, malformed: false };
  try {
    const envelope = parsePendingPurchaseEnvelope(JSON.parse(raw));
    if (!envelope) return { raw, envelope: null, malformed: true };
    return { raw, envelope, malformed: false };
  } catch {
    return { raw, envelope: null, malformed: true };
  }
}

function sameEnvelope(
  left: PendingPurchaseEnvelope | null,
  right: PendingPurchaseEnvelope
): boolean {
  if (!left) return false;
  return (
    left.uid === right.uid &&
    left.platform === right.platform &&
    left.canonicalSku === right.canonicalSku &&
    left.productId === right.productId &&
    left.androidBasePlanId === right.androidBasePlanId &&
    left.stage === right.stage &&
    left.initiatedAt === right.initiatedAt &&
    left.updatedAt === right.updatedAt
  );
}

function decidePendingMutation(
  store: IapKeyValueStore,
  disk: {
    raw: string | null;
    envelope: PendingPurchaseEnvelope | null;
    malformed: boolean;
  }
): MutationPlan {
  const accepted = gateFor(store).accepted;
  if (!accepted) return { action: "noop" };

  if (accepted.kind === "set") {
    if (
      accepted.currentGeneration() !== accepted.generation ||
      accepted.currentUid() !== accepted.uid
    ) {
      if (disk.envelope?.uid === accepted.uid) return { action: "remove" };
      return { action: "noop" };
    }
    if (sameEnvelope(disk.envelope, accepted.envelope)) return { action: "noop" };
    return { action: "set", value: JSON.stringify(accepted.envelope) };
  }

  if (accepted.kind === "clear") {
    if (!disk.raw) return { action: "noop" };
    if (accepted.allUids) return { action: "remove" };
    if (disk.envelope && accepted.uid && disk.envelope.uid !== accepted.uid) {
      return { action: "noop" };
    }
    if (
      accepted.onlyNonDurable &&
      disk.envelope &&
      isDurablePendingStage(disk.envelope.stage)
    ) {
      return { action: "noop" };
    }
    return { action: "remove" };
  }

  if (!disk.raw) return { action: "noop" };
  if (
    accepted.currentGeneration() !== accepted.generation ||
    accepted.currentUid() !== accepted.uid
  ) {
    return { action: "noop" };
  }
  if (disk.malformed || !disk.envelope) return { action: "remove" };
  if (disk.envelope.uid === accepted.uid) return { action: "noop" };
  if (accepted.currentUid() === disk.envelope.uid) return { action: "noop" };
  return { action: "remove" };
}

async function materializePendingCache(store: IapKeyValueStore): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    const disk = await parseStored(store);
    const plan = await enqueuePendingMutation(store, () =>
      decidePendingMutation(store, disk)
    );
    if (plan.action === "noop") return;
    if (plan.action === "set") {
      try {
        await store.setItem(PENDING_PURCHASE_CACHE_KEY, plan.value);
      } catch {
        return;
      }
      continue;
    }
    try {
      await store.removeItem(PENDING_PURCHASE_CACHE_KEY);
    } catch {
      return;
    }
  }
}

export async function readPendingPurchase(args: {
  store: IapKeyValueStore;
  uid: string | null;
}): Promise<PendingPurchaseEnvelope | null> {
  if (!args.uid) return null;
  const seen = await parseStored(args.store);
  if (!seen.raw) return null;
  if (seen.malformed) {
    const gate = gateFor(args.store);
    if (!gate.latest || gate.latest.op === "scrub-malformed") {
      admitIntent(args.store, { op: "scrub-malformed", seq: 0 });
      await materializePendingCache(args.store);
    }
    return null;
  }
  if (!seen.envelope || seen.envelope.uid !== args.uid) {
    return null;
  }
  return seen.envelope;
}

export async function reconcilePendingPurchaseForUid(
  args: { store: IapKeyValueStore } & PendingMutationAuth
): Promise<PendingPurchaseEnvelope | null> {
  admitIntent(args.store, { op: "reconcile", seq: 0, auth: captureAuth(args) });
  await materializePendingCache(args.store);
  return readPendingPurchase({ store: args.store, uid: args.expectedUid });
}

export async function writePendingPurchase(
  args: { store: IapKeyValueStore; envelope: PendingPurchaseEnvelope } & PendingMutationAuth
): Promise<boolean> {
  if (args.envelope.uid !== args.expectedUid) return false;
  if (pendingEnvelopeContainsSecrets(args.envelope)) return false;
  if (!parsePendingPurchaseEnvelope(args.envelope)) return false;
  if (!authStillOwns(args, args.envelope.uid) || !authStillOwnsAttempt(args)) return false;

  admitIntent(args.store, {
    op: "write",
    seq: 0,
    envelope: args.envelope,
    auth: captureAuth(args),
  });
  await materializePendingCache(args.store);
  if (!authStillOwns(args, args.envelope.uid) || !authStillOwnsAttempt(args)) return false;
  const disk = await parseStored(args.store);
  return sameEnvelope(disk.envelope, args.envelope);
}

export async function clearPendingPurchaseIfUid(
  store: IapKeyValueStore,
  uid: string,
  auth?: PendingMutationAuth
): Promise<void> {
  admitIntent(store, {
    op: "clear-uid",
    seq: 0,
    uid,
    auth: auth ? captureAuth(auth) : undefined,
  });
  await materializePendingCache(store);
}

export async function clearPendingPurchaseIfEnvelope(
  args: {
    store: IapKeyValueStore;
    envelope: PendingPurchaseEnvelope;
    onlyNonDurable?: boolean;
  } & PendingMutationAuth
): Promise<void> {
  admitIntent(args.store, {
    op: "clear-envelope",
    seq: 0,
    envelope: args.envelope,
    auth: captureAuth(args),
    onlyNonDurable: args.onlyNonDurable === true,
  });
  await materializePendingCache(args.store);
}

export async function clearPendingPurchase(store: IapKeyValueStore): Promise<void> {
  admitIntent(store, { op: "clear-all", seq: 0 });
  await materializePendingCache(store);
}
