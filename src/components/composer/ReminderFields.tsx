import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { Control, FieldErrors } from "react-hook-form";
import { Controller } from "react-hook-form";

import { PermissionRationaleModal, TextField, LocaleUiText } from "@/components/ui";
import { notificationsService } from "@/services/notifications";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useT } from "@/i18n";
import { calendarDayStartMs } from "@/services/recordDatePolicy";
import { translateFormMessage } from "@/utils/i18n/translateFormMessage";

interface ReminderFieldsProps {
  control: Control<Record<string, unknown>>;
  errors: FieldErrors;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function ReminderFields({
  control,
  errors,
  required,
  minimumDate,
  maximumDate,
}: ReminderFieldsProps) {
  const t = useT();
  const [showPicker, setShowPicker] = useState(false);
  const [showRationale, setShowRationale] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      label: { ...typography.captionStrong, color: c.textMuted, marginBottom: spacing.sm },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: c.surfaceMuted,
        paddingVertical: 14,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
      },
      value: { ...typography.body, color: c.text },
      link: { ...typography.captionStrong, color: c.primary },
      err: { ...typography.caption, color: c.danger, marginTop: 4 },
    })
  );

  const openPickerAfterPermission = async (): Promise<boolean> => {
    const status = await notificationsService.getPermissionStatus();
    if (status === "granted") {
      setShowPicker(true);
      return true;
    }
    setShowRationale(true);
    return false;
  };

  const onRationaleAllow = async () => {
    setShowRationale(false);
    const granted = await notificationsService.requestPermission();
    if (granted !== "granted") {
      setPermError(t("errors.reminderDenied"));
      return;
    }
    setPermError(null);
    setShowPicker(true);
  };

  return (
    <View>
      <LocaleUiText style={styles.label}>
        {required ? t("composer.reminderRequired") : t("composer.reminderOptional")}
      </LocaleUiText>
      <Controller
        control={control}
        name="reminder"
        render={({ field: { value, onChange } }) => {
          const rem = value as { at: number; note: string } | null;
          return (
            <>
              <Pressable
                onPress={() => {
                  setPermError(null);
                  void openPickerAfterPermission();
                }}
                style={styles.row}
              >
                <Text style={styles.value}>
                  {rem?.at
                    ? new Date(rem.at).toLocaleString()
                    : t("composer.reminderNotSet")}
                </Text>
                <LocaleUiText style={styles.link}>{t("diary.reminder.pickDate")}</LocaleUiText>
              </Pressable>
              {showPicker ? (
                <DateTimePicker
                  mode="datetime"
                  value={rem?.at ? new Date(rem.at) : new Date()}
                  minimumDate={minimumDate ?? new Date(calendarDayStartMs())}
                  maximumDate={maximumDate}
                  onChange={(event, selected) => {
                    setShowPicker(false);
                    if (event.type === "dismissed" || !selected) return;
                    const dayMs = calendarDayStartMs(selected);
                    const minMs = calendarDayStartMs(minimumDate ?? new Date());
                    const maxMs = maximumDate
                      ? calendarDayStartMs(maximumDate)
                      : Number.MAX_SAFE_INTEGER;
                    if (dayMs < minMs || dayMs > maxMs) {
                      setPermError(t("datePolicy.errors.reminder_future_3m.too_old"));
                      return;
                    }
                    setPermError(null);
                    onChange({
                      at: selected.getTime(),
                      note: rem?.note ?? "",
                      notificationId: null,
                    });
                  }}
                />
              ) : null}
              <TextField
                placeholder={t("diary.reminder.notePlaceholder")}
                value={rem?.note ?? ""}
                onChangeText={(note) =>
                  onChange(
                    rem?.at
                      ? { ...rem, note, notificationId: null }
                      : null
                  )
                }
                containerStyle={{ marginTop: spacing.sm }}
              />
              {rem?.at ? (
                <Pressable onPress={() => onChange(null)}>
                  <LocaleUiText style={[styles.link, { marginTop: spacing.sm }]}>
                    {t("composer.reminderClear")}
                  </LocaleUiText>
                </Pressable>
              ) : null}
            </>
          );
        }}
      />
      {permError ? <Text style={styles.err}>{permError}</Text> : null}
      {errors.reminder ? (
        <Text style={styles.err}>
          {translateFormMessage(
            t,
            String(
              (errors.reminder as { message?: string })?.message ??
                (errors.reminder as { at?: { message?: string } })?.at?.message ??
                ""
            )
          )}
        </Text>
      ) : null}
      <PermissionRationaleModal
        visible={showRationale}
        title={t("permission.notifications.title")}
        body={t("permission.notifications.body")}
        allowLabel={t("permission.notifications.allow")}
        notNowLabel={t("common.notNow")}
        onAllow={() => void onRationaleAllow()}
        onDismiss={() => setShowRationale(false)}
      />
    </View>
  );
}
