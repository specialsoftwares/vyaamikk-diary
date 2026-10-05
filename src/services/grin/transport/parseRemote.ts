/**
 * Parse/validate remote GRIN callable payloads before durable acceptance.
 * Malformed success shapes are integrity denies. Never invent issued numbers.
 * Mobile-safe: no firebase-admin, HostSqlite, tools adapters, or node:fs.
 */

import type {
  GrinCommandType,
  GrinConfirmedProjection,
  GrinDeny,
  GrinDenyCode,
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
} from "@/goodsEvidence/ports";
import type { GrinEvent, ImmutableGrin } from "@/goodsEvidence/types";

const GENERIC_DENY = "denied" as const;

const DENY_CODES = new Set<GrinDenyCode>([
  "unauthenticated",
  "forbidden",
  "policy_denied",
  "not_found",
  "invalid",
  "digest_conflict",
  "receipt_exists",
  "integrity",
  "serial_exhausted",
  "version_conflict",
  "voided",
  "quota_exhausted",
  "quota_state_invalid",
]);

const MUTATION_COMMAND_TYPES = new Set<Exclude<GrinCommandType, "registerGoodsReceipt">>([
  "amendFields",
  "recordQc",
  "dispatchReturn",
  "correctReturnDispatch",
  "voidWithReason",
  "recordEwbObservation",
  "linkVerifiedEvidence",
]);

const SHA256_HEX = /^[a-f0-9]{64}$/;

export type GrinRemoteRegisterResult = GrinRegisterResult & {
  confirmed?: GrinConfirmedProjection;
};
export type GrinRemoteMutationResult = GrinMutationResult & {
  confirmed?: GrinConfirmedProjection;
};
export type GrinRemoteReconcileResult = GrinReconcileResult & {
  confirmed?: GrinConfirmedProjection;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function integrity(): GrinDeny {
  return { ok: false, code: "integrity", detail: GENERIC_DENY };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseGrinDeny(value: unknown): GrinDeny | null {
  if (!isPlainObject(value) || value.ok !== false) return null;
  if (typeof value.code !== "string" || !DENY_CODES.has(value.code as GrinDenyCode)) return null;
  if (typeof value.detail !== "string") return null;
  return { ok: false, code: value.code as GrinDenyCode, detail: value.detail };
}

function parseSnapshotIdentity(
  value: unknown,
  receiptId: string
): ImmutableGrin | null {
  if (!isPlainObject(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (value.receiptId !== receiptId) return null;
  if (!isNonEmptyString(value.ownerUid) || !isNonEmptyString(value.ledgerId)) return null;
  return value as unknown as ImmutableGrin;
}

function parseEvent(value: unknown, receiptId: string): GrinEvent | null {
  if (!isPlainObject(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (!isNonEmptyString(value.eventId)) return null;
  if (value.receiptId !== receiptId) return null;
  if (!isPositiveInt(value.streamSequence)) return null;
  if (!isNonEmptyString(value.type)) return null;
  if (!isNonEmptyString(value.actorUid)) return null;
  if (!isNonEmptyString(value.serverAcceptedAtUtc)) return null;
  if (!isNonEmptyString(value.clientObservedAtUtc)) return null;
  if (typeof value.reason !== "string") return null;
  if (typeof value.expectedPreviousVersion !== "number" || !Number.isInteger(value.expectedPreviousVersion)) {
    return null;
  }
  if (value.expectedPreviousVersion < 0) return null;
  if (!isPlainObject(value.typedChanges)) return null;
  if (value.previousHash !== null && !isSha256(value.previousHash)) return null;
  if (!isSha256(value.eventHash)) return null;
  if (value.firestoreCommitTime !== null && typeof value.firestoreCommitTime !== "string") return null;
  return value as unknown as GrinEvent;
}

export function parseGrinConfirmedProjection(
  value: unknown
): GrinConfirmedProjection | null {
  if (!isPlainObject(value)) return null;
  if (!isNonEmptyString(value.receiptId)) return null;
  if (!isPositiveInt(value.eventVersion)) return null;
  if (!isSha256(value.headHash)) return null;
  const original = parseSnapshotIdentity(value.original, value.receiptId);
  const effective = parseSnapshotIdentity(value.effective, value.receiptId);
  if (!original || !effective) return null;
  if (!Array.isArray(value.events)) return null;
  if (value.events.length !== value.eventVersion) return null;
  const events: GrinEvent[] = [];
  for (let i = 0; i < value.events.length; i++) {
    const event = parseEvent(value.events[i], value.receiptId);
    if (!event || event.streamSequence !== i + 1) return null;
    events.push(event);
  }
  const head = events[events.length - 1];
  if (!head || head.eventHash !== value.headHash) return null;
  return {
    receiptId: value.receiptId,
    eventVersion: value.eventVersion,
    headHash: value.headHash,
    original,
    events,
    effective,
  };
}

function parseOptionalConfirmed(
  value: Record<string, unknown>,
  expected: { receiptId: string; eventVersion: number; headHash: string }
): { ok: true; confirmed?: GrinConfirmedProjection } | { ok: false } {
  if (!("confirmed" in value) || value.confirmed === undefined) {
    return { ok: true };
  }
  const confirmed = parseGrinConfirmedProjection(value.confirmed);
  if (!confirmed) return { ok: false };
  if (
    confirmed.receiptId !== expected.receiptId ||
    confirmed.eventVersion !== expected.eventVersion ||
    confirmed.headHash !== expected.headHash
  ) {
    return { ok: false };
  }
  return { ok: true, confirmed };
}

export function parseGrinRegisterResult(value: unknown): GrinRemoteRegisterResult {
  const denied = parseGrinDeny(value);
  if (denied) return denied;
  if (!isPlainObject(value) || value.ok !== true) return integrity();
  if (typeof value.replayed !== "boolean") return integrity();
  if (!isNonEmptyString(value.receiptId)) return integrity();
  if (!isNonEmptyString(value.issuedNumber)) return integrity();
  if (!isPositiveInt(value.serial)) return integrity();
  if (!isNonEmptyString(value.serverRegisteredAtUtc)) return integrity();
  if (!isPositiveInt(value.eventVersion)) return integrity();
  if (!isSha256(value.headHash)) return integrity();
  const extra = parseOptionalConfirmed(value, {
    receiptId: value.receiptId,
    eventVersion: value.eventVersion,
    headHash: value.headHash,
  });
  if (!extra.ok) return integrity();
  return {
    ok: true,
    replayed: value.replayed,
    receiptId: value.receiptId,
    issuedNumber: value.issuedNumber,
    serial: value.serial,
    serverRegisteredAtUtc: value.serverRegisteredAtUtc,
    eventVersion: value.eventVersion,
    headHash: value.headHash,
    ...(extra.confirmed ? { confirmed: extra.confirmed } : {}),
  };
}

export function parseGrinMutationResult(value: unknown): GrinRemoteMutationResult {
  const denied = parseGrinDeny(value);
  if (denied) return denied;
  if (!isPlainObject(value) || value.ok !== true) return integrity();
  if (typeof value.issuedNumber === "string") return integrity();
  if (typeof value.replayed !== "boolean") return integrity();
  if (!isNonEmptyString(value.receiptId)) return integrity();
  if (!isNonEmptyString(value.eventId)) return integrity();
  if (!isPositiveInt(value.eventVersion)) return integrity();
  if (!isSha256(value.headHash)) return integrity();
  if (!isNonEmptyString(value.serverAcceptedAtUtc)) return integrity();
  const extra = parseOptionalConfirmed(value, {
    receiptId: value.receiptId,
    eventVersion: value.eventVersion,
    headHash: value.headHash,
  });
  if (!extra.ok) return integrity();
  return {
    ok: true,
    replayed: value.replayed,
    receiptId: value.receiptId,
    eventId: value.eventId,
    eventVersion: value.eventVersion,
    headHash: value.headHash,
    serverAcceptedAtUtc: value.serverAcceptedAtUtc,
    ...(extra.confirmed ? { confirmed: extra.confirmed } : {}),
  };
}

export function parseGrinReconcileResult(value: unknown): GrinRemoteReconcileResult {
  const denied = parseGrinDeny(value);
  if (denied) return denied;
  if (!isPlainObject(value) || value.ok !== true) return integrity();
  if (value.commandType === "registerGoodsReceipt") {
    const parsed = parseGrinRegisterResult(value);
    if (!parsed.ok) return parsed;
    return { ...parsed, commandType: "registerGoodsReceipt" };
  }
  if (typeof value.commandType === "string" && MUTATION_COMMAND_TYPES.has(value.commandType as Exclude<GrinCommandType, "registerGoodsReceipt">)) {
    const parsed = parseGrinMutationResult(value);
    if (!parsed.ok) return parsed;
    return { ...parsed, commandType: value.commandType as Exclude<GrinCommandType, "registerGoodsReceipt"> };
  }
  return integrity();
}

export function parseGrinReceiptReadResult(value: unknown): GrinReceiptReadResult {
  const denied = parseGrinDeny(value);
  if (denied) return denied;
  if (!isPlainObject(value) || value.ok !== true) return integrity();
  const confirmed = parseGrinConfirmedProjection(value.confirmed);
  if (!confirmed) return integrity();
  return { ok: true, confirmed };
}

export function mapCallableFailure(err: unknown): GrinDeny | null {
  if (err == null || typeof err !== "object" || !("code" in err)) return null;
  const code = String((err as { code: unknown }).code).toLowerCase();
  if (code.includes("unauthenticated")) {
    return { ok: false, code: "unauthenticated", detail: GENERIC_DENY };
  }
  if (
    code.includes("not-found") ||
    code.includes("unimplemented") ||
    code.includes("unavailable")
  ) {
    return { ok: false, code: "policy_denied", detail: GENERIC_DENY };
  }
  return null;
}
