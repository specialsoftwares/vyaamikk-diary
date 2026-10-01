/**
 * INJECTED G1 server port for SQLITE_HOST interop.
 *
 * Wraps Team 1 `GoodsEvidenceRegisterAdapter` (or Team 1 `createInjectedGrinServerPort`
 * when that factory exists). Does not mint GRIN numbers, allocate serials, or
 * copy domain admission rules. App `src/services` must not import this module.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import type { GrinCommandType, GrinMutationResult, GrinReconcileResult, GrinRegisterResult } from "@/goodsEvidence/ports";
import type { GrinMutationEnvelope, GrinServerCommandPort } from "@/services/grin/outbox/ports";
import { GoodsEvidenceRegisterAdapter } from "../goods-evidence-emulator/adapter";
import { commandPath } from "../goods-evidence-emulator/paths";
import type { InjectedStore } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock, G1CommandResult, TrustedCaller } from "../goods-evidence-emulator/types";

export const INJECTED_PORT = "INJECTED_PORT" as const;

const MUTATION_TYPES: ReadonlySet<GrinMutationEnvelope["type"]> = new Set([
  "amendFields",
  "recordQc",
  "dispatchReturn",
  "correctReturnDispatch",
  "voidWithReason",
  "recordEwbObservation",
  "linkVerifiedEvidence",
]);

export type InjectedGrinServerPort = GrinServerCommandPort & {
  portKind: "INJECTED";
  portSource: string;
  registerCalls: number;
  reconcileCalls: number;
};

export type InjectedPortDeps = {
  store: InjectedStore;
  clock: G1Clock;
};

function registerEnvelope(uid: string, envelope: { commandId: string; type: string; ledgerId: string; body: unknown }) {
  return {
    commandId: envelope.commandId,
    type: envelope.type,
    ownerUid: uid,
    ledgerId: envelope.ledgerId,
    body: envelope.body,
  };
}

function storedCommandType(store: InjectedStore, uid: string, ledgerId: string, commandId: string): string | undefined {
  const raw = store.snapshot.get(commandPath(uid, ledgerId, commandId));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : undefined;
  } catch {
    return undefined;
  }
}

function toReconcileResult(result: G1CommandResult, storedType: string | undefined): GrinReconcileResult {
  if (!result.ok) return result;
  if ("issuedNumber" in result) {
    return { ...result, commandType: "registerGoodsReceipt" };
  }
  if (storedType && storedType !== "registerGoodsReceipt" && MUTATION_TYPES.has(storedType as GrinMutationEnvelope["type"])) {
    return { ...result, commandType: storedType as Exclude<GrinCommandType, "registerGoodsReceipt"> };
  }
  return { ok: false, code: "integrity", detail: "reconcile_result_missing_command_type" };
}

function wrapAdapter(deps: InjectedPortDeps): InjectedGrinServerPort {
  const adapter = new GoodsEvidenceRegisterAdapter(deps.store, deps.clock);
  const port: InjectedGrinServerPort = {
    portKind: "INJECTED",
    portSource: "wrap:GoodsEvidenceRegisterAdapter",
    registerCalls: 0,
    reconcileCalls: 0,
    async register(input): Promise<GrinRegisterResult> {
      port.registerCalls += 1;
      const caller: TrustedCaller = { uid: input.uid };
      // Adapter recomputes digest. Do not forward the local digest as a server field.
      return adapter.register(caller, registerEnvelope(input.uid, input.envelope));
    },
    async reconcile(input): Promise<GrinReconcileResult> {
      port.reconcileCalls += 1;
      const caller: TrustedCaller = { uid: input.uid };
      const result = await adapter.reconcile(caller, {
        ledgerId: input.ledgerId,
        commandId: input.commandId,
      });
      return toReconcileResult(
        result,
        storedCommandType(deps.store, input.uid, input.ledgerId, input.commandId)
      );
    },
    async mutate(input): Promise<GrinMutationResult> {
      const caller: TrustedCaller = { uid: input.uid };
      const envelope = registerEnvelope(input.uid, input.envelope);
      switch (input.envelope.type) {
        case "amendFields":
          return adapter.amendFields(caller, envelope);
        case "recordQc":
          return adapter.recordQc(caller, envelope);
        case "dispatchReturn":
          return adapter.dispatchReturn(caller, envelope);
        case "correctReturnDispatch":
          return adapter.correctReturnDispatch(caller, envelope);
        case "voidWithReason":
          return adapter.voidWithReason(caller, envelope);
        case "recordEwbObservation":
          return adapter.recordEwbObservation(caller, envelope);
        case "linkVerifiedEvidence":
          return adapter.linkVerifiedEvidence(caller, envelope);
        default:
          return { ok: false, code: "invalid", detail: "unsupported mutation type" };
      }
    },
  };
  return port;
}

function isInjectedPort(value: unknown): value is GrinServerCommandPort {
  if (value == null || typeof value !== "object") return false;
  const port = value as GrinServerCommandPort;
  return (
    port.portKind === "INJECTED" &&
    typeof port.register === "function" &&
    typeof port.reconcile === "function"
  );
}

async function tryTeam1Port(deps: InjectedPortDeps): Promise<InjectedGrinServerPort | null> {
  const emulatorDir = join(dirname(fileURLToPath(import.meta.url)), "../goods-evidence-emulator");
  const candidates = ["injectedGrinServerPort.ts", "serverPort.ts", "createInjectedGrinServerPort.ts"];
  for (const name of candidates) {
    const file = join(emulatorDir, name);
    if (!existsSync(file)) continue;
    const spec = pathToFileURL(file).href;
    const mod = (await import(spec)) as {
      createInjectedGrinServerPort?: (input: InjectedPortDeps) => GrinServerCommandPort | Promise<GrinServerCommandPort>;
    };
    if (typeof mod.createInjectedGrinServerPort !== "function") continue;
    const created = await mod.createInjectedGrinServerPort(deps);
    if (!isInjectedPort(created)) continue;
    const counted: InjectedGrinServerPort = {
      portKind: "INJECTED",
      portSource: `team1:${name}`,
      registerCalls: 0,
      reconcileCalls: 0,
      async register(input) {
        counted.registerCalls += 1;
        return created.register(input);
      },
      async reconcile(input) {
        counted.reconcileCalls += 1;
        return created.reconcile(input);
      },
      mutate: created.mutate ? (input) => created.mutate!(input) : undefined,
    };
    return counted;
  }
  return null;
}

export async function createInjectedGrinServerPort(deps: InjectedPortDeps): Promise<InjectedGrinServerPort> {
  const team1 = await tryTeam1Port(deps);
  if (team1) return team1;
  return wrapAdapter(deps);
}

export function lastIssuedSerialTotal(store: InjectedStore, uid: string, ledgerId: string): number {
  const prefix = `users/${uid}/goodsEvidenceLedgers/${ledgerId}/serials/`;
  let total = 0;
  for (const [path, raw] of store.snapshot) {
    if (!path.startsWith(prefix)) continue;
    try {
      const data = JSON.parse(raw) as { lastIssuedSerial?: unknown };
      if (typeof data.lastIssuedSerial === "number") total += data.lastIssuedSerial;
    } catch {
      // ignore unreadable serial docs; the adapter would have failed closed
    }
  }
  return total;
}

export function persistedReceiptCount(store: InjectedStore, uid: string, ledgerId: string): number {
  const prefix = `users/${uid}/goodsEvidenceLedgers/${ledgerId}/receipts/`;
  let n = 0;
  for (const path of store.snapshot.keys()) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.length > 0 && !rest.includes("/")) n += 1;
  }
  return n;
}

export function storedIssuedNumber(
  store: InjectedStore,
  uid: string,
  ledgerId: string,
  commandId: string
): string | null {
  const raw = store.snapshot.get(commandPath(uid, ledgerId, commandId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { result?: { issuedNumber?: unknown } };
    return typeof parsed.result?.issuedNumber === "string" ? parsed.result.issuedNumber : null;
  } catch {
    return null;
  }
}
