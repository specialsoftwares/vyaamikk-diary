import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DateTimePicker from "@react-native-community/datetimepicker";

import { Banner,
  Button,
  PermissionRationaleModal,
  TextField, LocaleUiText } from "@/components/ui";
import { CategoryPicker } from "@/components/diary/CategoryPicker";
import type { DiaryCategory, DiaryEntry } from "@/domain/types";
import {
  radius,
  spacing,
  typography,
  useThemedStyles,
  useThemeColors,
} from "@/theme";
import { entrySchema, type EntryFormValues } from "@/utils/validation";
import { formatEntryDate, todayStartMs } from "@/utils/date";
import { useT } from "@/i18n";
import { notificationsService } from "@/services/notifications";

interface EntryFormProps {
  initial?: Partial<EntryFormValues>;
  submitLabel: string;
  secondaryLabel?: string;
  onSubmit: (values: EntryFormValues) => Promise<void> | void;
  onSubmitSecondary?: (values: EntryFormValues) => Promise<void> | void;
  error?: string | null;
}

export function EntryForm({
  initial,
  submitLabel,
  secondaryLabel,
  onSubmit,
  onSubmitSecondary,
  error,
}: EntryFormProps) {
  const t = useT();
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      form: { gap: spacing.lg },
      fieldLabel: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.sm },

      dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
      datePill: {
        backgroundColor: c.surfaceMuted,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        borderWidth: 1,
        borderColor: c.divider,
      },
      datePillText: { ...typography.captionStrong, color: c.text },
      currentDate: { ...typography.body, color: c.textMuted },

      tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
      tagChip: {
        backgroundColor: c.primaryLight,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
      },
      tagChipText: { ...typography.captionStrong, color: c.primaryDark },
      tagInputRow: { flexDirection: "row", alignItems: "center" },

      sectionCard: {
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.md,
      },
      sectionTitle: { ...typography.titleSm, color: c.text },
      busyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
      busyText: { ...typography.caption, color: c.textMuted },
      locationCapturedRow: { gap: spacing.xs },
      locationCapturedText: { ...typography.bodyStrong, color: c.text },
      locationCoords: { ...typography.caption, color: c.textMuted },
      reminderScheduled: { ...typography.bodyStrong, color: c.text },
      reminderActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

      actions: { gap: spacing.md, marginTop: spacing.md },
    })
  );
  const [submitting, setSubmitting] = useState<"primary" | "secondary" | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Reminder state
  const [showReminderRationale, setShowReminderRationale] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingReminderDate, setPendingReminderDate] = useState<Date | null>(null);
  const [reminderNote, setReminderNote] = useState(initial?.reminder?.note ?? "");

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    mode: "onChange",
    defaultValues: {
      title: initial?.title ?? "",
      category: (initial?.category as DiaryCategory) ?? "work",
      entryDate: initial?.entryDate ?? todayStartMs(),
      notes: initial?.notes ?? "",
      locationName: initial?.locationName ?? "",
      quantity: initial?.quantity ?? "",
      issue: initial?.issue ?? "",
      tags: initial?.tags ?? [],
      geo: initial?.geo ?? null,
      reminder: initial?.reminder ?? null,
    },
  });

  const tags = watch("tags");
  const entryDate = watch("entryDate");
  const reminder = watch("reminder");

  // Keep reminderNote in sync when reminder is removed externally (e.g. on init).
  useEffect(() => {
    if (!reminder) setReminderNote("");
  }, [reminder]);

  const addTag = () => {
    const next = tagInput.trim();
    if (!next) return;
    if (tags.includes(next)) {
      setTagInput("");
      return;
    }
    if (tags.length >= 10) return;
    setValue("tags", [...tags, next], { shouldValidate: true });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setValue(
      "tags",
      tags.filter((x) => x !== tag),
      { shouldValidate: true }
    );
  };

  // --- Reminder ----------------------------------------------------------
  const ensureNotifPermission = async (): Promise<boolean> => {
    const status = await notificationsService.getPermissionStatus();
    if (status === "granted") return true;
    setShowReminderRationale(true);
    return false;
  };

  const onSetReminder = async () => {
    setReminderError(null);
    const ok = await ensureNotifPermission();
    if (!ok) return;
    // Default to "tomorrow morning 9 AM" as a sensible starting point.
    const tomorrow9 = new Date();
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    setPendingReminderDate(tomorrow9);
    setShowDatePicker(true);
  };

  const onReminderRationaleAllow = async () => {
    setShowReminderRationale(false);
    const granted = await notificationsService.requestPermission();
    if (granted !== "granted") {
      setReminderError(t("errors.reminderDenied"));
      return;
    }
    const tomorrow9 = new Date();
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    setPendingReminderDate(tomorrow9);
    setShowDatePicker(true);
  };

  const onRemoveReminder = () => {
    setReminderError(null);
    setReminderNote("");
    setValue("reminder", null, { shouldValidate: true });
  };

  const finalizeReminder = (when: Date) => {
    if (when.getTime() <= Date.now()) {
      setReminderError(t("diary.reminder.pastError"));
      return;
    }
    setValue(
      "reminder",
      {
        at: when.getTime(),
        note: reminderNote.trim(),
        // notificationId is assigned when the entry is saved (the form
        // submit handler in the screen schedules the OS notification and
        // patches the id back in).
        notificationId: null,
      },
      { shouldValidate: true }
    );
  };

  // --- Submit ------------------------------------------------------------
  const submitPrimary = handleSubmit(async (values) => {
    setSubmitting("primary");
    try {
      // Sync reminder note in case user typed it after picking the date.
      const finalValues =
        values.reminder !== null
          ? { ...values, reminder: { ...values.reminder, note: reminderNote.trim() } }
          : values;
      await onSubmit(finalValues);
    } finally {
      setSubmitting(null);
    }
  });

  const submitSecondary = handleSubmit(async (values) => {
    if (!onSubmitSecondary) return;
    setSubmitting("secondary");
    try {
      const finalValues =
        values.reminder !== null
          ? { ...values, reminder: { ...values.reminder, note: reminderNote.trim() } }
          : values;
      await onSubmitSecondary(finalValues);
    } finally {
      setSubmitting(null);
    }
  });

  return (
    <View style={styles.form}>
      {error ? <Banner tone="danger" message={error} /> : null}

      <Controller
        control={control}
        name="title"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={t("diary.field.title")}
            value={value}
            onChangeText={onChange}
            placeholder={t("diary.field.titlePlaceholder")}
            error={errors.title?.message}
            maxLength={120}
          />
        )}
      />

      <View>
        <LocaleUiText style={styles.fieldLabel}>{t("diary.field.category")}</LocaleUiText>
        <Controller
          control={control}
          name="category"
          render={({ field: { onChange, value } }) => (
            <CategoryPicker value={value} onChange={onChange} />
          )}
        />
      </View>

      <View>
        <LocaleUiText style={styles.fieldLabel}>{t("diary.field.date")}</LocaleUiText>
        <View style={styles.dateRow}>
          <Pressable
            onPress={() => setValue("entryDate", todayStartMs(), { shouldValidate: true })}
            style={styles.datePill}
          >
            <LocaleUiText style={styles.datePillText}>{t("common.today")}</LocaleUiText>
          </Pressable>
          <Pressable
            onPress={() =>
              setValue("entryDate", todayStartMs() - 86_400_000, { shouldValidate: true })
            }
            style={styles.datePill}
          >
            <LocaleUiText style={styles.datePillText}>{t("common.yesterday")}</LocaleUiText>
          </Pressable>
          <Text style={styles.currentDate}>{formatEntryDate(entryDate)}</Text>
        </View>
      </View>

      <Controller
        control={control}
        name="locationName"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={t("diary.field.location")}
            value={value ?? ""}
            onChangeText={onChange}
            placeholder={t("diary.field.locationPlaceholder")}
            error={errors.locationName?.message}
            maxLength={120}
          />
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={t("diary.field.notes")}
            value={value ?? ""}
            onChangeText={onChange}
            placeholder={t("diary.field.notesPlaceholder")}
            error={errors.notes?.message}
            multiline
            maxLength={5000}
          />
        )}
      />

      <Controller
        control={control}
        name="quantity"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={t("diary.field.quantity")}
            value={value ?? ""}
            onChangeText={onChange}
            placeholder={t("diary.field.quantityPlaceholder")}
            error={errors.quantity?.message}
            maxLength={60}
          />
        )}
      />

      <Controller
        control={control}
        name="issue"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={t("diary.field.issue")}
            value={value ?? ""}
            onChangeText={onChange}
            placeholder={t("diary.field.issuePlaceholder")}
            error={errors.issue?.message}
            multiline
            maxLength={500}
          />
        )}
      />

      <View>
        <LocaleUiText style={styles.fieldLabel}>{t("diary.field.tags")}</LocaleUiText>
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable key={tag} onPress={() => removeTag(tag)} style={styles.tagChip}>
              <Text style={styles.tagChipText}>#{tag} ×</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.tagInputRow}>
          <TextField
            placeholder={t("diary.field.tagsPlaceholder")}
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={addTag}
            returnKeyType="done"
            containerStyle={{ flex: 1 }}
            maxLength={30}
            autoCapitalize="none"
          />
          <View style={{ width: spacing.sm }} />
          <Button
            label={t("diary.field.addTag")}
            onPress={addTag}
            variant="secondary"
            size="md"
            fullWidth={false}
          />
        </View>
      </View>

      {/* --- Reminder -------------------------------------------------- */}
      <View style={styles.sectionCard}>
        <LocaleUiText style={styles.sectionTitle}>{t("diary.reminder.sectionTitle")}</LocaleUiText>
        {reminderError ? (
          <Banner tone="danger" message={reminderError} />
        ) : null}
        {reminder ? (
          <>
            <LocaleUiText style={styles.reminderScheduled}>
              {t("diary.reminder.scheduledFor", {
                datetime: new Date(reminder.at).toLocaleString(),
              })}
            </LocaleUiText>
            <TextField
              label={t("diary.reminder.noteLabel")}
              value={reminderNote}
              onChangeText={setReminderNote}
              placeholder={t("diary.reminder.notePlaceholder")}
              maxLength={200}
            />
            <View style={styles.reminderActions}>
              <Button
                label={t("diary.reminder.pickDate")}
                variant="ghost"
                onPress={() => {
                  setPendingReminderDate(new Date(reminder.at));
                  setShowDatePicker(true);
                }}
                size="md"
                fullWidth={false}
              />
              <Button
                label={t("diary.reminder.pickTime")}
                variant="ghost"
                onPress={() => {
                  setPendingReminderDate(new Date(reminder.at));
                  setShowTimePicker(true);
                }}
                size="md"
                fullWidth={false}
              />
              <Button
                label={t("diary.reminder.remove")}
                variant="ghost"
                onPress={onRemoveReminder}
                size="md"
                fullWidth={false}
              />
            </View>
          </>
        ) : (
          <Button
            label={t("diary.reminder.set")}
            variant="secondary"
            onPress={onSetReminder}
          />
        )}
      </View>

      {/* Native date/time pickers (modal on iOS, dialog on Android) */}
      {showDatePicker && pendingReminderDate ? (
        <DateTimePicker
          mode="date"
          value={pendingReminderDate}
          minimumDate={new Date()}
          onChange={(event, selected) => {
            setShowDatePicker(false);
            if (event.type === "dismissed" || !selected) return;
            // Preserve previous time
            const combined = new Date(selected);
            combined.setHours(
              pendingReminderDate.getHours(),
              pendingReminderDate.getMinutes(),
              0,
              0
            );
            setPendingReminderDate(combined);
            // Auto-open time picker after picking date for a smoother flow.
            setShowTimePicker(true);
          }}
        />
      ) : null}
      {showTimePicker && pendingReminderDate ? (
        <DateTimePicker
          mode="time"
          value={pendingReminderDate}
          onChange={(event, selected) => {
            setShowTimePicker(false);
            if (event.type === "dismissed" || !selected) return;
            const combined = new Date(pendingReminderDate);
            combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            setPendingReminderDate(combined);
            finalizeReminder(combined);
          }}
        />
      ) : null}

      <View style={styles.actions}>
        <Button
          label={submitLabel}
          onPress={submitPrimary}
          loading={submitting === "primary"}
          disabled={submitting !== null}
        />
        {secondaryLabel && onSubmitSecondary ? (
          <Button
            label={secondaryLabel}
            onPress={submitSecondary}
            variant="secondary"
            loading={submitting === "secondary"}
            disabled={submitting !== null}
          />
        ) : null}
      </View>

      <PermissionRationaleModal
        visible={showReminderRationale}
        title={t("permission.notifications.title")}
        body={t("permission.notifications.body")}
        allowLabel={t("permission.notifications.allow")}
        notNowLabel={t("common.notNow")}
        onAllow={onReminderRationaleAllow}
        onDismiss={() => setShowReminderRationale(false)}
      />
    </View>
  );
}

