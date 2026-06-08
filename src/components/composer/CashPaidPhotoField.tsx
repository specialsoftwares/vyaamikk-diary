import React, { useCallback } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Button, LocaleUiText } from "@/components/ui";
import {
  CashPaidPhotoError,
  pickCashPaidPhoto,
  type CashPaidPhotoSource,
  type PickedCashPaidPhoto,
} from "@/services/attachments/cashPaidPhotoService";
import { spacing, typography, useThemedStyles } from "@/theme";
import { useT } from "@/i18n";

export interface CashPaidPhotoFieldState {
  picked: PickedCashPaidPhoto | null;
  removeExisting: boolean;
}

interface CashPaidPhotoFieldProps {
  existingUri: string | null;
  state: CashPaidPhotoFieldState;
  onChange: (next: CashPaidPhotoFieldState) => void;
}

export function CashPaidPhotoField({
  existingUri,
  state,
  onChange,
}: CashPaidPhotoFieldProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginBottom: spacing.md, gap: spacing.sm },
      label: { ...typography.captionStrong, color: c.textMuted },
      hint: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      row: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
      thumb: {
        width: 72,
        height: 54,
        borderRadius: 8,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      actions: { flex: 1, gap: spacing.xs },
    })
  );

  const displayUri =
    state.removeExisting ? null : state.picked?.uri ?? existingUri ?? null;

  const handlePick = useCallback(
    async (source: CashPaidPhotoSource) => {
      try {
        const picked = await pickCashPaidPhoto(source);
        if (!picked) return;
        onChange({ picked, removeExisting: false });
      } catch (e) {
        if (e instanceof CashPaidPhotoError) {
          const msg =
            e.code === "permission"
              ? t("composer.cashPaidPhotoPermission")
              : e.code === "too_large"
                ? t("composer.cashPaidPhotoTooLarge")
                : t("composer.cashPaidPhotoReadFailed");
          Alert.alert(t("common.error"), msg);
        }
      }
    },
    [onChange, t]
  );

  const promptPhoto = useCallback(() => {
    Alert.alert(t("composer.cashPaidPhotoAdd"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("customerCredit.photoCamera"),
        onPress: () => void handlePick("camera"),
      },
      {
        text: t("customerCredit.photoLibrary"),
        onPress: () => void handlePick("library"),
      },
    ]);
  }, [handlePick, t]);

  const removePhoto = useCallback(() => {
    onChange({ picked: null, removeExisting: true });
  }, [onChange]);

  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.label}>{t("composer.cashPaidPhotoLabel")}</LocaleUiText>
      <LocaleUiText style={styles.hint}>{t("composer.cashPaidPhotoHint")}</LocaleUiText>
      <View style={styles.row}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumb} />
        )}
        <View style={styles.actions}>
          <Button
            label={displayUri ? t("common.change") : t("composer.cashPaidPhotoAdd")}
            variant="secondary"
            fullWidth={false}
            onPress={promptPhoto}
          />
          {displayUri ? (
            <Pressable onPress={removePhoto} accessibilityRole="button">
              <LocaleUiText style={styles.hint}>{t("composer.cashPaidPhotoRemove")}</LocaleUiText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
