import type { Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";
import { letterheadDocToCloudStorage } from "@/services/pdf/pdfCloudSync";
import { stableRecordId } from "@/services/records/stableRecordId";

import { parseLetterheadDocument } from "./documentParse";
import { isSupportedLetterheadParentData } from "./letterheadMirrorPolicy";
import type { LetterheadDocument, LetterheadDocumentCreateInput } from "./types";

export function buildNewLetterheadDocument(
  userId: string,
  recordId: string,
  input: LetterheadDocumentCreateInput,
  nowMs: number
): LetterheadDocument {
  const { clientRecordId: _omit, ...rest } = input;
  return {
    ...rest,
    id: recordId,
    userId,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

/**
 * Production letterheadDocs CREATE. Zero ordinary quota. ID and attempt
 * timestamp are resolved by the caller (or once here) and reused on
 * transaction retries. Template config and Storage uploads stay outside
 * this transaction.
 */
export async function createLetterheadDocumentAtomic(
  db: Firestore,
  userId: string,
  input: LetterheadDocumentCreateInput,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "lhd")
): Promise<LetterheadDocument> {
  const result = await createLetterheadDocumentAtomicDetailed(
    db,
    userId,
    input,
    hooks,
    nowMs,
    recordId
  );
  return result.record;
}

export async function createLetterheadDocumentAtomicDetailed(
  db: Firestore,
  userId: string,
  input: LetterheadDocumentCreateInput,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "lhd")
) {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const monthKey = istMonthKeyForMillis(nowMs);
  return runAtomicBillableCreate({
    db,
    userId,
    collection: "letterheadDocs",
    recordId,
    nowMs,
    monthKey,
    quotaConsumption: "none",
    parseExisting: (id, data) => parseLetterheadDocument(id, data, userId),
    buildNew: () => {
      const record = buildNewLetterheadDocument(userId, recordId, input, nowMs);
      if (
        !isSupportedLetterheadParentData({
          userId: record.userId,
          title: record.title,
          input: record.input as unknown as Record<string, unknown>,
        })
      ) {
        throw new AppError(
          "permission_denied",
          "Letterhead document is not valid.",
          undefined,
          { reason: "letterhead_parent_shape_invalid" }
        );
      }
      return { record, payload: letterheadDocToCloudStorage(record) };
    },
    hooks,
  });
}
