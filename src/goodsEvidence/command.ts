import { sha256Hex } from "@/utils/sha256Hex";

import { canonicalJson } from "./canonical";
import { cloneSnapshot } from "./snapshot";
import type { Quantity } from "./quantities";
import type { EwbLink } from "./ewb";
import type { VerifiedEvidenceResult } from "./ports";
import type {
  AcknowledgementState,
  BuyerIdentitySnapshot,
  CaptureProvenance,
  ReportedArrivalPrecision,
  CommercialLinks,
  CustodyState,
  OptionalText,
  QcStatus,
  ReceiptLine,
  SupplierSnapshot,
  TransportSnapshot,
} from "./types";

export type GoodsCommandType =
  | "registerGoodsReceipt"
  | "amendFields"
  | "recordQc"
  | "dispatchReturn"
  | "correctReturnDispatch"
  | "voidWithReason"
  | "recordEwbObservation"
  | "linkVerifiedEvidence";

export const MUTATION_COMMAND_TYPES = [
  "amendFields",
  "recordQc",
  "dispatchReturn",
  "correctReturnDispatch",
  "voidWithReason",
  "recordEwbObservation",
  "linkVerifiedEvidence",
] as const;

export type MutationCommandType = (typeof MUTATION_COMMAND_TYPES)[number];

export interface CommandEnvelope<TBody> {
  commandId: string;
  type: GoodsCommandType;
  ownerUid: string;
  ledgerId: string;
  body: TBody;
}

export interface FrozenCommand<TBody> extends CommandEnvelope<TBody> {
  digest: string;
}

export function freezeCommand<TBody>(command: CommandEnvelope<TBody>): FrozenCommand<TBody> {
  const body = cloneSnapshot(command.body);
  const digest = sha256Hex(
    canonicalJson({
      body,
      commandId: command.commandId,
      ledgerId: command.ledgerId,
      ownerUid: command.ownerUid,
      type: command.type,
    })
  );
  return {
    commandId: command.commandId,
    type: command.type,
    ownerUid: command.ownerUid,
    ledgerId: command.ledgerId,
    body,
    digest,
  };
}

export function assertFrozenUnchanged<TBody>(
  frozen: FrozenCommand<TBody>,
  candidate: CommandEnvelope<TBody>
): { ok: true } | { ok: false; code: "digest_conflict" } {
  const next = freezeCommand(candidate);
  if (next.digest === frozen.digest) return { ok: true };
  return { ok: false, code: "digest_conflict" };
}

export interface RegisterGoodsReceiptBody {
  receiptId: string;
  series: string;
  capturedAtClientUtc: string;
  reportedArrivalAt: string;
  reportedArrivalTimeZone: string;
  /** Optional; absent = legacy opaque timestamp. New clients should set explicitly. */
  reportedArrivalPrecision?: ReportedArrivalPrecision;
  captureProvenance: CaptureProvenance;
  buyer: BuyerIdentitySnapshot;
  supplier: SupplierSnapshot;
  commercial: CommercialLinks;
  ewb: EwbLink;
  transport: TransportSnapshot;
  lines: ReceiptLine[];
  custody: CustodyState;
  warehouse: OptionalText;
  locationBin: OptionalText;
  receivingEmployeeAttributed: OptionalText;
  qualityCheckedByAttributed: OptionalText;
  remarks: OptionalText;
  acknowledgement: AcknowledgementState;
  clientObservedAtUtc: string;
}

export interface AmendFieldsBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  claimedOldValues?: Record<string, unknown>;
  changes: Record<string, unknown>;
  clientObservedAtUtc: string;
}

export interface RecordQcBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  qcStatus: QcStatus;
  clientObservedAtUtc: string;
}

export interface DispatchReturnBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  lineId: string;
  returnQty: Quantity;
  clientObservedAtUtc: string;
}

export interface CorrectReturnDispatchBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  lineId: string;
  linkedEventId: string;
  correctionQty: Quantity;
  clientObservedAtUtc: string;
}

export interface VoidWithReasonBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  linkedReceiptId: string | null;
  clientObservedAtUtc: string;
}

export type EwbObservationChannel = "portal" | "movement" | "qc" | "replacement";

export interface RecordEwbObservationBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  clientObservedAtUtc: string;
  channel: EwbObservationChannel;
  observation: unknown;
}

export interface LinkVerifiedEvidenceBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  clientObservedAtUtc: string;
  /** Team 2 verified result. Adapter persists a link event; it does not hash bytes. */
  verified: VerifiedEvidenceResult;
}
