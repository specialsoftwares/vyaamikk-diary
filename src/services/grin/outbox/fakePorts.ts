import type {
  GrinDeny,
  GrinMutationResult,
  GrinMutationSuccess,
  GrinReconcileResult,
  GrinRegisterResult,
  GrinRegisterSuccess,
  GrinStoredCommandResult,
} from "@/goodsEvidence/ports";
import { isWave1OriginalCategory } from "@/goodsEvidence/evidence";
import type {
  GrinEvidenceUploadInput,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
  GrinMutationEnvelope,
  GrinServerCommandPort,
} from "./ports";
import type { LocalEvidenceRole } from "./types";

type StoredCommand = {
  digest: string;
  receiptId: string;
  stored: GrinStoredCommandResult;
};

export type FakeGrinServerPort = GrinServerCommandPort & {
  portKind: "FAKE";
  serialsIssued: number;
  holdNextRegister: Promise<void> | null;
  holdNextMutate: Promise<void> | null;
  dropNextResponse: boolean;
  throwNonNetworkAfterCommit: boolean;
  reconcileCalls: number;
  denyCode: Extract<GrinRegisterResult, { ok: false }>["code"] | null;
  waitUntilRegisterEntered(): Promise<void>;
  waitUntilMutateEntered(): Promise<void>;
  refreshEnteredWait(): void;
};

export function createFakeGrinServerPort(opts?: { mutate?: boolean }): FakeGrinServerPort {
  const commands = new Map<string, StoredCommand>();
  const receipts = new Map<string, string>();
  const serials = new Map<string, number>();
  let notifyEntered: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });
  let notifyMutateEntered: () => void = () => undefined;
  let mutateEntered = new Promise<void>((resolve) => {
    notifyMutateEntered = resolve;
  });

  function armEntered(): void {
    entered = new Promise<void>((resolve) => {
      notifyEntered = resolve;
    });
  }

  function armMutateEntered(): void {
    mutateEntered = new Promise<void>((resolve) => {
      notifyMutateEntered = resolve;
    });
  }

  function cmdKey(uid: string, ledgerId: string, commandId: string): string {
    return `${uid}/${ledgerId}/${commandId}`;
  }
  function receiptKey(uid: string, ledgerId: string, receiptId: string): string {
    return `${uid}/${ledgerId}/${receiptId}`;
  }
  function deny(code: GrinDeny["code"]): GrinDeny {
    return { ok: false, code, detail: "denied" };
  }

  const port: FakeGrinServerPort = {
    portKind: "FAKE",
    serialsIssued: 0,
    holdNextRegister: null,
    holdNextMutate: null,
    dropNextResponse: false,
    throwNonNetworkAfterCommit: false,
    reconcileCalls: 0,
    denyCode: null,
    waitUntilRegisterEntered() {
      return entered;
    },
    waitUntilMutateEntered() {
      return mutateEntered;
    },
    refreshEnteredWait() {
      armEntered();
      armMutateEntered();
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
        if (existing.stored.commandType !== "registerGoodsReceipt") return deny("integrity");
        return { ...existing.stored, replayed: true };
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
      const stored: GrinStoredCommandResult = { ...result, commandType: "registerGoodsReceipt" };
      commands.set(cmdKey(uid, ledgerId, commandId), { digest, receiptId, stored });
      receipts.set(rKey, commandId);
      if (port.dropNextResponse) {
        port.dropNextResponse = false;
        const err = new Error("lost_server_response");
        (err as { code?: string }).code = "network_ambiguous";
        throw err;
      }
      if (port.throwNonNetworkAfterCommit) {
        port.throwNonNetworkAfterCommit = false;
        throw new TypeError("clock_failure");
      }
      return result;
    },
    async reconcile(input): Promise<GrinReconcileResult> {
      port.reconcileCalls += 1;
      if (port.denyCode && port.denyCode !== "not_found") return deny(port.denyCode);
      const stored = commands.get(cmdKey(input.uid, input.ledgerId, input.commandId));
      if (!stored) return deny("not_found");
      return { ...stored.stored, replayed: true };
    },
  };

  if (opts?.mutate) {
    port.mutate = async (input): Promise<GrinMutationResult> => {
      notifyMutateEntered();
      if (port.holdNextMutate) await port.holdNextMutate;
      if (port.denyCode) return deny(port.denyCode);
      const { uid, digest } = input;
      const envelope: GrinMutationEnvelope = input.envelope;
      const { commandId, ledgerId, body, type } = envelope;
      const receiptId =
        body && typeof body === "object" && typeof (body as { receiptId?: unknown }).receiptId === "string"
          ? (body as { receiptId: string }).receiptId
          : "";
      const existing = commands.get(cmdKey(uid, ledgerId, commandId));
      if (existing) {
        if (existing.digest !== digest) return deny("digest_conflict");
        if (existing.stored.commandType === "registerGoodsReceipt") return deny("integrity");
        return { ...existing.stored, replayed: true };
      }
      const result: GrinMutationSuccess = {
        ok: true,
        replayed: false,
        receiptId,
        eventId: `gevt_${commandId}`,
        eventVersion: 1,
        headHash: "b".repeat(64),
        serverAcceptedAtUtc: "2026-09-28T12:00:00.000Z",
      };
      commands.set(cmdKey(uid, ledgerId, commandId), {
        digest,
        receiptId,
        stored: { ...result, commandType: type },
      });
      if (port.dropNextResponse) {
        port.dropNextResponse = false;
        const err = new Error("lost_server_response");
        (err as { code?: string }).code = "network_ambiguous";
        throw err;
      }
      if (port.throwNonNetworkAfterCommit) {
        port.throwNonNetworkAfterCommit = false;
        throw new TypeError("clock_failure");
      }
      return result;
    };
  }

  return port;
}

function notDurableResult(retryable: boolean, generation: string | null = null): GrinEvidenceUploadResult {
  return {
    ok: false,
    originalDurable: false,
    generation,
    retryable,
    evidenceId: null,
    receiptId: null,
    ledgerId: null,
    category: null,
    claimedSha256: null,
    actualSha256: null,
    reservationId: null,
  };
}

function derivativeResult(ok: boolean, generation: string | null): GrinEvidenceUploadResult {
  return {
    ok,
    originalDurable: false,
    generation,
    retryable: !ok,
    evidenceId: null,
    receiptId: null,
    ledgerId: null,
    category: null,
    claimedSha256: null,
    actualSha256: null,
    reservationId: null,
  };
}

export type FakeEvidenceUploadPort = GrinEvidenceUploadPort & {
  portKind: "FAKE";
  originalAttempts: number;
  thumbnailSuccesses: number;
  metadataSuccesses: number;
  holdNextUpload: Promise<void> | null;
  holdUploadRole: LocalEvidenceRole | null;
  failNextDerivative: boolean;
  mismatchOriginalIdentity: boolean;
  remainingOriginalFails: number;
  waitUntilUploadEntered(): Promise<void>;
  refreshUploadEnteredWait(): void;
};

export function createFakeEvidenceUploadPort(opts?: { failOriginalTimes?: number }): FakeEvidenceUploadPort {
  let notifyEntered: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });

  function armEntered(): void {
    entered = new Promise<void>((resolve) => {
      notifyEntered = resolve;
    });
  }

  const port: FakeEvidenceUploadPort = {
    portKind: "FAKE",
    originalAttempts: 0,
    thumbnailSuccesses: 0,
    metadataSuccesses: 0,
    holdNextUpload: null,
    holdUploadRole: null,
    failNextDerivative: false,
    mismatchOriginalIdentity: false,
    remainingOriginalFails: opts?.failOriginalTimes ?? 0,
    waitUntilUploadEntered() {
      return entered;
    },
    refreshUploadEnteredWait() {
      armEntered();
    },
    async upload(input: GrinEvidenceUploadInput) {
      const shouldHold = port.holdNextUpload && (port.holdUploadRole == null || port.holdUploadRole === input.role);
      if (shouldHold) notifyEntered();
      if (shouldHold && port.holdNextUpload) await port.holdNextUpload;

      if (input.role === "thumbnail" || input.role === "metadata") {
        if (port.failNextDerivative) {
          port.failNextDerivative = false;
          return derivativeResult(false, null);
        }
        if (input.role === "thumbnail") port.thumbnailSuccesses += 1;
        else port.metadataSuccesses += 1;
        return derivativeResult(true, input.role === "thumbnail" ? "thumb-gen" : "meta-gen");
      }

      if (!isWave1OriginalCategory(input.category)) {
        return notDurableResult(false);
      }
      port.originalAttempts += 1;
      if (port.remainingOriginalFails > 0) {
        port.remainingOriginalFails -= 1;
        return notDurableResult(true);
      }
      const claimed = input.claimedSha256;
      if (port.mismatchOriginalIdentity) {
        return {
          ok: true,
          originalDurable: true,
          generation: "orig-gen-mismatch",
          retryable: false,
          evidenceId: "ev_other",
          receiptId: input.receiptId,
          ledgerId: input.ledgerId,
          category: input.category,
          claimedSha256: claimed,
          actualSha256: claimed,
          reservationId: "resv_mismatch",
        };
      }
      return {
        ok: true,
        originalDurable: true,
        generation: "orig-gen-1",
        retryable: false,
        evidenceId: input.evidenceId,
        receiptId: input.receiptId,
        ledgerId: input.ledgerId,
        category: input.category,
        claimedSha256: claimed,
        actualSha256: claimed,
        reservationId: `resv_${input.evidenceId}`,
      };
    },
  };
  return port;
}
