import React, { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState, Header, Loader, Screen } from "@/components/ui";
import { EntryForm } from "@/components/diary/EntryForm";
import type { BusinessEntry } from "@/domain/businessEntry";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
import { getDiaryRepository } from "@/services/diary";
import { resolveEntryLocationWithFootprint } from "@/services/location/locationFootprintCapture";
import { notificationsService } from "@/services/notifications";
import { useAuth } from "@/state/auth";
import type { EntryFormValues } from "@/utils/validation";
import { useT } from "@/i18n";
import { createLogger } from "@/utils/logger";

const log = createLogger("screens/edit");

export default function EditEntryScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = String(id ?? "");

  const [entry, setEntry] = useState<BusinessEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !entryId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const found = await getDiaryRepository().getById(user.uid, entryId);
      if (!found) setLoadError(t("errors.notFound"));
      else setEntry(found);
    } catch (e) {
      setLoadError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, entryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (values: EntryFormValues) => {
    if (!user || !entry) return;
    setSubmitError(null);
    try {
      const repo = getDiaryRepository();

      // Decide whether to reschedule the OS notification:
      //   - existing reminder with same time and same note → keep as-is
      //   - any other change (time, note, removed) → cancel old + maybe schedule new
      const reminderChanged =
        values.reminder?.at !== entry.reminder?.at ||
        values.reminder?.note !== entry.reminder?.note ||
        (values.reminder === null) !== (entry.reminder === null);

      let nextReminder = values.reminder ?? null;

      if (reminderChanged) {
        if (entry.reminder?.notificationId) {
          await notificationsService.cancel(entry.reminder.notificationId);
        }
        if (nextReminder) {
          try {
            const notificationId = await notificationsService.scheduleOneShot({
              title: t("diary.reminder.notificationTitle", {
                title: values.title || entry.title,
              }),
              body: nextReminder.note || t("diary.reminder.notificationBody"),
              at: nextReminder.at,
              data: { entryId: entry.id, userId: user.uid },
            });
            nextReminder = { ...nextReminder, notificationId };
          } catch (e) {
            log.warn("failed to reschedule reminder", e);
            // Persist the reminder without the OS id so the user at least
            // sees their intent recorded; surface a soft warning.
            nextReminder = { ...nextReminder, notificationId: null };
          }
        }
      }

      const manualLoc = values.locationName?.trim()
        ? { name: values.locationName.trim(), geo: null, gps: null }
        : null;
      const { location } = await resolveEntryLocationWithFootprint(user.uid, manualLoc);

      await repo.update(user.uid, {
        id: entry.id,
        title: values.title,
        notes: values.notes?.trim() || null,
        entryDate: values.entryDate,
        reminder: nextReminder,
        location,
        payload: {
          category: values.category,
          quantity: values.quantity?.trim() || null,
          issue: values.issue?.trim() || null,
          tags: values.tags,
          locationName: values.locationName?.trim() || null,
          geo: null,
        },
      });
      router.back();
    } catch (e) {
      setSubmitError(userFacingMessage(e));
    }
  };

  if (loading) {
    return (
      <Screen>
        <Header title={t("diary.editTitle")} showBack backFrom="diary" />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  if (loadError || !entry) {
    return (
      <Screen>
        <Header title={t("diary.editTitle")} showBack backFrom="diary" />
        <ErrorState message={loadError ?? t("errors.notFound")} onRetry={load} />
      </Screen>
    );
  }

  if (entry.entryType !== "legacy") {
    return (
      <Screen>
        <Header title={t("diary.editTitle")} showBack backFrom="diary" />
        <Banner tone="info" message={t("composer.editLegacyOnly")} />
      </Screen>
    );
  }

  const legacy = entry.payload as import("@/domain/businessEntry").LegacyPayload;

  return (
    <Screen scroll form>
      <Header title={t("diary.editTitle")} showBack backFrom="diary" />
      <EntryForm
        initial={{
          title: entry.title,
          category: legacy.category as import("@/domain/types").DiaryCategory,
          notes: entry.notes ?? "",
          entryDate: entry.entryDate,
          locationName: legacy.locationName ?? "",
          geo: legacy.geo,
          quantity: legacy.quantity ?? "",
          issue: legacy.issue ?? "",
          tags: legacy.tags,
          reminder: entry.reminder,
        }}
        submitLabel={t("diary.saveChanges")}
        onSubmit={handleSave}
        error={submitError}
      />
    </Screen>
  );
}
