import type { GrinCommandType } from "@/goodsEvidence/ports";
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
};

export function asApplicationOutbox(outbox: GrinOutbox): GrinOutboxApplicationSurface {
  return outbox as GrinOutboxApplicationSurface;
}
