/**
 * Atomic persistence for applySubscriptionTransition.
 *
 * Derivation is complete before this module writes. Google/Apple payloads
 * never enter here — only CanonicalTransitionRequest + derived state.
 *
 * TRANSACTION SHAPE (Firestore-compatible, structurally enforced):
 *   1. READ PHASE   — processed-event doc, subscription status, company
 *                     billing, the financial ledger row (when the request
 *                     carries a financial event), and any auxiliary decision
 *                     state read by the prepare hook. The hook receives a
 *                     READ-ONLY transaction view, so it cannot write.
 *   2. VALIDATE     — idempotent-replay check, stale-platform-state guard,
 *                     pure derivation, financial ledger conflict check.
 *   3. WRITE PHASE  — every set/create happens here, after ALL reads.
 * No read is ever issued after the first write, matching production
 * Firestore semantics (reads-before-writes) and the strict MemoryBillingStore.
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
import {
  AlreadyExistsError,
  type BillingReadTransaction,
  type BillingStore,
} from "./store";
import { deriveSubscriptionTransition, type TransitionRequest } from "./transition";
import type {
  BillingEventLedgerDoc,
  CompanyBillingDoc,
  ProcessedBillingEventDoc,
  SubscriptionAuditLogEventDoc,
  SubscriptionStatusDoc,
} from "./types";

/** A write the prepare hook wants persisted atomically with the transition. */
export interface PlannedAuxWrite {
  op: "create" | "set";
  path: string;
  data: Record<string, unknown>;
}

export type TransitionPlan =
  | {
      /** Proceed with derivation; auxWrites land in the write phase. */
      outcome: "proceed";
      auxWrites?: PlannedAuxWrite[];
    }
  | {
      /**
       * The requested effect is already durably satisfied (e.g. a retried
       * trial grant for the same account). The engine returns the current
       * state, performs ZERO writes, and never re-derives (no extension).
       * Takes precedence over the fingerprint conflict check so that a
       * legitimate retry with a later timestamp stays idempotent.
       */
      outcome: "alreadySatisfied";
    }
  | {
      /**
       * The transition must fail closed (e.g. trial already consumed by a
       * different account). Evaluated AFTER idempotent-replay detection so a
       * retry of an already-committed request is never converted into an
       * error. Hooks should prefer this over throwing for business rejections.
       */
      outcome: "reject";
      error: BillingError;
    };

/**
 * Read-phase hook. Receives a READ-ONLY transaction view — writes are not
 * expressible, which makes read-after-write bugs structurally impossible for
 * hook authors. All hook writes must be returned as planned aux writes.
 */
export type PrepareTransitionHook = (
  readTx: BillingReadTransaction,
  prior: SubscriptionStatusDoc | null
) => Promise<TransitionPlan>;

export interface ApplyTransitionDeps {
  store: BillingStore;
  diagnosticUid: string;
  prepareTransition?: PrepareTransitionHook;
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

function summaryOf(status: SubscriptionStatusDoc): string {
  return `${status.billingStatus}:${status.plan}:${status.entitlementActive ? "1" : "0"}`;
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

function mergeInvalidatedFingerprints(
  prior: CompanyBillingDoc | null,
  ev: TransitionRequest["requested"]["platformEvent"] | undefined
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  for (const fp of prior?.invalidatedCredentialFingerprints ?? []) push(fp);
  push(ev?.linkedCredentialFingerprint);
  if (
    prior?.credentialFingerprint &&
    ev?.credentialFingerprint &&
    prior.credentialFingerprint !== ev.credentialFingerprint
  ) {
    push(prior.credentialFingerprint);
  }
  return out;
}

function companyFrom(
  uid: string,
  prior: CompanyBillingDoc | null,
  nowMs: number,
  req: TransitionRequest
): CompanyBillingDoc | null {
  const ev = req.requested.platformEvent;
  if (!ev && !prior) return null;
  const priorWatermark =
    typeof prior?.lastReconciledAt === "number" ? prior.lastReconciledAt : null;
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
    invalidatedCredentialFingerprints: mergeInvalidatedFingerprints(prior, ev),
    lastReconciledAt: ev
      ? Math.max(ev.reconciledAt, priorWatermark ?? ev.reconciledAt)
      : priorWatermark,
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
    existing.uid !== next.uid ||
    (existing.relatedFinancialEventId ?? null) !== (next.relatedFinancialEventId ?? null) ||
    existing.occurredAt !== next.occurredAt
  );
}

export async function applySubscriptionTransition(
  deps: ApplyTransitionDeps,
  req: TransitionRequest
): Promise<ApplyTransitionResult> {
  const processedPath = processedEventPath(sanitizeDocId(req.idempotencyKey));
  const statusPath = subscriptionStatusPath(req.uid);
  const companyPath = companyBillingPath(req.uid);
  const requestedFinancial = req.requested.financialEvent ?? null;
  const ledgerPath = requestedFinancial
    ? financialLedgerPath(sanitizeDocId(requestedFinancial.financialEventId))
    : null;
  // Pure preview (prior=null) used only for the idempotency fingerprint —
  // the fingerprint depends solely on the request, never on prior state.
  const derivedPreview = deriveSubscriptionTransition(null, req);

  try {
    return await deps.store.runTransaction(async (tx) => {
      // ---------------- READ PHASE (no writes exist yet) ----------------
      const processedSnap = await tx.get(processedPath);
      const prior = asStatus((await tx.get(statusPath)).data());
      const companySnap = await tx.get(companyPath);
      const priorCompany = companySnap.exists
        ? (companySnap.data() as unknown as CompanyBillingDoc)
        : null;
      const ledgerSnap = ledgerPath ? await tx.get(ledgerPath) : null;
      const readOnlyTx: BillingReadTransaction = { get: (p) => tx.get(p) };
      const plan: TransitionPlan = deps.prepareTransition
        ? await deps.prepareTransition(readOnlyTx, prior)
        : { outcome: "proceed" };

      // ---------------- VALIDATE ----------------
      if (plan.outcome === "alreadySatisfied") {
        return {
          alreadyProcessed: true,
          diagnosticUid: deps.diagnosticUid,
          from: prior,
          to: prior ?? derivedPreview.next,
          financialEventWritten: false,
          historyWritten: false,
          resultSummary: prior ? summaryOf(prior) : derivedPreview.resultSummary,
        };
      }

      if (processedSnap.exists) {
        const prev = processedSnap.data() ?? {};
        if (prev.requestFingerprint !== derivedPreview.requestFingerprint) {
          throw new BillingError({
            clientCode: "internal_error",
            causeCode: "idempotency_conflict",
          });
        }
        return {
          alreadyProcessed: true,
          diagnosticUid: deps.diagnosticUid,
          from: prior,
          to: prior ?? derivedPreview.next,
          financialEventWritten: false,
          historyWritten: false,
          resultSummary: String(prev.resultSummary ?? derivedPreview.resultSummary),
        };
      }

      if (plan.outcome === "reject") {
        throw plan.error;
      }

      if (req.requested.kind === "recordFinancial" && !prior) {
        throw new BillingError({
          clientCode: "invalid_purchase",
          causeCode: "no_prior_subscription_for_financial_record",
        });
      }

      // Stale-event defense in depth (see transition.ts contract): reject
      // platform-sourced transitions older than the persisted watermark.
      const ev = req.requested.platformEvent;
      if (
        ev &&
        typeof priorCompany?.lastReconciledAt === "number" &&
        ev.reconciledAt < priorCompany.lastReconciledAt
      ) {
        throw new BillingError({
          clientCode: "verification_failed",
          causeCode: "stale_platform_state",
        });
      }

      const derived = deriveSubscriptionTransition(prior, req);

      let writeFinancialRow = false;
      if (derived.ledger && ledgerSnap) {
        if (ledgerSnap.exists) {
          if (ledgerConflict(ledgerSnap.data() ?? {}, derived.ledger)) {
            throw new BillingError({
              clientCode: "internal_error",
              causeCode: "financial_event_conflict",
            });
          }
        } else {
          writeFinancialRow = true;
        }
      }

      const company = companyFrom(req.uid, priorCompany, req.nowMs, req);
      if (
        company &&
        company.encryptedPurchaseCredential == null &&
        req.requested.platformEvent?.encryptedPurchaseCredential
      ) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "plaintext_credential_blocked",
        });
      }

      // ---------------- WRITE PHASE (no reads after this point) ----------------
      tx.set(statusPath, derived.next as unknown as Record<string, unknown>);
      if (company) {
        tx.set(companyPath, company as unknown as Record<string, unknown>);
      }

      const audit: SubscriptionAuditLogEventDoc = {
        diagnosticUid: deps.diagnosticUid,
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
          googleSubscriptionState: req.requested.googleSubscriptionState ?? null,
        },
      };
      appendSubscriptionAuditEvent(tx, auditEventIdFor(req.idempotencyKey), audit);

      let historyWritten = false;
      if (derived.history) {
        const hist = derived.history as unknown as Record<string, unknown>;
        assertNoSecretsInHistory(hist);
        tx.create(subscriptionHistoryPath(req.uid, historyEventId(req.idempotencyKey)), hist);
        historyWritten = true;
      }

      if (derived.ledger && ledgerPath && writeFinancialRow) {
        tx.create(ledgerPath, derived.ledger as unknown as Record<string, unknown>);
      }

      const processed: ProcessedBillingEventDoc = {
        idempotencyKey: req.idempotencyKey,
        source: req.source,
        processedAt: req.nowMs,
        resultSummary: derived.resultSummary,
        requestFingerprint: derived.requestFingerprint,
        diagnosticUid: deps.diagnosticUid,
      };
      tx.create(processedPath, processed as unknown as Record<string, unknown>);

      for (const aux of plan.auxWrites ?? []) {
        if (aux.op === "create") tx.create(aux.path, aux.data);
        else tx.set(aux.path, aux.data);
      }

      return {
        alreadyProcessed: false,
        diagnosticUid: deps.diagnosticUid,
        from: prior,
        to: derived.next,
        financialEventWritten: writeFinancialRow,
        historyWritten,
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
