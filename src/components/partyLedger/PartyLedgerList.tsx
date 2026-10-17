import React, { useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { Banner, Button, EmptyState, LocaleUiText } from "@/components/ui";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { useLocalPartyLedger } from "@/components/partyLedger/useLocalPartyLedger";
import { useT } from "@/i18n";
import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";
import {
  type LocalPartySummary,
} from "@/services/partyLedger/localExplorer";
import { formatInrMinor } from "@/services/partyLedger/money";
import { radius, spacing, typography, useThemeColors, useThemedStyles } from "@/theme";

interface PartySection {
  key: string;
  title: string;
  data: LocalPartySummary[];
}

export function PartyLedgerList({ ownerUid }: { ownerUid: string | null }) {
  const t = useT();
  const router = useRouter();
  const colors = useThemeColors();
  const { ledger, error, reading, reload } = useLocalPartyLedger(ownerUid);
  const [query, setQuery] = useState("");
  const onDevice = !PARTY_LEDGER_SERVER_PROJECTION_ENABLED;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      fill: { flex: 1, minHeight: 0 },
      caption: { ...typography.micro, color: c.textMuted },
      search: {
        marginTop: spacing.sm,
        marginBottom: spacing.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surface,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...typography.body,
        color: c.text,
      },
      section: {
        ...typography.micro,
        color: c.textSubtle,
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
      },
      errorBlock: { gap: spacing.sm, marginTop: spacing.sm },
      emptyGrow: { flexGrow: 1 },
    })
  );

  const parties = ledger?.parties ?? [];
  const needle = query.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const provisionalLabel = t("partyLedger.provisional");
  const unassignedLabel = t("partyLedger.unassigned");

  const filtered = useMemo(() => {
    if (!needle) return parties;
    return parties.filter((party) => {
      const hay = [
        party.displayName,
        party.provisional ? provisionalLabel : "",
        party.unassigned ? unassignedLabel : "",
      ]
        .join(" ")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
      return hay.includes(needle);
    });
  }, [needle, parties, provisionalLabel, unassignedLabel]);

  const sections = useMemo(() => {
    const groups: PartySection[] = [
      {
        key: "unassigned",
        title: t("partyLedger.sectionUnassigned"),
        data: filtered.filter((party) => party.unassigned),
      },
      {
        key: "provisional",
        title: t("partyLedger.sectionProvisional"),
        data: filtered.filter((party) => party.provisional),
      },
      {
        key: "assigned",
        title: t("partyLedger.sectionAssigned"),
        data: filtered.filter((party) => !party.unassigned && !party.provisional),
      },
    ];
    return groups.filter((section) => section.data.length > 0);
  }, [filtered, t]);

  const noResults = parties.length > 0 && filtered.length === 0;

  return (
    <View style={styles.fill}>
      {onDevice ? (
        <LocaleUiText style={styles.caption}>{t("partyLedger.deviceCounted")}</LocaleUiText>
      ) : null}
      {error ? (
        <View style={styles.errorBlock}>
          <Banner tone="danger" message={t("partyLedger.loadError")} />
          <Button label={t("partyLedger.retry")} variant="secondary" onPress={() => void reload()} />
        </View>
      ) : (
        <>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("partyLedger.searchPlaceholder")}
          placeholderTextColor={colors.textSubtle}
          accessibilityLabel={t("partyLedger.searchA11y")}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <SectionList
          style={styles.fill}
          sections={sections}
          keyExtractor={(item) => item.partyId}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={sections.length === 0 ? styles.emptyGrow : undefined}
          renderSectionHeader={({ section }) => (
            <LocaleUiText style={styles.section}>{section.title}</LocaleUiText>
          )}
          renderItem={({ item }) => (
            <PartyRow
              party={item}
              onPress={() =>
                router.push({
                  pathname: "/(app)/party-ledger/[partyId]",
                  params: { partyId: item.partyId },
                })
              }
            />
          )}
          ListEmptyComponent={
            reading ? (
              <LocaleUiText style={styles.caption}>{t("partyLedger.reading")}</LocaleUiText>
            ) : noResults ? (
              <EmptyState
                title={t("partyLedger.noResultsTitle")}
                message={t("partyLedger.noResultsBody")}
                iconName="magnify"
                accentKey="cash"
              />
            ) : (
              <EmptyState
                title={t("partyLedger.emptyTitle")}
                message={t("partyLedger.emptyBody")}
                iconName="account-cash-outline"
                accentKey="cash"
              />
            )
          }
        />
        </>
      )}
    </View>
  );
}

function PartyRow({ party, onPress }: { party: LocalPartySummary; onPress: () => void }) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
        gap: 2,
      },
      rowTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: spacing.md,
      },
      name: { ...typography.bodyStrong, color: c.text, flex: 1 },
      amount: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.micro, color: c.textMuted },
      badge: { ...typography.micro, color: c.primaryDark },
    })
  );
  const name = party.unassigned ? t("partyLedger.unassigned") : party.displayName;
  const figure =
    party.cashPaidMinor == null
      ? t("partyLedger.amountUnreadable")
      : formatInrMinor(party.cashPaidMinor);
  const onDevice = !PARTY_LEDGER_SERVER_PROJECTION_ENABLED;
  const leftOut = party.lines.some((line) => line.kind === "exclusion");

  return (
    <LuxuryPressable
      style={styles.row}
      onPress={onPress}
      tactile={false}
      accessibilityRole="button"
      accessibilityLabel={
        onDevice
          ? `${name}. ${t("partyLedger.cashPaid")} ${figure}. ${t("partyLedger.deviceCounted")}`
          : `${name}. ${t("partyLedger.cashPaid")} ${figure}`
      }
    >
      <View style={styles.rowTop}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.amount}>{figure}</Text>
      </View>
      <LocaleUiText style={styles.meta}>{t("partyLedger.cashPaid")}</LocaleUiText>
      {party.provisional ? (
        <LocaleUiText style={styles.badge}>
          {t("partyLedger.provisional")} · {t("partyLedger.provisionalHint")}
        </LocaleUiText>
      ) : null}
      {onDevice && party.cashPaidMinor != null ? (
        <LocaleUiText style={styles.meta}>{t("partyLedger.deviceCounted")}</LocaleUiText>
      ) : null}
      {leftOut ? <LocaleUiText style={styles.meta}>{t("partyLedger.someLeftOut")}</LocaleUiText> : null}
    </LuxuryPressable>
  );
}
