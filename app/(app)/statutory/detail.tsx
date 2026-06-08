import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { statutoryInfoRepository } from "@/repositories/statutoryInfoRepository";
import { getAttachedNotes, getStatutoryTemplate } from "@/services/statutory/statutoryInfoRegistry";
import {
  formatStatutoryDueLine,
  formatStatutoryPeriodLine,
} from "@/services/statutory/statutoryCompliancePeriod";
import {
  daysUntilDue,
  generateAllStatutoryDues,
} from "@/services/statutory/statutoryDeadlineEngine";
import { formatEntryDate } from "@/utils/date";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function StatutoryDetailScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { occurrenceId, templateId } = useLocalSearchParams<{
    occurrenceId?: string;
    templateId?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [dueMs, setDueMs] = useState(0);
  const [periodLine, setPeriodLine] = useState("");
  const [dueLine, setDueLine] = useState("");

  const tid = templateId ? String(templateId) : "";
  const template = getStatutoryTemplate(tid);
  const attached = getAttachedNotes(tid);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      body: { ...typography.body, color: c.text, lineHeight: 24 },
      muted: { ...typography.caption, color: c.textMuted, lineHeight: 20, marginTop: spacing.md },
      period: { ...typography.captionStrong, color: c.primary, marginTop: spacing.sm },
      note: {
        backgroundColor: c.surfaceMuted,
        borderRadius: 12,
        padding: spacing.md,
        marginTop: spacing.md,
      },
      noteText: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
    })
  );

  useEffect(() => {
    if (!user?.uid || !occurrenceId || String(occurrenceId).startsWith("ref_")) {
      setLoading(false);
      return;
    }
    void statutoryInfoRepository.getById(user.uid, String(occurrenceId)).then((row) => {
      const ms = row?.dueDateMs ?? 0;
      setDueMs(ms);
      if (row) {
        const due = generateAllStatutoryDues().find(
          (d) => d.templateId === row.templateId && d.dueDateKey === row.dueDateKey
        );
        const label = due?.periodLabel ?? "";
        setPeriodLine(formatStatutoryPeriodLine(label, t));
        setDueLine(ms > 0 ? formatStatutoryDueLine(ms, formatEntryDate, t) : "");
      }
      setLoading(false);
    });
  }, [user?.uid, occurrenceId, t]);

  if (!template) {
    return (
      <Screen>
        <Header title={t("statutory.tabTitle")} showBack onBackPress={() => router.back()} />
        <LocaleUiText style={styles.muted}>{t("errors.notFound")}</LocaleUiText>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        variant="executive"
        title={t(template.titleKey)}
        showBack
        onBackPress={() => router.back()}
      />
      {loading ? <Loader message={t("common.loading")} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {periodLine ? <Text style={styles.period}>{periodLine}</Text> : null}
          {dueLine ? <Text style={styles.period}>{dueLine}</Text> : null}
          {dueMs > 0 ? (
            <LocaleUiText style={styles.muted}>
              {t("statutory.card.daysLeft", { days: daysUntilDue(dueMs) })}
            </LocaleUiText>
          ) : null}
          <LocaleUiText style={styles.muted}>{t(template.applicabilityKey)}</LocaleUiText>
          <LocaleUiText style={styles.body}>{t(template.bodyKey)}</LocaleUiText>
          <LocaleUiText style={styles.muted}>{t(template.cautionKey)}</LocaleUiText>
          {(template.penaltyNoteKeys ?? []).map((k) => (
            <View key={k} style={styles.note}>
              <LocaleUiText style={styles.noteText}>{t(k)}</LocaleUiText>
            </View>
          ))}
          {attached.map((a: { id: string; bodyKey: string }) => (
            <View key={a.id} style={styles.note}>
              <LocaleUiText style={styles.noteText}>{t(a.bodyKey)}</LocaleUiText>
            </View>
          ))}
          <LocaleUiText style={[styles.muted, { marginTop: spacing.xl }]}>
            {t("statutory.disclaimer")}
          </LocaleUiText>
        </ScrollView>
      )}
    </Screen>
  );
}
