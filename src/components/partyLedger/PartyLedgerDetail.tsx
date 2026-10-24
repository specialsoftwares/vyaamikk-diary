import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useLocalPartyLedger } from "@/components/partyLedger/useLocalPartyLedger";
import { Banner, Button, EmptyState, Header, LocaleUiText } from "@/components/ui";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { useT } from "@/i18n";
import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";
import {
  type LedgerSourceLink,
  type LocalLedgerLine,
} from "@/services/partyLedger/localExplorer";
import { formatInrMinor } from "@/services/partyLedger/money";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatShortDate } from "@/utils/formatters";

export function PartyLedgerDetail({
  ownerUid,
  partyId,
}: {
  ownerUid: string | null;
  partyId: string;
}) {
  const t = useT();
  const router = useRouter();
  const { ledger, error, reading, reload } = useLocalPartyLedger(ownerUid);
  const [rulesOpen, setRulesOpen] = useState(false);
  const onDevice = !PARTY_LEDGER_SERVER_PROJECTION_ENABLED;
  const party = ledger?.parties.find((item) => item.partyId === partyId) ?? null;

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      fill: { flex: 1, minHeight: 0 },
      summary: { gap: spacing.xs, paddingBottom: spacing.md },
      name: { ...typography.titleMd, color: colors.text },
      amount: { ...typography.titleSm, color: colors.text },
      meta: { ...typography.micro, color: colors.textMuted },
      badge: { ...typography.caption, color: colors.primaryDark },
      section: { ...typography.captionStrong, color: colors.text, marginTop: spacing.sm },
      line: {
        paddingVertical: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
        gap: 2,
      },
      lineTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.md,
      },
      lineTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
      link: { ...typography.captionStrong, color: colors.primary },
      rule: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
      errorBlock: { gap: spacing.sm },
    })
  );

  const ruleKeys = useMemo(
    () => [...new Set(party?.lines.map((line) => line.explanationKey) ?? [])],
    [party]
  );
  const name = party?.unassigned ? t("partyLedger.unassigned") : party?.displayName || t("partyLedger.missingParty");
  const figure =
    party == null
      ? ""
      : party.cashPaidMinor == null
        ? t("partyLedger.amountUnreadable")
        : formatInrMinor(party.cashPaidMinor);

  return (
    <View style={styles.fill}>
      <Header
        title={name}
        subtitle={onDevice ? t("partyLedger.deviceCounted") : undefined}
        showBack
        fallback="/(app)/(tabs)/saved-records"
      />
      {error ? (
        <View style={styles.errorBlock}>
          <Banner tone="danger" message={t("partyLedger.loadError")} />
          <Button label={t("partyLedger.retry")} variant="secondary" onPress={() => void reload()} />
        </View>
      ) : (
        <FlatList
          style={styles.fill}
          data={party?.lines ?? []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            party ? (
              <View style={styles.summary}>
                {party.provisional ? (
                  <LocaleUiText style={styles.badge}>
                    {t("partyLedger.provisional")} · {t("partyLedger.provisionalHint")}
                  </LocaleUiText>
                ) : null}
                <LocaleUiText style={styles.meta}>{t("partyLedger.cashPaid")}</LocaleUiText>
                <Text
                  style={styles.amount}
                  accessibilityLabel={
                    onDevice ? `${t("partyLedger.cashPaid")} ${figure}. ${t("partyLedger.deviceCounted")}` : figure
                  }
                >
                  {figure}
                </Text>
                {onDevice && party.cashPaidMinor != null ? (
                  <LocaleUiText style={styles.meta}>{t("partyLedger.deviceCounted")}</LocaleUiText>
                ) : null}
                {party.lines.some((line) => line.kind === "exclusion") ? (
                  <LocaleUiText style={styles.meta}>{t("partyLedger.someLeftOut")}</LocaleUiText>
                ) : null}
                <LuxuryPressable
                  onPress={() => setRulesOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: rulesOpen }}
                  accessibilityLabel={t("partyLedger.howCounted")}
                >
                  <LocaleUiText style={styles.section}>{t("partyLedger.howCounted")}</LocaleUiText>
                </LuxuryPressable>
                {rulesOpen
                  ? ruleKeys.map((key) => (
                      <LocaleUiText key={key} style={styles.rule}>
                        {t(key)}
                      </LocaleUiText>
                    ))
                  : null}
                <LocaleUiText style={styles.section}>{t("partyLedger.transactions")}</LocaleUiText>
              </View>
            ) : null
          }
          renderItem={({ item }) => <TransactionLine line={item} onOpen={() => openSource(router, item.source)} />}
          ListEmptyComponent={
            reading ? (
              <LocaleUiText style={styles.meta}>{t("partyLedger.reading")}</LocaleUiText>
            ) : party ? (
              <EmptyState
                title={t("partyLedger.transactions")}
                message={t("partyLedger.emptyBody")}
                iconName="cash-minus"
                accentKey="cash"
              />
            ) : (
              <EmptyState
                title={t("partyLedger.missingParty")}
                message={onDevice ? t("partyLedger.deviceCounted") : undefined}
                iconName="account-outline"
                accentKey="cash"
              />
            )
          }
        />
      )}
    </View>
  );
}

function TransactionLine({ line, onOpen }: { line: LocalLedgerLine; onOpen: () => void }) {
  const t = useT();
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      line: {
        paddingVertical: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.divider,
        gap: 2,
      },
      lineTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.md,
      },
      lineTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
      amount: { ...typography.bodyStrong, color: colors.text },
      meta: { ...typography.micro, color: colors.textMuted },
      link: { ...typography.captionStrong, color: colors.primary, marginTop: spacing.xs },
    })
  );
  const typeKey = `partyLedger.types.${line.recordType}`;
  const translated = t(typeKey);
  const typeLabel = translated === typeKey ? t("partyLedger.types.unknown") : translated;
  const when = lineDate(line.occurredAtMs) ?? t("partyLedger.dateUnknown");
  const amount =
    line.kind === "exclusion"
      ? line.exclusionReason === "not_positive"
        ? t("partyLedger.amountNotPositive")
        : t("partyLedger.amountUnreadable")
      : line.moneyMinor
        ? formatInrMinor(line.moneyMinor)
        : null;

  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Text style={styles.lineTitle}>{typeLabel}</Text>
        {amount ? <Text style={styles.amount}>{amount}</Text> : null}
      </View>
      <LocaleUiText style={styles.meta}>{when}</LocaleUiText>
      {line.kind === "activity" || line.kind === "obligation" ? (
        <LocaleUiText style={styles.meta}>{t("partyLedger.notCash")}</LocaleUiText>
      ) : null}
      {line.kind === "cash_paid" && !PARTY_LEDGER_SERVER_PROJECTION_ENABLED ? (
        <LocaleUiText style={styles.meta}>{t("partyLedger.deviceCounted")}</LocaleUiText>
      ) : null}
      <LuxuryPressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={t("partyLedger.viewSource")}>
        <LocaleUiText style={styles.link}>{t("partyLedger.viewSource")}</LocaleUiText>
      </LuxuryPressable>
    </View>
  );
}

function lineDate(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  try {
    return formatShortDate(ms);
  } catch {
    return null;
  }
}

function openSource(router: ReturnType<typeof useRouter>, source: LedgerSourceLink) {
  const id = source.params.id ?? "";
  switch (source.pathname) {
    case "/(app)/purchase-order/form":
      router.push({ pathname: "/(app)/purchase-order/form", params: { id } });
      return;
    case "/(app)/customer-credit/[id]":
      router.push({ pathname: "/(app)/customer-credit/[id]", params: { id } });
      return;
    case "/(app)/letterhead/create":
      router.push({
        pathname: "/(app)/letterhead/create",
        params: { documentId: source.params.documentId ?? id },
      });
      return;
    case "/(app)/professional-pack/[id]":
      router.push({ pathname: "/(app)/professional-pack/[id]", params: { id } });
      return;
    case "/(app)/grin/[receiptId]":
      router.push({
        pathname: "/(app)/grin/[receiptId]",
        params: { receiptId: source.params.receiptId ?? id },
      });
      return;
    case "/(app)/drafts":
      router.push("/(app)/drafts");
      return;
    default:
      router.push({ pathname: "/(app)/diary/[id]", params: { id } });
  }
}
