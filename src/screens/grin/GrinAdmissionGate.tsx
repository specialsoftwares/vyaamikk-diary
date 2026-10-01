import React from "react";
import { StyleSheet, View } from "react-native";

import { Banner, EmptyState, Header, Screen } from "@/components/ui";
import {
  isGoodsEvidenceBlockedByStoreRuntime,
  isGoodsEvidenceEnabled,
} from "@/goodsEvidence/featureFlag";
import { useT } from "@/i18n";
import { spacing, useThemedStyles } from "@/theme";

export function GrinAdmissionGate({
  title,
  subtitle,
  children,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showBack?: boolean;
}): React.ReactElement {
  const t = useT();
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
    })
  );

  if (isGoodsEvidenceBlockedByStoreRuntime()) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Header title={title} subtitle={subtitle} showBack={showBack} />
          <EmptyState title={t("grin.storeBlockedTitle")} message={t("grin.storeBlockedBody")} />
        </View>
      </Screen>
    );
  }

  if (!isGoodsEvidenceEnabled()) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Header title={title} subtitle={subtitle} showBack={showBack} />
          <EmptyState title={t("grin.unavailableTitle")} message={t("grin.unavailableBody")} />
        </View>
      </Screen>
    );
  }

  return (
    <>
      {children}
    </>
  );
}

export function GrinFixtureNotices(): React.ReactElement {
  const t = useT();
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Banner tone="info" message={t("grin.fixtureBanner")} />
      <Banner tone="warning" message={t("grin.pricingQuotaNote")} />
    </View>
  );
}
