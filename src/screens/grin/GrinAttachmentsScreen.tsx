import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { Banner, Card, EmptyState, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import {
  requireLiveGrinApplicationRepository,
  type GrinApplicationAttachment,
} from "@/services/grin/repository";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinAttachmentsScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.attachmentsTitle")}>
      <GrinAttachmentsAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinAttachmentsAdmittedBody(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [attachments, setAttachments] = useState<GrinApplicationAttachment[]>([]);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setAttachments([]);
      return;
    }
    try {
      setAttachments(requireLiveGrinApplicationRepository().attachments(receiptId));
    } catch {
      setAttachments([]);
    }
  }, [receiptId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Header title={t("grin.attachmentsTitle")} showBack />
        <GrinFixtureNotices />
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
