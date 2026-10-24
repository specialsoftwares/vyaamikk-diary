import type { GrinCommandType, GrinConfirmedProjection } from "@/goodsEvidence/ports";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import type { GrinDispatchSession, GrinLocalReceiptView } from "@/services/grin/outbox/types";

export type GrinMutationQueueInput = {
  ledgerId: string;
  receiptId: string;
  commandType: Exclude<GrinCommandType, "registerGoodsReceipt">;
  body: unknown;
  commandId?: string;
};

/**
 * Optional Team 3 methods. Repository never invents them on GrinOutbox.
 * persistMutationAndQueue must not rewrite the register receipt payload.
 * getConfirmedProjection is the only allowed source of expectedVersion.
 */
export type GrinOutboxApplicationSurface = GrinOutbox & {
  listForOwnerAndLedger?(ownerUid: string, ledgerId: string): GrinLocalReceiptView[];
  persistMutationAndQueue?(
    session: GrinDispatchSession,
    input: {
      ledgerId: string;
      receiptId: string;
      type: GrinMutationQueueInput["commandType"];
      commandType?: GrinMutationQueueInput["commandType"];
      body: unknown;
      commandId?: string;
    }
  ): GrinLocalReceiptView;
  getConfirmedProjection?(
    ownerUid: string,
    ledgerId: string,
    receiptId: string
  ): GrinConfirmedProjection | null;
};

export function asApplicationOutbox(outbox: GrinOutbox): GrinOutboxApplicationSurface {
  return outbox as GrinOutboxApplicationSurface;
}
