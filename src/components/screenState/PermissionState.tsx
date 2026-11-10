import React, { useEffect } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { useI18n } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { screenStateCopy } from "./screenStateCopy";

export function PermissionState({
  source,
  onAlternative,
  onDismiss,
  body,
  onRecheck,
}: {
  source: "camera" | "library";
  onAlternative: () => void;
  onDismiss: () => void;
  /** Replaces the default purpose sentence when this screen's permission is not a customer photo. */
  body?: string;
  /** Called when the app becomes active again, so a return from Settings can be rechecked. */
  onRecheck?: () => void;
}) {
  const { lang } = useI18n();
  const copy = screenStateCopy(lang);
  useEffect(() => {
    if (!onRecheck) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") onRecheck();
    });
    return () => sub.remove();
  }, [onRecheck]);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { gap: spacing.sm, paddingVertical: spacing.sm },
      title: { ...typography.titleSm, color: c.text },
      body: { ...typography.body, color: c.textMuted, lineHeight: 22 },
      actions: { gap: spacing.sm },
    })
  );
  return (
    <View style={styles.wrap}>
      <LocaleUiText style={styles.title}>{copy.permissionTitle}</LocaleUiText>
      <LocaleUiText style={styles.body}>
        {body ?? (source === "camera" ? copy.permissionCameraBody : copy.permissionLibraryBody)}
      </LocaleUiText>
      <View style={styles.actions}>
        <Button
          label={copy.openSettings}
          variant="secondary"
          onPress={() => {
            void Linking.openSettings().catch(() => undefined);
          }}
        />
        <Button
          label={source === "camera" ? copy.usePhotosInstead : copy.useCameraInstead}
          variant="secondary"
          onPress={onAlternative}
        />
        <Button label={copy.continueWithoutPhoto} variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}
