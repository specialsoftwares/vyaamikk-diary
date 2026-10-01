import type { GrinRegisterResult, GrinRegisterSuccess } from "@/goodsEvidence/ports";
import type { GrinEvidenceUploadPort, GrinServerCommandPort } from "./ports";
import type { LocalEvidenceRole } from "./types";

type StoredCommand = {
  digest: string;
  receiptId: string;
  result: GrinRegisterSuccess;
};

export type FakeGrinServerPort = GrinServerCommandPort & {
  portKind: "FAKE";
  serialsIssued: number;
  holdNextRegister: Promise<void> | null;
  dropNextResponse: boolean;
  denyCode: Extract<GrinRegisterResult, { ok: false }>["code"] | null;
  waitUntilRegisterEntered(): Promise<void>;
};

export function createFakeGrinServerPort(): FakeGrinServerPort {
  const commands = new Map<string, StoredCommand>();
  const receipts = new Map<string, string>();
  const serials = new Map<string, number>();
  let notifyEntered: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });

  function cmdKey(uid: string, ledgerId: string, commandId: string): string {
    return `${uid}/${ledgerId}/${commandId}`;
  }
  function receiptKey(uid: string, ledgerId: string, receiptId: string): string {
    return `${uid}/${ledgerId}/${receiptId}`;
  }
  function deny(code: Extract<GrinRegisterResult, { ok: false }>["code"]): GrinRegisterResult {
    return { ok: false, code, detail: "denied" };
  }

  const port: FakeGrinServerPort = {
    portKind: "FAKE",
    serialsIssued: 0,
    holdNextRegister: null,
    dropNextResponse: false,
    denyCode: null,
    waitUntilRegisterEntered() {
      return entered;
    },
    async register(input) {
      notifyEntered();
      if (port.holdNextRegister) await port.holdNextRegister;
      if (port.denyCode) return deny(port.denyCode);

      const { uid } = input;
      const { commandId, ledgerId, body } = input.envelope;
      const receiptId =
        body && typeof body === "object" && typeof (body as { receiptId?: unknown }).receiptId === "string"
          ? (body as { receiptId: string }).receiptId
          : "";
      const digest = input.digest;
      const existing = commands.get(cmdKey(uid, ledgerId, commandId));
      if (existing) {
        if (existing.digest !== digest) return deny("digest_conflict");
        return { ...existing.result, replayed: true };
      }
      const rKey = receiptKey(uid, ledgerId, receiptId);
      if (receipts.has(rKey)) return deny("receipt_exists");

      const serialKey = `${uid}/${ledgerId}`;
      const next = (serials.get(serialKey) ?? 0) + 1;
      serials.set(serialKey, next);
      port.serialsIssued += 1;
      const result: GrinRegisterSuccess = {
        ok: true,
        replayed: false,
        receiptId,
        issuedNumber: `GRIN/MAIN/FY2026-27/${String(next).padStart(6, "0")}`,
        serial: next,
        serverRegisteredAtUtc: "2026-09-28T12:00:00.000Z",
        eventVersion: 1,
        headHash: "a".repeat(64),
      };
      commands.set(cmdKey(uid, ledgerId, commandId), { digest, receiptId, result });
      receipts.set(rKey, commandId);
      if (port.dropNextResponse) {
        port.dropNextResponse = false;
        const err = new Error("lost_server_response");
        (err as { code?: string }).code = "network_ambiguous";
        throw err;
      }
      return result;
    },
    async reconcile(input) {
      if (port.denyCode && port.denyCode !== "not_found") return deny(port.denyCode);
      const stored = commands.get(cmdKey(input.uid, input.ledgerId, input.commandId));
      if (!stored) return deny("not_found");
      return { ...stored.result, replayed: true };
    },
  };
  return port;
}

export type FakeEvidenceUploadPort = GrinEvidenceUploadPort & {
  portKind: "FAKE";
  originalAttempts: number;
  thumbnailSuccesses: number;
  metadataSuccesses: number;
};

export function createFakeEvidenceUploadPort(opts?: { failOriginalTimes?: number }): FakeEvidenceUploadPort {
  let remainingOriginalFails = opts?.failOriginalTimes ?? 0;
  const port: FakeEvidenceUploadPort = {
    portKind: "FAKE",
    originalAttempts: 0,
    thumbnailSuccesses: 0,
    metadataSuccesses: 0,
    async upload(input) {
      if (input.role === "thumbnail") {
        port.thumbnailSuccesses += 1;
        return { ok: true, originalDurable: false, generation: "thumb-gen", retryable: false };
      }
      if (input.role === "metadata") {
        port.metadataSuccesses += 1;
        return { ok: true, originalDurable: false, generation: "meta-gen", retryable: false };
      }
      port.originalAttempts += 1;
      if (remainingOriginalFails > 0) {
        remainingOriginalFails -= 1;
        return { ok: false, originalDurable: false, generation: null, retryable: true };
      }
      return { ok: true, originalDurable: true, generation: "orig-gen-1", retryable: false };
    },
  };
  return port;
}
