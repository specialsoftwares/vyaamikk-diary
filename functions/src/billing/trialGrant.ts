/**
 * Authoritative 14-day Professional trial grant.
 *
 * Identity: trialIdentityHmac(TRIAL_IDENTITY_SECRET, phone) — no raw phone is
 * stored on the ledger or returned in a way that callers should log. Replay
 * of the same grant request (same uid + same identity) is idempotent.
 * Account deletion/recreation with the same phone hash cannot obtain a second
 * trial unless overrideAllowed is set (consumed atomically).
 */

import { applySubscriptionTransition } from "./applyTransition";
import { diagnosticUidHmac } from "./diagnosticUid";
import { BillingError } from "./errors";
import { trialLedgerPath } from "./paths";
import type { BillingStore } from "./store";
import { trialIdentityHmac } from "./trialIdentity";
import type { TransitionRequest } from "./transition";
import type { TrialLedgerDoc } from "./types";

export interface GrantTrialInput {
  uid: string;
  /** Used only to derive the HMAC id; never persisted. */
  phoneE164: string;
  trialIdentitySecret: string;
  billingDiagUidSecret: string;
  nowMs: number;
  /**
   * When true, a ledger row with overrideAllowed=true may grant a second
   * trial (recycled-number support). The override flag is consumed atomically.
   */
  consumeOverride?: boolean;
}

export async function grantProfessionalTrial(
  store: BillingStore,
  input: GrantTrialInput
): Promise<{
  trialIdentityHmac: string;
  diagnosticUid: string;
  alreadyProcessed: boolean;
  trialEndsAt: number;
}> {
  const identity = trialIdentityHmac(input.trialIdentitySecret, input.phoneE164);
  const diagnosticUid = diagnosticUidHmac(input.billingDiagUidSecret, input.uid);
  const idempotencyKey = input.consumeOverride
    ? `trial:${identity}:override:${input.uid}`
    : `trial:${identity}:${input.uid}`;
  const ledgerPath = trialLedgerPath(identity);

  const req: TransitionRequest = {
    uid: input.uid,
    source: "trialGrant",
    eventSource: "trial",
    idempotencyKey,
    occurredAt: input.nowMs,
    nowMs: input.nowMs,
    requested: { kind: "grantTrial" },
  };

  const result = await applySubscriptionTransition(
    {
      store,
      diagnosticUid,
      afterPriorRead: async (tx) => {
        const snap = await tx.get(ledgerPath);
        const ledger = (snap.exists ? snap.data() : null) as TrialLedgerDoc | null;

        if (ledger?.trialUsed === true) {
          const sameAccount = ledger.lastAccountUidDiagnostic === diagnosticUid;
          if (input.consumeOverride === true) {
            if (ledger.overrideAllowed !== true) {
              throw new BillingError({
                clientCode: "not_entitled",
                causeCode: "trial_override_not_allowed",
              });
            }
            tx.set(ledgerPath, {
              trialUsed: true,
              firstTrialStartedAt: ledger.firstTrialStartedAt,
              lastAccountUidDiagnostic: diagnosticUid,
              overrideAllowed: false,
              createdAt: ledger.createdAt,
              updatedAt: input.nowMs,
            } satisfies TrialLedgerDoc);
            return;
          }
          if (sameAccount) {
            return;
          }
          throw new BillingError({
            clientCode: "not_entitled",
            causeCode: "trial_already_used",
          });
        }

        tx.set(ledgerPath, {
          trialUsed: true,
          firstTrialStartedAt: input.nowMs,
          lastAccountUidDiagnostic: diagnosticUid,
          overrideAllowed: false,
          createdAt: ledger?.createdAt ?? input.nowMs,
          updatedAt: input.nowMs,
        } satisfies TrialLedgerDoc);
      },
    },
    req
  );

  return {
    trialIdentityHmac: identity,
    diagnosticUid,
    alreadyProcessed: result.alreadyProcessed,
    trialEndsAt: result.to.trialEndsAt ?? 0,
  };
}
