import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";

import { Button, LocaleUiText } from "@/components/ui";
import { KeyboardSafeBottomSheet } from "@/components/inputSafety/KeyboardSafeBottomSheet";
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
      error: { ...typography.caption, color: c.danger, lineHeight: 18 },
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
      sheetAction: {
        minHeight: 48,
        justifyContent: "center",
        paddingVertical: spacing.sm,
      },
      sheetActionLabel: { ...typography.bodyStrong, color: c.text },
      previewBackdrop: {
        flex: 1,
        backgroundColor: c.overlay,
        justifyContent: "center",
        padding: spacing.lg,
      },
      previewImage: { width: "100%", height: 360, backgroundColor: c.surface },
    })
  );

  const [chooserOpen, setChooserOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pickerLock = useRef(false);
  const pendingSource = useRef<CashPaidPhotoSource | null>(null);

  const displayUri = state.removeExisting ? null : state.picked?.uri ?? existingUri ?? null;

  const runPick = useCallback(
    async (source: CashPaidPhotoSource) => {
      if (pickerLock.current) return;
      pickerLock.current = true;
      try {
        const picked = await pickCashPaidPhoto(source);
        if (!picked) return;
        onChange({ picked, removeExisting: false });
        setMessage(null);
      } catch (e) {
        if (e instanceof CashPaidPhotoError) {
          const msg =
            e.code === "permission"
              ? t("composer.cashPaidPhotoPermission")
              : e.code === "too_large"
                ? t("composer.cashPaidPhotoTooLarge")
                : e.code === "unsupported"
                  ? t("composer.cashPaidPhotoUnsupported")
                  : t("composer.cashPaidPhotoReadFailed");
          setMessage(msg);
        }
      } finally {
        pickerLock.current = false;
      }
    },
    [onChange, t]
  );

  useEffect(() => {
    if (chooserOpen || !pendingSource.current) return;
    const timer = setTimeout(() => {
      const source = pendingSource.current;
      pendingSource.current = null;
      if (source) void runPick(source);
    }, 280);
    return () => clearTimeout(timer);
  }, [chooserOpen, runPick]);

  const closeChooser = useCallback(() => {
    pendingSource.current = null;
    setChooserOpen(false);
  }, []);

  const choose = useCallback(
    (source: CashPaidPhotoSource) => {
      if (pickerLock.current || pendingSource.current) return;
      pendingSource.current = source;
      setChooserOpen(false);
    },
    []
  );

  const openChooser = useCallback(() => {
    if (pickerLock.current) return;
    setChooserOpen(true);
  }, []);

  const removePhoto = useCallback(() => {
    onChange({ picked: null, removeExisting: true });
    setMessage(null);
  }, [onChange]);

  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.label}>{t("composer.cashPaidPhotoLabel")}</LocaleUiText>
      <LocaleUiText style={styles.hint}>{t("composer.cashPaidPhotoHint")}</LocaleUiText>
      <View style={styles.row}>
        {displayUri ? (
          <Image
            source={{ uri: displayUri }}
            style={styles.thumb}
            resizeMode="contain"
            accessibilityLabel={t("composer.cashPaidPhotoPreview")}
          />
        ) : (
          <View style={styles.thumb} />
        )}
        <View style={styles.actions}>
          {displayUri ? (
            <>
              <Button
                label={t("composer.cashPaidPhotoPreview")}
                variant="secondary"
                fullWidth={false}
                onPress={() => setPreviewOpen(true)}
              />
              <Button
                label={t("composer.cashPaidPhotoReplace")}
                variant="secondary"
                fullWidth={false}
                onPress={openChooser}
              />
              <Pressable
                onPress={removePhoto}
                accessibilityRole="button"
                accessibilityLabel={t("composer.cashPaidPhotoRemoveAction")}
              >
                <LocaleUiText style={styles.hint}>
                  {t("composer.cashPaidPhotoRemoveAction")}
                </LocaleUiText>
              </Pressable>
            </>
          ) : (
            <Button
              label={t("composer.cashPaidPhotoAdd")}
              variant="secondary"
              fullWidth={false}
              onPress={openChooser}
            />
          )}
        </View>
      </View>
      {message ? (
        <LocaleUiText style={styles.error} accessibilityLiveRegion="polite">
          {message}
        </LocaleUiText>
      ) : null}

      <KeyboardSafeBottomSheet
        visible={chooserOpen}
        onClose={closeChooser}
        title={t("composer.cashPaidPhotoSheetTitle")}
      >
        <Pressable
          style={styles.sheetAction}
          onPress={() => choose("camera")}
          accessibilityRole="button"
          accessibilityLabel={t("customerCredit.photoCamera")}
        >
          <LocaleUiText style={styles.sheetActionLabel}>
            {t("customerCredit.photoCamera")}
          </LocaleUiText>
        </Pressable>
        <Pressable
          style={styles.sheetAction}
          onPress={() => choose("library")}
          accessibilityRole="button"
          accessibilityLabel={t("composer.cashPaidPhotoChoose")}
        >
          <LocaleUiText style={styles.sheetActionLabel}>
            {t("composer.cashPaidPhotoChoose")}
          </LocaleUiText>
        </Pressable>
        <Pressable
          style={styles.sheetAction}
          onPress={closeChooser}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        >
          <LocaleUiText style={styles.sheetActionLabel}>{t("common.cancel")}</LocaleUiText>
        </Pressable>
      </KeyboardSafeBottomSheet>

      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <Pressable
          style={styles.previewBackdrop}
          onPress={() => setPreviewOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        >
          {displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel={t("composer.cashPaidPhotoPreview")}
            />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
