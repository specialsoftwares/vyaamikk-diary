/**
 * DEV harness visual-only Workspace Ready phases.
 * Does not drive production navigation or persistence.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  WORKSPACE_PREPARING_STATUS_PENDING,
  WORKSPACE_PREPARING_SUBTITLE,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_SUBTITLE,
  WORKSPACE_READY_TITLE,
} from "@/auth-v2/workspaceCompletionMachine";
import { typography } from "@/theme";

export function WorkspacePhasePreview({
  phase,
}: {
  phase: "preparing" | "ready";
}) {
  const title = phase === "preparing" ? WORKSPACE_PREPARING_TITLE : WORKSPACE_READY_TITLE;
  const subtitle = phase === "preparing" ? WORKSPACE_PREPARING_SUBTITLE : WORKSPACE_READY_SUBTITLE;
  return (
    <View style={styles.fill} accessibilityLabel={title}>
      <Text style={styles.kicker}>DEV phase preview</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {phase === "preparing" ? (
        <Text style={styles.status}>{WORKSPACE_PREPARING_STATUS_PENDING}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: "#0B0D18",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  kicker: { ...typography.micro, color: "rgba(165,180,252,0.7)", fontWeight: "600" },
  title: { ...typography.titleLg, color: "#F8FAFC" },
  subtitle: { ...typography.body, color: "rgba(226,232,240,0.78)", lineHeight: 22 },
  status: { ...typography.caption, color: "rgba(165,180,252,0.85)", marginTop: 8 },
});
