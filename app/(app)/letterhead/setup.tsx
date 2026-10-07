/**
 * Letterhead setup: pick/scan template + writing area + signature/stamp + save.
 *
 * Uploads use authenticated media REST (no Firebase JS Blob construction).
 * Candidate ownership uses SyncSessionToken; fileGeneration is path-only.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, InteractionManager, Platform, StyleSheet, View } from "react-native";
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
import { WritingAreaControls } from "@/components/letterhead/WritingAreaControls";
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
  validateWritingMargins,
} from "@/services/letterhead";
import {
  assertCandidateOwner,
  beginLetterheadCapture,
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
import { IMPORTED_PAGE_FIT } from "@/services/letterhead/letterheadVisualSpec";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
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
  const scannerOk = getDocumentScannerCapability().canScan;
  const preferredEntry: TemplateEntry =
    entry === "scan" && scannerOk ? "scan" : "gallery";
  const isGalleryFallback = preferredEntry === "gallery";
  const { user } = useAuth();

  const [existing, setExisting] = useState<LetterheadConfig | null>(null);
  const [candidate, setCandidate] = useState<LetterheadCandidateImage | null>(null);
  const candidateRef = useRef<LetterheadCandidateImage | null>(null);
  const mountedRef = useRef(true);
  const pickGuard = useRef(false);
  const saveGuard = useRef(false);

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
      sectionHeading: {
        ...typography.captionStrong,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      },
      assetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
      assetThumb: {
        width: 64,
        height: 40,
        borderRadius: 6,
        backgroundColor: colors.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.divider,
      },
      assetBtns: { flex: 1, flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
      assetLabel: { ...typography.captionStrong, color: colors.text, marginBottom: spacing.xs },
      assetHint: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.xs },
      cta: { marginTop: spacing.lg },
      bgImage: { width: "100%", height: "100%" },
    })
  );

  const replaceCandidate = useCallback((next: LetterheadCandidateImage | null) => {
    const prev = candidateRef.current;
    candidateRef.current = next;
    setCandidate(next);
    if (prev && prev.localUri !== next?.localUri) {
      void retireLetterheadCandidate(prev);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const owned = candidateRef.current;
      candidateRef.current = null;
      if (owned) void retireLetterheadCandidate(owned);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getLetterheadRepository()
      .get(user.uid)
      .then((c) => {
        if (cancelled || !mountedRef.current || !c) return;
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

  const applyCandidate = useCallback(
    (next: LetterheadCandidateImage) => {
      if (!mountedRef.current) {
        void retireLetterheadCandidate(next);
        return;
      }
      replaceCandidate(next);
      setTemplateWarnings(
        analyzeTemplateImage({
          width: next.width,
          height: next.height,
          approxBytes: next.approxBytes,
        }).warnings
      );
    },
    [replaceCandidate]
  );

  const captureTemplateFromGallery = useCallback((): Promise<boolean> => {
    return (async () => {
      if (!user?.uid) throw new LetterheadCandidateError("wrong_owner");
      const ctx = beginLetterheadCapture(user.uid);

      const pending = await ImagePicker.getPendingResultAsync();
      let asset: ImagePicker.ImagePickerAsset | null = null;
      if (pending && "assets" in pending && pending.assets?.[0]) {
        asset = pending.assets[0];
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
          base64: false,
          exif: false,
        });
        if (result.canceled || !result.assets?.[0]) return false;
        asset = result.assets[0];
      }

      const next = await persistLetterheadCandidateFromAsset(ctx, asset);
      if (!mountedRef.current) {
        await retireLetterheadCandidate(next);
        return false;
      }
      applyCandidate(next);
      return true;
    })();
  }, [user?.uid, applyCandidate]);

  const captureTemplateFromScanner = useCallback((): Promise<boolean> => {
    return (async () => {
      if (!user?.uid) throw new LetterheadCandidateError("wrong_owner");
      const ctx = beginLetterheadCapture(user.uid);
      const scanned = await scanLetterheadDocument({
        pageLimit: 1,
        galleryImportAllowed: true,
      });
      if (scanned.status === "canceled") return false;
      if (scanned.status === "unavailable") {
        if (mountedRef.current) setError(t("letterhead.entryScannerUnavailable"));
        return captureTemplateFromGallery();
      }
      if (scanned.status !== "success") {
        throw new LetterheadCandidateError("read_failed");
      }
      const next = await persistLetterheadCandidateFromLocalFile(ctx, scanned.localUri, {
        mimeType: "image/jpeg",
      });
      if (!mountedRef.current) {
        await retireLetterheadCandidate(next);
        return false;
      }
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
    if (!mountedRef.current) return false;
    if (kind === "signature") setSignatureUri(asset.dataUri);
    else setStampUri(asset.dataUri);
    return true;
  }, []);

  const runPick = useCallback(
    async (target: PickTarget) => {
      if (target === "template") await captureTemplate();
      else await captureAsset(target);
    },
    [captureTemplate, captureAsset]
  );

  const startPick = useCallback(
    async (target: PickTarget) => {
      if (pickGuard.current || picking || permissionBusy) return;
      pickGuard.current = true;
      setError(null);
      setPendingTarget(target);

      const skipGalleryPermission =
        target === "template" && preferredEntry === "scan" && scannerOk;

      try {
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
        await runPick(target);
      } catch (e) {
        if (mountedRef.current) setError(mapPickError(e, t));
      } finally {
        setPicking(false);
        pickGuard.current = false;
      }
    },
    [picking, permissionBusy, runPick, preferredEntry, scannerOk, t]
  );

  const onRationaleAllow = useCallback(async () => {
    if (permissionBusy || pickGuard.current) return;
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
      pickGuard.current = true;
      setPicking(true);
      await runPick(pendingTarget);
    } catch (e) {
      if (mountedRef.current) setError(mapPickError(e, t));
    } finally {
      setPicking(false);
      setPermissionBusy(false);
      pickGuard.current = false;
    }
  }, [permissionBusy, runPick, pendingTarget, t]);

  const templateUri = candidate?.localUri ?? existing?.imageDataUri ?? null;

  const onSave = async () => {
    if (!user || saveGuard.current) return;
    setError(null);
    if (!templateUri) {
      setError(t("letterhead.setupNeedImage"));
      return;
    }
    const bounds = validateWritingMargins(margins);
    if (!bounds.ok) {
      setError(t("letterhead.setupSaveFailedUnchanged"));
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    const previousExisting = existing;
    try {
      let imageForSave = templateUri;
      if (candidate) {
        assertCandidateOwner(candidate, user.uid);
        const backend = getActiveBackend();
        if (backend === "local-mock") {
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
      if (!mountedRef.current) return;
      setExisting(saved);
      if (candidate) {
        const done = candidate;
        candidateRef.current = null;
        setCandidate(null);
        await retireLetterheadCandidate(done);
      }
      router.replace("/(app)/letterhead");
    } catch (e) {
      if (previousExisting) setExisting(previousExisting);
      if (e instanceof AppError && e.code === "save_failed") {
        setError(t("letterhead.setupImageTooLarge"));
      } else {
        setError(t("letterhead.setupSaveFailedUnchanged"));
      }
    } finally {
      setSaving(false);
      saveGuard.current = false;
    }
  };

  const busy = picking || permissionBusy || saving;

  return (
    <Screen scroll form>
      <Header title={t("letterhead.setupTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.setupIntro")}</LocaleUiText>

      {isGalleryFallback ? (
        <View style={styles.banner}>
          <Banner tone="info" message={t("letterhead.setupGalleryFallback")} />
        </View>
      ) : null}

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
        <WritingAreaControls
          margins={margins}
          onChange={setMargins}
          background={
            templateUri ? (
              <Image
                source={{ uri: templateUri }}
                style={styles.bgImage}
                resizeMode={IMPORTED_PAGE_FIT}
              />
            ) : undefined
          }
          labels={{
            section: t("letterhead.setupAdjust"),
            top: t("letterhead.setupTopMargin"),
            bottom: t("letterhead.setupBottomMargin"),
            left: t("letterhead.setupLeftMargin"),
            right: t("letterhead.setupRightMargin"),
            decrease: t("letterhead.setupDecrease"),
            increase: t("letterhead.setupIncrease"),
          }}
        />
        <Button
          label={templateUri ? t("letterhead.setupReplace") : t("letterhead.setupPick")}
          variant="secondary"
          onPress={() => void startPick("template")}
          loading={picking && pendingTarget === "template"}
          disabled={busy}
        />
        {preferredEntry === "scan" && scannerOk ? (
          <LocaleUiText style={styles.assetHint}>{t("letterhead.entryScanBody")}</LocaleUiText>
        ) : (
          <LocaleUiText style={styles.assetHint}>
            {t("letterhead.incompleteGalleryAppearance")}
          </LocaleUiText>
        )}
      </Card>

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
    if (e.code === "unsupported_format") return t("letterhead.entryCouldNotOpenPhoto");
    return t("letterhead.setupImageReadFailed");
  }
  if (e instanceof Error && e.message === "IMAGE_READ_FAILED") {
    return t("letterhead.setupImageReadFailed");
  }
  const raw = e instanceof Error ? e.message : "";
  if (/Creating blobs from|ArrayBufferView/i.test(raw)) {
    return t("letterhead.setupImageReadFailed");
  }
  return userFacingMessage(e);
}
