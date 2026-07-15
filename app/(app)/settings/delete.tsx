import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { getActiveBackend } from "@/config/env";
import { DELETION_GRACE_DAYS } from "@/domain/identityLifecycle";
import { openPublicLinkOrExplain } from "@/config/publicLinks";
import { getAuthEntryHref } from "@/config/authWrapper";
import { Banner, Button, Card, Header, Screen, TextField, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";

const CONFIRMATION_TEXT = "DELETE";

export default function DeleteAccountScreen() {
  const t = useT();
  const router = useRouter();
  const { requestAccountDeletion } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeKey = useMemo(() => {
    const backend = getActiveBackend();
    return backend === "local-mock" ? "deviceOnly" : "deviceAndServer";
  }, []);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      banner: { marginBottom: spacing.lg },
      scope: { marginBottom: spacing.md },
      body: { ...typography.bodyStrong, color: colors.text, marginBottom: spacing.sm },
      list: { gap: spacing.sm },
      bulletRow: { flexDirection: "row", gap: spacing.sm },
      bulletDot: { ...typography.body, color: colors.textMuted, width: 12 },
      bulletText: { ...typography.body, color: colors.textMuted, flex: 1 },
      confirmBlock: { gap: spacing.md, marginTop: spacing.xl },
      webLink: { ...typography.captionStrong, color: colors.primaryDark, marginTop: spacing.sm },
    })
  );

  const Bullet = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );

  const canSubmit = confirm.trim().toUpperCase() === CONFIRMATION_TEXT;

  const finishWithResult = (
    serverDetailKey?: "pending" | "failed" | "partial"
  ) => {
    if (serverDetailKey === "pending") {
      Alert.alert(
        t("deleteAccount.resultGraceTitle"),
        t("deleteAccount.result_grace"),
        [{ text: t("common.ok"), onPress: () => router.replace(getAuthEntryHref()) }]
      );
      return;
    }
    if (serverDetailKey === "failed") {
      Alert.alert(
        t("deleteAccount.resultPartialTitle"),
        t(`deleteAccount.result_${serverDetailKey}`),
        [{ text: t("common.ok"), onPress: () => router.replace(getAuthEntryHref()) }]
      );
      return;
    }
    router.replace(getAuthEntryHref());
  };

  const onConfirm = () => {
    if (!canSubmit) return;
    Alert.alert(
      t("deleteAccount.confirmPrompt"),
      t("deleteAccount.confirmPromptBody", { days: DELETION_GRACE_DAYS }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            setError(null);
            try {
              const result = await requestAccountDeletion();
              finishWithResult(result.serverDetailKey);
            } catch (e) {
              setError(userFacingMessage(e));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const openWebDeletion = () => {
    void openPublicLinkOrExplain("accountDeletion", {
      title: t("deleteAccount.title"),
      unavailableMessage:
        "The web account-deletion page is not configured yet. Use in-app deletion, or contact support.",
    });
  };

  return (
    <Screen scroll>
      <Header
        variant="executive"
        title={t("deleteAccount.title")}
        showBack
        backFrom="settings"
      />

      <View style={styles.banner}>
        <Banner
          tone="danger"
          title={t("deleteAccount.bannerTitle")}
          message={t("deleteAccount.bannerBody")}
        />
      </View>

      <View style={styles.scope}>
        <Banner
          tone="warning"
          title={t(`deleteAccount.scopeTitle_${scopeKey}`)}
          message={t(`deleteAccount.scopeBody_${scopeKey}`)}
        />
      </View>

      <Card>
        <LocaleUiText style={styles.body}>{t("deleteAccount.happensTitle")}</LocaleUiText>
        <View style={styles.list}>
          <Bullet>{t("deleteAccount.happensList1")}</Bullet>
          <Bullet>{t("deleteAccount.happensList2")}</Bullet>
          <Bullet>{t("deleteAccount.happensList3")}</Bullet>
          <Bullet>{t("deleteAccount.happensList4")}</Bullet>
          <Bullet>{t("deleteAccount.happensList5")}</Bullet>
          <Bullet>{t("deleteAccount.happensList6")}</Bullet>
        </View>
      </Card>

      <View style={styles.confirmBlock}>
        <TextField
          label={t("deleteAccount.confirmLabel", { word: CONFIRMATION_TEXT })}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={CONFIRMATION_TEXT}
          error={error}
        />
        <Button
          label={t("deleteAccount.confirmButton")}
          variant="danger"
          disabled={!canSubmit}
          loading={submitting}
          onPress={onConfirm}
        />
        <Pressable onPress={openWebDeletion}>
          <LocaleUiText style={styles.webLink}>{t("deleteAccount.webDeletionLink")}</LocaleUiText>
        </Pressable>
      </View>
    </Screen>
  );
}
