import { canonicalJson } from "@/goodsEvidence/canonical";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import { sha256Hex } from "@/utils/sha256Hex";
import type { GrinCommandType } from "@/goodsEvidence/ports";

export type AdmittedCommand<TBody = unknown> = {
  commandId: string;
  type: GrinCommandType;
  ownerUid: string;
  ledgerId: string;
  body: TBody;
  digest: string;
};

export function freezeAdmittedCommand<TBody>(command: {
  commandId: string;
  type: GrinCommandType;
  ownerUid: string;
  ledgerId: string;
  body: TBody;
}): AdmittedCommand<TBody> {
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

export function digestConflict(
  frozen: Pick<AdmittedCommand, "digest">,
  candidate: { commandId: string; type: GrinCommandType; ownerUid: string; ledgerId: string; body: unknown }
): boolean {
  return freezeAdmittedCommand(candidate).digest !== frozen.digest;
}
