/**
 * Single native-store connection and purchase-listener owner.
 *
 * Do not attach listeners from screens. Do not launch a purchase sheet on
 * startup. Store events never mutate feature entitlement.
 *
 * After any await, shared session state may be mutated only when
 * generation + uid still match the operation that started the work.
 */

import {
  ANDROID_SUBSCRIPTION_PRODUCT_IDS,
  IOS_SUBSCRIPTION_PRODUCT_IDS,
  getClientCatalogEntry,
  isCanonicalSku,
} from "./iapCatalog";
import { mapStoreProductsToCatalog } from "./iapCatalogMap";
import type { IapCapability } from "./iapCapability";
import {
  assertServerObfuscatedAccountId,
  isUuidAppAccountToken,
} from "./iapAccountBinding";
import {
  clearPendingPurchaseIfEnvelope,
  clearPendingPurchaseIfUid,
  isDurablePendingStage,
  readPendingPurchase,
  reconcilePendingPurchaseForUid,
  writePendingPurchase,
} from "./iapPendingPurchase";
import {
  isNativeDisconnectError,
  isUserCancelledError,
  thrownPurchaseError,
} from "./iapNativeErrors";
import {
  pendingProductIdForSku,
  processPurchaseError,
  processStorePurchase,
  type PurchaseProcessorDeps,
} from "./iapPurchaseProcessor";
import type {
  CanonicalSkuAvailability,
  IapBackend,
  IapKeyValueStore,
  IapNativeAdapter,
  IapPlatform,
  IapView,
  PendingPurchaseEnvelope,
  PurchaseFlowResult,
  StorePurchase,
} from "./iapTypes";

export interface IapSessionDeps {
  native: IapNativeAdapter;
  backend: IapBackend;
  store: IapKeyValueStore;
  platform: IapPlatform | "web" | "other";
  capability: IapCapability;
  now: () => number;
  onChange: (view: IapView) => void;
}

export interface IapAuthInput {
  status: "signed_in" | "signed_out" | "unknown" | string;
  uid: string | null;
}

export function createIapSession(deps: IapSessionDeps) {
  let generation = 0;
  let uid: string | null = null;
  let connected = false;
  let connectionOwnerGen: number | null = null;
  let listenerOwnerGen: number | null = null;
  let connectionEnds = Promise.resolve();
  let openFlight: Promise<boolean> | null = null;
  let openFlightGen: number | null = null;
  let reconnectBudget = 0;
  let readyGen: number | null = null;
  let purchaseInFlight = false;
  let purchaseOwnerGen: number | null = null;
  let purchaseOwnerUid: string | null = null;
  let flowKind: "purchase" | "restore" | null = null;
  let flowAttempt: number | null = null;
  let nextFlowAttempt = 0;
  let operationRevision = 0;
  let catalog: CanonicalSkuAvailability[] = [];
  let pending: PendingPurchaseEnvelope | null = null;
  let lastResult: PurchaseFlowResult | null = null;
  let removeUpdated: (() => void) | null = null;
  let removeError: (() => void) | null = null;
  let processedTokens = new Set<string>();
  let finishedIosTokens = new Set<string>();
  let processQueue: Promise<void> = Promise.resolve();

  const storePlatform: IapPlatform | null =
    deps.platform === "android" || deps.platform === "ios" ? deps.platform : null;

  function isCurrentOperation(forGen: number, forUid: string | null): boolean {
    return generation === forGen && uid === forUid;
  }

  function mutationAuthFor(
    forUid: string,
    forGen: number,
    attempt?: number | null,
    revision?: number | null
  ) {
    return {
      expectedUid: forUid,
      generation: forGen,
      currentGeneration: () => generation,
      currentUid: () => uid,
      expectedAttempt: attempt ?? undefined,
      currentAttempt: () => flowAttempt,
      expectedRevision: revision ?? operationRevision,
      currentRevision: () => operationRevision,
    };
  }

  function emit() {
    deps.onChange({
      ownerUid: uid,
      available: deps.capability.available && storePlatform != null && uid != null,
      unavailableReason: !uid ? "not_signed_in" : deps.capability.reason,
      connected,
      catalog,
      pending,
      lastResult,
      purchaseInFlight,
    });
  }

  function emitIfCurrent(forGen: number, forUid: string | null) {
    if (!isCurrentOperation(forGen, forUid)) return;
    emit();
  }

  function publishResultIfCurrent(
    forGen: number,
    forUid: string | null,
    result: PurchaseFlowResult
  ): PurchaseFlowResult {
    if (!isCurrentOperation(forGen, forUid)) return result;
    lastResult = result;
    emit();
    return result;
  }

  function beginPurchaseLock(
    forGen: number,
    forUid: string,
    kind: "purchase" | "restore" = "purchase"
  ): number {
    operationRevision += 1;
    nextFlowAttempt += 1;
    purchaseInFlight = true;
    purchaseOwnerGen = forGen;
    purchaseOwnerUid = forUid;
    flowKind = kind;
    flowAttempt = nextFlowAttempt;
    return nextFlowAttempt;
  }

  function releasePurchaseIfCurrent(
    forGen: number,
    forUid: string | null,
    attempt?: number | null
  ) {
    if (!isCurrentOperation(forGen, forUid)) return;
    if (purchaseOwnerGen !== forGen || purchaseOwnerUid !== forUid) return;
    if (attempt != null && flowAttempt !== attempt) return;
    purchaseInFlight = false;
    purchaseOwnerGen = null;
    purchaseOwnerUid = null;
    flowKind = null;
    flowAttempt = null;
  }

  function purchaseLockOwnedBy(forGen: number, forUid: string | null): boolean {
    return (
      purchaseInFlight &&
      purchaseOwnerGen === forGen &&
      purchaseOwnerUid === forUid &&
      isCurrentOperation(forGen, forUid)
    );
  }

  function ownsPurchaseAttempt(forGen: number, forUid: string | null, attempt: number): boolean {
    return purchaseLockOwnedBy(forGen, forUid) && flowKind === "purchase" && flowAttempt === attempt;
  }

  function ownsRestoreAttempt(forGen: number, forUid: string | null, attempt: number): boolean {
    return purchaseLockOwnedBy(forGen, forUid) && flowKind === "restore" && flowAttempt === attempt;
  }

  function isAuthReady(forGen: number): boolean {
    return readyGen === forGen;
  }

  function authChurnResult(forUid: string | null): PurchaseFlowResult {
    return {
      kind: "failed",
      recoverable: true,
      message: forUid ? "Account changed." : "Signed out.",
    };
  }

  function processorDeps(
    forGen: number,
    forUid: string | null,
    attempt: number | null,
    revision: number | null
  ): PurchaseProcessorDeps | null {
    if (!storePlatform) return null;
    return {
      native: deps.native,
      backend: deps.backend,
      store: deps.store,
      platform: storePlatform,
      now: deps.now,
      currentUid: () => uid,
      currentGeneration: () => generation,
      generation: forGen,
      operationUid: forUid,
      operationAttempt: attempt,
      currentAttempt: () => flowAttempt,
      operationRevision: revision,
      currentRevision: () => operationRevision,
    };
  }

  function detachListenersOwnedBy(forGen: number) {
    if (listenerOwnerGen !== forGen) return;
    removeUpdated?.();
    removeError?.();
    removeUpdated = null;
    removeError = null;
    listenerOwnerGen = null;
  }

  function enqueueConnectionEnd(work: () => Promise<void>): Promise<void> {
    const run = connectionEnds.then(work, work);
    connectionEnds = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function markDisconnected(forGen: number, forUid: string | null) {
    if (!isCurrentOperation(forGen, forUid)) return;
    connected = false;
    if (connectionOwnerGen === forGen) connectionOwnerGen = null;
    detachListenersOwnedBy(forGen);
  }

  async function compensateStaleStorage(
    envelope: PendingPurchaseEnvelope,
    forGen: number,
    attempt?: number | null,
    revision?: number | null
  ): Promise<void> {
    await clearPendingPurchaseIfEnvelope({
      store: deps.store,
      envelope,
      onlyNonDurable: true,
      ...mutationAuthFor(envelope.uid, forGen, attempt, revision),
    });
  }

  async function compensateStalePurchase(
    envelope: PendingPurchaseEnvelope,
    forGen: number,
    forUid: string,
    attempt?: number,
    revision?: number | null
  ): Promise<PurchaseFlowResult> {
    await compensateStaleStorage(envelope, forGen, attempt, revision);
    const result = authChurnResult(forUid);
    if (attempt != null) {
      if (!ownsPurchaseAttempt(forGen, forUid, attempt)) return result;
    } else if (!isCurrentOperation(forGen, forUid)) {
      return result;
    }
    releasePurchaseIfCurrent(forGen, forUid, attempt);
    if (
      pending?.canonicalSku === envelope.canonicalSku &&
      pending?.productId === envelope.productId &&
      pending?.initiatedAt === envelope.initiatedAt
    ) {
      pending = null;
    }
    lastResult = result;
    emit();
    return result;
  }

  async function abandonNonDurablePending(
    envelope: PendingPurchaseEnvelope | null,
    forUid: string,
    forGen: number,
    attempt: number,
    revision?: number | null
  ) {
    const target = envelope ?? pending;
    if (!target || target.uid !== forUid) return;
    if (isDurablePendingStage(target.stage)) return;
    await clearPendingPurchaseIfEnvelope({
      store: deps.store,
      envelope: target,
      onlyNonDurable: true,
      ...mutationAuthFor(forUid, forGen, attempt, revision),
    });
    if (!ownsPurchaseAttempt(forGen, forUid, attempt)) return;
    if (
      pending &&
      pending.uid === forUid &&
      pending.canonicalSku === target.canonicalSku &&
      pending.initiatedAt === target.initiatedAt &&
      !isDurablePendingStage(pending.stage)
    ) {
      pending = null;
    }
  }

  function handlePurchase(
    purchase: StorePurchase,
    source: "purchase" | "recovery" | "restore"
  ): Promise<void> {
    const forGen = generation;
    const forUid = uid;
    const kindAtStart = flowKind;
    const attemptAtStart = flowAttempt;
    const revisionAtStart = operationRevision;
    const pendingAtStart = pending;
    const tokens = processedTokens;
    const finished = finishedIosTokens;
    const capturedOperationStillOwns = () => {
      if (!isCurrentOperation(forGen, forUid)) return false;
      if (operationRevision !== revisionAtStart) return false;
      if (kindAtStart === "purchase" && attemptAtStart != null && !ownsPurchaseAttempt(forGen, forUid, attemptAtStart)) {
        return false;
      }
      if (kindAtStart === "restore" && attemptAtStart != null && !ownsRestoreAttempt(forGen, forUid, attemptAtStart)) {
        return false;
      }
      if (kindAtStart == null && (flowKind != null || flowAttempt != null)) return false;
      return true;
    };
    const run = async () => {
      if (!capturedOperationStillOwns()) return;
      // Applicability before any pending mutation: a mismatched store event
      // must not patch, clear, or release the active purchase attempt.
      if (pendingAtStart && pendingAtStart.productId !== purchase.productId) {
        if (source !== "restore") return;
      }
      if (kindAtStart === "purchase" && !pendingAtStart) return;
      const pdeps = processorDeps(forGen, forUid, attemptAtStart, revisionAtStart);
      if (!pdeps) return;
      const latest = forUid ? await readPendingPurchase({ store: deps.store, uid: forUid }) : null;
      if (!capturedOperationStillOwns()) return;
      const pendingForProcess =
        pendingAtStart && latest && latest.productId !== pendingAtStart.productId
          ? pendingAtStart
          : latest ?? pendingAtStart;
      if (
        source !== "restore" &&
        pendingForProcess &&
        pendingForProcess.productId !== purchase.productId
      ) {
        return;
      }
      const out = await processStorePurchase({
        deps: pdeps,
        purchase,
        pending: pendingForProcess,
        source,
        processedTokens: tokens,
        finishedIosTokens: finished,
      });
      if (!capturedOperationStillOwns()) return;
      if (
        source !== "restore" &&
        pendingAtStart &&
        pendingAtStart.productId !== purchase.productId
      ) {
        return;
      }
      pending = out.pending;
      lastResult = out.result;
      if (out.result.kind !== "store_pending" && kindAtStart === "purchase") {
        releasePurchaseIfCurrent(forGen, forUid, attemptAtStart);
      }
      emit();
    };
    const queued = processQueue.then(run, run);
    processQueue = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  function attachListeners(forGen: number) {
    if (generation !== forGen) return;
    if (listenerOwnerGen != null && listenerOwnerGen > forGen) return;
    if (listenerOwnerGen === forGen && removeUpdated != null && removeError != null) return;
    if (listenerOwnerGen != null && listenerOwnerGen !== forGen) {
      detachListenersOwnedBy(listenerOwnerGen);
    }
    removeUpdated = deps.native.addPurchaseUpdatedListener((purchase) => {
      if (generation !== forGen || listenerOwnerGen !== forGen) return;
      void handlePurchase(purchase, "purchase");
    });
    removeError = deps.native.addPurchaseErrorListener((error) => {
      if (generation !== forGen || listenerOwnerGen !== forGen) return;
      const forUid = uid;
      const kindAtStart = flowKind;
      const attemptAtStart = flowAttempt;
      const revisionAtStart = operationRevision;
      const pendingAtStart = pending;
      const pdeps = processorDeps(forGen, forUid, attemptAtStart, revisionAtStart);
      if (!pdeps) return;
      void (async () => {
        // Unidentified errors (no productId) apply only to the current
        // purchase-owned attempt. See iapNative unidentified-error policy.
        if (kindAtStart !== "purchase" || attemptAtStart == null) return;
        if (
          error.productId &&
          pendingAtStart &&
          pendingAtStart.productId !== error.productId
        ) {
          return;
        }
        const latest = forUid ? await readPendingPurchase({ store: deps.store, uid: forUid }) : null;
        if (!ownsPurchaseAttempt(forGen, forUid, attemptAtStart)) return;
        if (operationRevision !== revisionAtStart) return;
        const pendingForProcess =
          pendingAtStart && latest && latest.productId !== pendingAtStart.productId
            ? pendingAtStart
            : latest ?? pendingAtStart;
        if (
          error.productId &&
          pendingForProcess &&
          pendingForProcess.productId !== error.productId
        ) {
          return;
        }
        const out = await processPurchaseError({
          deps: pdeps,
          error,
          pending: pendingForProcess,
        });
        if (!ownsPurchaseAttempt(forGen, forUid, attemptAtStart)) return;
        if (operationRevision !== revisionAtStart) return;
        pending = out.pending;
        lastResult = out.result;
        releasePurchaseIfCurrent(forGen, forUid, attemptAtStart);
        emit();
      })();
    });
    listenerOwnerGen = forGen;
  }

  async function endNativeConnection(): Promise<void> {
    try {
      await deps.native.endConnection();
    } catch {
      // ignore
    }
  }

  async function openConnectionExclusive(
    forGen: number,
    asReconnect: boolean
  ): Promise<boolean> {
    await connectionEnds;
    if (generation !== forGen || !uid || !storePlatform || !deps.capability.available) {
      return false;
    }
    if (connected && connectionOwnerGen === forGen) return true;
    if (asReconnect) {
      if (reconnectBudget <= 0) return false;
      reconnectBudget -= 1;
    }
    const forUid = uid;
    let didConnect = false;
    try {
      didConnect = (await deps.native.initConnection()) === true;
    } catch {
      didConnect = false;
    }

    if (!isCurrentOperation(forGen, forUid) || uid == null) {
      const newerOwns = connectionOwnerGen != null && connectionOwnerGen > forGen;
      if (didConnect && !newerOwns) {
        await enqueueConnectionEnd(endNativeConnection);
      }
      return false;
    }

    if (connectionOwnerGen != null && connectionOwnerGen > forGen) {
      return false;
    }

    if (!didConnect) {
      connected = false;
      if (connectionOwnerGen === forGen) connectionOwnerGen = null;
      detachListenersOwnedBy(forGen);
      return false;
    }

    connected = true;
    connectionOwnerGen = forGen;
    attachListeners(forGen);
    return true;
  }

  async function openConnection(
    forGen: number,
    asReconnect = false
  ): Promise<boolean> {
    while (openFlight != null && openFlightGen !== forGen) {
      try {
        await openFlight;
      } catch {
        // ignore
      }
      if (generation !== forGen) return false;
    }
    if (openFlight != null && openFlightGen === forGen) {
      return openFlight;
    }
    if (generation !== forGen || !uid || !storePlatform || !deps.capability.available) {
      return false;
    }
    if (connected && connectionOwnerGen === forGen) return true;

    const run = openConnectionExclusive(forGen, asReconnect);
    openFlight = run;
    openFlightGen = forGen;
    try {
      return await run;
    } finally {
      if (openFlight === run) {
        openFlight = null;
        openFlightGen = null;
      }
    }
  }

  async function closeConnectionIfOwned(forGen: number): Promise<void> {
    if (generation !== forGen) return;
    if (connectionOwnerGen != null && connectionOwnerGen > forGen) return;
    if (!connected && connectionOwnerGen == null) return;

    await enqueueConnectionEnd(async () => {
      if (generation !== forGen) return;
      if (connectionOwnerGen != null && connectionOwnerGen > forGen) return;
      if (!connected && connectionOwnerGen == null) return;
      await endNativeConnection();
      if (generation !== forGen) return;
      if (connectionOwnerGen != null && connectionOwnerGen > forGen) return;
      connected = false;
      if (connectionOwnerGen != null && connectionOwnerGen <= forGen) {
        connectionOwnerGen = null;
      }
      detachListenersOwnedBy(forGen);
    });
  }

  async function ensureConnected(forGen: number, forUid: string | null): Promise<boolean> {
    if (!isCurrentOperation(forGen, forUid) || !storePlatform || !deps.capability.available) {
      return false;
    }
    if (connected && connectionOwnerGen === forGen) return true;
    return openConnection(forGen, true);
  }

  async function recover(forGen: number, forUid: string) {
    if (!isCurrentOperation(forGen, forUid) || !storePlatform) return;
    const existing = await readPendingPurchase({ store: deps.store, uid: forUid });
    if (!isCurrentOperation(forGen, forUid)) return;
    pending = existing;
    if (!existing) {
      emitIfCurrent(forGen, forUid);
      return;
    }

    const durable = isDurablePendingStage(existing.stage);
    if (!durable) {
      pending = {
        ...existing,
        stage: "awaiting_recovery",
        updatedAt: deps.now(),
      };
      await writePendingPurchase({
        store: deps.store,
        envelope: pending,
        ...mutationAuthFor(forUid, forGen),
      });
      if (!isCurrentOperation(forGen, forUid)) return;
    }

    let purchases: StorePurchase[] = [];
    try {
      purchases = await deps.native.getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
    } catch (error) {
      if (!isCurrentOperation(forGen, forUid)) return;
      if (isNativeDisconnectError(thrownPurchaseError(error))) {
        markDisconnected(forGen, forUid);
      }
      emit();
      return;
    }
    if (!isCurrentOperation(forGen, forUid)) return;
    const matching = purchases.filter((p) => p.productId === existing.productId);
    if (matching.length === 0) {
      if (!durable) {
        await clearPendingPurchaseIfUid(deps.store, forUid, mutationAuthFor(forUid, forGen));
        if (isCurrentOperation(forGen, forUid)) pending = null;
      }
      if (isCurrentOperation(forGen, forUid)) emit();
      return;
    }
    for (const purchase of matching) {
      if (!isCurrentOperation(forGen, forUid)) return;
      await handlePurchase(purchase, "recovery");
    }
  }

  async function setAuth(input: IapAuthInput) {
    const previousUid = uid;
    generation += 1;
    const forGen = generation;
    readyGen = null;
    processedTokens = new Set();
    finishedIosTokens = new Set();
    purchaseInFlight = false;
    purchaseOwnerGen = null;
    purchaseOwnerUid = null;
    flowKind = null;
    flowAttempt = null;
    catalog = [];
    lastResult = null;
    pending = null;
    reconnectBudget = 1;

    const nextUid = input.status === "signed_in" ? input.uid : null;
    uid = nextUid;

    if (listenerOwnerGen != null && listenerOwnerGen < forGen) {
      detachListenersOwnedBy(listenerOwnerGen);
    }

    try {
    if (previousUid && previousUid !== nextUid) {
      await clearPendingPurchaseIfUid(
        deps.store,
        previousUid,
        mutationAuthFor(previousUid, forGen)
      );
    }
    if (generation !== forGen) return;

    await closeConnectionIfOwned(forGen);
    if (generation !== forGen) return;

    if (!nextUid) {
      emitIfCurrent(forGen, nextUid);
      return;
    }

    const reconciled = await reconcilePendingPurchaseForUid({
      store: deps.store,
      ...mutationAuthFor(nextUid, forGen),
    });
    if (generation !== forGen) return;
    pending = reconciled;

    if (!deps.capability.available || !storePlatform) {
      emitIfCurrent(forGen, nextUid);
      return;
    }

    const didConnect = await openConnection(forGen);
    if (generation !== forGen) return;
    if (!didConnect) {
      if (isCurrentOperation(forGen, nextUid)) {
        connected = false;
        emit();
      }
      return;
    }
    await recover(forGen, nextUid);
    emitIfCurrent(forGen, nextUid);
    } finally {
      if (generation === forGen) readyGen = forGen;
    }
  }

  async function loadCatalog(): Promise<CanonicalSkuAvailability[]> {
    const forGen = generation;
    const forUid = uid;
    if (!forUid || !deps.capability.available || !storePlatform) {
      if (isCurrentOperation(forGen, forUid)) {
        catalog = [];
        emit();
        return catalog;
      }
      return [];
    }
    if (!connected || connectionOwnerGen !== forGen) {
      const ok = await ensureConnected(forGen, forUid);
      if (!isCurrentOperation(forGen, forUid)) return [];
      if (!ok) {
        catalog = [];
        emit();
        return catalog;
      }
    }
    const skus =
      storePlatform === "android"
        ? [...ANDROID_SUBSCRIPTION_PRODUCT_IDS]
        : [...IOS_SUBSCRIPTION_PRODUCT_IDS];
    let products: Awaited<ReturnType<IapNativeAdapter["fetchProducts"]>> = [];
    try {
      products = await deps.native.fetchProducts({ skus, type: "subs" });
    } catch (error) {
      if (!isCurrentOperation(forGen, forUid)) return [];
      if (isNativeDisconnectError(thrownPurchaseError(error))) {
        markDisconnected(forGen, forUid);
        const ok = await ensureConnected(forGen, forUid);
        if (!isCurrentOperation(forGen, forUid)) return [];
        if (ok) {
          try {
            products = await deps.native.fetchProducts({ skus, type: "subs" });
          } catch {
            products = [];
          }
        } else {
          products = [];
        }
      } else {
        products = [];
      }
    }
    if (!isCurrentOperation(forGen, forUid)) return [];
    catalog = mapStoreProductsToCatalog({
      platform: storePlatform,
      products,
    });
    emit();
    return catalog;
  }

  async function canLaunchNativeSheet(
    forGen: number,
    forUid: string,
    envelope: PendingPurchaseEnvelope,
    attempt: number
  ): Promise<boolean> {
    if (!ownsPurchaseAttempt(forGen, forUid, attempt)) return false;
    if (forUid !== envelope.uid) return false;
    const stored = await readPendingPurchase({ store: deps.store, uid: forUid });
    if (!ownsPurchaseAttempt(forGen, forUid, attempt)) return false;
    return (
      stored != null &&
      stored.uid === envelope.uid &&
      stored.canonicalSku === envelope.canonicalSku &&
      stored.productId === envelope.productId &&
      stored.initiatedAt === envelope.initiatedAt
    );
  }

  function purchaseBlocked(): boolean {
    if (readyGen !== generation) return true;
    if (purchaseInFlight) return true;
    return pending != null && isDurablePendingStage(pending.stage);
  }

  async function purchase(canonicalSku: string): Promise<PurchaseFlowResult> {
    if (!isCanonicalSku(canonicalSku)) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: "products_unavailable",
      };
      return publishResultIfCurrent(generation, uid, result);
    }
    const forGen = generation;
    const buyerUid = uid;
    if (!buyerUid) {
      const result: PurchaseFlowResult = { kind: "unavailable", reason: "not_signed_in" };
      return publishResultIfCurrent(forGen, buyerUid, result);
    }
    if (!deps.capability.available || !storePlatform) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: deps.capability.reason ?? "native_build_required",
      };
      return publishResultIfCurrent(forGen, buyerUid, result);
    }
    if (purchaseBlocked()) {
      const result: PurchaseFlowResult = { kind: "already_in_flight" };
      if (flowKind == null) return publishResultIfCurrent(forGen, buyerUid, result);
      return result;
    }

    const myAttempt = beginPurchaseLock(forGen, buyerUid, "purchase");
    const myRevision = operationRevision;
    emit();
    let envelope: PendingPurchaseEnvelope | null = null;

    const retiredWithoutPublish = async (): Promise<PurchaseFlowResult> => {
      if (envelope) await compensateStaleStorage(envelope, forGen, myAttempt, myRevision);
      if (!isCurrentOperation(forGen, buyerUid)) return authChurnResult(buyerUid);
      return {
        kind: "failed",
        recoverable: true,
        message: "Purchase didn't complete.",
      };
    };

    const stillOwnsThisPurchase = () => ownsPurchaseAttempt(forGen, buyerUid, myAttempt);

    const launchNativeSheet = async (run: () => Promise<void>): Promise<PurchaseFlowResult | "launched"> => {
      if (!envelope || !stillOwnsThisPurchase()) return retiredWithoutPublish();
      if (!(await canLaunchNativeSheet(forGen, buyerUid, envelope, myAttempt))) {
        if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
        return compensateStalePurchase(envelope, forGen, buyerUid, myAttempt, myRevision);
      }
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      pending = envelope;
      emit();
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      await run();
      return "launched";
    };

    if (!connected || connectionOwnerGen !== forGen) {
      const ok = await ensureConnected(forGen, buyerUid);
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      if (!ok) {
        releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
        const result: PurchaseFlowResult = {
          kind: "failed",
          recoverable: true,
          message: "Store is not connected.",
        };
        return publishResultIfCurrent(forGen, buyerUid, result);
      }
    }

    const entry = getClientCatalogEntry(canonicalSku);
    if (catalog.length === 0) {
      await loadCatalog();
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
    }
    const skuState = catalog.find((item) => item.canonicalSku === canonicalSku);
    if (!skuState?.available) {
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: skuState?.unavailableReason ?? "products_unavailable",
      };
      return publishResultIfCurrent(forGen, buyerUid, result);
    }

    try {
      const ids = pendingProductIdForSku(storePlatform, canonicalSku);
      if (storePlatform === "android") {
        const prepared = await deps.backend.prepareAndroidBillingAccount();
        if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
        const obfuscatedAccountId = assertServerObfuscatedAccountId({
          obfuscatedAccountId: prepared.obfuscatedAccountId,
          uid: buyerUid,
        });
        const offerToken = skuState.androidOfferToken;
        if (!offerToken) {
          if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
          releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
          const result: PurchaseFlowResult = {
            kind: "unavailable",
            reason: "unsupported_offer",
          };
          return publishResultIfCurrent(forGen, buyerUid, result);
        }
        envelope = {
          version: 1,
          uid: buyerUid,
          platform: "android",
          canonicalSku,
          productId: ids.productId,
          androidBasePlanId: ids.androidBasePlanId,
          stage: "intent_created",
          initiatedAt: deps.now(),
          updatedAt: deps.now(),
        };
        const wrote = await writePendingPurchase({
          store: deps.store,
          envelope,
          ...mutationAuthFor(buyerUid, forGen, myAttempt, myRevision),
        });
        if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
        if (!wrote) {
          releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          return publishResultIfCurrent(forGen, buyerUid, result);
        }
        const launched = await launchNativeSheet(async () => {
          await deps.native.requestPurchase({
            type: "subs",
            request: {
              google: {
                skus: [entry.android.productId],
                subscriptionOffers: [{ sku: entry.android.productId, offerToken }],
                obfuscatedAccountId,
              },
            },
          });
        });
        if (launched !== "launched") return launched;
      } else {
        const prepared = await deps.backend.prepareIOSBillingAccount();
        if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
        if (!isUuidAppAccountToken(prepared.appAccountToken)) {
          releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          return publishResultIfCurrent(forGen, buyerUid, result);
        }
        envelope = {
          version: 1,
          uid: buyerUid,
          platform: "ios",
          canonicalSku,
          productId: ids.productId,
          stage: "intent_created",
          initiatedAt: deps.now(),
          updatedAt: deps.now(),
        };
        const wrote = await writePendingPurchase({
          store: deps.store,
          envelope,
          ...mutationAuthFor(buyerUid, forGen, myAttempt, myRevision),
        });
        if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
        if (!wrote) {
          releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Couldn't start purchase.",
          };
          return publishResultIfCurrent(forGen, buyerUid, result);
        }
        const launched = await launchNativeSheet(async () => {
          await deps.native.requestPurchase({
            type: "subs",
            request: {
              apple: {
                sku: entry.ios.productId,
                appAccountToken: prepared.appAccountToken,
              },
            },
          });
        });
        if (launched !== "launched") return launched;
      }
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      const result: PurchaseFlowResult = { kind: "sheet_launched" };
      lastResult = result;
      emit();
      return result;
    } catch (error) {
      const normalized = thrownPurchaseError(error);
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      if (isNativeDisconnectError(normalized)) {
        markDisconnected(forGen, buyerUid);
      }
      if (isUserCancelledError(normalized)) {
        await abandonNonDurablePending(envelope, buyerUid, forGen, myAttempt, myRevision);
        if (!stillOwnsThisPurchase()) return { kind: "cancelled" };
        releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
        const result: PurchaseFlowResult = { kind: "cancelled" };
        lastResult = result;
        emit();
        return result;
      }
      await abandonNonDurablePending(envelope, buyerUid, forGen, myAttempt, myRevision);
      if (!stillOwnsThisPurchase()) return retiredWithoutPublish();
      releasePurchaseIfCurrent(forGen, buyerUid, myAttempt);
      const result: PurchaseFlowResult = {
        kind: "failed",
        recoverable: true,
        message: "Purchase didn't complete.",
      };
      lastResult = result;
      emit();
      return result;
    }
  }

  async function restorePurchases(): Promise<PurchaseFlowResult> {
    const forGen = generation;
    const forUid = uid;
    if (!forUid || !deps.capability.available || !storePlatform) {
      const result: PurchaseFlowResult = {
        kind: "unavailable",
        reason: !forUid ? "not_signed_in" : deps.capability.reason ?? "native_build_required",
      };
      return publishResultIfCurrent(forGen, forUid, result);
    }
    if (!isAuthReady(forGen) || purchaseInFlight) {
      return { kind: "already_in_flight" };
    }
    const myAttempt = beginPurchaseLock(forGen, forUid, "restore");
    emit();
    try {
      if (!connected || connectionOwnerGen !== forGen) {
        const ok = await ensureConnected(forGen, forUid);
        if (!ownsRestoreAttempt(forGen, forUid, myAttempt)) {
          return authChurnResult(forUid);
        }
        if (!ok) {
          const result: PurchaseFlowResult = {
            kind: "failed",
            recoverable: true,
            message: "Store is not connected.",
          };
          return publishResultIfCurrent(forGen, forUid, result);
        }
      }
      let purchases: StorePurchase[] = [];
      try {
        purchases = await deps.native.getAvailablePurchases({
          onlyIncludeActiveItemsIOS: true,
          includeSuspendedAndroid: false,
        });
      } catch (error) {
        if (!ownsRestoreAttempt(forGen, forUid, myAttempt)) {
          return authChurnResult(forUid);
        }
        if (isNativeDisconnectError(thrownPurchaseError(error))) {
          markDisconnected(forGen, forUid);
        }
        const result: PurchaseFlowResult = {
          kind: "failed",
          recoverable: true,
          message: "Couldn't refresh store purchases.",
        };
        return publishResultIfCurrent(forGen, forUid, result);
      }
      if (!ownsRestoreAttempt(forGen, forUid, myAttempt)) {
        return authChurnResult(forUid);
      }
      if (purchases.length === 0) {
        const result: PurchaseFlowResult = { kind: "verified" };
        return publishResultIfCurrent(forGen, forUid, result);
      }
      let last: PurchaseFlowResult = { kind: "verified" };
      for (const purchase of purchases) {
        if (!ownsRestoreAttempt(forGen, forUid, myAttempt)) {
          return authChurnResult(forUid);
        }
        await handlePurchase(purchase, "restore");
        if (!ownsRestoreAttempt(forGen, forUid, myAttempt)) {
          return authChurnResult(forUid);
        }
        last = lastResult ?? last;
      }
      return last;
    } finally {
      const mine = ownsRestoreAttempt(forGen, forUid, myAttempt);
      releasePurchaseIfCurrent(forGen, forUid, myAttempt);
      if (mine) emitIfCurrent(forGen, forUid);
    }
  }

  async function dispose() {
    const ownedListeners = listenerOwnerGen;
    generation += 1;
    if (ownedListeners != null) detachListenersOwnedBy(ownedListeners);
    if (connected) {
      try {
        await deps.native.endConnection();
      } catch {
        // ignore
      }
    }
    connected = false;
    connectionOwnerGen = null;
    uid = null;
    pending = null;
    purchaseInFlight = false;
    purchaseOwnerGen = null;
    purchaseOwnerUid = null;
    flowKind = null;
    flowAttempt = null;
  }

  return {
    setAuth,
    loadCatalog,
    purchase,
    restorePurchases,
    dispose,
    getGeneration: () => generation,
    getView: (): IapView => ({
      ownerUid: uid,
      available: deps.capability.available && storePlatform != null && uid != null,
      unavailableReason: !uid ? "not_signed_in" : deps.capability.reason,
      connected,
      catalog,
      pending,
      lastResult,
      purchaseInFlight,
    }),
  };
}

export type IapSession = ReturnType<typeof createIapSession>;
