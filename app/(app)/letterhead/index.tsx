/**
 * Letterhead gate.
 *
 *   • No config saved → "Set up letterhead" CTA → /letterhead/setup
 *   • Config saved    → preview + "Create document" CTA → /letterhead/create
 *                       plus "Replace" and "Remove"
 *
 * All other screens (setup, create) assume they own the flow they were
 * routed into; this gate is the only entry point.
 */

import React, { useCallback, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";

import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import {
  getLetterheadRepository,
  type LetterheadConfig,
} from "@/services/letterhead";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { requestComposerPickerReturn } from "@/navigation";

export default function LetterheadGateScreen() {
  const t = useT();
  const router = useRouter();
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();
  const { user } = useAuth();

  const [config, setConfig] = useState<LetterheadConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      bannerWrap: { marginBottom: spacing.md },
      emptyWrap: { paddingVertical: spacing.lg },
      body: { gap: spacing.lg },
      preview: { gap: spacing.sm, padding: spacing.md },
      imageFrame: {
        width: "100%",
        aspectRatio: 210 / 297,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: colors.surfaceMuted,
        position: "relative",
      },
      image: { width: "100%", height: "100%" },
      writableOverlay: {
        position: "absolute",
        borderWidth: 2,
        borderColor: colors.primary,
        borderStyle: "dashed",
        backgroundColor: colors.primaryLight,
        opacity: 0.5,
        borderRadius: 4,
      },
      previewHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
      actions: { gap: spacing.md },
    })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const c = await getLetterheadRepository().get(user.uid);
      setConfig(c);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRemove = () => {
    if (!user || !config) return;
    Alert.alert(
      t("letterhead.gateRemoveConfirm"),
      t("letterhead.gateRemoveConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setActionError(null);
            setRemoving(true);
            try {
              await getLetterheadRepository().remove(user.uid);
              setConfig(null);
            } catch (e) {
              setActionError(userFacingMessage(e));
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen scroll>
      <Header
        title={t("letterhead.gateTitle")}
        showBack
        backFrom="you"
        onBackPress={() => {
          if (fromPicker === "1") {
            requestComposerPickerReturn("picker");
          }
          if (router.canGoBack()) router.back();
          else router.replace("/(app)/(tabs)/you");
        }}
      />

      {actionError ? (
        <View style={styles.bannerWrap}>
          <Banner tone="danger" message={actionError} />
        </View>
      ) : null}

      {loading ? (
        <Loader fullscreen message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !config ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t("letterhead.gateMissingTitle")}
            message={t("letterhead.gateMissingMessage")}
            actionLabel={t("letterhead.gateSetup")}
            onAction={() => router.push("/(app)/letterhead/setup")}
          />
        </View>
      ) : (
        <View style={styles.body}>
          <Card style={styles.preview}>
            <View style={styles.imageFrame}>
              <Image
                source={{ uri: config.imageDataUri }}
                style={styles.image}
                resizeMode="contain"
                accessible
                accessibilityLabel={t("letterhead.gateTitle")}
              />
              {/* Translucent overlay marking the writable area */}
              <View
                pointerEvents="none"
                style={[
                  styles.writableOverlay,
                  {
                    top: `${config.margins.topPct}%`,
                    bottom: `${config.margins.bottomPct}%`,
                    left: `${config.margins.leftPct}%`,
                    right: `${config.margins.rightPct}%`,
                  },
                ]}
              />
            </View>
            <LocaleUiText style={styles.previewHint}>
              {t("letterhead.setupAdjust")}: {Math.round(config.margins.topPct)}% /{" "}
              {Math.round(config.margins.rightPct)}% /{" "}
              {Math.round(config.margins.bottomPct)}% /{" "}
              {Math.round(config.margins.leftPct)}%
            </LocaleUiText>
          </Card>

          <View style={styles.actions}>
            <Button
              label={t("letterhead.gateCreate")}
              onPress={() => router.push("/(app)/letterhead/create")}
            />
            <Button
              label={t("letterhead.historyAction")}
              variant="secondary"
              onPress={() => router.push("/(app)/letterhead/history")}
            />
            <Button
              label={t("letterhead.gateReplace")}
              variant="ghost"
              onPress={() => router.push("/(app)/letterhead/setup")}
            />
            <Button
              label={t("letterhead.gateRemove")}
              variant="ghost"
              onPress={onRemove}
              loading={removing}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

