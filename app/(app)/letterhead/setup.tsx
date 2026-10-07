/**
 * Letterhead setup: pick/scan template + writing area + signature/stamp + save.
 *
 * Editor state / save completions are bound to SyncSessionToken via
 * createLetterheadSetupEditorRuntime (uid + generation). Uploads use media REST.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type TemplateWarningKey,
} from "@/services/letterhead";
import {
  assertCandidateOwner,
  beginLetterheadCapture,
  LetterheadCandidateError,
  persistLetterheadCandidateFromAsset,
  persistLetterheadCandidateFromLocalFile,
  readCandidateDataUri,
  retireLetterheadCandidate,
} from "@/services/letterhead/letterheadCandidateImage";
import {
  getDocumentScannerCapability,
  scanLetterheadDocument,
} from "@/services/letterhead/documentScanner";
import { ImportedLetterheadImage } from "@/components/letterhead/ImportedLetterheadImage";
import {
  createLetterheadSetupEditorRuntime,
  type LetterheadSetupEditorSnapshot,
} from "@/services/letterhead/letterheadSetupEditorRuntime";
import {
  captureAdmissionToken,
  mayIssueRemoteWork,
  syncSessionOwnership,
} from "@/sync/syncSessionOwnership";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { getActiveBackend } from "@/config/env";

type PickTarget = "template" | "signature" | "stamp";
type TemplateEntry = "scan" | "gallery";

function waitForPickerPresentation(): Promise<void> {
  const delayMs = Platform.OS === "ios" ? 450 : 200;
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, delayMs));
  });
}

const EMPTY_SNAP: LetterheadSetupEditorSnapshot = {
  ownerKey: "signed_out#0",
  existing: null,
  candidate: null,
  margins: { ...DEFAULT_LETTERHEAD_MARGINS },
  signatureUri: null,
  stampUri: null,
  defaultName: "",
  defaultTitle: "",
  defaultClose: "",
  templateWarnings: [],
  error: null,
  saving: false,
  loading: false,
};

export default function LetterheadSetupScreen() {
  const t = useT();
  const router = useRouter();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const scannerOk = getDocumentScannerCapability().canScan;
  const preferredEntry: TemplateEntry =
    entry === "scan" && scannerOk ? "scan" : "gallery";
  const isGalleryFallback = preferredEntry === "gallery";
  const { user } = useAuth();

  const mountedRef = useRef(true);
  const pickGuard = useRef(false);
  const [picking, setPicking] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [showPermissionRationale, setShowPermissionRationale] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PickTarget>("template");
  const [pickError, setPickError] = useState<string | null>(null);
  const [snap, setSnap] = useState<LetterheadSetupEditorSnapshot>(EMPTY_SNAP);

  const runtime = useMemo(
    () =>
      createLetterheadSetupEditorRuntime({
        get: (uid) => getLetterheadRepository().get(uid),
        save: (uid, patch, session) => getLetterheadRepository().save(uid, patch, session),
        readCandidateDataUri,
        useLocalFileForSave: getActiveBackend() !== "local-mock",
        retireCandidate: (c) => void retireLetterheadCandidate(c),
        liveSession: () => syncSessionOwnership.capture(),
      }),
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    const unsub = runtime.subscribe(() => {
      if (mountedRef.current) setSnap(runtime.snapshot());
    });
    setSnap(runtime.snapshot());
    return () => {
      mountedRef.current = false;
      unsub();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    if (!user?.uid) {
      runtime.setOwner(null);
      return;
    }
    const session = captureAdmissionToken();
    if (!session || !mayIssueRemoteWork(session, user.uid)) {
      runtime.setOwner(null);
      return;
    }
    runtime.setOwner(session);
  }, [user?.uid, runtime]);

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
    })
  );

  const applyCandidate = useCallback(
    (next: Parameters<typeof runtime.setCandidate>[0], warnings: TemplateWarningKey[]) => {
      if (!mountedRef.current) {
        void retireLetterheadCandidate(next);
        return;
      }
      runtime.setCandidate(next, warnings);
    },
    [runtime]
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
      if (!mountedRef.current || !mayIssueRemoteWork(ctx.session, user.uid)) {
        await retireLetterheadCandidate(next);
        return false;
      }
      applyCandidate(
        next,
        analyzeTemplateImage({
          width: next.width,
          height: next.height,
          approxBytes: next.approxBytes,
        }).warnings
      );
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
        if (mountedRef.current) setPickError(t("letterhead.entryScannerUnavailable"));
        return captureTemplateFromGallery();
      }
      if (scanned.status !== "success") {
        throw new LetterheadCandidateError("read_failed");
      }
      const next = await persistLetterheadCandidateFromLocalFile(ctx, scanned.localUri, {
        mimeType: "image/jpeg",
      });
      if (!mountedRef.current || !mayIssueRemoteWork(ctx.session, user.uid)) {
        await retireLetterheadCandidate(next);
        return false;
      }
      applyCandidate(
        next,
        analyzeTemplateImage({
          width: next.width,
          height: next.height,
          approxBytes: next.approxBytes,
        }).warnings
      );
      return true;
    })();
  }, [user?.uid, applyCandidate, captureTemplateFromGallery, t]);

  const captureTemplate = useCallback((): Promise<boolean> => {
    if (preferredEntry === "scan") return captureTemplateFromScanner();
    return captureTemplateFromGallery();
  }, [preferredEntry, captureTemplateFromScanner, captureTemplateFromGallery]);

  const captureAsset = useCallback(
    async (kind: "signature" | "stamp"): Promise<boolean> => {
      if (!user?.uid) return false;
      const session = captureAdmissionToken();
      if (!session || !mayIssueRemoteWork(session, user.uid)) return false;
      const asset = await pickLetterheadAsset();
      if (!asset) return false;
      if (!mountedRef.current) return false;
      if (!mayIssueRemoteWork(session, user.uid)) return false;
      if (kind === "signature") runtime.setSignatureUri(asset.dataUri);
      else runtime.setStampUri(asset.dataUri);
      return true;
    },
    [user?.uid, runtime]
  );

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
      setPickError(null);
      runtime.setError(null);
      setPendingTarget(target);

      const skipGalleryPermission =
        target === "template" && preferredEntry === "scan" && scannerOk;

      try {
        if (Platform.OS === "android" && !skipGalleryPermission) {
          const current = await ImagePicker.getMediaLibraryPermissionsAsync();
          if (!current.granted) {
            if (current.canAskAgain === false) {
              setPickError(t("letterhead.setupPermissionDenied"));
              return;
            }
            setShowPermissionRationale(true);
            return;
          }
        }

        setPicking(true);
        await runPick(target);
      } catch (e) {
        if (mountedRef.current) setPickError(mapPickError(e, t));
      } finally {
        setPicking(false);
        pickGuard.current = false;
      }
    },
    [picking, permissionBusy, runPick, preferredEntry, scannerOk, t, runtime]
  );

  const onRationaleAllow = useCallback(async () => {
    if (permissionBusy || pickGuard.current) return;
    setPermissionBusy(true);
    setPickError(null);
    try {
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setShowPermissionRationale(false);
      if (!r.granted) {
        setPickError(t("letterhead.setupPermissionDenied"));
        return;
      }
      await waitForPickerPresentation();
      pickGuard.current = true;
      setPicking(true);
      await runPick(pendingTarget);
    } catch (e) {
      if (mountedRef.current) setPickError(mapPickError(e, t));
    } finally {
      setPicking(false);
      setPermissionBusy(false);
      pickGuard.current = false;
    }
  }, [permissionBusy, runPick, pendingTarget, t]);

  const templateUri = snap.candidate?.localUri ?? snap.existing?.imageDataUri ?? null;
  const displayError =
    pickError ??
    (snap.error === "need_image"
      ? t("letterhead.setupNeedImage")
      : snap.error === "session_retired"
        ? t("letterhead.setupSaveFailedUnchanged")
        : snap.error
          ? t("letterhead.setupSaveFailedUnchanged")
          : null);

  const onSave = async () => {
    if (!user || snap.saving) return;
    setPickError(null);
    if (!templateUri) {
      runtime.setError("need_image");
      return;
    }
    if (snap.candidate) {
      try {
        assertCandidateOwner(snap.candidate, user.uid);
      } catch (e) {
        const session = captureAdmissionToken();
        if (session) runtime.clearRetiredOwnerFields(session);
        setPickError(t("letterhead.setupSaveFailedUnchanged"));
        return;
      }
    }
    const result = await runtime.save();
    if (!mountedRef.current) return;
    if (result.navigate) {
      router.replace("/(app)/letterhead");
    }
  };

  const busy = picking || permissionBusy || snap.saving;

  return (
    <Screen scroll form>
      <Header title={t("letterhead.setupTitle")} showBack backFrom="letterhead" />
      <LocaleUiText style={styles.lead}>{t("letterhead.setupIntro")}</LocaleUiText>

      {isGalleryFallback ? (
        <View style={styles.banner}>
          <Banner tone="info" message={t("letterhead.setupGalleryFallback")} />
        </View>
      ) : null}

      {displayError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={displayError} />
        </View>
      ) : null}

      {snap.templateWarnings.map((w) => (
        <View key={w} style={styles.banner}>
          <Banner tone="warning" message={t(w)} />
        </View>
      ))}

      <Card style={styles.card}>
        <WritingAreaControls
          margins={snap.margins}
          onChange={(m) => runtime.setMargins(m)}
          background={
            templateUri ? (
              <ImportedLetterheadImage
                uri={templateUri}
                width={snap.candidate?.width ?? snap.existing?.imageWidth}
                height={snap.candidate?.height ?? snap.existing?.imageHeight}
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
            {snap.signatureUri ? (
              <Image
                source={{ uri: snap.signatureUri }}
                style={styles.assetThumb}
                resizeMode="contain"
              />
            ) : null}
            <View style={styles.assetBtns}>
              <Button
                label={
                  snap.signatureUri ? t("letterhead.assetReplace") : t("letterhead.assetAdd")
                }
                variant="secondary"
                size="md"
                onPress={() => void startPick("signature")}
                loading={picking && pendingTarget === "signature"}
                disabled={busy}
              />
              {snap.signatureUri ? (
                <Button
                  label={t("letterhead.assetRemove")}
                  variant="ghost"
                  size="md"
                  onPress={() => runtime.setSignatureUri(null)}
                  disabled={busy}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View>
          <LocaleUiText style={styles.assetLabel}>{t("letterhead.assetStamp")}</LocaleUiText>
          <View style={styles.assetRow}>
            {snap.stampUri ? (
              <Image
                source={{ uri: snap.stampUri }}
                style={styles.assetThumb}
                resizeMode="contain"
              />
            ) : null}
            <View style={styles.assetBtns}>
              <Button
                label={snap.stampUri ? t("letterhead.assetReplace") : t("letterhead.assetAdd")}
                variant="secondary"
                size="md"
                onPress={() => void startPick("stamp")}
                loading={picking && pendingTarget === "stamp"}
                disabled={busy}
              />
              {snap.stampUri ? (
                <Button
                  label={t("letterhead.assetRemove")}
                  variant="ghost"
                  size="md"
                  onPress={() => runtime.setStampUri(null)}
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
        value={snap.defaultName}
        onChangeText={(v) => runtime.setDefaultName(v)}
        placeholder={t("letterhead.fieldNamePlaceholder")}
        maxLength={80}
      />
      <TextField
        label={t("letterhead.fieldDesignation")}
        value={snap.defaultTitle}
        onChangeText={(v) => runtime.setDefaultTitle(v)}
        placeholder={t("letterhead.fieldDesignationPlaceholder")}
        maxLength={80}
      />
      <TextField
        label={t("letterhead.fieldClosing")}
        value={snap.defaultClose}
        onChangeText={(v) => runtime.setDefaultClose(v)}
        placeholder={t("letterhead.fieldClosingPlaceholder")}
        maxLength={80}
      />

      <View style={styles.cta}>
        <Button
          label={snap.saving ? t("letterhead.setupSaving") : t("letterhead.setupSave")}
          onPress={() => void onSave()}
          loading={snap.saving}
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
