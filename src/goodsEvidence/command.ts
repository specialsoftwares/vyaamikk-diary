import { sha256Hex } from "@/utils/sha256Hex";

import { canonicalJson } from "./canonical";
import type { Quantity } from "./quantities";
import type { EwbLink } from "./ewb";
import type {
  AcknowledgementState,
  BuyerIdentitySnapshot,
  CaptureProvenance,
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
  | "voidWithReason";

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
  const digest = sha256Hex(
    canonicalJson({
      body: command.body,
      commandId: command.commandId,
      ledgerId: command.ledgerId,
      ownerUid: command.ownerUid,
      type: command.type,
    })
  );
  return { ...command, digest };
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
  captureProvenance: CaptureProvenance;
  buyer: BuyerIdentitySnapshot;
  supplier: SupplierSnapshot;
  commercial: CommercialLinks;
  ewb: EwbLink;
  transport: TransportSnapshot;
  lines: ReceiptLine[];
  custody: CustodyState;
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

export interface VoidWithReasonBody {
  receiptId: string;
  expectedVersion: number;
  reason: string;
  linkedReceiptId: string | null;
  clientObservedAtUtc: string;
}
