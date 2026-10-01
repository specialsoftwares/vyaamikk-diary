import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { Banner, Card, Header, Screen } from "@/components/ui";
import { useT } from "@/i18n";
import {
  requireLiveGrinApplicationRepository,
  type GrinApplicationExceptionView,
} from "@/services/grin/repository";
import { exceptionKindLabel, exceptionRuleLabel } from "@/services/grin/grinDisplay";
import { spacing, useThemedStyles } from "@/theme";

import { GrinAdmissionGate, GrinFixtureNotices } from "./GrinAdmissionGate";
import { GrinFieldRow } from "./GrinFieldRow";

export function GrinExceptionsScreen(): React.ReactElement {
  const t = useT();
  return (
    <GrinAdmissionGate title={t("grin.exceptionsTitle")}>
      <GrinExceptionsAdmittedBody />
    </GrinAdmissionGate>
  );
}

function GrinExceptionsAdmittedBody(): React.ReactElement {
  const t = useT();
  const { receiptId } = useLocalSearchParams<{ receiptId: string }>();
  const [view, setView] = useState<GrinApplicationExceptionView | null>(null);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    })
  );

  const load = useCallback(() => {
    if (!receiptId) {
      setView(null);
      return;
    }
    try {
      setView(requireLiveGrinApplicationRepository().exceptions(receiptId));
    } catch {
      setView(null);
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
        <Header title={t("grin.exceptionsTitle")} showBack />
        <GrinFixtureNotices />
        <Banner tone="info" message={t("grin.exception.itcNote")} />
        {(view?.evaluations ?? []).map((item) => {
          const source =
            typeof item.comparedValues.source === "string" ? item.comparedValues.source : t("grin.optional.notSupplied");
          const observed =
            typeof item.comparedValues.observedAtUtc === "string"
              ? item.comparedValues.observedAtUtc
              : item.evaluatedAtUtc;
          return (
            <Card key={item.ruleId} elevated={false}>
              <GrinFieldRow label={t("grin.exceptionsTitle")} value={exceptionRuleLabel(item.ruleId, t)} />
              <GrinFieldRow label={t("grin.exception.kindLabel")} value={exceptionKindLabel(item.kind, t)} />
              <GrinFieldRow label={t("grin.exception.source")} value={source} />
              <GrinFieldRow label={t("grin.exception.observedAt")} value={observed} />
              <GrinFieldRow label={t("grin.pack.itcNotDetermined")} value={item.itcDisposition} />
              <Banner
                tone={item.kind === "exception" ? "warning" : item.kind === "unknown_incomplete_source" ? "info" : "success"}
                message={
                  item.kind === "exception"
                    ? t("grin.exception.reviewPrompt")
                    : item.kind === "unknown_incomplete_source"
                      ? t("grin.exception.incompleteSourcePrompt")
                      : item.kind === "not_applicable"
                        ? t("grin.exception.naPrompt")
                        : t("grin.exception.clearPrompt")
                }
              />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
