/**
 * Letterhead setup: pick template image + adjust writable area + optional
 * signature/stamp assets and reusable letter defaults, then save.
 *
 * Everything is stored on the user's `LetterheadConfig` (base64 data URIs for
 * images) — user-scoped, never shared. No Vyaamikk branding is added here or
 * to the generated PDF; this screen only prepares the document base.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Image, InteractionManager, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Banner,
  Button,
  Card,
  Header,
  PermissionRationaleModal,
  Screen,
  TextField, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import {
  analyzeTemplateImage,
  DEFAULT_LETTERHEAD_MARGINS,
  getLetterheadRepository,
  LetterheadAssetError,
  pickLetterheadAsset,
  type LetterheadConfig,
  type LetterheadMargins,
  type TemplateWarningKey,
} from "@/services/letterhead";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { AppError, userFacingMessage } from "@/domain/errors";

interface PickedImage {
  dataUri: string;
  width: number;
  height: number;
  approxBytes: number;
}

type PickTarget = "template" | "signature" | "stamp";

function waitForPickerPresentation(): Promise<void> {
  const delayMs = Platform.OS === "ios" ? 450 : 200;
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, delayMs));
  });
}

export default function LetterheadSetupScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();

  const [existing, setExisting] = useState<LetterheadConfig | null>(null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [margins, setMargins] = useState<LetterheadMargins>(DEFAULT_LETTERHEAD_MARGINS);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [stampUri, setStampUri] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [defaultClose, setDefaultClose] = useState("");
  const [templateWarnings, setTemplateWarnings] = useState<TemplateWarningKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionRationale, setShowPermissionRationale] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PickTarget>("template");

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
      banner: { marginBottom: spacing.md },
      card: { gap: spacing.md, padding: spacing.md },
      imageFrame: {
        width: "100%",
        aspectRatio: 210 / 297,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: colors.surfaceMuted,
        position: "relative",
      },
      imageFramePlaceholder: {
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.divider,
        borderStyle: "dashed",
      },
      image: { width: "100%", height: "100%" },
      placeholderText: { ...typography.titleLg, color: colors.textSubtle, letterSpacing: 2 },
      writableOverlay: {
        position: "absolute",
        borderWidth: 2,
        borderColor: colors.primary,
        borderStyle: "dashed",
        backgroundColor: colors.primaryLight,
        opacity: 0.5,
        borderRadius: 4,
      },
      sectionHeading: {
        ...typography.captionStrong,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      },
      marginRow: { flexDirection: "row", gap: spacing.md },
      marginField: { flex: 1 },
      assetRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      },
      assetThumb: {
        width: 64,
        height: 40,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
      },
      assetBtns: { flex: 1, flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
      assetLabel: { ...typography.captionStrong, color: colors.text, marginBottom: spacing.xs },
      assetHint: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.xs },
      cta: { marginTop: spacing.lg },
    })
  );

  // Preload an existing config so "Replace" preserves margins/assets/defaults.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getLetterheadRepository()
      .get(user.uid)
      .then((c) => {
        if (cancelled || !c) return;
        setExisting(c);
        setMargins(c.margins ?? DEFAULT_LETTERHEAD_MARGINS);
        setSignatureUri(c.signatureDataUri ?? null);
        setStampUri(c.stampDataUri ?? null);
        setDefaultName(c.defaultSenderName ?? "");
        setDefaultTitle(c.defaultSenderTitle ?? "");
        setDefaultClose(c.defaultComplimentaryClose ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const captureTemplate = useCallback((): Promise<boolean> => {
    return (async () => {
      const pending = await ImagePicker.getPendingResultAsync();
      let asset: ImagePicker.ImagePickerAsset | null = null;
      if (pending && "assets" in pending && pending.assets?.[0]) {
        asset = pending.assets[0];
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
          base64: true,
          exif: false,
        });
        if (result.canceled || !result.assets?.[0]) return false;
        asset = result.assets[0];
      }
      if (!asset?.base64) throw new Error("IMAGE_READ_FAILED");
      const mime =
        asset.mimeType ??
        (asset.fileName?.toLowerCase().endsWith(".jpg") ||
        asset.fileName?.toLowerCase().endsWith(".jpeg")
          ? "image/jpeg"
          : "image/png");
      const next: PickedImage = {
        dataUri: `data:${mime};base64,${asset.base64}`,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        approxBytes: Math.ceil((asset.base64.length * 3) / 4),
      };
      setPicked(next);
      setTemplateWarnings(analyzeTemplateImage(next).warnings);
      return true;
    })();
  }, []);

  const captureAsset = useCallback(
    async (kind: "signature" | "stamp"): Promise<boolean> => {
      const asset = await pickLetterheadAsset();
      if (!asset) return false;
      if (kind === "signature") setSignatureUri(asset.dataUri);
      else setStampUri(asset.dataUri);
      return true;
    },
    []
  );

  const runPick = useCallback(
    async (target: PickTarget) => {
      if (target === "template") {
        await captureTemplate();
      } else {
        await captureAsset(target);
      }
    },
    [captureTemplate, captureAsset]
  );

  const startPick = useCallback(
    async (target: PickTarget) => {
      if (picking || permissionBusy) return;
      setError(null);
      setPendingTarget(target);

      if (Platform.OS === "android") {
        const current = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!current.granted) {
          if (current.canAskAgain === false) {
            setError(t("letterhead.setupPermissionDenied"));
            return;
          }
          setShowPermissionRationale(true);
          return;
        }
      }

      setPicking(true);
      try {
        await runPick(target);
      } catch (e) {
        setError(mapPickError(e, t));
      } finally {
        setPicking(false);
      }
    },
    [picking, permissionBusy, runPick, t]
  );

  const onRationaleAllow = useCallback(async () => {
    if (permissionBusy) return;
    setPermissionBusy(true);
    setError(null);
    try {
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setShowPermissionRationale(false);
      if (!r.granted) {
        setError(t("letterhead.setupPermissionDenied"));
        return;
      }
      await waitForPickerPresentation();
      setPicking(true);
      await runPick(pendingTarget);
    } catch (e) {
      setError(mapPickError(e, t));
    } finally {
      setPicking(false);
      setPermissionBusy(false);
    }
  }, [permissionBusy, runPick, pendingTarget, t]);

  const updateMargin = (key: keyof LetterheadMargins) => (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    const n = Math.max(0, Math.min(80, parseInt(cleaned || "0", 10)));
    setMargins((m) => ({ ...m, [key]: n }));
  };

  const templateUri = picked?.dataUri ?? existing?.imageDataUri ?? null;

  const onSave = async () => {
    if (!user) return;
    setError(null);
    if (!templateUri) {
      setError(t("letterhead.setupNeedImage"));
      return;
    }
    setSaving(true);
    try {
      await getLetterheadRepository().save(user.uid, {
        imageDataUri: templateUri,
        imageWidth: picked?.width ?? existing?.imageWidth ?? 0,
        imageHeight: picked?.height ?? existing?.imageHeight ?? 0,
        margins,
        signatureDataUri: signatureUri,
        stampDataUri: stampUri,
        defaultSenderName: defaultName.trim() || null,
        defaultSenderTitle: defaultTitle.trim() || null,
        defaultComplimentaryClose: defaultClose.trim() || null,
        repeatTemplateAllPages: true,
      });
      router.replace("/(app)/letterhead");
    } catch (e) {
      if (e instanceof AppError && e.code === "save_failed") {
        setError(t("letterhead.setupImageTooLarge"));
      } else {
        setError(userFacingMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const busy = picking || permissionBusy || saving;

  return (
    <Screen scroll form>
      <Header title={t("letterhead.setupTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.setupIntro")}</LocaleUiText>

      {error ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}

      {templateWarnings.map((w) => (
        <View key={w} style={styles.banner}>
          <Banner tone="warning" message={t(w)} />
        </View>
      ))}

      <Card style={styles.card}>
        {templateUri ? (
          <View style={styles.imageFrame}>
            <Image source={{ uri: templateUri }} style={styles.image} resizeMode="contain" />
            <View
              pointerEvents="none"
              style={[
                styles.writableOverlay,
                {
                  top: `${margins.topPct}%`,
                  bottom: `${margins.bottomPct}%`,
                  left: `${margins.leftPct}%`,
                  right: `${margins.rightPct}%`,
                },
              ]}
            />
          </View>
        ) : (
          <View style={[styles.imageFrame, styles.imageFramePlaceholder]}>
            <Text style={styles.placeholderText}>A4</Text>
          </View>
        )}
        <Button
          label={templateUri ? t("letterhead.setupReplace") : t("letterhead.setupPick")}
          variant="secondary"
          onPress={() => void startPick("template")}
          loading={picking && pendingTarget === "template"}
          disabled={busy}
        />
      </Card>

      <LocaleUiText style={styles.sectionHeading}>{t("letterhead.setupAdjust")}</LocaleUiText>
      <View style={styles.marginRow}>
        <TextField
          label={t("letterhead.setupTopMargin")}
          keyboardType="number-pad"
          value={String(margins.topPct)}
          onChangeText={updateMargin("topPct")}
          maxLength={2}
          containerStyle={styles.marginField}
        />
        <TextField
          label={t("letterhead.setupBottomMargin")}
          keyboardType="number-pad"
          value={String(margins.bottomPct)}
          onChangeText={updateMargin("bottomPct")}
          maxLength={2}
          containerStyle={styles.marginField}
        />
      </View>
      <View style={styles.marginRow}>
        <TextField
          label={t("letterhead.setupLeftMargin")}
          keyboardType="number-pad"
          value={String(margins.leftPct)}
          onChangeText={updateMargin("leftPct")}
          maxLength={2}
          containerStyle={styles.marginField}
        />
        <TextField
          label={t("letterhead.setupRightMargin")}
          keyboardType="number-pad"
          value={String(margins.rightPct)}
          onChangeText={updateMargin("rightPct")}
          maxLength={2}
          containerStyle={styles.marginField}
        />
      </View>

      {/* --- Optional signature / stamp --- */}
      <LocaleUiText style={styles.sectionHeading}>{t("letterhead.assetsSection")}</LocaleUiText>
      <Card style={styles.card}>
        <View>
          <LocaleUiText style={styles.assetLabel}>{t("letterhead.assetSignature")}</LocaleUiText>
          <View style={styles.assetRow}>
            {signatureUri ? (
              <Image source={{ uri: signatureUri }} style={styles.assetThumb} resizeMode="contain" />
            ) : null}
            <View style={styles.assetBtns}>
              <Button
                label={signatureUri ? t("letterhead.assetReplace") : t("letterhead.assetAdd")}
                variant="secondary"
                size="md"
                onPress={() => void startPick("signature")}
                loading={picking && pendingTarget === "signature"}
                disabled={busy}
              />
              {signatureUri ? (
                <Button
                  label={t("letterhead.assetRemove")}
                  variant="ghost"
                  size="md"
                  onPress={() => setSignatureUri(null)}
                  disabled={busy}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View>
          <LocaleUiText style={styles.assetLabel}>{t("letterhead.assetStamp")}</LocaleUiText>
          <View style={styles.assetRow}>
            {stampUri ? (
              <Image source={{ uri: stampUri }} style={styles.assetThumb} resizeMode="contain" />
            ) : null}
            <View style={styles.assetBtns}>
              <Button
                label={stampUri ? t("letterhead.assetReplace") : t("letterhead.assetAdd")}
                variant="secondary"
                size="md"
                onPress={() => void startPick("stamp")}
                loading={picking && pendingTarget === "stamp"}
                disabled={busy}
              />
              {stampUri ? (
                <Button
                  label={t("letterhead.assetRemove")}
                  variant="ghost"
                  size="md"
                  onPress={() => setStampUri(null)}
                  disabled={busy}
                />
              ) : null}
            </View>
          </View>
        </View>
        <LocaleUiText style={styles.assetHint}>{t("letterhead.assetHint")}</LocaleUiText>
      </Card>

      {/* --- Reusable letter defaults --- */}
      <LocaleUiText style={styles.sectionHeading}>{t("letterhead.sectionClosing")}</LocaleUiText>
      <TextField
        label={t("letterhead.fieldName")}
        value={defaultName}
        onChangeText={setDefaultName}
        placeholder={t("letterhead.fieldNamePlaceholder")}
        maxLength={80}
      />
      <TextField
        label={t("letterhead.fieldDesignation")}
        value={defaultTitle}
        onChangeText={setDefaultTitle}
        placeholder={t("letterhead.fieldDesignationPlaceholder")}
        maxLength={80}
      />
      <TextField
        label={t("letterhead.fieldClosing")}
        value={defaultClose}
        onChangeText={setDefaultClose}
        placeholder={t("letterhead.fieldClosingPlaceholder")}
        maxLength={80}
      />

      <View style={styles.cta}>
        <Button
          label={saving ? t("letterhead.setupSaving") : t("letterhead.setupSave")}
          onPress={onSave}
          loading={saving}
          disabled={!templateUri || picking || permissionBusy}
        />
      </View>

      <PermissionRationaleModal
        visible={showPermissionRationale}
        title={t("letterhead.setupPermissionTitle")}
        body={t("letterhead.setupPermissionBody")}
        allowLabel={t("letterhead.setupPermissionAllow")}
        notNowLabel={t("common.notNow")}
        loading={permissionBusy}
        onAllow={() => void onRationaleAllow()}
        onDismiss={() => {
          if (!permissionBusy) setShowPermissionRationale(false);
        }}
      />
    </Screen>
  );
}

function mapPickError(e: unknown, t: (k: string) => string): string {
  if (e instanceof LetterheadAssetError) {
    return e.code === "too_large"
      ? t("letterhead.assetTooLarge")
      : t("letterhead.assetReadFailed");
  }
  if (e instanceof Error && e.message === "IMAGE_READ_FAILED") {
    return t("letterhead.setupImageReadFailed");
  }
  return userFacingMessage(e);
}
