/**
 * INJECTED GrinServerCommandPort wrapping GoodsEvidenceRegisterAdapter.
 *
 * TEST COMPOSITION only. Not a live callable. Do not import this module from
 * functions/src/index.ts or from mobile src/services/grin/transport.
 * Isolated from React, Expo, and the client goods-evidence admission flag.
 *
 * Client `digest` is the locally frozen outbox identity. This port recomputes
 * digest inside the adapter from the trusted uid + envelope and does not
 * forward the client digest as a server field.
 */

import type {
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
} from "../../src/goodsEvidence/ports";
import type {
  GrinMutationEnvelope,
  GrinRegisterEnvelope,
  GrinServerCommandPort,
} from "../../src/services/grin/outbox/ports";
import { GoodsEvidenceRegisterAdapter } from "./adapter";

export type InjectedGrinServerPort = GrinServerCommandPort & {
  portKind: "INJECTED";
  mutate: NonNullable<GrinServerCommandPort["mutate"]>;
  readReceipt(input: {
    uid: string;
    ledgerId: string;
    receiptId: string;
  }): Promise<GrinReceiptReadResult>;
};

function adapterEnvelope(
  envelope: GrinRegisterEnvelope | GrinMutationEnvelope
): { commandId: string; type: string; ledgerId: string; body: unknown } {
  return {
    commandId: envelope.commandId,
    type: envelope.type,
    ledgerId: envelope.ledgerId,
    body: envelope.body,
  };
}

function dispatchMutation(
  adapter: GoodsEvidenceRegisterAdapter,
  uid: string,
  envelope: GrinMutationEnvelope
): Promise<GrinMutationResult> {
  const caller = { uid };
  const command = adapterEnvelope(envelope);
  switch (envelope.type) {
    case "amendFields":
      return adapter.amendFields(caller, command);
    case "recordQc":
      return adapter.recordQc(caller, command);
    case "dispatchReturn":
      return adapter.dispatchReturn(caller, command);
    case "correctReturnDispatch":
      return adapter.correctReturnDispatch(caller, command);
    case "voidWithReason":
      return adapter.voidWithReason(caller, command);
    case "recordEwbObservation":
      return adapter.recordEwbObservation(caller, command);
    case "linkVerifiedEvidence":
      return adapter.linkVerifiedEvidence(caller, command);
    default: {
      const exhaustive: never = envelope.type;
      void exhaustive;
      return Promise.resolve({ ok: false, code: "invalid", detail: "denied" });
    }
  }
}

export function createInjectedGrinServerPort(adapter: GoodsEvidenceRegisterAdapter): InjectedGrinServerPort {
  const port: InjectedGrinServerPort = {
    portKind: "INJECTED",
    async register(input: {
      uid: string;
      envelope: GrinRegisterEnvelope;
      digest: string;
    }): Promise<GrinRegisterResult> {
      void input.digest;
      return adapter.register({ uid: input.uid }, adapterEnvelope(input.envelope));
    },
    async reconcile(input: {
      uid: string;
      ledgerId: string;
      commandId: string;
    }): Promise<GrinReconcileResult> {
      return adapter.reconcile(
        { uid: input.uid },
        { ledgerId: input.ledgerId, commandId: input.commandId }
      );
    },
    async mutate(input: {
      uid: string;
      envelope: GrinMutationEnvelope;
      digest: string;
    }): Promise<GrinMutationResult> {
      void input.digest;
      return dispatchMutation(adapter, input.uid, input.envelope);
    },
    async readReceipt(input: {
      uid: string;
      ledgerId: string;
      receiptId: string;
    }): Promise<GrinReceiptReadResult> {
      return adapter.readReceipt(
        { uid: input.uid },
        { ledgerId: input.ledgerId, receiptId: input.receiptId }
      );
    },
  };
  return port;
}
