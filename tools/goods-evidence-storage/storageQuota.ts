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

export type StorageHoldKind = "original" | "derivative";
export type StorageHoldPhase = "reserved" | "retained";

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
    }
  | { ok: false; code: "quota_exhausted"; usedBytes: number; capBytes: number }
  | { ok: false; code: "quota_state_invalid"; reason: string };

export function originalHoldKey(evidenceId: string): string {
  return `original:${evidenceId}`;
}

export function derivativeHoldKey(derivativeKey: string): string {
  return `derivative:${derivativeKey}`;
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

export function parseStorageAccounting(
  raw: Record<string, unknown> | undefined
): StorageAccountingDoc | null | { malformed: true } {
  if (raw == null) return null;
  if (raw.schemaVersion !== 1) return { malformed: true };
  const holdsRaw = raw.holds;
  if (holdsRaw == null || typeof holdsRaw !== "object" || Array.isArray(holdsRaw)) {
    return { malformed: true };
  }
  const holds = Object.create(null) as Record<string, StorageHold>;
  for (const [key, value] of Object.entries(holdsRaw as Record<string, unknown>)) {
    if (!key || typeof value !== "object" || value == null || Array.isArray(value)) {
      return { malformed: true };
    }
    const rec = value as Record<string, unknown>;
    if (rec.kind !== "original" && rec.kind !== "derivative") return { malformed: true };
    if (rec.phase !== "reserved" && rec.phase !== "retained") return { malformed: true };
    if (typeof rec.bytes !== "number" || !Number.isInteger(rec.bytes) || rec.bytes < 0) {
      return { malformed: true };
    }
    holds[key] = { kind: rec.kind, bytes: rec.bytes, phase: rec.phase };
  }
  const doc: StorageAccountingDoc = {
    schemaVersion: 1,
    reservedOriginalBytes: numField(raw.reservedOriginalBytes),
    retainedOriginalBytes: numField(raw.retainedOriginalBytes),
    reservedDerivativeBytes: numField(raw.reservedDerivativeBytes),
    retainedDerivativeBytes: numField(raw.retainedDerivativeBytes),
    holds,
    updatedAtUtc: typeof raw.updatedAtUtc === "string" ? raw.updatedAtUtc : "",
  };
  if (
    doc.reservedOriginalBytes < 0 ||
    doc.retainedOriginalBytes < 0 ||
    doc.reservedDerivativeBytes < 0 ||
    doc.retainedDerivativeBytes < 0 ||
    !doc.updatedAtUtc
  ) {
    return { malformed: true };
  }
  return doc;
}

function numField(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : Number.NaN;
}

export function chargedStorageBytes(doc: StorageAccountingDoc): number {
  return (
    doc.reservedOriginalBytes +
    doc.retainedOriginalBytes +
    doc.reservedDerivativeBytes +
    doc.retainedDerivativeBytes
  );
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
  const percent = usedBytes / capBytes;
  if (percent >= STORAGE_WARN_95) {
    return { level: "warn_95", usedBytes, capBytes, percent };
  }
  if (percent >= STORAGE_WARN_80) {
    return { level: "warn_80", usedBytes, capBytes, percent };
  }
  return null;
}

function recount(doc: StorageAccountingDoc, updatedAtUtc: string): StorageAccountingDoc {
  let reservedOriginalBytes = 0;
  let retainedOriginalBytes = 0;
  let reservedDerivativeBytes = 0;
  let retainedDerivativeBytes = 0;
  for (const hold of Object.values(doc.holds)) {
    if (hold.kind === "original" && hold.phase === "reserved") reservedOriginalBytes += hold.bytes;
    if (hold.kind === "original" && hold.phase === "retained") retainedOriginalBytes += hold.bytes;
    if (hold.kind === "derivative" && hold.phase === "reserved") reservedDerivativeBytes += hold.bytes;
    if (hold.kind === "derivative" && hold.phase === "retained") retainedDerivativeBytes += hold.bytes;
  }
  return {
    schemaVersion: 1,
    reservedOriginalBytes,
    retainedOriginalBytes,
    reservedDerivativeBytes,
    retainedDerivativeBytes,
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

export function admitStorageReservation(params: {
  existing: StorageAccountingDoc | null;
  holdKey: string;
  kind: StorageHoldKind;
  bytes: number;
  capBytes: number;
  updatedAtUtc: string;
}): StorageAdmission {
  if (!Number.isInteger(params.bytes) || params.bytes < 1) {
    return { ok: false, code: "quota_state_invalid", reason: "invalid_reservation_bytes" };
  }
  const current = params.existing ? cloneAccounting(params.existing) : emptyStorageAccounting(params.updatedAtUtc);
  const prior = current.holds[params.holdKey];
  if (prior) {
    const used = chargedStorageBytes(current);
    return {
      ok: true,
      next: current,
      warning: storageWarningFor(used, params.capBytes),
      overLimitRetained: params.capBytes >= 0 && used > params.capBytes,
    };
  }
  const usedNow = chargedStorageBytes(current);
  if (params.capBytes >= 0 && usedNow + params.bytes > params.capBytes) {
    return { ok: false, code: "quota_exhausted", usedBytes: usedNow, capBytes: params.capBytes };
  }
  current.holds[params.holdKey] = {
    kind: params.kind,
    bytes: params.bytes,
    phase: "reserved",
  };
  const next = recount(current, params.updatedAtUtc);
  const used = chargedStorageBytes(next);
  return {
    ok: true,
    next,
    warning: storageWarningFor(used, params.capBytes),
    overLimitRetained: false,
  };
}

export function retainStorageHold(
  existing: StorageAccountingDoc,
  holdKey: string,
  actualBytes: number,
  updatedAtUtc: string
): StorageAccountingDoc | { malformed: true } {
  const current = cloneAccounting(existing);
  const hold = current.holds[holdKey];
  if (!hold) {
    current.holds[holdKey] = { kind: "original", bytes: actualBytes, phase: "retained" };
  } else {
    current.holds[holdKey] = {
      ...hold,
      bytes: Number.isInteger(actualBytes) && actualBytes >= 0 ? actualBytes : hold.bytes,
      phase: "retained",
    };
  }
  return recount(current, updatedAtUtc);
}

export function releaseReservedHold(
  existing: StorageAccountingDoc,
  holdKey: string,
  updatedAtUtc: string
): StorageAccountingDoc {
  const current = cloneAccounting(existing);
  const hold = current.holds[holdKey];
  if (hold && hold.phase === "reserved") {
    delete current.holds[holdKey];
  }
  return recount(current, updatedAtUtc);
}

export type StorageInventoryItem = {
  holdKey: string;
  kind: StorageHoldKind;
  bytes: number;
  phase: StorageHoldPhase;
};

/** Rebuild counters from an inventory. Does not delete evidence. */
export function repairStorageAccounting(
  inventory: StorageInventoryItem[],
  updatedAtUtc: string
): StorageAccountingDoc {
  const holds = Object.create(null) as Record<string, StorageHold>;
  for (const item of inventory) {
    if (!item.holdKey) continue;
    if (!Number.isInteger(item.bytes) || item.bytes < 0) continue;
    holds[item.holdKey] = { kind: item.kind, bytes: item.bytes, phase: item.phase };
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
