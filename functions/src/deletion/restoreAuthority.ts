/**
 * Restore admission. The authority snapshot is not the database being restored.
 * A missing, stale, or unreachable authority keeps traffic closed.
 * An in-database erasure manifest is not this authority: a snapshot from
 * before deletion can omit it.
 */

export type RestoreAuthoritySnapshot = {
  watermark: number;
  erasedUids: readonly string[];
  withdrawnPurposes: Readonly<Record<string, readonly string[]>>;
};

/**
 * Claim decision for a custom token. The client does not supply the watermark.
 * Required mode stays inactive until this returns admit, so current phone tokens
 * keep working. An unavailable authority does not become an unmarked token.
 */
export function decideRestoreAdmission(input: {
  configured: boolean;
  authority: RestoreAuthoritySnapshot | null;
  closed: boolean;
  required: boolean;
  reconciled: boolean;
  localWatermark: number | null;
  uid: string;
  purpose?: string;
}): { status: "skip" | "admit" | "deny" | "unavailable"; authorityWatermark?: number } {
  if (input.closed) return { status: "deny" };
  // Required mode is not the trigger for the claim. A configured, open,
  // reconciled fence admits before required mode so existing custom tokens
  // can carry the watermark. An unconfigured authority still skips.
  if (!input.configured && !input.required) return { status: "skip" };
  if (!input.configured || !input.authority || input.localWatermark == null) {
    return { status: "unavailable" };
  }
  if (!input.reconciled) return input.required ? { status: "unavailable" } : { status: "skip" };
  const traffic = decideRestoreTraffic({
    authority: input.authority,
    localWatermark: input.localWatermark,
    uid: input.uid,
    purpose: input.purpose,
  });
  if (traffic === "deny") return { status: "deny" };
  return { status: "admit", authorityWatermark: input.localWatermark };
}

export function claimsForAdmission(
  base: Record<string, string | number | boolean>,
  admission: { status: string; authorityWatermark?: number }
): Record<string, string | number | boolean> {
  if (admission.status !== "admit" || !Number.isSafeInteger(admission.authorityWatermark)) return { ...base };
  return { ...base, authorityWatermark: admission.authorityWatermark as number };
}

/**
 * A restored primary that lacks either restore-control document cannot reopen
 * service. The external traffic and worker holds stay closed until an operator
 * rewrites both documents. This function does not open anything.
 */
export function restoreServiceCanReopen(input: {
  localFencePresent: boolean;
  localModePresent: boolean;
  externalTrafficClosed: boolean;
  workersStopped: boolean;
}): { open: false; reason: string } | { open: true } {
  if (!input.localFencePresent || !input.localModePresent) {
    return { open: false, reason: "restored_primary_missing_restore_control" };
  }
  if (input.externalTrafficClosed || input.workersStopped) {
    return { open: false, reason: "external_hold" };
  }
  return { open: true };
}

export function decideRestoreTraffic(input: {
  authority: RestoreAuthoritySnapshot | null;
  localWatermark: number | null;
  uid: string;
  purpose?: string;
}): "allow" | "deny" {
  if (!input.authority) return "deny";
  if (!Number.isSafeInteger(input.authority.watermark) || input.authority.watermark < 1) return "deny";
  if (input.localWatermark !== input.authority.watermark) return "deny";
  if (input.authority.erasedUids.includes(input.uid)) return "deny";
  const withdrawn = input.purpose ? input.authority.withdrawnPurposes[input.uid] ?? [] : [];
  if (input.purpose && withdrawn.includes(input.purpose)) return "deny";
  return "allow";
}

/** A malformed security snapshot is null. It must not become an empty allow-list. */
export function parseRestoreAuthoritySnapshot(data: unknown): RestoreAuthoritySnapshot | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const watermark = record.watermark;
  if (!Number.isSafeInteger(watermark) || Number(watermark) < 1) return null;
  if (!Array.isArray(record.erasedUids) || record.erasedUids.some((uid) => typeof uid !== "string" || uid.length === 0)) {
    return null;
  }
  if (!record.withdrawnPurposes || typeof record.withdrawnPurposes !== "object" || Array.isArray(record.withdrawnPurposes)) {
    return null;
  }
  const withdrawnPurposes: Record<string, readonly string[]> = {};
  for (const [uid, purposes] of Object.entries(record.withdrawnPurposes)) {
    if (!Array.isArray(purposes) || purposes.some((purpose) => typeof purpose !== "string" || purpose.length === 0)) {
      return null;
    }
    withdrawnPurposes[uid] = purposes;
  }
  return {
    watermark: Number(watermark),
    erasedUids: record.erasedUids,
    withdrawnPurposes,
  };
}

/**
 * The default database is the one a restore would replace. It cannot be the
 * outside authority, even if an operator sets the environment to it.
 */
export function outsideRestoreAuthorityDatabaseId(id: string | null | undefined): string | null {
  const trimmed = id?.trim() ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(trimmed)) return null;
  if (trimmed === "default") return null;
  const primary = process.env.FIRESTORE_DATABASE_ID?.trim() || "";
  if (primary && trimmed === primary) return null;
  return trimmed;
}

export type RestoreAuthoritySource = {
  configured: boolean;
  read(): Promise<RestoreAuthoritySnapshot | null>;
};

let sourceForTests: RestoreAuthoritySource | null = null;

export function setRestoreAuthoritySourceForTests(source: RestoreAuthoritySource | null): void {
  sourceForTests = source;
}

/** Live named database. Unset, default, or the primary database is not an outside authority. */
export function restoreAuthorityDatabaseId(): string | null {
  return outsideRestoreAuthorityDatabaseId(process.env.RESTORE_AUTHORITY_DATABASE_ID);
}

/** A set but invalid database id is configured and unusable, so admission denies. */
export function restoreAuthorityConfiguration(): { configured: boolean; databaseId: string | null } {
  const raw = process.env.RESTORE_AUTHORITY_DATABASE_ID?.trim() ?? "";
  if (!raw) return { configured: false, databaseId: null };
  return { configured: true, databaseId: outsideRestoreAuthorityDatabaseId(raw) };
}

/** Purpose names copied onto a deletion job. Empty or unsafe names are dropped. */
export function unionWithdrawnPurposes(
  existing: readonly string[] | undefined,
  incoming: readonly string[]
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const purpose of [...(existing ?? []), ...incoming]) {
    if (typeof purpose !== "string" || purpose.length === 0 || purpose.includes("/") || seen.has(purpose)) continue;
    seen.add(purpose);
    merged.push(purpose);
  }
  return merged;
}

/**
 * Appends an erasure or withdrawal to a snapshot that was already valid.
 * The watermark stays put. Existing uids and purposes are kept.
 */
export function mergeRestoreAuthorityProjection(
  existing: RestoreAuthoritySnapshot,
  uid: string,
  projection: { erase?: boolean; withdrawPurposes?: readonly string[] }
): RestoreAuthoritySnapshot {
  if (!uid || uid.includes("/") || uid.includes("..")) throw new Error("restore_authority_projection_failed");
  const erasedUids = [...existing.erasedUids];
  if (projection.erase && !erasedUids.includes(uid)) erasedUids.push(uid);
  const withdrawnPurposes: Record<string, readonly string[]> = {};
  for (const [key, purposes] of Object.entries(existing.withdrawnPurposes)) {
    withdrawnPurposes[key] = [...purposes];
  }
  const purposes = unionWithdrawnPurposes(withdrawnPurposes[uid], projection.withdrawPurposes ?? []);
  if (purposes.length > 0) withdrawnPurposes[uid] = purposes;
  const parsed = parseRestoreAuthoritySnapshot({ watermark: existing.watermark, erasedUids, withdrawnPurposes });
  if (!parsed || parsed.erasedUids.length < existing.erasedUids.length) {
    throw new Error("restore_authority_projection_failed");
  }
  return parsed;
}

export type RestoreAuthorityStore = {
  read(): Promise<unknown | null>;
  write(snapshot: RestoreAuthoritySnapshot): Promise<void>;
  /** Returns conflict when expected is no longer the stored snapshot. */
  compareAndSet?(expected: unknown, snapshot: RestoreAuthoritySnapshot): Promise<"stored" | "conflict">;
};

function canonicalAuthority(data: unknown): string | null {
  const parsed = parseRestoreAuthoritySnapshot(data);
  if (!parsed) return null;
  const erased = [...parsed.erasedUids].sort().join(",");
  const purposes = Object.keys(parsed.withdrawnPurposes).sort().map((uid) => {
    return `${uid}:${[...parsed.withdrawnPurposes[uid]].sort().join(",")}`;
  }).join(";");
  return `${parsed.watermark}|${erased}|${purposes}`;
}

let storeForTests: RestoreAuthorityStore | null = null;

export function setRestoreAuthorityStoreForTests(store: RestoreAuthorityStore | null): void {
  storeForTests = store;
}

/**
 * Durable write to the independent authority. Unset configuration skips.
 * A configured but invalid database, a missing seed document, or a malformed
 * snapshot throws and does not replace the document with an empty allow-list.
 * This does not create the database.
 */
export async function projectRestoreAuthority(
  uid: string,
  projection: { erase?: boolean; withdrawPurposes?: readonly string[] }
): Promise<"skipped" | "projected"> {
  if (!projection.erase && !(projection.withdrawPurposes && projection.withdrawPurposes.length > 0)) {
    throw new Error("restore_authority_projection_failed");
  }
  if (storeForTests) return writeProjection(uid, projection, storeForTests);
  const configuration = restoreAuthorityConfiguration();
  if (!configuration.configured) return "skipped";
  if (!configuration.databaseId) throw new Error("restore_authority_unprovisioned");
  const databaseId = configuration.databaseId;
  const { getApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const ref = getFirestore(getApp(), databaseId).doc("authority/restore");
  return writeProjection(uid, projection, {
    async read() {
      const snap = await ref.get();
      return snap.exists ? (snap.data() ?? null) : null;
    },
    async write(snapshot) {
      await ref.set(snapshot);
    },
    async compareAndSet(expected, snapshot) {
      let stored = false;
      await getFirestore(getApp(), databaseId).runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? (snap.data() ?? null) : null;
        if (canonicalAuthority(current) !== canonicalAuthority(expected)) {
          stored = false;
          return;
        }
        tx.set(ref, snapshot);
        stored = true;
      });
      return stored ? "stored" : "conflict";
    },
  });
}

async function writeProjection(
  uid: string,
  projection: { erase?: boolean; withdrawPurposes?: readonly string[] },
  store: RestoreAuthorityStore
): Promise<"projected"> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let raw: unknown | null;
    try {
      raw = await store.read();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("restore_authority_")) throw error;
      throw new Error("restore_authority_write_failed");
    }
    if (raw == null) throw new Error("restore_authority_unprovisioned");
    const existing = parseRestoreAuthoritySnapshot(raw);
    if (!existing) throw new Error("restore_authority_projection_failed");
    const next = mergeRestoreAuthorityProjection(existing, uid, projection);
    try {
      if (!store.compareAndSet) {
        await store.write(next);
        return "projected";
      }
      const outcome = await store.compareAndSet(raw, next);
      if (outcome === "stored") return "projected";
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("restore_authority_")) throw error;
      throw new Error("restore_authority_write_failed");
    }
  }
  throw new Error("restore_authority_write_failed");
}

export async function readConfiguredRestoreAuthority(): Promise<{
  configured: boolean;
  snapshot: RestoreAuthoritySnapshot | null;
}> {
  if (sourceForTests) {
    return { configured: sourceForTests.configured, snapshot: await sourceForTests.read() };
  }
  const configuration = restoreAuthorityConfiguration();
  if (!configuration.configured) return { configured: false, snapshot: null };
  const databaseId = configuration.databaseId;
  if (!databaseId) return { configured: true, snapshot: null };
  try {
    const { getApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const snap = await getFirestore(getApp(), databaseId).doc("authority/restore").get();
    if (!snap.exists) return { configured: true, snapshot: null };
    return { configured: true, snapshot: parseRestoreAuthoritySnapshot(snap.data()) };
  } catch {
    return { configured: true, snapshot: null };
  }
}
