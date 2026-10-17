import React, { useCallback, useState } from "react";

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
  const [category, setCategory] = useState<GrinAttachCategory>("invoice");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const styles = useGrinThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const maskRetired = useCallback(() => {
    setAttachments([]);
  }, []);

  const load = useCallback(() => {
    if (!receiptId) {
      setAttachments([]);
      return;
    }
    try {
      setAttachments(originRepo(origin).attachments(receiptId));
    } catch (caught) {
      if (grinMutationErrorMessage(caught, t, "grin.attachFailed").retired) {
        maskRetired();
        setError(t("grin.errSessionRetired"));
        return;
      }
      setAttachments([]);
    }
  }, [maskRetired, origin, receiptId, t]);

  useGrinFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const completePick = useCallback(
    async (source: "camera" | "library") => {
      if (!receiptId) return;
      setBusy(true);
      setError(null);
      let retainedPath: string | null = null;
      try {
        originRepo(origin);
        const picked = await pickGrinOriginal({ source, category, origin });
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
        setAttachments(originRepo(origin).attachments(receiptId));
      } catch (caught) {
        if (retainedPath) await discardUncommittedGrinOriginal(retainedPath);
        const mapped = grinMutationErrorMessage(caught, t, "grin.attachFailed");
        if (mapped.retired) maskRetired();
        const pickerKey = caught instanceof Error ? attachPickerErrorKey(caught.message) : null;
        setError(pickerKey ? t(pickerKey) : mapped.message);
      } finally {
        setBusy(false);
      }
    },
    [category, maskRetired, origin, receiptId, t]
  );

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
        {attachments.length === 0 ? <EmptyState title={t("grin.emptyTitle")} /> : null}
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
