/**
 * FAKE or INJECTED ports for G1 register/reconcile and G2 evidence upload.
 * App modules must not import firebase-admin. Production injects Team 1 / Team 2 adapters.
 */

import type { Wave1OriginalCategory } from "@/goodsEvidence/evidence";
import type {
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
} from "@/goodsEvidence/ports";
import type { GrinCommandType, LocalEvidenceRole } from "./types";

export type GrinPortKind = "FAKE" | "INJECTED";

export type GrinRegisterEnvelope = {
  commandId: string;
  type: "registerGoodsReceipt";
  ledgerId: string;
  body: unknown;
};

export type GrinMutationEnvelope = {
  commandId: string;
  type: Exclude<GrinCommandType, "registerGoodsReceipt">;
  ledgerId: string;
  body: unknown;
};

/**
 * INJECTED: host supplies Team 1 G1 adapter.
 * FAKE: tests supply an in-process stand-in.
 * `digest` is the locally frozen digest; an INJECTED G1 adapter recomputes
 * digest from the envelope and must not read it as a client-supplied server field.
 */
export type GrinServerCommandPort = {
  portKind: GrinPortKind;
  register(input: {
    uid: string;
    envelope: GrinRegisterEnvelope;
    digest: string;
  }): Promise<GrinRegisterResult>;
  /**
   * wave1b stored command result (register or mutation). Clients must not
   * invent `issuedNumber` from a mutation success.
   */
  reconcile(input: { uid: string; ledgerId: string; commandId: string }): Promise<GrinReconcileResult>;
  mutate?(input: { uid: string; envelope: GrinMutationEnvelope; digest: string }): Promise<GrinMutationResult>;
  /**
   * Authorized retrieve of confirmed original / events / effective.
   * Absent on FAKE ports that do not implement retrieve — outbox must not invent confirmation.
   */
  readReceipt?(input: { uid: string; ledgerId: string; receiptId: string }): Promise<GrinReceiptReadResult>;
};

export type GrinEvidenceUploadInput = {
  uid: string;
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
  role: LocalEvidenceRole;
  localPath: string;
  claimedSha256: string | null;
  /**
   * Required for originals. Typed unknown so callers cannot skip validation.
   * Validated as Wave1OriginalCategory; missing/invalid fails. NEVER default to invoice.
   */
  category: unknown;
  sizeBytes: number;
};

/**
 * Structured identity is populated only when the original is durable.
 * Derivatives and failures must leave these fields null.
 */
export type GrinEvidenceUploadResult = {
  ok: boolean;
  originalDurable: boolean;
  generation: string | null;
  retryable: boolean;
  evidenceId: string | null;
  receiptId: string | null;
  ledgerId: string | null;
  category: Wave1OriginalCategory | null;
  claimedSha256: string | null;
  actualSha256: string | null;
  reservationId: string | null;
};

/**
 * INJECTED: host supplies Team 2 storage adapter.
 * FAKE: tests supply an in-process stand-in.
 */
export type GrinEvidenceUploadPort = {
  portKind: GrinPortKind;
  upload(input: GrinEvidenceUploadInput): Promise<GrinEvidenceUploadResult>;
};
