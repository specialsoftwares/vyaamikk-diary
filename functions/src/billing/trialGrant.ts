/**
 * Authoritative 14-day Professional trial grant.
 *
 * Identity: trialIdentityHmac(TRIAL_IDENTITY_SECRET, phone) — no raw phone is
 * stored on the ledger and no trial identity material is returned to callers.
 * Replay of the same grant request (same phone identity + same account) is
 * idempotent and NEVER extends an existing trial. Account deletion or
 * recreation with the same phone hash cannot obtain a second trial unless
 * overrideAllowed is set (consumed atomically). A trial can never replace
 * current or historic paid access (enforced fail-closed in transition.ts).
 *
 * PRIVACY — idempotency key: the key is persisted verbatim on audit and
 * processed-event documents, so it must be OPAQUE. It is derived as
 * `trial:` + SHA-256(identityHmac : diagnosticUid : mode) and therefore
 * contains no raw uid, no raw phone, and does not expose the trial identity
 * HMAC itself.
 */

import { createHash } from "node:crypto";

import { applySubscriptionTransition, type TransitionPlan } from "./applyTransition";
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

/**
 * Callable-facing result. Deliberately EXCLUDES the trial identity HMAC —
 * identity material never leaves the server boundary.
 */
export interface GrantTrialResult {
  diagnosticUid: string;
  alreadyProcessed: boolean;
  trialEndsAt: number;
}

export function opaqueTrialIdempotencyKey(
  identityHmac: string,
  diagnosticUid: string,
  mode: "normal" | "override"
): string {
  const digest = createHash("sha256")
    .update(`vyd-trial-grant-v1:${identityHmac}:${diagnosticUid}:${mode}`, "utf8")
    .digest("hex");
  return `trial:${digest}`;
}

export async function grantProfessionalTrial(
  store: BillingStore,
  input: GrantTrialInput
): Promise<GrantTrialResult> {
  const identity = trialIdentityHmac(input.trialIdentitySecret, input.phoneE164);
  const diagnosticUid = diagnosticUidHmac(input.billingDiagUidSecret, input.uid);
  const mode = input.consumeOverride === true ? "override" : "normal";
  const idempotencyKey = opaqueTrialIdempotencyKey(identity, diagnosticUid, mode);
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
      // READ-ONLY prepare hook: reads the durable trial ledger and returns
      // the planned ledger write; the engine persists it atomically in the
      // write phase (never during reads).
      prepareTransition: async (readTx, prior): Promise<TransitionPlan> => {
        const snap = await readTx.get(ledgerPath);
        const ledger = (snap.exists ? snap.data() : null) as TrialLedgerDoc | null;

        if (ledger?.trialUsed === true) {
          const sameAccount = ledger.lastAccountUidDiagnostic === diagnosticUid;
          if (sameAccount && prior?.trialStartedAt != null) {
            // Retried grant for the account that already holds the trial
            // (covers normal AND consumed-override retries): zero writes,
            // current state returned — the trial is NEVER extended.
            return { outcome: "alreadySatisfied" };
          }
          if (input.consumeOverride === true) {
            if (ledger.overrideAllowed !== true) {
              return {
                outcome: "reject",
                error: new BillingError({
                  clientCode: "not_entitled",
                  causeCode: "trial_override_not_allowed",
                }),
              };
            }
            return {
              outcome: "proceed",
              auxWrites: [
                {
                  op: "set",
                  path: ledgerPath,
                  data: {
                    trialUsed: true,
                    firstTrialStartedAt: ledger.firstTrialStartedAt,
                    lastAccountUidDiagnostic: diagnosticUid,
                    overrideAllowed: false,
                    createdAt: ledger.createdAt,
                    updatedAt: input.nowMs,
                  } satisfies TrialLedgerDoc,
                },
              ],
            };
          }
          if (sameAccount) {
            // Ledger says this account consumed the trial but no trial state
            // exists (e.g. status doc restored from scratch): re-deriving is
            // allowed only through the engine's eligibility gate.
            return { outcome: "proceed" };
          }
          return {
            outcome: "reject",
            error: new BillingError({
              clientCode: "not_entitled",
              causeCode: "trial_already_used",
            }),
          };
        }

        return {
          outcome: "proceed",
          auxWrites: [
            {
              op: "set",
              path: ledgerPath,
              data: {
                trialUsed: true,
                firstTrialStartedAt: input.nowMs,
                lastAccountUidDiagnostic: diagnosticUid,
                overrideAllowed: false,
                createdAt: ledger?.createdAt ?? input.nowMs,
                updatedAt: input.nowMs,
              } satisfies TrialLedgerDoc,
            },
          ],
        };
      },
    },
    req
  );

  return {
    diagnosticUid,
    alreadyProcessed: result.alreadyProcessed,
    trialEndsAt: result.to.trialEndsAt ?? 0,
  };
}
