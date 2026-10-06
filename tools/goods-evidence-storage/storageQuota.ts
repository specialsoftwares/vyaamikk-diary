/**
 * Per-account GRIN cloud storage accounting.
 *
 * Proposed GiB caps are PROPOSED_PENDING_OWNER_CONFIRMATION — economics HOLD
 * for advertising (see docs/release/proposals/team2/STORAGE_ECONOMICS.md).
 * Alternative pending owner approval: 256 MiB / 1 GiB / 5 GiB.
 *
 * Total retained per account (not per device, not monthly reset).
 * Originals and retained derivatives both count. Derivatives use a distinct
 * hold key and Storage path (`.../derivatives/{id}`).
 *
 * No overage fees. Never silent-delete. Cap refuse is the only write-path stop.
 * Admission never silently repairs a corrupt accounting document.
 *
 * Hold keys encode ledgerId + evidenceId + kind (see encodeStorageHoldKey).
 * Owner is the accounting document path. No live migration of v1 occupied-key
 * `original:{evidenceId}` keys — those documents are quota_state_invalid.
 */

export const GIB = 1024 * 1024 * 1024;

/** PROPOSED_PENDING_OWNER_CONFIRMATION — do not advertise these numbers. */
export const PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES = {
  free: 0,
  starter: 1 * GIB,
  professional: 5 * GIB,
  business: 20 * GIB,
} as const;

/** Owner-approval alternative from STORAGE_ECONOMICS.md — not wired as the live cap. */
export const OWNER_ALTERNATIVE_STORAGE_CAPS_BYTES = {
  free: 0,
  starter: 256 * 1024 * 1024,
  professional: 1 * GIB,
  business: 5 * GIB,
} as const;

export const STORAGE_WARN_80 = 0.8;
export const STORAGE_WARN_95 = 0.95;

/**
 * Firestore documents are bounded (~1 MiB). The holds map is not indefinite scale.
 *
 * Size model (Firestore field-name + 32 B/field + nested map; 64-char ids):
 *   original hold ≈ 300–380 bytes; derivative hold ≈ 380–450 bytes.
 *   1 MiB / 450 ≈ 2,300–2,600 entries before a document-size write failure.
 *
 * Intended 15 MiB-PDF workload at the proposed 20 GiB cap:
 *   floor(20 GiB / 15 MiB) = 1,365 originals. 1,365 < 2,500, so the byte cap
 *   is reached first for that workload (with ~150–200 KiB document headroom).
 *
 * 10 MiB images filling 20 GiB = 2,048 originals — still under this bound.
 * Tiny files, or 8 derivatives × 1,365 originals (~12k holds), hit this bound
 * before the byte cap. Fail closed; do not redesign the document in this slice.
 *
 * 2,500 is the smallest reviewable integer that keeps the 15 MiB-PDF-at-20-GiB
 * originals workload (and a 10 MiB-image fill plus a few in-flight holds)
 * inside the ~1 MiB document with margin. Not a product file-count SKU.
 */
export const MAX_STORAGE_HOLDS = 2500;

export const STORAGE_HOLD_KEY_VERSION = 1 as const;

const HOLD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DERIVATIVE_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type StorageHoldKind = "original" | "derivative";
export type StorageHoldPhase = "reserved" | "retained";

export type OriginalHoldIdentity = {
  kind: "original";
  ledgerId: string;
  evidenceId: string;
};

export type DerivativeHoldIdentity = {
  kind: "derivative";
  ledgerId: string;
  evidenceId: string;
  derivativeKey: string;
};

export type StorageHoldIdentity = OriginalHoldIdentity | DerivativeHoldIdentity;

export type StorageHold = {
  kind: StorageHoldKind;
  bytes: number;
  phase: StorageHoldPhase;
};

export type StorageAccountingDoc = {
  schemaVersion: 1;
  reservedOriginalBytes: number;
  retainedOriginalBytes: number;
  reservedDerivativeBytes: number;
  retainedDerivativeBytes: number;
  holds: Record<string, StorageHold>;
  updatedAtUtc: string;
};

export type StorageWarning = {
  level: "warn_80" | "warn_95";
  usedBytes: number;
  capBytes: number;
  percent: number;
};

export type StorageAdmission =
  | {
      ok: true;
      next: StorageAccountingDoc;
      warning: StorageWarning | null;
      overLimitRetained: boolean;
      replayed: boolean;
    }
  | { ok: false; code: "quota_exhausted"; usedBytes: number; capBytes: number }
  | { ok: false; code: "quota_state_invalid"; reason: string };

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function addSafeNonNegativeIntegers(a: number, b: number): number | null {
  if (!isNonNegativeSafeInteger(a) || !isNonNegativeSafeInteger(b)) return null;
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum < 0) return null;
  return sum;
}

function isHoldDocumentId(value: string): boolean {
  return HOLD_ID_RE.test(value) && !value.includes("/") && !value.includes(".") && !value.includes("\\");
}

function isDerivativeKeyId(value: string): boolean {
  return DERIVATIVE_KEY_RE.test(value) && isHoldDocumentId(value);
}

export function holdIdentityError(identity: StorageHoldIdentity): string | null {
  if (!isHoldDocumentId(identity.ledgerId) || identity.ledgerId.length < 1) {
    return "invalid_hold_ledger_id";
  }
  if (!isHoldDocumentId(identity.evidenceId) || identity.evidenceId.length < 1) {
    return "invalid_hold_evidence_id";
  }
  if (identity.kind === "derivative") {
    if (!isDerivativeKeyId(identity.derivativeKey)) return "invalid_hold_derivative_key";
  }
  return null;
}

function readLengthPrefixed(raw: string, index: number): { value: string; next: number } | null {
  let digitsEnd = index;
  while (digitsEnd < raw.length && raw.charCodeAt(digitsEnd) >= 48 && raw.charCodeAt(digitsEnd) <= 57) {
    digitsEnd += 1;
  }
  if (digitsEnd === index || digitsEnd >= raw.length || raw.charAt(digitsEnd) !== ".") return null;
  const len = Number(raw.slice(index, digitsEnd));
  if (!Number.isSafeInteger(len) || len < 1) return null;
  const valueStart = digitsEnd + 1;
  const valueEnd = valueStart + len;
  if (valueEnd > raw.length) return null;
  return { value: raw.slice(valueStart, valueEnd), next: valueEnd };
}

/**
 * Unambiguous length-prefixed hold key. IDs are already `[A-Za-z0-9_-]{1,64}`;
 * length prefixes still prevent separator collisions if that charset changes.
 *
 * original:   `1.o.{ledgerLen}.{ledgerId}.{evidenceLen}.{evidenceId}`
 * derivative: `1.d.{ledgerLen}.{ledgerId}.{evidenceLen}.{evidenceId}.{derivLen}.{derivativeKey}`
 */
export function encodeStorageHoldKey(identity: StorageHoldIdentity): string | null {
  if (holdIdentityError(identity)) return null;
  const head =
    identity.kind === "original"
      ? `${STORAGE_HOLD_KEY_VERSION}.o.`
      : `${STORAGE_HOLD_KEY_VERSION}.d.`;
  const body = `${identity.ledgerId.length}.${identity.ledgerId}.${identity.evidenceId.length}.${identity.evidenceId}`;
  if (identity.kind === "original") return `${head}${body}`;
  return `${head}${body}.${identity.derivativeKey.length}.${identity.derivativeKey}`;
}

export function parseStorageHoldKey(key: string): StorageHoldIdentity | null {
  if (typeof key !== "string" || key.length < 8) return null;
  const originalPrefix = `${STORAGE_HOLD_KEY_VERSION}.o.`;
  const derivativePrefix = `${STORAGE_HOLD_KEY_VERSION}.d.`;
  let kind: StorageHoldKind;
  let index: number;
  if (key.startsWith(originalPrefix)) {
    kind = "original";
    index = originalPrefix.length;
  } else if (key.startsWith(derivativePrefix)) {
    kind = "derivative";
    index = derivativePrefix.length;
  } else {
    return null;
  }
  const ledger = readLengthPrefixed(key, index);
  if (!ledger || key.charAt(ledger.next) !== ".") return null;
  const evidence = readLengthPrefixed(key, ledger.next + 1);
  if (!evidence) return null;
  if (kind === "original") {
    if (evidence.next !== key.length) return null;
    const identity: OriginalHoldIdentity = {
      kind: "original",
      ledgerId: ledger.value,
      evidenceId: evidence.value,
    };
    return holdIdentityError(identity) ? null : identity;
  }
  if (key.charAt(evidence.next) !== ".") return null;
  const derivative = readLengthPrefixed(key, evidence.next + 1);
  if (!derivative || derivative.next !== key.length) return null;
  const identity: DerivativeHoldIdentity = {
    kind: "derivative",
    ledgerId: ledger.value,
    evidenceId: evidence.value,
    derivativeKey: derivative.value,
  };
  return holdIdentityError(identity) ? null : identity;
}

export function originalHoldKey(ledgerId: string, evidenceId: string): string {
  const key = encodeStorageHoldKey({ kind: "original", ledgerId, evidenceId });
  if (!key) throw new Error("invalid_hold_identity");
  return key;
}

export function derivativeHoldKey(
  ledgerId: string,
  evidenceId: string,
  derivativeKey: string
): string {
  const key = encodeStorageHoldKey({
    kind: "derivative",
    ledgerId,
    evidenceId,
    derivativeKey,
  });
  if (!key) throw new Error("invalid_hold_identity");
  return key;
}

export function identitiesEquivalent(a: StorageHoldIdentity, b: StorageHoldIdentity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.ledgerId !== b.ledgerId || a.evidenceId !== b.evidenceId) return false;
  if (a.kind === "derivative" && b.kind === "derivative") {
    return a.derivativeKey === b.derivativeKey;
  }
  return true;
}

export function emptyStorageAccounting(updatedAtUtc: string): StorageAccountingDoc {
  return {
    schemaVersion: 1,
    reservedOriginalBytes: 0,
    retainedOriginalBytes: 0,
    reservedDerivativeBytes: 0,
    retainedDerivativeBytes: 0,
    holds: Object.create(null) as Record<string, StorageHold>,
    updatedAtUtc,
  };
}

type HoldTotals =
  | {
      ok: true;
      reservedOriginalBytes: number;
      retainedOriginalBytes: number;
      reservedDerivativeBytes: number;
      retainedDerivativeBytes: number;
    }
  | { ok: false; reason: string };

function totalHolds(holds: Record<string, StorageHold>): HoldTotals {
  let reservedOriginalBytes = 0;
  let retainedOriginalBytes = 0;
  let reservedDerivativeBytes = 0;
  let retainedDerivativeBytes = 0;
  for (const [key, hold] of Object.entries(holds)) {
    const identity = parseStorageHoldKey(key);
    if (!identity) return { ok: false, reason: "unparseable_hold_key" };
    if (identity.kind !== hold.kind) return { ok: false, reason: "hold_kind_mismatch" };
    if (!isNonNegativeSafeInteger(hold.bytes)) return { ok: false, reason: "invalid_hold_bytes" };
    const bucket =
      hold.kind === "original"
        ? hold.phase === "reserved"
          ? "reservedOriginalBytes"
          : "retainedOriginalBytes"
        : hold.phase === "reserved"
          ? "reservedDerivativeBytes"
          : "retainedDerivativeBytes";
    const current =
      bucket === "reservedOriginalBytes"
        ? reservedOriginalBytes
        : bucket === "retainedOriginalBytes"
          ? retainedOriginalBytes
          : bucket === "reservedDerivativeBytes"
            ? reservedDerivativeBytes
            : retainedDerivativeBytes;
    const next = addSafeNonNegativeIntegers(current, hold.bytes);
    if (next == null) return { ok: false, reason: "hold_sum_overflow" };
    if (bucket === "reservedOriginalBytes") reservedOriginalBytes = next;
    else if (bucket === "retainedOriginalBytes") retainedOriginalBytes = next;
    else if (bucket === "reservedDerivativeBytes") reservedDerivativeBytes = next;
    else retainedDerivativeBytes = next;
  }
  return {
    ok: true,
    reservedOriginalBytes,
    retainedOriginalBytes,
    reservedDerivativeBytes,
    retainedDerivativeBytes,
  };
}

function countersMatchTotals(doc: StorageAccountingDoc, totals: Extract<HoldTotals, { ok: true }>): boolean {
  return (
    doc.reservedOriginalBytes === totals.reservedOriginalBytes &&
    doc.retainedOriginalBytes === totals.retainedOriginalBytes &&
    doc.reservedDerivativeBytes === totals.reservedDerivativeBytes &&
    doc.retainedDerivativeBytes === totals.retainedDerivativeBytes
  );
}

export function accountingConsistencyError(doc: StorageAccountingDoc): string | null {
  if (
    !isNonNegativeSafeInteger(doc.reservedOriginalBytes) ||
    !isNonNegativeSafeInteger(doc.retainedOriginalBytes) ||
    !isNonNegativeSafeInteger(doc.reservedDerivativeBytes) ||
    !isNonNegativeSafeInteger(doc.retainedDerivativeBytes)
  ) {
    return "invalid_counter";
  }
  const holdCount = Object.keys(doc.holds).length;
  if (holdCount > MAX_STORAGE_HOLDS) return "holds_map_at_capacity";
  const totals = totalHolds(doc.holds);
  if (!totals.ok) return totals.reason;
  if (!countersMatchTotals(doc, totals)) return "counter_hold_mismatch";
  return null;
}

export function parseStorageAccounting(
  raw: Record<string, unknown> | undefined
): StorageAccountingDoc | null | { malformed: true; reason: string } {
  if (raw == null) return null;
  if (raw.schemaVersion !== 1) return { malformed: true, reason: "schema_version" };
  const holdsRaw = raw.holds;
  if (holdsRaw == null || typeof holdsRaw !== "object" || Array.isArray(holdsRaw)) {
    return { malformed: true, reason: "holds_shape" };
  }
  const holds = Object.create(null) as Record<string, StorageHold>;
  for (const [key, value] of Object.entries(holdsRaw as Record<string, unknown>)) {
    const identity = parseStorageHoldKey(key);
    if (!identity) return { malformed: true, reason: "unparseable_hold_key" };
    if (!key || typeof value !== "object" || value == null || Array.isArray(value)) {
      return { malformed: true, reason: "hold_shape" };
    }
    const rec = value as Record<string, unknown>;
    if (rec.kind !== "original" && rec.kind !== "derivative") {
      return { malformed: true, reason: "hold_kind" };
    }
    if (rec.kind !== identity.kind) return { malformed: true, reason: "hold_kind_mismatch" };
    if (rec.phase !== "reserved" && rec.phase !== "retained") {
      return { malformed: true, reason: "hold_phase" };
    }
    if (!isNonNegativeSafeInteger(rec.bytes)) return { malformed: true, reason: "invalid_hold_bytes" };
    holds[key] = { kind: rec.kind, bytes: rec.bytes, phase: rec.phase };
  }
  if (typeof raw.updatedAtUtc !== "string" || !raw.updatedAtUtc) {
    return { malformed: true, reason: "updated_at" };
  }
  if (
    !isNonNegativeSafeInteger(raw.reservedOriginalBytes) ||
    !isNonNegativeSafeInteger(raw.retainedOriginalBytes) ||
    !isNonNegativeSafeInteger(raw.reservedDerivativeBytes) ||
    !isNonNegativeSafeInteger(raw.retainedDerivativeBytes)
  ) {
    return { malformed: true, reason: "invalid_counter" };
  }
  const doc: StorageAccountingDoc = {
    schemaVersion: 1,
    reservedOriginalBytes: raw.reservedOriginalBytes,
    retainedOriginalBytes: raw.retainedOriginalBytes,
    reservedDerivativeBytes: raw.reservedDerivativeBytes,
    retainedDerivativeBytes: raw.retainedDerivativeBytes,
    holds,
    updatedAtUtc: raw.updatedAtUtc,
  };
  const consistency = accountingConsistencyError(doc);
  if (consistency) return { malformed: true, reason: consistency };
  return doc;
}

export function chargedStorageBytes(doc: StorageAccountingDoc): number {
  const a = addSafeNonNegativeIntegers(doc.reservedOriginalBytes, doc.retainedOriginalBytes);
  const b = addSafeNonNegativeIntegers(doc.reservedDerivativeBytes, doc.retainedDerivativeBytes);
  if (a == null || b == null) return Number.NaN;
  const total = addSafeNonNegativeIntegers(a, b);
  return total == null ? Number.NaN : total;
}

export function storageCapBytesFromStatus(
  statusData: Record<string, unknown> | undefined,
  statusExists: boolean
): number | "enforcement_off" {
  if (!statusExists) return "enforcement_off";
  if (statusData?.quotaEnforcementEnabled !== true) return "enforcement_off";
  const entitled = statusData.entitlementActive === true;
  const plan = entitled ? statusData.plan : "free";
  if (plan === "starter") return PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.starter;
  if (plan === "professional") {
    return PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.professional;
  }
  if (plan === "business") return PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.business;
  return PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES.free;
}

export function storageWarningFor(usedBytes: number, capBytes: number): StorageWarning | null {
  if (capBytes <= 0) return null;
  if (!Number.isFinite(usedBytes) || !Number.isFinite(capBytes)) return null;
  const percent = usedBytes / capBytes;
  if (percent >= STORAGE_WARN_95) {
    return { level: "warn_95", usedBytes, capBytes, percent };
  }
  if (percent >= STORAGE_WARN_80) {
    return { level: "warn_80", usedBytes, capBytes, percent };
  }
  return null;
}

function recount(doc: StorageAccountingDoc, updatedAtUtc: string): StorageAccountingDoc | { malformed: true; reason: string } {
  const totals = totalHolds(doc.holds);
  if (!totals.ok) return { malformed: true, reason: totals.reason };
  return {
    schemaVersion: 1,
    reservedOriginalBytes: totals.reservedOriginalBytes,
    retainedOriginalBytes: totals.retainedOriginalBytes,
    reservedDerivativeBytes: totals.reservedDerivativeBytes,
    retainedDerivativeBytes: totals.retainedDerivativeBytes,
    holds: doc.holds,
    updatedAtUtc,
  };
}

export function cloneAccounting(doc: StorageAccountingDoc): StorageAccountingDoc {
  return {
    ...doc,
    holds: { ...doc.holds },
  };
}

function holdMatchesReservation(
  hold: StorageHold,
  identity: StorageHoldIdentity,
  bytes: number
): boolean {
  return hold.kind === identity.kind && hold.bytes === bytes;
}

export function admitStorageReservation(params: {
  existing: StorageAccountingDoc | null;
  identity: StorageHoldIdentity;
  bytes: number;
  capBytes: number;
  updatedAtUtc: string;
  replay?: boolean;
}): StorageAdmission {
  if (!isPositiveSafeInteger(params.bytes)) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_reservation_bytes" };
  }
  if (holdIdentityError(params.identity)) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_hold_identity" };
  }
  const holdKey = encodeStorageHoldKey(params.identity);
  if (!holdKey) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_hold_identity" };
  }
  if (params.existing) {
    const consistency = accountingConsistencyError(params.existing);
    if (consistency) {
      return { ok: false, code: "quota_state_invalid", reason: consistency };
    }
  }
  const current = params.existing
    ? cloneAccounting(params.existing)
    : emptyStorageAccounting(params.updatedAtUtc);
  const prior = current.holds[holdKey];
  if (prior) {
    if (!holdMatchesReservation(prior, params.identity, params.bytes)) {
      return { ok: false, code: "quota_state_invalid", reason: "hold_conflict" };
    }
    if (!params.replay) {
      return { ok: false, code: "quota_state_invalid", reason: "hold_conflict" };
    }
    const used = chargedStorageBytes(current);
    if (!isNonNegativeSafeInteger(used)) {
      return { ok: false, code: "quota_state_invalid", reason: "invalid_counter" };
    }
    return {
      ok: true,
      next: current,
      warning: storageWarningFor(used, params.capBytes),
      overLimitRetained: params.capBytes >= 0 && used > params.capBytes,
      replayed: true,
    };
  }
  if (params.replay) {
    const used = chargedStorageBytes(current);
    if (!isNonNegativeSafeInteger(used)) {
      return { ok: false, code: "quota_state_invalid", reason: "invalid_counter" };
    }
    return {
      ok: true,
      next: current,
      warning: storageWarningFor(used, params.capBytes),
      overLimitRetained: params.capBytes >= 0 && used > params.capBytes,
      replayed: true,
    };
  }
  const holdCount = Object.keys(current.holds).length;
  if (holdCount >= MAX_STORAGE_HOLDS) {
    return { ok: false, code: "quota_state_invalid", reason: "holds_map_at_capacity" };
  }
  const usedNow = chargedStorageBytes(current);
  if (!isNonNegativeSafeInteger(usedNow)) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_counter" };
  }
  const projected = addSafeNonNegativeIntegers(usedNow, params.bytes);
  if (projected == null) {
    return { ok: false, code: "quota_state_invalid", reason: "hold_sum_overflow" };
  }
  if (params.capBytes >= 0 && projected > params.capBytes) {
    return { ok: false, code: "quota_exhausted", usedBytes: usedNow, capBytes: params.capBytes };
  }
  current.holds[holdKey] = {
    kind: params.identity.kind,
    bytes: params.bytes,
    phase: "reserved",
  };
  const next = recount(current, params.updatedAtUtc);
  if ("malformed" in next) {
    return { ok: false, code: "quota_state_invalid", reason: next.reason };
  }
  const used = chargedStorageBytes(next);
  if (!isNonNegativeSafeInteger(used)) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_counter" };
  }
  return {
    ok: true,
    next,
    warning: storageWarningFor(used, params.capBytes),
    overLimitRetained: false,
    replayed: false,
  };
}

export function retainStorageHold(
  existing: StorageAccountingDoc,
  identity: StorageHoldIdentity,
  actualBytes: number,
  updatedAtUtc: string
): StorageAccountingDoc | { malformed: true; reason: string } {
  const consistency = accountingConsistencyError(existing);
  if (consistency) return { malformed: true, reason: consistency };
  if (holdIdentityError(identity)) return { malformed: true, reason: "invalid_hold_identity" };
  if (!isNonNegativeSafeInteger(actualBytes)) return { malformed: true, reason: "invalid_hold_bytes" };
  const holdKey = encodeStorageHoldKey(identity);
  if (!holdKey) return { malformed: true, reason: "invalid_hold_identity" };
  const current = cloneAccounting(existing);
  const hold = current.holds[holdKey];
  if (!hold) return { malformed: true, reason: "hold_missing" };
  if (hold.kind !== identity.kind) return { malformed: true, reason: "hold_conflict" };
  current.holds[holdKey] = {
    kind: hold.kind,
    bytes: actualBytes,
    phase: "retained",
  };
  return recount(current, updatedAtUtc);
}

export function releaseReservedHold(
  existing: StorageAccountingDoc,
  identity: StorageHoldIdentity,
  updatedAtUtc: string
): StorageAccountingDoc | { malformed: true; reason: string } {
  const consistency = accountingConsistencyError(existing);
  if (consistency) return { malformed: true, reason: consistency };
  if (holdIdentityError(identity)) return { malformed: true, reason: "invalid_hold_identity" };
  const holdKey = encodeStorageHoldKey(identity);
  if (!holdKey) return { malformed: true, reason: "invalid_hold_identity" };
  const current = cloneAccounting(existing);
  const hold = current.holds[holdKey];
  if (hold && hold.kind !== identity.kind) return { malformed: true, reason: "hold_conflict" };
  if (hold && hold.phase === "reserved") {
    delete current.holds[holdKey];
  }
  return recount(current, updatedAtUtc);
}

export type StorageInventoryItem = {
  identity: StorageHoldIdentity;
  bytes: number;
  phase: StorageHoldPhase;
};

/** Rebuild counters from an inventory. Does not delete evidence. Never called from admission. */
export function repairStorageAccounting(
  inventory: StorageInventoryItem[],
  updatedAtUtc: string
): StorageAccountingDoc | { malformed: true; reason: string } {
  if (!Array.isArray(inventory)) return { malformed: true, reason: "inventory_shape" };
  if (inventory.length > MAX_STORAGE_HOLDS) {
    return { malformed: true, reason: "holds_map_at_capacity" };
  }
  const holds = Object.create(null) as Record<string, StorageHold>;
  for (const item of inventory) {
    if (!item || holdIdentityError(item.identity)) {
      return { malformed: true, reason: "invalid_hold_identity" };
    }
    if (item.identity.kind !== "original" && item.identity.kind !== "derivative") {
      return { malformed: true, reason: "hold_kind" };
    }
    if (item.phase !== "reserved" && item.phase !== "retained") {
      return { malformed: true, reason: "hold_phase" };
    }
    if (!isNonNegativeSafeInteger(item.bytes)) return { malformed: true, reason: "invalid_hold_bytes" };
    const holdKey = encodeStorageHoldKey(item.identity);
    if (!holdKey) return { malformed: true, reason: "invalid_hold_identity" };
    if (Object.prototype.hasOwnProperty.call(holds, holdKey)) {
      return { malformed: true, reason: "duplicate_hold" };
    }
    holds[holdKey] = { kind: item.identity.kind, bytes: item.bytes, phase: item.phase };
  }
  return recount(
    {
      schemaVersion: 1,
      reservedOriginalBytes: 0,
      retainedOriginalBytes: 0,
      reservedDerivativeBytes: 0,
      retainedDerivativeBytes: 0,
      holds,
      updatedAtUtc,
    },
    updatedAtUtc
  );
}
