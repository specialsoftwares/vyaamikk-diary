import { AppError, toAppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { EntryReminder } from "@/domain/types";
import type { CreateBusinessEntryInput } from "./types";
import {
  createEntryLocalFirst,
  updateEntryLocalFirst,
  type LocalFirstCreateResult,
} from "./localFirst";
import { readLocalEntryRecordSync } from "@/repositories/localEntriesRepository";
import {
  captureAdmissionToken,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

export type { LocalFirstCreateResult };

export type ReminderNotificationPort = {
  scheduleOneShot: (opts: {
    title: string;
    body: string;
    at: number;
    data?: Record<string, unknown>;
  }) => Promise<string>;
  cancel: (notificationId: string | null | undefined) => Promise<void>;
};

let reminderNotificationsForTests: ReminderNotificationPort | null = null;

/** Node/CI seam. Production still uses notificationsService (lazy-loaded). */
export function setReminderNotificationsForTests(port: ReminderNotificationPort | null): void {
  reminderNotificationsForTests = port;
}

function reminderNotifications(): ReminderNotificationPort {
  if (reminderNotificationsForTests) return reminderNotificationsForTests;
  // Lazy so Node tests never import expo-notifications.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/services/notifications").notificationsService as ReminderNotificationPort;
}

export function reminderStillAppliesForScheduledNotification(
  current: BusinessEntry | null | undefined,
  scheduled: Pick<EntryReminder, "at" | "note">
): boolean {
  if (!current?.reminder) return false;
  if (current.reminder.at !== scheduled.at) return false;
  if (current.reminder.note !== scheduled.note) return false;
  if (current.reminder.notificationId) return false;
  return true;
}

export async function createEntryWithReminder(
  userId: string,
  input: CreateBusinessEntryInput,
  reminderLabels: { title: string; body: string },
  options?: { session?: SyncSessionToken | null }
): Promise<LocalFirstCreateResult> {
  const session =
    options && "session" in options ? options.session ?? null : captureAdmissionToken();
  const created = await createEntryLocalFirst(userId, input, { session });
  const entry = created.entry;
  if (!entry.reminder || entry.reminder.notificationId) return created;

  const scheduled = { at: entry.reminder.at, note: entry.reminder.note };
  const notifications = reminderNotifications();
  let notificationId: string;
  try {
    notificationId = await notifications.scheduleOneShot({
      title: reminderLabels.title.replace("{{title}}", entry.title),
      body: reminderLabels.body,
      at: scheduled.at,
      data: { entryId: entry.id, userId },
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

  const live = readLocalEntryRecordSync(userId, entry.id)?.entry ?? entry;
  if (!reminderStillAppliesForScheduledNotification(live, scheduled)) {
    await notifications.cancel(notificationId);
    return { ...created, entry: live };
  }

  const attached = await updateEntryLocalFirst(
    userId,
    { id: entry.id, reminder: { ...live.reminder!, notificationId } },
    { session }
  );
  return {
    ...created,
    entry: attached.entry,
    remoteAccepted: created.remoteAccepted,
    reminderRemoteAccepted: attached.remoteAccepted,
    reminderFailureKind: attached.failureKind,
  };
}
