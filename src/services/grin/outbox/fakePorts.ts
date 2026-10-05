import type {
  GrinConfirmedProjection,
  GrinDeny,
  GrinMutationResult,
  GrinMutationSuccess,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
  GrinRegisterSuccess,
  GrinStoredCommandResult,
} from "@/goodsEvidence/ports";
import { buildOriginalStoragePath, isWave1OriginalCategory } from "@/goodsEvidence/evidence";
import type {
  GrinEvidenceUploadInput,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
  GrinMutationEnvelope,
  GrinServerCommandPort,
} from "./ports";
import { nonDurableEvidenceUploadResult } from "./ports";
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
  holdNextRead: Promise<void> | null;
  failNextRead: boolean;
  dropNextResponse: boolean;
  throwNonNetworkAfterCommit: boolean;
  reconcileCalls: number;
  readReceiptCalls: number;
  denyCode: Extract<GrinRegisterResult, { ok: false }>["code"] | null;
  waitUntilRegisterEntered(): Promise<void>;
  waitUntilMutateEntered(): Promise<void>;
  waitUntilReadEntered(): Promise<void>;
  refreshEnteredWait(): void;
  setConfirmedProjection(uid: string, ledgerId: string, confirmed: GrinConfirmedProjection): void;
};

export function createFakeGrinServerPort(opts?: { mutate?: boolean; readReceipt?: boolean }): FakeGrinServerPort {
  const commands = new Map<string, StoredCommand>();
  const receipts = new Map<string, string>();
  const serials = new Map<string, number>();
  const projections = new Map<string, GrinConfirmedProjection>();
  let notifyEntered: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });
  let notifyMutateEntered: () => void = () => undefined;
  let mutateEntered = new Promise<void>((resolve) => {
    notifyMutateEntered = resolve;
  });
  let notifyReadEntered: () => void = () => undefined;
  let readEntered = new Promise<void>((resolve) => {
    notifyReadEntered = resolve;
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

  function armReadEntered(): void {
    readEntered = new Promise<void>((resolve) => {
      notifyReadEntered = resolve;
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
    holdNextRead: null,
    failNextRead: false,
    dropNextResponse: false,
    throwNonNetworkAfterCommit: false,
    reconcileCalls: 0,
    readReceiptCalls: 0,
    denyCode: null,
    waitUntilRegisterEntered() {
      return entered;
    },
    waitUntilMutateEntered() {
      return mutateEntered;
    },
    waitUntilReadEntered() {
      return readEntered;
    },
    refreshEnteredWait() {
      armEntered();
      armMutateEntered();
      armReadEntered();
    },
    setConfirmedProjection(uid, ledgerId, confirmed) {
      projections.set(receiptKey(uid, ledgerId, confirmed.receiptId), confirmed);
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
      if (opts?.readReceipt) {
        const original = { receiptId, schemaVersion: 1, ledgerId, ownerUid: uid };
        projections.set(rKey, {
          receiptId,
          eventVersion: result.eventVersion,
          headHash: result.headHash,
          original: original as GrinConfirmedProjection["original"],
          events: [
            {
              schemaVersion: 1,
              eventId: `gevt_${commandId}`,
              receiptId,
              streamSequence: 1,
              type: "receipt_registered",
              actorUid: uid,
              serverAcceptedAtUtc: result.serverRegisteredAtUtc,
              clientObservedAtUtc: result.serverRegisteredAtUtc,
              reason: "issued",
              expectedPreviousVersion: 0,
              typedChanges: {},
              previousHash: null,
              eventHash: result.headHash,
              firestoreCommitTime: null,
            },
          ],
          effective: original as GrinConfirmedProjection["effective"],
        });
      }
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

  if (opts?.readReceipt) {
    port.readReceipt = async (input): Promise<GrinReceiptReadResult> => {
      notifyReadEntered();
      port.readReceiptCalls += 1;
      if (port.failNextRead) {
        port.failNextRead = false;
        throw new Error("lost_confirmation");
      }
      if (port.holdNextRead) await port.holdNextRead;
      if (port.denyCode) return deny(port.denyCode);
      const stored = projections.get(receiptKey(input.uid, input.ledgerId, input.receiptId));
      if (!stored) return deny("not_found");
      return { ok: true, confirmed: stored };
    };
  }

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
      const expectedVersion =
        body && typeof body === "object" && typeof (body as { expectedVersion?: unknown }).expectedVersion === "number"
          ? (body as { expectedVersion: number }).expectedVersion
          : 0;
      const rKey = receiptKey(uid, ledgerId, receiptId);
      const prior = projections.get(rKey);
      if (opts?.readReceipt && prior && prior.eventVersion !== expectedVersion) {
        return deny("version_conflict");
      }
      const nextVersion = prior ? prior.eventVersion + 1 : 1;
      const result: GrinMutationSuccess = {
        ok: true,
        replayed: false,
        receiptId,
        eventId: `gevt_${commandId}`,
        eventVersion: nextVersion,
        headHash: "b".repeat(64),
        serverAcceptedAtUtc: "2026-09-28T12:00:00.000Z",
      };
      commands.set(cmdKey(uid, ledgerId, commandId), {
        digest,
        receiptId,
        stored: { ...result, commandType: type },
      });
      if (opts?.readReceipt) {
        const original = prior?.original ?? ({ receiptId, schemaVersion: 1, ledgerId, ownerUid: uid } as GrinConfirmedProjection["original"]);
        const events = [...(prior?.events ?? []), {
          schemaVersion: 1,
          eventId: result.eventId,
          receiptId,
          streamSequence: nextVersion,
          type: type === "amendFields" ? "field_amended" : type === "recordQc" ? "qc_decision" : "ewb_observation_recorded",
          actorUid: uid,
          serverAcceptedAtUtc: result.serverAcceptedAtUtc,
          clientObservedAtUtc: result.serverAcceptedAtUtc,
          reason: "mutation",
          expectedPreviousVersion: expectedVersion,
          typedChanges: {},
          previousHash: prior?.headHash ?? null,
          eventHash: result.headHash,
          firestoreCommitTime: null,
        }];
        const effective = {
          ...(prior?.effective ?? original),
          remarks: type === "amendFields" ? { kind: "present", value: "amended" } : (prior?.effective as { remarks?: unknown } | undefined)?.remarks,
        } as GrinConfirmedProjection["effective"];
        projections.set(rKey, {
          receiptId,
          eventVersion: nextVersion,
          headHash: result.headHash,
          original,
          events: events as GrinConfirmedProjection["events"],
          effective,
        });
      }
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
  return nonDurableEvidenceUploadResult(retryable, generation);
}

function derivativeResult(ok: boolean, generation: string | null): GrinEvidenceUploadResult {
  return {
    ...nonDurableEvidenceUploadResult(!ok, generation),
    ok,
    originalDurable: false,
  };
}

function durableOriginalResult(input: GrinEvidenceUploadInput, extras?: Partial<GrinEvidenceUploadResult>): GrinEvidenceUploadResult {
  const category = isWave1OriginalCategory(input.category) ? input.category : null;
  const objectKey = `${"testhostobjectkey".padEnd(16, "x")}${input.evidenceId}`.slice(0, 64);
  const claimed = input.claimedSha256;
  return {
    ok: true,
    originalDurable: true,
    generation: extras?.generation ?? "orig-gen-1",
    retryable: false,
    ownerUid: extras?.ownerUid ?? input.uid,
    mime: extras?.mime ?? "application/pdf",
    sizeBytes: extras?.sizeBytes ?? input.sizeBytes,
    storagePath: extras?.storagePath ?? buildOriginalStoragePath(input.uid, objectKey.replace(/[^A-Za-z0-9_-]/g, "x")),
    evidenceId: extras?.evidenceId ?? input.evidenceId,
    receiptId: extras?.receiptId ?? input.receiptId,
    ledgerId: extras?.ledgerId ?? input.ledgerId,
    category: extras?.category !== undefined ? extras.category : category,
    claimedSha256: extras?.claimedSha256 !== undefined ? extras.claimedSha256 : claimed,
    actualSha256: extras?.actualSha256 !== undefined ? extras.actualSha256 : claimed,
    reservationId: extras?.reservationId ?? `resv_${input.evidenceId}`,
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
  nextOriginalResult: GrinEvidenceUploadResult | null;
  originalResultPatch: Partial<GrinEvidenceUploadResult> | null;
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
    nextOriginalResult: null,
    originalResultPatch: null,
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
      if (port.nextOriginalResult) {
        const next = port.nextOriginalResult;
        port.nextOriginalResult = null;
        return next;
      }
      const patch = port.originalResultPatch;
      if (port.mismatchOriginalIdentity) {
        return durableOriginalResult(input, {
          evidenceId: "ev_other",
          reservationId: "resv_mismatch",
          generation: "orig-gen-mismatch",
          ...patch,
        });
      }
      return durableOriginalResult(input, patch ?? undefined);
    },
  };
  return port;
}
