/**
 * Local notification (reminder) service.
 *
 * Rules (per product spec):
 *   - Never request notification permission on first launch.
 *   - Always show a rationale modal BEFORE the native popup.
 *   - Schedule only user-created reminders. No marketing, no surprise sends.
 *   - If the user edits a reminder time, reschedule (cancel + schedule).
 *   - If the user deletes the entry or the reminder, cancel the notification.
 *
 * Note: Push notifications are deliberately NOT used here — V1 ships only
 * locally-scheduled reminders, which keep working in Expo Go (SDK 53+
 * removed push notification support from Expo Go but local scheduling
 * still works).
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { AppError } from "@/domain/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("notifications");

export type NotifPermissionStatus = "granted" | "denied" | "undetermined";

// Ensure foreground notifications surface as banners/sounds.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  log.warn("setNotificationHandler failed at module load", e);
}

let androidChannelEnsured = false;

async function ensureAndroidChannel() {
  if (Platform.OS !== "android" || androidChannelEnsured) return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    androidChannelEnsured = true;
  } catch (e) {
    log.warn("ensureAndroidChannel failed", e);
  }
}

export const notificationsService = {
  async getPermissionStatus(): Promise<NotifPermissionStatus> {
    try {
      const r = await Notifications.getPermissionsAsync();
      if (r.granted) return "granted";
      if (r.canAskAgain === false) return "denied";
      return r.status === "undetermined" ? "undetermined" : "denied";
    } catch (e) {
      log.warn("getPermissionStatus failed", e);
      return "undetermined";
    }
  },

  async requestPermission(): Promise<NotifPermissionStatus> {
    try {
      const r = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });
      await ensureAndroidChannel();
      if (r.granted) return "granted";
      return r.canAskAgain === false ? "denied" : "denied";
    } catch (e) {
      log.warn("requestPermission failed", e);
      return "denied";
    }
  },

  /**
   * Schedule a single, one-shot local notification at `at` (epoch millis).
   * Returns the OS scheduler handle. Callers should persist this id so
   * they can cancel/reschedule later.
   */
  async scheduleOneShot(opts: {
    title: string;
    body: string;
    at: number;
    data?: Record<string, unknown>;
  }): Promise<string> {
    const status = await this.getPermissionStatus();
    if (status !== "granted") {
      throw new AppError("permission_denied", "Notification permission not granted.");
    }
    if (opts.at <= Date.now()) {
      throw new AppError("save_failed", "Reminder time must be in the future.");
    }
    await ensureAndroidChannel();
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: opts.title,
          body: opts.body,
          sound: true,
          data: opts.data ?? {},
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(opts.at),
        },
      });
      log.info("scheduled", { id, at: opts.at });
      return id;
    } catch (e) {
      log.warn("scheduleOneShot failed", e);
      throw new AppError("save_failed", "Could not schedule reminder.");
    }
  },

  async cancel(notificationId: string | null | undefined): Promise<void> {
    if (!notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      log.info("cancelled", { id: notificationId });
    } catch (e) {
      // Cancelling a non-existent reminder shouldn't bubble up.
      log.warn("cancel failed (ignored)", e);
    }
  },
};
