/**
 * Local, best-effort reminders for Customer Credit receivables.
 *
 * Privacy: notification copy never includes the customer name — only the
 * app-generated record number. Scheduling is silently skipped when the user has
 * not granted notification permission (we never prompt from here).
 */

import {
  isReceivable,
  primaryDueDate,
  type CustomerCreditRecord,
} from "@/domain/customerCredit";
import { notificationsService } from "@/services/notifications";
import { createLogger } from "@/utils/logger";

import { getCustomerCreditRepository } from "./index";

const log = createLogger("customerCredit/reminders");

type TFn = (k: string, vars?: Record<string, string | number>) => string;

/** Reminder fires at 09:00 local on the next due date (or the due time if later). */
export function computeCreditReminderAt(
  record: CustomerCreditRecord,
  now = Date.now()
): number | null {
  if (!isReceivable(record)) return null;
  const due = primaryDueDate(record, now);
  if (due == null) return null;
  const d = new Date(due);
  d.setHours(9, 0, 0, 0);
  let at = d.getTime();
  if (at <= now) at = due;
  return at > now ? at : null;
}

/** Cancel any OS-scheduled reminder attached to this record (no persistence). */
export async function cancelCreditReminder(record: CustomerCreditRecord): Promise<void> {
  await notificationsService.cancel(record.reminderNotificationId);
}

/**
 * Reconcile the record's reminder with its current due state: cancel the old
 * one, schedule a fresh reminder when applicable + permitted, and persist the
 * resulting handle. Always non-fatal — failures leave the record reminder-less.
 */
export async function syncCreditReminder(
  userId: string,
  record: CustomerCreditRecord,
  t: TFn
): Promise<void> {
  try {
    await notificationsService.cancel(record.reminderNotificationId);
    const at = computeCreditReminderAt(record);
    const repo = getCustomerCreditRepository();
    if (at == null) {
      if (record.reminderAt != null || record.reminderNotificationId != null) {
        await repo.setReminder(userId, record.id, {
          reminderAt: null,
          reminderNotificationId: null,
        });
      }
      return;
    }
    const id = await notificationsService.scheduleOneShot({
      title: t("customerCredit.reminderTitle"),
      body: t("customerCredit.reminderBody", { recordNumber: record.recordNumber }),
      at,
      data: { kind: "customer_credit", recordId: record.id },
    });
    await repo.setReminder(userId, record.id, { reminderAt: at, reminderNotificationId: id });
  } catch {
    // Permission not granted / scheduling unavailable — clear stale handle.
    log.info("credit reminder not scheduled");
    try {
      await getCustomerCreditRepository().setReminder(userId, record.id, {
        reminderAt: null,
        reminderNotificationId: null,
      });
    } catch {
      // ignore
    }
  }
}
