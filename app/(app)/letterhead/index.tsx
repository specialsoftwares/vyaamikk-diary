/**
 * Letterhead gate — "Your letterhead".
 *
 * Missing template → two choices (scan/upload vs create with logo).
 * Existing template → preview + create / edit / replace; stays active until
 * a replacement save succeeds.
 */

import React, { useCallback, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";

import {
  Banner,
  Button,
  Card,
  ErrorState,
  Header,
  Loader,
  LocaleUiText,
  Screen,
} from "@/components/ui";
import { useAuth } from "@/state/auth";
import {
  getDocumentScannerCapability,
  getLetterheadRepository,
  type LetterheadConfig,
} from "@/services/letterhead";
import {
  generatedHeaderFlex,
  IMPORTED_PAGE_FIT,
} from "@/services/letterhead/letterheadVisualSpec";
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

  const scannerCap = getDocumentScannerCapability();

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      bannerWrap: { marginBottom: spacing.md },
      body: { gap: spacing.lg },
      benefit: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
      choiceCard: {
        gap: spacing.xs,
        padding: spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
      },
      choiceTitle: { ...typography.titleMd, color: colors.text },
      choiceBody: { ...typography.body, color: colors.textMuted },
      choiceHint: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.xs },
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
      generatedPreview: {
        flex: 1,
        padding: spacing.md,
        justifyContent: "flex-start",
        gap: spacing.sm,
      },
      generatedName: { ...typography.titleMd, color: colors.text },
      generatedLine: { ...typography.caption, color: colors.textMuted },
      appearanceNote: { ...typography.caption, color: colors.textSubtle },
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

  const openScanOrUpload = () => {
    router.push({
      pathname: "/(app)/letterhead/setup",
      params: { entry: scannerCap.canScan ? "scan" : "gallery" },
    });
  };

  const isGenerated =
    config?.sourceType === "generated_layout" && Boolean(config.generatedLayout);

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

      <LocaleUiText style={styles.benefit}>{t("letterhead.gateBenefit")}</LocaleUiText>

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
        <View style={styles.body}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("letterhead.entryScanTitle")}
            onPress={openScanOrUpload}
            style={styles.choiceCard}
          >
            <LocaleUiText style={styles.choiceTitle}>
              {t("letterhead.entryScanTitle")}
            </LocaleUiText>
            <LocaleUiText style={styles.choiceBody}>
              {t("letterhead.entryScanBody")}
            </LocaleUiText>
            {!scannerCap.canScan ? (
              <LocaleUiText style={styles.choiceHint}>
                {t("letterhead.entryScannerUnavailable")}
              </LocaleUiText>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("letterhead.entryLogoTitle")}
            onPress={() => router.push("/(app)/letterhead/generate")}
            style={styles.choiceCard}
          >
            <LocaleUiText style={styles.choiceTitle}>
              {t("letterhead.entryLogoTitle")}
            </LocaleUiText>
            <LocaleUiText style={styles.choiceBody}>
              {t("letterhead.entryLogoBody")}
            </LocaleUiText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Card style={styles.preview}>
            <View style={styles.imageFrame}>
              {isGenerated && config.generatedLayout ? (
                (() => {
                  const layout = config.generatedLayout;
                  const flex = generatedHeaderFlex(layout.logoAlign);
                  const logoOk =
                    Boolean(layout.logoUri) &&
                    (layout.logoUri!.startsWith("data:") ||
                      layout.logoUri!.startsWith("http"));
                  return (
                    <View
                      style={[
                        styles.generatedPreview,
                        {
                          flexDirection: flex.flexDirection,
                          justifyContent: flex.justifyContent,
                          alignItems: flex.alignItems,
                        },
                      ]}
                    >
                      {logoOk ? (
                        <Image
                          source={{ uri: layout.logoUri! }}
                          style={{ width: 72, height: 48 }}
                          resizeMode="contain"
                          accessible
                          accessibilityLabel={t("letterhead.entryLogoTitle")}
                        />
                      ) : null}
                      <View style={{ alignItems: flex.alignItems }}>
                        {layout.businessName ? (
                          <LocaleUiText
                            style={[styles.generatedName, { textAlign: flex.textAlign }]}
                          >
                            {layout.businessName}
                          </LocaleUiText>
                        ) : null}
                        {layout.address ? (
                          <LocaleUiText
                            style={[styles.generatedLine, { textAlign: flex.textAlign }]}
                          >
                            {layout.address}
                          </LocaleUiText>
                        ) : null}
                        {layout.contact ? (
                          <LocaleUiText
                            style={[styles.generatedLine, { textAlign: flex.textAlign }]}
                          >
                            {layout.contact}
                          </LocaleUiText>
                        ) : null}
                        {layout.gstin ? (
                          <LocaleUiText
                            style={[styles.generatedLine, { textAlign: flex.textAlign }]}
                          >
                            GSTIN: {layout.gstin}
                          </LocaleUiText>
                        ) : null}
                        {layout.appearance === "grayscale" ||
                        layout.appearance === "mono" ? (
                          <LocaleUiText style={styles.appearanceNote}>
                            {layout.appearance === "mono"
                              ? t("letterhead.genAppearanceMono")
                              : t("letterhead.genAppearanceGrayscale")}{" "}
                            (PDF)
                          </LocaleUiText>
                        ) : null}
                      </View>
                    </View>
                  );
                })()
              ) : (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "flex-start",
                  }}
                >
                  <Image
                    source={{ uri: config.imageDataUri ?? undefined }}
                    style={styles.image}
                    resizeMode={IMPORTED_PAGE_FIT}
                    accessible
                    accessibilityLabel={t("letterhead.gateTitle")}
                  />
                </View>
              )}
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
              label={t("letterhead.gateEdit")}
              variant="ghost"
              onPress={() =>
                router.push(
                  isGenerated
                    ? "/(app)/letterhead/generate"
                    : "/(app)/letterhead/setup"
                )
              }
            />
            <Button
              label={t("letterhead.gateReplace")}
              variant="ghost"
              onPress={openScanOrUpload}
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
