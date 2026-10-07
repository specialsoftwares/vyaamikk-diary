import React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmittedSessionHost } from "./GrinAdmittedSessionHost";
import { bindProductionGrinScreenRuntime } from "./bindProductionGrinScreenRuntime";

export { GrinFixtureNotices } from "./GrinFixtureNotices";

export function GrinAdmissionGate({
  title,
  subtitle,
  children,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  children: (session: GrinDispatchSession) => React.ReactNode;
  showBack?: boolean;
}): React.ReactElement {
  bindProductionGrinScreenRuntime();
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
      {children}
    </GrinAdmittedSessionHost>
  );
}
