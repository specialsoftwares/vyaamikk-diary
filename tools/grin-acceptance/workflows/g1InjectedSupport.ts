import { freezeCommand } from "@/goodsEvidence/command";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";

export const G1_QA_NOW = Date.UTC(2026, 8, 28, 12, 0, 0, 0);

export function g1FixedClock(utcMs = G1_QA_NOW) {
  const clock = { seq: 0, nowMs: () => utcMs, uuid: () => `id_${++clock.seq}` };
  return clock;
}

export function g1RegisterEnvelope(
  ownerUid: string,
  ledgerId: string,
  commandId: string,
  receiptId: string
) {
  const frozen = freezeCommand({
    commandId,
    type: "registerGoodsReceipt",
    ownerUid,
    ledgerId,
    body: sampleRegisterBody({ receiptId }),
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}

export function g1MutationEnvelope(
  ownerUid: string,
  ledgerId: string,
  commandId: string,
  type: "amendFields" | "dispatchReturn",
  body: Record<string, unknown>
) {
  const frozen = freezeCommand({
    commandId,
    type,
    ownerUid,
    ledgerId,
    body,
  });
  return {
    commandId: frozen.commandId,
    type: frozen.type,
    ownerUid: frozen.ownerUid,
    ledgerId: frozen.ledgerId,
    body: frozen.body,
    digest: frozen.digest,
  };
}
