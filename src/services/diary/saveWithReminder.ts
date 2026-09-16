import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError, toAppError } from "@/domain/errors";
import type { CreateBusinessEntryInput } from "./types";
import { createEntryLocalFirst, type LocalFirstCreateResult } from "./localFirst";
import { getDiaryRepository } from "./index";
import { notificationsService } from "@/services/notifications";
import { persistDiaryUpdateIntent } from "@/repositories/diaryLocalIntent";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import { mergeBusinessEntryUpdate } from "./mergeEntryUpdate";

export type { LocalFirstCreateResult };

export async function createEntryWithReminder(
  userId: string,
  input: CreateBusinessEntryInput,
  reminderLabels: { title: string; body: string }
): Promise<LocalFirstCreateResult> {
  const created = await createEntryLocalFirst(userId, input);
  const entry = created.entry;
  if (!entry.reminder || entry.reminder.notificationId) return created;
  try {
    const notificationId = await notificationsService.scheduleOneShot({
      title: reminderLabels.title.replace("{{title}}", entry.title),
      body: reminderLabels.body,
      at: entry.reminder.at,
      data: { entryId: entry.id, userId },
    });
    const reminder = { ...entry.reminder, notificationId };
    if (!created.remoteAccepted) {
      const merged = mergeBusinessEntryUpdate(entry, { id: entry.id, reminder });
      persistDiaryUpdateIntent(merged, { id: entry.id, reminder }, readLocalEntryRecordSync(userId, entry.id));
      return { ...created, entry: merged };
    }
    const updated = await getDiaryRepository().update(userId, {
      id: entry.id,
      reminder,
    });
    return { ...created, entry: updated };
  } catch (e) {
    const err = toAppError(e);
    if (err.code === "permission_denied") {
      throw new AppError(
        "permission_denied",
        "Notification permission is required to save this reminder."
      );
    }
    throw err;
  }
}
