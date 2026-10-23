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

export type RestoreAuthoritySource = {
  configured: boolean;
  read(): Promise<RestoreAuthoritySnapshot | null>;
};

let sourceForTests: RestoreAuthoritySource | null = null;

export function setRestoreAuthoritySourceForTests(source: RestoreAuthoritySource | null): void {
  sourceForTests = source;
}

/** Live named database. Unset means the authority infrastructure is not deployed. */
export function restoreAuthorityDatabaseId(): string | null {
  const id = process.env.RESTORE_AUTHORITY_DATABASE_ID?.trim();
  return id ? id : null;
}

export async function readConfiguredRestoreAuthority(): Promise<{
  configured: boolean;
  snapshot: RestoreAuthoritySnapshot | null;
}> {
  if (sourceForTests) {
    return { configured: sourceForTests.configured, snapshot: await sourceForTests.read() };
  }
  const databaseId = restoreAuthorityDatabaseId();
  if (!databaseId) return { configured: false, snapshot: null };
  try {
    const { getApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const snap = await getFirestore(getApp(), databaseId).doc("authority/restore").get();
    if (!snap.exists) return { configured: true, snapshot: null };
    const data = snap.data() ?? {};
    const watermark = Number(data.watermark);
    const erasedUids = Array.isArray(data.erasedUids) ? data.erasedUids.filter((uid) => typeof uid === "string") : [];
    const withdrawnPurposes = data.withdrawnPurposes && typeof data.withdrawnPurposes === "object"
      ? data.withdrawnPurposes as Record<string, readonly string[]>
      : {};
    if (!Number.isSafeInteger(watermark)) return { configured: true, snapshot: null };
    return { configured: true, snapshot: { watermark, erasedUids, withdrawnPurposes } };
  } catch {
    return { configured: true, snapshot: null };
  }
}
