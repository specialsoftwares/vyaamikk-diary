import { AppError } from "@/domain/errors";
import type { BusinessEntry, LetterheadMatterPayload } from "@/domain/businessEntry";
import type { UpdateBusinessEntryInput } from "./types";
import { mergeBusinessEntryUpdate, mergeEntryPdfGeneration } from "./mergeEntryUpdate";

export function reminderCancelIdAfterUpdate(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): string | null {
  if (edit.reminder === undefined) return null;
  const wasScheduled = existing.reminder?.notificationId ?? null;
  const willBeDifferent =
    edit.reminder === null || edit.reminder.notificationId !== existing.reminder?.notificationId;
  if (wasScheduled && willBeDifferent) return wasScheduled;
  return null;
}

export function buildDiaryUpdateRecord(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): BusinessEntry {
  const frozen = freezeLetterheadMirrorLinkage(existing, edit);
  let next = mergeBusinessEntryUpdate(existing, frozen);
  if (edit.pdfUri !== undefined && edit.pdfUri) {
    next = mergeEntryPdfGeneration(next, edit.pdfUri);
  }
  return next;
}

function freezeLetterheadMirrorLinkage(
  existing: BusinessEntry,
  edit: UpdateBusinessEntryInput
): UpdateBusinessEntryInput {
  if (existing.entryType !== "letterhead_matter") return edit;
  if (edit.payload === undefined) return edit;
  const current = existing.payload as LetterheadMatterPayload;
  const next = edit.payload as LetterheadMatterPayload;
  if (next.letterheadDocumentId === current.letterheadDocumentId) return edit;
  throw new AppError(
    "permission_denied",
    "Letterhead diary link cannot be changed.",
    undefined,
    { reason: "letterhead_mirror_conversion_denied" }
  );
}

/**
 * Notification work runs after a successful commit. Failure here must not
 * report the already-committed record as an uncommitted save.
 */
export async function runAfterDiaryUpdateCommit(
  cancelId: string | null,
  cancelNotification: (id: string) => Promise<void>
): Promise<void> {
  if (!cancelId) return;
  try {
    await cancelNotification(cancelId);
  } catch {
    // Post-commit: the Firestore write already succeeded.
  }
}
