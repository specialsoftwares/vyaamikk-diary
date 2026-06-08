import type { BusinessEntry } from "@/domain/businessEntry";
import { AppError, toAppError } from "@/domain/errors";
import type { CreateBusinessEntryInput } from "./types";
import { createEntryLocalFirst } from "./localFirst";
import { getDiaryRepository } from "./index";
import { notificationsService } from "@/services/notifications";

export async function createEntryWithReminder(
  userId: string,
  input: CreateBusinessEntryInput,
  reminderLabels: { title: string; body: string }
): Promise<BusinessEntry> {
  const entry = await createEntryLocalFirst(userId, input);
  if (!entry.reminder || entry.reminder.notificationId) return entry;
  try {
    const notificationId = await notificationsService.scheduleOneShot({
      title: reminderLabels.title.replace("{{title}}", entry.title),
      body: reminderLabels.body,
      at: entry.reminder.at,
      data: { entryId: entry.id, userId },
    });
    return getDiaryRepository().update(userId, {
      id: entry.id,
      reminder: { ...entry.reminder, notificationId },
    });
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
