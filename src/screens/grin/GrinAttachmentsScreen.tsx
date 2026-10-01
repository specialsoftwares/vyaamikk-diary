import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Banner, Card, EmptyState, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import { GRIN_FIXTURE_REPOSITORY_LABEL, getGrinFixtureRepository } from "@/services/grin/fixture";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinAttachmentsScreen(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const record = receiptId ? getGrinFixtureRepository().get(receiptId) : null;
  const attachments = record?.attachments ?? [];
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  return (
    <GrinAdmissionGate title={t("grin.attachmentsTitle")}>
      <Screen scroll>
        <View style={styles.wrap}>
          <Header title={t("grin.attachmentsTitle")} showBack />
          <GrinFixtureNotices repositoryLabel={GRIN_FIXTURE_REPOSITORY_LABEL} />
          {attachments.length === 0 ? <EmptyState title={t("grin.emptyTitle")} /> : null}
          {attachments.map((item) => (
            <Card key={item.evidenceId} elevated={false}>
              <GrinFieldRow label={t("grin.attachmentsTitle")} value={item.displayName} />
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
              {item.isInvoiceReferenceOnly ? (
                <Banner tone="warning" message={t("grin.pack.invoiceRefNotRetained")} />
              ) : null}
              {item.isChallan ? <Banner tone="info" message={t("grin.pack.challanNotInvoice")} /> : null}
            </Card>
          ))}
        </View>
      </Screen>
    </GrinAdmissionGate>
  );
}
