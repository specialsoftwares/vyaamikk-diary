/**
 * Immutable issuer-identity snapshots for PDFs/records.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { DocumentFacingIdentity } from "@/onboarding/profileIdentityModel";

const PREFIX = "vyd_issuer_identity_snapshot_v1_";

export interface IssuerIdentitySnapshotRecord {
  uid: string;
  snapshotId: string;
  identity: DocumentFacingIdentity;
  /** Per-PDF disclosure defaults at snapshot time. */
  defaultShowMobile: boolean;
  defaultShowEmail: boolean;
}

function key(uid: string, snapshotId: string): string {
  return `${PREFIX}${uid}_${snapshotId}`;
}

function latestKey(uid: string): string {
  return `${PREFIX}latest_${uid}`;
}

export async function persistIssuerIdentitySnapshot(
  record: IssuerIdentitySnapshotRecord
): Promise<void> {
  await AsyncStorage.setItem(key(record.uid, record.snapshotId), JSON.stringify(record));
  await AsyncStorage.setItem(latestKey(record.uid), record.snapshotId);
}

export async function loadIssuerIdentitySnapshot(
  uid: string,
  snapshotId: string
): Promise<IssuerIdentitySnapshotRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(key(uid, snapshotId));
    if (!raw) return null;
    return JSON.parse(raw) as IssuerIdentitySnapshotRecord;
  } catch {
    return null;
  }
}

export async function loadLatestIssuerIdentitySnapshot(
  uid: string
): Promise<IssuerIdentitySnapshotRecord | null> {
  const id = await AsyncStorage.getItem(latestKey(uid));
  if (!id) return null;
  return loadIssuerIdentitySnapshot(uid, id);
}

/** Apply per-PDF toggles without mutating verified identity. */
export function applyPdfContactDisclosure(
  identity: DocumentFacingIdentity,
  opts: { showMobile: boolean; showEmail: boolean }
): Pick<DocumentFacingIdentity, "phoneE164" | "email"> & {
  phoneHidden: boolean;
  emailHidden: boolean;
} {
  return {
    phoneE164: opts.showMobile ? identity.phoneE164 : "",
    email: opts.showEmail ? identity.email : "",
    phoneHidden: !opts.showMobile,
    emailHidden: !opts.showEmail,
  };
}
