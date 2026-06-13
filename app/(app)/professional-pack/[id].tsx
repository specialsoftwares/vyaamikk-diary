import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";

import { Banner, Button, Card, ErrorState, Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { userFacingMessage } from "@/domain/errors";
import { useAppFeedback } from "@/feedback/AppFeedback";
import { deleteRecordPermanently } from "@/services/records/permanentDeletion";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate } from "@/utils/date";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import {
  categoryLabelKey,
  matterLabelKey,
  statusLabelKey,
} from "@/utils/professionalPack/display";
import { buildProfessionalPackPdfHtml } from "@/services/pdf/professionalPackPdfTemplate";
import { getUserPdfBranding } from "@/services/pdf/userPdfBranding";
import { pdfService } from "@/services/pdf/pdfService";
import { dayKey } from "@/utils/date";
import { getMatterDef } from "@/domain/professionalPackMatters";
import { shareProfessionalBriefText } from "@/services/share/shareTextService";
import { isShareUserCancelled } from "@/utils/shareDismissed";
import { matterLabelKey as matterKey } from "@/utils/professionalPack/display";

export default function ProfessionalPackDetailScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [pack, setPack] = useState<ProfessionalServicePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: { gap: spacing.md },
      label: { ...typography.captionStrong, color: c.textMuted },
      value: { ...typography.body, color: c.text },
      actions: { gap: spacing.sm, marginTop: spacing.lg },
    })
  );

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setFetchError(null);
    setNotFound(false);
    try {
      const found = await getProfessionalPackRepository().getById(user.uid, String(id));
      setPack(found);
      setNotFound(!found);
    } catch (e) {
      setPack(null);
      setNotFound(false);
      setFetchError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onShareText = async () => {
    if (!pack) return;
    try {
      await shareProfessionalBriefText(pack, { t });
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        setError(userFacingMessage(e));
      }
    }
  };

  const regeneratePdf = async () => {
    if (!pack || !user) return;
    setBusy(true);
    setError(null);
    try {
      const def = getMatterDef(pack.professionalCategory, pack.matterType);
      const branding = await getUserPdfBranding(user, { t });
      const html = buildProfessionalPackPdfHtml({
        pack,
        user,
        branding,
        locale: lang === "hi" ? "hi-IN" : "en-IN",
        labels: {
          reportTitle: def
            ? t(`proPack.pdfTitles.${def.pdfTitleKey}`)
            : t("proPack.pdfTitles.generic"),
          matterType: t(matterKey(pack.professionalCategory, pack.matterType)),
          category: t(categoryLabelKey(pack.professionalCategory)),
          factsSection: t("proPack.pdf.factsSection"),
          linkedSection: t("proPack.pdf.linkedSection"),
          professionalSection: t("proPack.pdf.professionalSection"),
          notesSection: t("proPack.pdf.notesSection"),
          disclaimer: t("proPack.pdf.disclaimer"),
          matterDate: t("proPack.pdf.matterDate"),
          dueDate: t("proPack.pdf.dueDate"),
          status: t("proPack.pdf.status"),
          profileTitle: t("pdf.userProfileTitle"),
          legal: branding.legal,
        },
      });
      const pdf = await pdfService.generate({
        html,
        fileNameHint: t("proPack.fileNameHint", { date: dayKey(pack.matterDate) }),
      });
      const updated = await getProfessionalPackRepository().update(user.uid, {
        id: pack.id,
        pdfUri: pdf.uri,
      });
      setPack(updated);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: "application/pdf",
          dialogTitle: pack.title,
        });
      }
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: ProfessionalServicePack["status"]) => {
    if (!pack || !user) return;
    setBusy(true);
    try {
      const updated = await getProfessionalPackRepository().update(user.uid, {
        id: pack.id,
        status,
      });
      setPack(updated);
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!pack || !user) return;
    Alert.alert(t("proPack.deleteTitle"), t("proPack.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const result = await deleteRecordPermanently({
              entityType: "professional_pack",
              recordId: pack.id,
              userId: user.uid,
              ueid: user.ueid,
            });
            const msg = result.syncPending
              ? t("swipeDelete.deletedSyncPending")
              : t("swipeDelete.deleted");
            feedback.showSuccess(msg);
            router.back();
          } catch (e) {
            setError(userFacingMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <Loader message={t("common.loading")} />
      </Screen>
    );
  }

  if (fetchError) {
    return (
      <Screen scroll>
        <Header title={t("proPack.detailTitle")} showBack backFrom={from ?? "pro_pack"} />
        <ErrorState
          message={t("proPack.fetchError")}
          onRetry={() => void load()}
          retryLabel={t("common.retry")}
        />
      </Screen>
    );
  }

  if (notFound || !pack) {
    return (
      <Screen>
        <Header title={t("errors.notFound")} showBack backFrom="pro_pack" />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={pack.title} showBack backFrom={from ?? "pro_pack"} />
      <Banner tone="info" message={t("proPack.formDisclaimer")} />
      {error ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}
      <Card style={styles.card}>
        <View>
          <LocaleUiText style={styles.label}>{t("proPack.detailCategory")}</LocaleUiText>
          <LocaleUiText style={styles.value}>{t(categoryLabelKey(pack.professionalCategory))}</LocaleUiText>
        </View>
        <View>
          <LocaleUiText style={styles.label}>{t("proPack.detailMatter")}</LocaleUiText>
          <LocaleUiText style={styles.value}>
            {t(matterLabelKey(pack.professionalCategory, pack.matterType))}
          </LocaleUiText>
        </View>
        <View>
          <LocaleUiText style={styles.label}>{t("proPack.pdf.status")}</LocaleUiText>
          <LocaleUiText style={styles.value}>{t(statusLabelKey(pack.status))}</LocaleUiText>
        </View>
        <View>
          <LocaleUiText style={styles.label}>{t("proPack.matterDate")}</LocaleUiText>
          <Text style={styles.value}>{formatEntryDate(pack.matterDate)}</Text>
        </View>
        {pack.dueDate ? (
          <View>
            <LocaleUiText style={styles.label}>{t("proPack.dueDateOptional")}</LocaleUiText>
            <Text style={styles.value}>{formatEntryDate(pack.dueDate)}</Text>
          </View>
        ) : null}
        {Object.entries(pack.facts).map(([k, v]) =>
          v != null && String(v).trim() ? (
            <View key={k}>
              <LocaleUiText style={styles.label}>{t(`proPack.fields.${k}` as never) || k}</LocaleUiText>
              <Text style={styles.value}>{String(v)}</Text>
            </View>
          ) : null
        )}
      </Card>
      <View style={styles.actions}>
        <Button
          label={t("common.shareText")}
          variant="secondary"
          onPress={() => void onShareText()}
          disabled={busy}
        />
        <Button
          label={t("proPack.editPack")}
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/(app)/professional-pack/form",
              params: {
                category: pack.professionalCategory,
                matter: pack.matterType,
                id: pack.id,
              },
            })
          }
          disabled={busy}
        />
        <Button
          label={busy ? t("common.loading") : t("proPack.regenerateShare")}
          onPress={() => void regeneratePdf()}
          disabled={busy}
        />
        <Button
          label={t("proPack.markShared")}
          variant="secondary"
          onPress={() => void setStatus("shared")}
          disabled={busy}
        />
        <Button
          label={t("proPack.markCompleted")}
          variant="secondary"
          onPress={() => void setStatus("completed")}
          disabled={busy}
        />
        <Button
          label={t("common.delete")}
          variant="secondary"
          onPress={onDelete}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}
