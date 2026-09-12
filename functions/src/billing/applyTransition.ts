/**
 * Atomic persistence for applySubscriptionTransition.
 *
 * Derivation is complete before this module writes. Google/Apple payloads
 * never enter here — only CanonicalTransitionRequest + derived state.
 */

import { appendSubscriptionAuditEvent, auditEventIdFor } from "./audit";
import { BillingError } from "./errors";
import {
  companyBillingPath,
  financialLedgerPath,
  processedEventPath,
  sanitizeDocId,
  subscriptionHistoryPath,
  subscriptionStatusPath,
} from "./paths";
import { AlreadyExistsError, type BillingStore, type BillingTransaction } from "./store";
import {
  deriveSubscriptionTransition,
  type DerivedTransition,
  type TransitionRequest,
} from "./transition";
import type {
  BillingEventLedgerDoc,
  CompanyBillingDoc,
  ProcessedBillingEventDoc,
  SubscriptionAuditLogEventDoc,
  SubscriptionStatusDoc,
} from "./types";

export interface ApplyTransitionDeps {
  store: BillingStore;
  diagnosticUid: string;
  /**
   * Runs inside the persistence transaction after the processed-event miss
   * and prior-state read, before writes. Used by trial grant to enforce the
   * durable-identity ledger atomically with the entitlement mutation.
   */
  afterPriorRead?: (
    tx: BillingTransaction,
    prior: SubscriptionStatusDoc | null
  ) => Promise<void>;
}

export interface ApplyTransitionResult {
  alreadyProcessed: boolean;
  diagnosticUid: string;
  from: SubscriptionStatusDoc | null;
  to: SubscriptionStatusDoc;
  financialEventWritten: boolean;
  historyWritten: boolean;
  resultSummary: string;
}

function asStatus(data: Record<string, unknown> | undefined): SubscriptionStatusDoc | null {
  if (!data) return null;
  return data as unknown as SubscriptionStatusDoc;
}

function historyEventId(idempotencyKey: string): string {
  return sanitizeDocId(`h_${idempotencyKey}`);
}

function assertNoSecretsInHistory(history: Record<string, unknown>): void {
  const forbidden = [
    "purchaseToken",
    "purchase_token",
    "receipt",
    "receiptData",
    "signedTransaction",
    "signedPayload",
    "encryptedPurchaseCredential",
    "ciphertext",
  ];
  for (const key of forbidden) {
    if (key in history) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "history_secret_field",
      });
    }
  }
}

function companyFrom(
  uid: string,
  prior: CompanyBillingDoc | null,
  nowMs: number,
  req: TransitionRequest
): CompanyBillingDoc | null {
  const ev = req.requested.platformEvent;
  if (!ev && !prior) return null;
  return {
    uid,
    platform: ev?.platform ?? prior!.platform,
    canonicalSku: ev?.canonicalSku ?? prior!.canonicalSku,
    productId: ev?.productId ?? prior!.productId,
    basePlanId: ev ? ev.basePlanId : prior!.basePlanId,
    latestOrderId: ev?.latestOrderId ?? prior?.latestOrderId ?? null,
    originalTransactionId: ev?.originalTransactionId ?? prior?.originalTransactionId ?? null,
    credentialFingerprint: ev?.credentialFingerprint ?? prior?.credentialFingerprint ?? null,
    encryptedPurchaseCredential:
      ev?.encryptedPurchaseCredential ?? prior?.encryptedPurchaseCredential ?? null,
    invalidatedCredentialFingerprints: prior?.invalidatedCredentialFingerprints ?? [],
    createdAt: prior?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
}

function ledgerConflict(existing: Record<string, unknown>, next: BillingEventLedgerDoc): boolean {
  return (
    existing.eventType !== next.eventType ||
    existing.grossAmountInPaise !== next.grossAmountInPaise ||
    existing.platform !== next.platform ||
    existing.canonicalSku !== next.canonicalSku ||
    existing.uid !== next.uid
  );
}

async function persistDerived(
  tx: BillingTransaction,
  req: TransitionRequest,
  derived: DerivedTransition,
  prior: SubscriptionStatusDoc | null,
  priorCompany: CompanyBillingDoc | null,
  diagnosticUid: string
): Promise<{ financialEventWritten: boolean; historyWritten: boolean }> {
  const uid = req.uid;
  tx.set(subscriptionStatusPath(uid), derived.next as unknown as Record<string, unknown>);

  const company = companyFrom(uid, priorCompany, req.nowMs, req);
  if (company) {
    if (company.encryptedPurchaseCredential == null && req.requested.platformEvent?.encryptedPurchaseCredential) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "plaintext_credential_blocked",
      });
    }
    tx.set(companyBillingPath(uid), company as unknown as Record<string, unknown>);
  }

  const audit: SubscriptionAuditLogEventDoc = {
    diagnosticUid,
    source: req.source,
    idempotencyKey: req.idempotencyKey,
    occurredAt: req.occurredAt,
    fromPlan: prior?.plan ?? null,
    toPlan: derived.next.plan,
    fromBillingStatus: prior?.billingStatus ?? null,
    toBillingStatus: derived.next.billingStatus,
    entitlementActiveAfter: derived.next.entitlementActive,
    detail: {
      eventSource: req.eventSource,
      kind: req.requested.kind,
      canonicalSku: req.requested.platformEvent?.canonicalSku ?? null,
    },
  };
  appendSubscriptionAuditEvent(tx, auditEventIdFor(req.idempotencyKey), audit);

  let historyWritten = false;
  if (derived.history) {
    const hist = derived.history as unknown as Record<string, unknown>;
    assertNoSecretsInHistory(hist);
    tx.create(
      subscriptionHistoryPath(uid, historyEventId(req.idempotencyKey)),
      hist
    );
    historyWritten = true;
  }

  let financialEventWritten = false;
  if (derived.ledger) {
    const ledgerPath = financialLedgerPath(sanitizeDocId(derived.ledger.financialEventId));
    const existing = await tx.get(ledgerPath);
    if (existing.exists) {
      if (ledgerConflict(existing.data() ?? {}, derived.ledger)) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "financial_event_conflict",
        });
      }
    } else {
      tx.create(ledgerPath, derived.ledger as unknown as Record<string, unknown>);
      financialEventWritten = true;
    }
  }

  const processed: ProcessedBillingEventDoc = {
    idempotencyKey: req.idempotencyKey,
    source: req.source,
    processedAt: req.nowMs,
    resultSummary: derived.resultSummary,
    requestFingerprint: derived.requestFingerprint,
    diagnosticUid,
  };
  tx.create(
    processedEventPath(sanitizeDocId(req.idempotencyKey)),
    processed as unknown as Record<string, unknown>
  );

  return { financialEventWritten, historyWritten };
}

export async function applySubscriptionTransition(
  deps: ApplyTransitionDeps,
  req: TransitionRequest
): Promise<ApplyTransitionResult> {
  const processedPath = processedEventPath(sanitizeDocId(req.idempotencyKey));
  const derivedPreview = deriveSubscriptionTransition(null, req);

  try {
    return await deps.store.runTransaction(async (tx) => {
      const processedSnap = await tx.get(processedPath);
      if (processedSnap.exists) {
        const prev = processedSnap.data() ?? {};
        if (prev.requestFingerprint !== derivedPreview.requestFingerprint) {
          throw new BillingError({
            clientCode: "internal_error",
            causeCode: "idempotency_conflict",
          });
        }
        const status = asStatus((await tx.get(subscriptionStatusPath(req.uid))).data());
        return {
          alreadyProcessed: true,
          diagnosticUid: deps.diagnosticUid,
          from: status,
          to: status ?? derivedPreview.next,
          financialEventWritten: false,
          historyWritten: false,
          resultSummary: String(prev.resultSummary ?? derivedPreview.resultSummary),
        };
      }

      const prior = asStatus((await tx.get(subscriptionStatusPath(req.uid))).data());
      if (deps.afterPriorRead) {
        await deps.afterPriorRead(tx, prior);
      }
      const derived = deriveSubscriptionTransition(prior, req);
      const companySnap = await tx.get(companyBillingPath(req.uid));
      const priorCompany = companySnap.exists
        ? (companySnap.data() as unknown as CompanyBillingDoc)
        : null;
      const written = await persistDerived(
        tx,
        req,
        derived,
        prior,
        priorCompany,
        deps.diagnosticUid
      );
      return {
        alreadyProcessed: false,
        diagnosticUid: deps.diagnosticUid,
        from: prior,
        to: derived.next,
        financialEventWritten: written.financialEventWritten,
        historyWritten: written.historyWritten,
        resultSummary: derived.resultSummary,
      };
    });
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "append_only_collision",
      });
    }
    throw err;
  }
}
