import type { BusinessEntry } from "@/domain/businessEntry";
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
  let next = mergeBusinessEntryUpdate(existing, edit);
  if (edit.pdfUri !== undefined && edit.pdfUri) {
    next = mergeEntryPdfGeneration(next, edit.pdfUri);
  }
  return next;
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
