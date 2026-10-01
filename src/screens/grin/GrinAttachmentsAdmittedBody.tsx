import React, { useCallback, useState } from "react";

import { WAVE1_ORIGINAL_CATEGORIES, type Wave1OriginalCategory } from "@/goodsEvidence/evidence";
import type { GrinApplicationAttachment } from "@/services/grin/repository";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing } from "@/theme/spacing";

import { grinMutationErrorMessage } from "./grinActionErrors";
import { GrinFieldRow } from "./GrinFieldRow";
import { GrinFixtureNotices } from "./GrinFixtureNotices";
import { pickGrinOriginal } from "./grinOriginalPicker";
import {
  originRepo,
  useFrozenGrinOrigin,
  useGrinFocusEffect,
  useGrinLocalSearchParams,
  useGrinT,
  useGrinThemedStyles,
} from "./grinScreenHooks";
import { Banner, Button, Card, EmptyState, FormSection, Header, Screen, SelectField, View, StyleSheet } from "./grinSurfaces";

export function GrinAttachmentsAdmittedBody({
  session,
}: {
  session: GrinDispatchSession;
}): React.ReactElement {
  const origin = useFrozenGrinOrigin(session);
  const t = useGrinT();
  const { receiptId } = useGrinLocalSearchParams<{ receiptId: string }>();
  const [attachments, setAttachments] = useState<GrinApplicationAttachment[]>([]);
  const [category, setCategory] = useState<Wave1OriginalCategory>("invoice");
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
      try {
        originRepo(origin);
        const picked = await pickGrinOriginal({ source, category });
        originRepo(origin);
        if (!picked) return;
        originRepo(origin).attachOriginal({
          receiptId,
          category,
          localPath: picked.localPath,
          claimedSha256: picked.claimedSha256,
          byteSize: picked.byteSize,
          mime: picked.mime,
          fileName: picked.fileName,
        });
        originRepo(origin);
        setAttachments(originRepo(origin).attachments(receiptId));
      } catch (caught) {
        const mapped = grinMutationErrorMessage(caught, t, "grin.attachFailed");
        if (mapped.retired) maskRetired();
        if (caught instanceof Error && caught.message === "picker_host_not_ready") {
          setError(t("grin.attachPickerNotReady"));
        } else if (caught instanceof Error && caught.message === "picker_in_flight") {
          setError(t("grin.attachPickerBusy"));
        } else if (caught instanceof Error && caught.message === "invalid_evidence_category") {
          setError(t("grin.attachNeedCategory"));
        } else {
          setError(mapped.message);
        }
      } finally {
        setBusy(false);
      }
    },
    [category, maskRetired, origin, receiptId, t]
  );

  const categoryOptions = WAVE1_ORIGINAL_CATEGORIES.map((value) => ({
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
            onChange={(value) => setCategory(value as Wave1OriginalCategory)}
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
