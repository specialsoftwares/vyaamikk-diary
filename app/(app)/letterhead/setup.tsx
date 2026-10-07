/**
 * Letterhead setup: pick template image + adjust writable area + optional
 * signature/stamp assets and reusable letter defaults, then save.
 *
 * Template selection copies into an app-private file (no full-resolution
 * base64 in React state). Storage upload uses Expo File + resumable upload
 * so React Native never builds ArrayBuffer-backed Blobs (RN ≥ 0.74).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Image, InteractionManager, Platform, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import {
  Banner,
  Button,
  Card,
  Header,
  PermissionRationaleModal,
  Screen,
  TextField,
  LocaleUiText,
} from "@/components/ui";
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
import {
  assertCandidateOwner,
  LetterheadCandidateError,
  persistLetterheadCandidateFromAsset,
  persistLetterheadCandidateFromLocalFile,
  readCandidateDataUri,
  retireLetterheadCandidate,
  type LetterheadCandidateImage,
} from "@/services/letterhead/letterheadCandidateImage";
import {
  getDocumentScannerCapability,
  scanLetterheadDocument,
} from "@/services/letterhead/documentScanner";
import { useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { AppError, userFacingMessage } from "@/domain/errors";
import { getActiveBackend } from "@/config/env";

type PickTarget = "template" | "signature" | "stamp";
type TemplateEntry = "scan" | "gallery";

function waitForPickerPresentation(): Promise<void> {
  const delayMs = Platform.OS === "ios" ? 450 : 200;
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, delayMs));
  });
}

export default function LetterheadSetupScreen() {
  const t = useT();
  const router = useRouter();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const preferredEntry: TemplateEntry =
    entry === "scan" && getDocumentScannerCapability().canScan ? "scan" : "gallery";
  const { user } = useAuth();

  const [existing, setExisting] = useState<LetterheadConfig | null>(null);
  const [candidate, setCandidate] = useState<LetterheadCandidateImage | null>(null);
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

  useEffect(() => {
    return () => {
      void retireLetterheadCandidate(candidate);
    };
    // Only retire on unmount of the last candidate reference held in closure
    // via explicit replace paths below; avoid retiring the live candidate on
    // every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCandidate = useCallback((next: LetterheadCandidateImage) => {
    setCandidate((prev) => {
      if (prev) void retireLetterheadCandidate(prev);
      return next;
    });
    setTemplateWarnings(
      analyzeTemplateImage({
        width: next.width,
        height: next.height,
        approxBytes: next.approxBytes,
      }).warnings
    );
  }, []);

  const captureTemplateFromGallery = useCallback((): Promise<boolean> => {
    return (async () => {
      if (!user?.uid) throw new LetterheadCandidateError("wrong_owner");

      const pending = await ImagePicker.getPendingResultAsync();
      let asset: ImagePicker.ImagePickerAsset | null = null;
      if (pending && "assets" in pending && pending.assets?.[0]) {
        asset = pending.assets[0];
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
          // File-based path — do not request ImagePicker base64 into JS heap.
          base64: false,
          exif: false,
        });
        if (result.canceled || !result.assets?.[0]) return false;
        asset = result.assets[0];
      }

      const next = await persistLetterheadCandidateFromAsset(user.uid, asset);
      applyCandidate(next);
      return true;
    })();
  }, [user?.uid, applyCandidate]);

  const captureTemplateFromScanner = useCallback((): Promise<boolean> => {
    return (async () => {
      if (!user?.uid) throw new LetterheadCandidateError("wrong_owner");
      const scanned = await scanLetterheadDocument({
        pageLimit: 1,
        galleryImportAllowed: true,
      });
      if (scanned.status === "canceled") return false;
      if (scanned.status === "unavailable") {
        setError(t("letterhead.entryScannerUnavailable"));
        return captureTemplateFromGallery();
      }
      if (scanned.status !== "success") {
        throw new LetterheadCandidateError("read_failed");
      }
      const next = await persistLetterheadCandidateFromLocalFile(user.uid, scanned.localUri, {
        mimeType: "image/jpeg",
      });
      applyCandidate(next);
      return true;
    })();
  }, [user?.uid, applyCandidate, captureTemplateFromGallery, t]);

  const captureTemplate = useCallback((): Promise<boolean> => {
    if (preferredEntry === "scan") return captureTemplateFromScanner();
    return captureTemplateFromGallery();
  }, [preferredEntry, captureTemplateFromScanner, captureTemplateFromGallery]);

  const captureAsset = useCallback(async (kind: "signature" | "stamp"): Promise<boolean> => {
    const asset = await pickLetterheadAsset();
    if (!asset) return false;
    if (kind === "signature") setSignatureUri(asset.dataUri);
    else setStampUri(asset.dataUri);
    return true;
  }, []);

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

      // ML Kit Document Scanner owns its camera/gallery UI — do not require
      // app media-library permission before launching the scanner.
      const skipGalleryPermission =
        target === "template" &&
        preferredEntry === "scan" &&
        getDocumentScannerCapability().canScan;

      if (Platform.OS === "android" && !skipGalleryPermission) {
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
    [picking, permissionBusy, runPick, preferredEntry, t]
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

  const templateUri = candidate?.localUri ?? existing?.imageDataUri ?? null;

  const onSave = async () => {
    if (!user) return;
    setError(null);
    if (!templateUri) {
      setError(t("letterhead.setupNeedImage"));
      return;
    }
    if (saving) return;
    setSaving(true);
    const previousExisting = existing;
    try {
      let imageForSave = templateUri;
      if (candidate) {
        assertCandidateOwner(candidate, user.uid);
        const backend = getActiveBackend();
        if (backend === "local-mock") {
          // Mock has no Storage — persist inline data URI once at commit.
          imageForSave = await readCandidateDataUri(candidate);
        } else {
          imageForSave = candidate.localUri;
        }
      }

      const saved = await getLetterheadRepository().save(user.uid, {
        sourceType: "imported_image",
        generatedLayout: null,
        imageDataUri: imageForSave,
        imageWidth: candidate?.width ?? existing?.imageWidth ?? 0,
        imageHeight: candidate?.height ?? existing?.imageHeight ?? 0,
        margins,
        signatureDataUri: signatureUri,
        stampDataUri: stampUri,
        defaultSenderName: defaultName.trim() || null,
        defaultSenderTitle: defaultTitle.trim() || null,
        defaultComplimentaryClose: defaultClose.trim() || null,
        repeatTemplateAllPages: true,
      });
      setExisting(saved);
      if (candidate) {
        await retireLetterheadCandidate(candidate);
        setCandidate(null);
      }
      router.replace("/(app)/letterhead");
    } catch (e) {
      // Keep prepared candidate + previous active template.
      if (previousExisting) setExisting(previousExisting);
      if (e instanceof AppError && e.code === "save_failed") {
        setError(t("letterhead.setupImageTooLarge"));
      } else if (e instanceof LetterheadCandidateError && e.code === "wrong_owner") {
        setError(t("letterhead.setupSaveFailedUnchanged"));
      } else {
        setError(t("letterhead.setupSaveFailedUnchanged"));
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
        {preferredEntry === "scan" && getDocumentScannerCapability().canScan ? (
          <LocaleUiText style={styles.assetHint}>
            {t("letterhead.entryScanBody")}
          </LocaleUiText>
        ) : null}
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
          onPress={() => void onSave()}
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
  if (e instanceof LetterheadCandidateError) {
    if (e.code === "too_large") return t("letterhead.setupImageTooLarge");
    if (e.code === "wrong_owner") return t("letterhead.setupSaveFailedUnchanged");
    return t("letterhead.setupImageReadFailed");
  }
  if (e instanceof Error && e.message === "IMAGE_READ_FAILED") {
    return t("letterhead.setupImageReadFailed");
  }
  // Never surface raw RN Blob / Storage internals.
  const raw = e instanceof Error ? e.message : "";
  if (/Creating blobs from|ArrayBufferView/i.test(raw)) {
    return t("letterhead.setupImageReadFailed");
  }
  return userFacingMessage(e);
}
