import React, { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";

import { screenStateCopy } from "@/components/screenState/screenStateCopy";
import { captureLoadClaim } from "@/components/screenState/resolveScreenState";
import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";

import type { GrinAttachCategory } from "@/services/grin/repository";
import { GRIN_ATTACH_CATEGORIES } from "@/services/grin/repository";
import type { GrinApplicationAttachment } from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFieldRow } from "./GrinFieldRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import {
  commitGrinOriginalRetention,
  discardUncommittedGrinOriginal,
  pickGrinOriginal,
} from "./grinOriginalPicker";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinLocalSearchParams,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, Card, EmptyState, FormSection, Header, Screen, SelectField, View, StyleSheet } from "./grinSurfaces";

function grinPermissionCopy() {
  const lang = i18next.resolvedLanguage || i18next.language || "en";
  return screenStateCopy(lang);
}

function GrinPermissionActions({
  source,
  onAlternative,
}: {
  source: "camera" | "library";
  onAlternative: () => void;
}) {
  const copy = grinPermissionCopy();
  return (
    <>
      <Banner
        tone="warning"
        message={source === "camera" ? copy.grinPermissionCameraBody : copy.grinPermissionLibraryBody}
      />
      <Button
        label={copy.openSettings}
        variant="secondary"
        onPress={() => {
          void import("react-native")
            .then((rn) => rn.Linking.openSettings())
            .catch(() => undefined);
        }}
      />
      <Button
        label={source === "camera" ? copy.usePhotosInstead : copy.useCameraInstead}
        variant="secondary"
        onPress={onAlternative}
      />
    </>
  );
}

function attachPickerErrorKey(message: string): string | null {
  if (message === "picker_host_not_ready") return "grin.attachPickerNotReady";
  if (message === "picker_in_flight") return "grin.attachPickerBusy";
  if (message === "invalid_evidence_category") return "grin.attachNeedCategory";
  if (message === "permission") return "grin.attachPermissionDenied";
  if (message === "unsupported_mime") return "grin.attachUnsupportedType";
  if (message === "too_large") return "grin.attachTooLarge";
  if (message === "source_missing") return "grin.attachSourceMissing";
  if (message === "empty_original") return "grin.attachFailed";
  return null;
}

export function GrinAttachmentsAdmittedBody({
  session,
}: {
  session: GrinDispatchSession;
}): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [attachments, setAttachments] = useState<GrinApplicationAttachment[]>([]);
  const [readPhase, setReadPhase] = useState<"loading" | "ready" | "error">("loading");
  const [category, setCategory] = useState<GrinAttachCategory>("invoice");
  const [error, setError] = useState<string | null>(null);
  const [permissionSource, setPermissionSource] = useState<"camera" | "library" | null>(null);
  const [busy, setBusy] = useState(false);
  const readGeneration = useRef(0);
  const pickGeneration = useRef(0);
  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setAttachments([]);
  }, []);

  const load = useCallback(() => {
    const claim = captureLoadClaim(session.ownerUid, ++readGeneration.current);
    const stillThisRequest = () =>
      readGeneration.current === claim.generation &&
      currentSessionCommitEpoch() === claim.epoch &&
      session.ownerUid === claim.uid;
    if (!receiptId) {
      if (!stillThisRequest()) return;
      setAttachments([]);
      setReadPhase("ready");
      return;
    }
    try {
      const next = originRepo(origin).attachments(receiptId);
      if (!stillThisRequest()) return;
      setAttachments(next);
      setError(null);
      setReadPhase("ready");
    } catch (caught) {
      if (readGeneration.current !== claim.generation) return;
      const mapped = grinMutationErrorMessage(caught, t, "grin.attachFailed");
      if (mapped.retired || !stillThisRequest()) maskRetired();
      setError(mapped.retired ? t("grin.errSessionRetired") : mapped.message);
      setReadPhase("error");
    }
  }, [maskRetired, origin, receiptId, session.ownerUid, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const completePick = useCallback(
    async (source: "camera" | "library") => {
      if (!receiptId) return;
      const claim = captureLoadClaim(session.ownerUid, ++pickGeneration.current);
      const stillThisRequest = () =>
        pickGeneration.current === claim.generation &&
        currentSessionCommitEpoch() === claim.epoch &&
        session.ownerUid === claim.uid;
      setBusy(true);
      setError(null);
      setPermissionSource(null);
      let retainedPath: string | null = null;
      try {
        originRepo(origin);
        const picked = await pickGrinOriginal({ source, category, origin });
        if (pickGeneration.current !== claim.generation) return;
        if (!stillThisRequest()) {
          maskRetired();
          setError(t("grin.errSessionRetired"));
          setReadPhase("error");
          return;
        }
        originRepo(origin);
        if (!picked) return;
        retainedPath = picked.localPath;
        originRepo(origin).attachOriginal({
          receiptId,
          category,
          localPath: picked.localPath,
          claimedSha256: picked.claimedSha256,
          byteSize: picked.byteSize,
          mime: picked.mime,
          fileName: picked.fileName,
          captureProvenance: picked.captureProvenance,
          osConversionOccurred: picked.osConversionOccurred,
        });
        commitGrinOriginalRetention(picked.localPath);
        retainedPath = null;
        originRepo(origin);
        if (!stillThisRequest()) {
          maskRetired();
          setError(t("grin.errSessionRetired"));
          setReadPhase("error");
          return;
        }
        setAttachments(originRepo(origin).attachments(receiptId));
        setReadPhase("ready");
      } catch (caught) {
        if (pickGeneration.current !== claim.generation) {
          if (retainedPath) await discardUncommittedGrinOriginal(retainedPath);
          return;
        }
        if (retainedPath) await discardUncommittedGrinOriginal(retainedPath);
        const mapped = grinMutationErrorMessage(caught, t, "grin.attachFailed");
        if (mapped.retired) maskRetired();
        const pickerKey = caught instanceof Error ? attachPickerErrorKey(caught.message) : null;
        if (pickerKey === "grin.attachPermissionDenied") setPermissionSource(source);
        setError(pickerKey ? t(pickerKey) : mapped.message);
      } finally {
        if (pickGeneration.current === claim.generation) setBusy(false);
      }
    },
    [category, maskRetired, origin, receiptId, session.ownerUid, t]
  );

  useEffect(() => {
    if (!permissionSource) return;
    let remove = () => {};
    let cancelled = false;
    void import("react-native")
      .then((rn) => {
        if (cancelled) return;
        const sub = rn.AppState.addEventListener("change", (next: string) => {
          if (next !== "active" || !permissionSource) return;
          void import("expo-image-picker")
            .then(async (picker) => {
              const perm =
                permissionSource === "camera"
                  ? await picker.getCameraPermissionsAsync()
                  : await picker.getMediaLibraryPermissionsAsync();
              if (perm.granted) setPermissionSource(null);
            })
            .catch(() => undefined);
        });
        remove = () => sub.remove();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      remove();
    };
  }, [permissionSource]);

  const categoryOptions = GRIN_ATTACH_CATEGORIES.map((value) => ({
    value,
    label: t(`grin.category.${value}`),
  }));

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.attachmentsTitle")} showBack />
        <GrinFixtureNotices />
        {error ? <Banner tone="danger" message={error} /> : null}
        {readPhase === "error" && !permissionSource ? (
          <Button label={t("common.retry")} onPress={load} variant="secondary" />
        ) : null}
        {permissionSource ? (
          <GrinPermissionActions
            source={permissionSource}
            onAlternative={() => {
              const next = permissionSource === "camera" ? "library" : "camera";
              setPermissionSource(null);
              void completePick(next);
            }}
          />
        ) : null}
        <FormSection title={t("grin.attachCategory")} subtitle={t("grin.attachNeedCategory")}>
          <SelectField
            label={t("grin.attachCategory")}
            value={category}
            options={categoryOptions}
            onChange={(value: string) => setCategory(value as GrinAttachCategory)}
          />
          <Button
            label={t("grin.attachLibrary")}
            onPress={() => void completePick("library")}
            loading={busy}
            variant="secondary"
          />
          <Button
            label={t("grin.attachCapture")}
            onPress={() => void completePick("camera")}
            loading={busy}
            variant="secondary"
          />
        </FormSection>
        {readPhase === "ready" && attachments.length === 0 ? <EmptyState title={t("grin.emptyTitle")} /> : null}
        {attachments.map((item) => (
          <Card key={`${item.evidenceId}-${item.role}`} elevated={false}>
            <GrinFieldRow label={t("grin.attachmentsTitle")} value={item.evidenceId} />
            <GrinFieldRow
              label={t("grin.pack.completeness")}
              value={
                item.completeness === "complete" ? t("grin.pack.complete") : t("grin.completeness.notComplete")
              }
            />
            <GrinFieldRow
              label={t("grin.field.qc")}
              value={
                item.verification === "verified"
                  ? t("grin.attachment.verified")
                  : item.verification === "failed"
                    ? t("grin.attachment.failed")
                    : t("grin.attachment.pending")
              }
            />
            {item.isDerivative ? <Banner tone="warning" message={t("grin.attachment.derivativeNotOriginal")} /> : null}
            {!item.originalDurable ? <Banner tone="warning" message={t("grin.pack.missingOriginal")} /> : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
