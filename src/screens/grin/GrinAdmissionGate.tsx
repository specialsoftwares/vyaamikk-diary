import React from "react";
import { StyleSheet, View } from "react-native";

import { Banner, EmptyState, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import {
  GRIN_APPLICATION_REPOSITORY_LABEL,
  grinRepositoryIsFake,
} from "@/services/grin/repository";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmittedSessionHost } from "./GrinAdmittedSessionHost";

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
  const { user } = useAuth();
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
    })
  );

  const blocked = (
    <Screen>
      <View style={styles.wrap}>
        <Header title={title} subtitle={subtitle} showBack={showBack} />
        <EmptyState title={t("grin.storeBlockedTitle")} message={t("grin.storeBlockedBody")} />
      </View>
    </Screen>
  );

  const unavailable = (
    <Screen>
      <View style={styles.wrap}>
        <Header title={title} subtitle={subtitle} showBack={showBack} />
        <EmptyState title={t("grin.unavailableTitle")} message={t("grin.unavailableBody")} />
      </View>
    </Screen>
  );

  return (
    <GrinAdmittedSessionHost
      ownerUid={user?.uid ?? null}
      renderBlocked={() => blocked}
      renderUnavailable={() => unavailable}
    >
      {() => children}
    </GrinAdmittedSessionHost>
  );
}

export function GrinFixtureNotices({
  repositoryLabel = GRIN_APPLICATION_REPOSITORY_LABEL,
}: {
  repositoryLabel?: string;
} = {}): React.ReactElement {
  const t = useT();
  const banner = grinRepositoryIsFake(repositoryLabel) ? t("grin.fixtureBanner") : t("grin.queueBanner");
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Banner tone="info" message={banner} />
      <Banner tone="warning" message={t("grin.pricingQuotaNote")} />
    </View>
  );
}
