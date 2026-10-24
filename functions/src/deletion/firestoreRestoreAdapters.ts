/**
 * Hold documents live on the outside database. Client rules cannot read them.
 * Direct Firestore and Storage clients are denied only after this module
 * writes restoreControl/current.closed, which is the document those rules read.
 * Callables and workers read the outside hold itself.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import type { LocalRestoreDocs, OutsideHolds, RestoreHoldStore } from "./restoreControlPlane";
import { proveAuthorityReconciled, type RestoreAuthoritySnapshot } from "./restoreAuthority";
import { listDocumentIdsPage } from "./firestorePurge";
import type { InventoryLog, InventoryRecord, ReadOnlyInventory } from "./deletionInventory";

export const HOLD_ENFORCEMENT = {
  firestoreClients: "security rules restoreClosed() and restoreModeAllows() read restoreControl on the primary database",
  storageClients: "storage rules restoreClosed() and restoreModeAllows() read the same primary documents through firestore.get",
  callables: "assertRestoreTrafficClosed reads the outside hold when RESTORE_PROTECTION_ACTIVE=true, then the primary fence",
  workers: "privilegedWorkerHold reads RESTORE_WORKER_HOLD and, when protection is active, the outside _restoreHolds/current document",
} as const;

function holdFromData(data: Record<string, unknown> | undefined): OutsideHolds {
  const traffic = data?.traffic === "open" ? "open" : "closed";
  const workers = data?.workers === "running" ? "running" : "stopped";
  const phase = data?.phase === "workers_released" || data?.phase === "traffic_released" ? data.phase : "closed";
  const revision = Number.isSafeInteger(data?.revision) ? Number(data?.revision) : 0;
  return { traffic, workers, phase, revision };
}

export function createFirestoreRestoreHoldStore(primary: Firestore, holds: Firestore): RestoreHoldStore {
  const ref = holds.doc("_restoreHolds/current");
  return {
    async readDocs(): Promise<LocalRestoreDocs> {
      const [fence, mode] = await Promise.all([
        primary.doc("restoreControl/current").get(),
        primary.doc("restoreControl/mode").get(),
      ]);
      const fenceData = fence.data();
      const modeData = mode.data();
      return {
        fence: fence.exists
          ? {
              closed: fenceData?.closed === true,
              reconciled: fenceData?.reconciled === true,
              watermark: Number.isSafeInteger(fenceData?.watermark) ? Number(fenceData?.watermark) : 0,
            }
          : null,
        mode: mode.exists ? { required: modeData?.required === true } : null,
      };
    },
    async readHolds() {
      const snap = await ref.get();
      if (!snap.exists) return { traffic: "closed", workers: "stopped", phase: "closed", revision: 0 };
      return holdFromData(snap.data() as Record<string, unknown>);
    },
    async writeHolds(next, expectedRevision) {
      try {
        await holds.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const current = snap.exists ? Number(snap.get("revision") ?? 0) : 0;
          if (current !== expectedRevision) throw new Error("conflict");
          tx.set(ref, next);
        });
        return "stored";
      } catch (error) {
        if (error instanceof Error && error.message === "conflict") return "conflict";
        throw error;
      }
    },
  };
}

/**
 * Writes an open reconciled fence only after the proposal matches the outside
 * authority's watermark, erased accounts, and withdrawn purposes. A watermark
 * without those lists does not write.
 */
export async function rewriteOpenReconciledFence(
  primary: Firestore,
  authority: RestoreAuthoritySnapshot | null,
  proposed: { watermark: number; erasedUids?: readonly string[]; withdrawnPurposes?: Readonly<Record<string, readonly string[]>> }
): Promise<"rewritten" | "refused"> {
  const proof = proveAuthorityReconciled(authority, proposed);
  if (!proof.ok) return "refused";
  await primary.doc("restoreControl/current").set({
    closed: false,
    reconciled: true,
    watermark: proof.snapshot.watermark,
  });
  return "rewritten";
}

/** Rules enforce this document. An outside "closed" value does nothing until it is written here. */
export async function enforceClientFenceFromHold(primary: Firestore, holds: OutsideHolds): Promise<"closed" | "unchanged"> {
  if (holds.traffic !== "closed") return "unchanged";
  const ref = primary.doc("restoreControl/current");
  const snap = await ref.get();
  if (snap.exists && snap.get("closed") === true) return "closed";
  await ref.set(
    {
      closed: true,
      reconciled: false,
      watermark: Number.isSafeInteger(snap.get("watermark")) ? snap.get("watermark") : 0,
    },
    { merge: true }
  );
  return "closed";
}

export function createFirestoreInventory(db: Firestore, pageSize = 100): ReadOnlyInventory {
  return {
    async childCollections(path) {
      const collections = await db.doc(path).listCollections();
      return collections.map((collection) => collection.id);
    },
    async listPage(path, collection, pageToken) {
      const page = await listDocumentIdsPage(db, path, collection, pageToken, pageSize);
      const missingIds: string[] = [];
      for (const id of page.ids) {
        const snap = await db.doc(`${path}/${collection}/${id}`).get();
        if (!snap.exists) missingIds.push(id);
      }
      return { ids: page.ids, missingIds, nextPageToken: page.nextPageToken ?? null };
    },
  };
}

export function createFirestoreInventoryLog(db: Firestore, job: { jobId: string; uid: string }): InventoryLog {
  const ref = db.collection("_deletionInventory").doc(job.jobId);
  return {
    async commit(record) {
      if (record.uid !== job.uid || record.jobId !== job.jobId) throw new Error("inventory_wrong_account");
      await db.runTransaction(async (tx) => {
        tx.set(ref, {
          jobId: job.jobId,
          uid: job.uid,
          revision: record.revision,
          scope: record.scope,
          status: record.status,
          clockSource: "server",
          remainingPaths: record.remainingPaths,
          observedAt: FieldValue.serverTimestamp(),
        });
      });
      return record.revision;
    },
    async read(revision) {
      const snap = await ref.get();
      if (!snap.exists || snap.get("revision") !== revision) return null;
      if (snap.get("uid") !== job.uid || snap.get("jobId") !== job.jobId) return null;
      if (snap.get("clockSource") !== "server" || (snap.get("status") !== "complete" && snap.get("status") !== "partial")) {
        return null;
      }
      const rawTime = snap.get("observedAt") as { toMillis?: () => number } | number | undefined;
      const observedAt = typeof rawTime === "object" && rawTime && typeof rawTime.toMillis === "function"
        ? rawTime.toMillis()
        : Number(rawTime);
      if (!Number.isSafeInteger(observedAt) || observedAt <= 0) return null;
      const paths = snap.get("remainingPaths");
      return {
        revision,
        scope: String(snap.get("scope") ?? ""),
        observedAt,
        remainingPaths: Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string") : [],
        status: snap.get("status"),
        clockSource: "server",
        jobId: job.jobId,
        uid: job.uid,
      } satisfies InventoryRecord;
    },
  };
}
