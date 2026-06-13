import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { Banner,
  Button,
  Card,
  ErrorState,
  Header,
  Loader,
  PremiumActionButton,
  Screen, LocaleUiText } from "@/components/ui";
import { BusinessEntryDetailBody } from "@/components/diary/BusinessEntryDetailBody";
import type { BusinessEntry, OutwardFreightPayload } from "@/domain/businessEntry";
import { isComposerEntryType } from "@/domain/composerOptions";
import { entryHasPdfExport, entryTypeLabelKey } from "@/utils/businessEntry/display";
import { freightDefaultsFromDispatch } from "@/utils/businessEntry/freightFromDispatch";
import { userFacingMessage } from "@/domain/errors";
import { getDiaryRepository } from "@/services/diary";
import { updateEntryLocalFirst } from "@/services/diary/localFirst";
import { stripGpsFromLocation } from "@/services/location/locationRecordService";
import { deleteUserContent } from "@/services/records/userContentDelete";
import { notifySearchIndexChanged } from "@/services/search";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { formatEntryDate, formatRelative } from "@/utils/date";
import { shareBusinessEntryText } from "@/services/share/shareTextService";
import { isShareUserCancelled } from "@/utils/shareDismissed";
import { pdfService } from "@/services/pdf/pdfService";
import { exportCashPaidPdf } from "@/services/diary/exportCashPaidPdf";
import { regenerateEntryPdf } from "@/services/diary/regenerateEntryPdf";

export default function EntryDetailScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const entryId = String(id ?? "");

  const [entry, setEntry] = useState<BusinessEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [linkedDispatchStale, setLinkedDispatchStale] = useState(false);
  const [refreshingLink, setRefreshingLink] = useState(false);
  const [removingGps, setRemovingGps] = useState(false);
  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      bannerWrap: { marginBottom: spacing.md },
      card: { gap: spacing.md, borderRadius: radius.xl },
      title: { ...typography.titleLg, color: colors.text },
      metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
      tag: {
        backgroundColor: colors.primaryLight,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
        borderRadius: 999,
      },
      tagText: { ...typography.micro, color: colors.primaryDark, letterSpacing: 0.3 },
      date: { ...typography.caption, color: colors.textMuted },
      field: { gap: 2 },
      fieldLabel: { ...typography.captionStrong, color: colors.textMuted },
      fieldValue: { ...typography.body, color: colors.text },
      notesBlock: { gap: spacing.xs },
      notes: { ...typography.body, color: colors.text, lineHeight: 22 },
      tagsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginTop: spacing.sm,
      },
      chip: {
        backgroundColor: colors.surfaceMuted,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
      },
      chipText: { ...typography.caption, color: colors.text },
      timestamps: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.sm },
      actions: { gap: spacing.md, marginTop: spacing.xl },
    })
  );

  const Field = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>
        {value}
      </Text>
    </View>
  );

  const load = useCallback(async () => {
    if (!user || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const found = await getDiaryRepository().getById(user.uid, entryId);
      if (!found) {
        setError(t("errors.notFound"));
      } else {
        setEntry(found);
        setLinkedDispatchStale(false);
        if (found.entryType === "outward_freight_details") {
          const p = found.payload as unknown as OutwardFreightPayload;
          if (p.linkedDispatchId) {
            const dispatch = await getDiaryRepository().getById(user.uid, p.linkedDispatchId);
            if (
              dispatch &&
              dispatch.updatedAt > (p.linkedDispatchUpdatedAt ?? 0)
            ) {
              setLinkedDispatchStale(true);
            }
          }
        }
      }
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, entryId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onShare = async () => {
    if (!entry) return;
    try {
      await shareBusinessEntryText(entry, {
        locale: lang === "hi" ? "hi" : "en",
        t,
        freightLabels: {
          dispatchUpdate: t("composer.freightShare.dispatchUpdate"),
          billNo: t("composer.freightShare.billNo"),
          billDate: t("composer.freightShare.billDate"),
          lrNo: t("composer.freightShare.lrNo"),
          deliveryLocation: t("composer.freightShare.deliveryLocation"),
          totalBoxes: t("composer.freightShare.totalBoxes"),
          totalWeight: t("composer.freightShare.totalWeight"),
          freightType: t("composer.freightShare.freightType"),
          ccCopy: t("composer.freightShare.ccCopy"),
          clarification: t("composer.freightShare.clarification"),
          freightTypeToPay: t("composer.freightTypes.to_pay"),
          freightTypePaid: t("composer.freightTypes.paid"),
          freightTypeTbb: t("composer.freightTypes.tbb"),
          freightTypeOther: t("composer.freightTypes.other"),
          ccAttach: t("composer.ccCopy.attach"),
          ccNotAttached: t("composer.ccCopy.not_attached"),
          ccNotApplicable: t("composer.ccCopy.not_applicable"),
        },
      });
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        setActionError(userFacingMessage(e));
      }
    }
  };

  const onExportPdf = async () => {
    if (!entry || !user) return;
    setActionError(null);
    setExporting(true);
    try {
      if (entry.entryType === "business_cash_given") {
        const updated = await exportCashPaidPdf(user.uid, entry, {
          user,
          uiLang: lang,
          t,
        });
        setEntry(updated);
        return;
      }
      if (entry.pdfUri) {
        await pdfService.share({
          uri: entry.pdfUri,
          fileName: entry.title.replace(/\s+/g, "-") + ".pdf",
        });
        return;
      }
      const updated = await regenerateEntryPdf(user.uid, entry, {
        user,
        locale: "en-IN",
        uiLang: lang,
        t,
        fileNameHint: t("pdf.entryFileNameHint", { date: "{{date}}" }),
      });
      setEntry(updated);
      if (updated.pdfUri) {
        await pdfService.share({
          uri: updated.pdfUri,
          fileName: updated.title.replace(/\s+/g, "-") + ".pdf",
        });
      }
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        setActionError(userFacingMessage(e) || t("pdf.entryExportFailed"));
      }
    } finally {
      setExporting(false);
    }
  };

  const onCreateFreightFromDispatch = () => {
    if (!entry || entry.entryType !== "material_dispatched") return;
    router.push({
      pathname: "/(app)/composer/[type]",
      params: { type: "outward_freight_details", linkedDispatchId: entry.id },
    });
  };

  const onRefreshFromDispatch = () => {
    if (!entry || !user || entry.entryType !== "outward_freight_details") return;
    const p = entry.payload as unknown as OutwardFreightPayload;
    if (!p.linkedDispatchId) return;
    Alert.alert(t("composer.refreshDispatchTitle"), t("composer.refreshDispatchBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        onPress: async () => {
          setRefreshingLink(true);
          setActionError(null);
          try {
            const dispatch = await getDiaryRepository().getById(
              user.uid,
              p.linkedDispatchId!
            );
            if (!dispatch || dispatch.entryType !== "material_dispatched") {
              setActionError(t("errors.notFound"));
              return;
            }
            const fresh = freightDefaultsFromDispatch(dispatch);
            const current = entry.payload as unknown as OutwardFreightPayload;
            const nextPayload: OutwardFreightPayload = {
              ...current,
              dispatchTitle: String(fresh.dispatchTitle),
              billNumber: String(fresh.billNumber ?? current.billNumber),
              billDate: Number(fresh.billDate) || current.billDate,
              lrGrNumber: String(fresh.lrGrNumber || "") || current.lrGrNumber,
              deliveryLocation: String(fresh.deliveryLocation || current.deliveryLocation),
              dispatchFromLocation:
                String(fresh.dispatchFromLocation || "") || current.dispatchFromLocation,
              partyName: String(fresh.partyName || "") || current.partyName,
              materialName: String(fresh.materialName || "") || current.materialName,
              transporterName:
                String(fresh.transporterName || "") || current.transporterName,
              vehicleNumber: String(fresh.vehicleNumber || "") || current.vehicleNumber,
              linkedDispatchUpdatedAt: dispatch.updatedAt,
            };
            const updated = await getDiaryRepository().update(user.uid, {
              id: entry.id,
              payload: nextPayload,
            });
            setEntry(updated);
            setLinkedDispatchStale(false);
          } catch (e) {
            setActionError(userFacingMessage(e));
          } finally {
            setRefreshingLink(false);
          }
        },
      },
    ]);
  };

  const onRemoveGps = async () => {
    if (!entry || !user) return;
    setRemovingGps(true);
    setActionError(null);
    try {
      const updated = await updateEntryLocalFirst(user.uid, {
        id: entry.id,
        location: stripGpsFromLocation(entry.location),
      });
      setEntry(updated);
      notifySearchIndexChanged();
    } catch (e) {
      setActionError(userFacingMessage(e));
    } finally {
      setRemovingGps(false);
    }
  };

  const onDelete = () => {
    if (!entry || !user) return;
    const body = `${t("swipeDelete.confirm.recordBody")}\n\n${t("swipeDelete.confirm.recordSharedPdf")}`;
    Alert.alert(t("swipeDelete.confirm.recordTitle"), body, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          setActionError(null);
          try {
            await deleteUserContent(user.uid, {
              entityType: "diary_entry",
              recordId: entry.id,
              title: entry.title,
              confirmTier: "record",
            });
            router.back();
          } catch (e) {
            setActionError(userFacingMessage(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <Header title={t("diary.detailTitle")} showBack backFrom={from} />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  if (error || !entry) {
    return (
      <Screen>
        <Header title={t("diary.detailTitle")} showBack backFrom={from} />
        <ErrorState message={error ?? t("errors.notFound")} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={t("diary.detailTitle")} showBack backFrom={from} />

      {actionError ? (
        <View style={styles.bannerWrap}>
          <Banner tone="danger" message={actionError} />
        </View>
      ) : null}

      {linkedDispatchStale ? (
        <View style={styles.bannerWrap}>
          <Banner tone="warning" message={t("composer.linkedDispatchStale")} />
        </View>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.title}>{entry.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.tag}>
            <LocaleUiText style={styles.tagText}>{t(entryTypeLabelKey(entry.entryType))}</LocaleUiText>
          </View>
          <Text style={styles.date}>{formatEntryDate(entry.entryDate)}</Text>
        </View>

        <BusinessEntryDetailBody
          entry={entry}
          onRemoveGps={() => void onRemoveGps()}
          removingGps={removingGps}
        />

        {entry.reminder ? (
          <Field
            label={t("diary.reminder.sectionTitle")}
            value={t("diary.reminder.scheduledFor", {
              datetime: new Date(entry.reminder.at).toLocaleString(),
            })}
          />
        ) : null}

        <Text style={styles.timestamps}>
          {t("diary.deleteUpdated", { relative: formatRelative(entry.updatedAt) })}
        </Text>
      </Card>

      <View style={styles.actions}>
        {entry.entryType === "legacy" ? (
          <Button
            label={t("common.edit")}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: "/(app)/diary/edit/[id]", params: { id: entry.id } })
            }
          />
        ) : null}
        {isComposerEntryType(entry.entryType) ? (
          <Button
            label={t("common.edit")}
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: "/(app)/composer/[type]",
                params: { type: entry.entryType, entryId: entry.id },
              })
            }
          />
        ) : null}
        {entry.entryType === "material_dispatched" ? (
          <Button
            label={t("composer.createFreightFromDispatch")}
            variant="secondary"
            onPress={onCreateFreightFromDispatch}
          />
        ) : null}
        {entry.entryType === "outward_freight_details" &&
        (entry.payload as unknown as OutwardFreightPayload).linkedDispatchId ? (
          <Button
            label={t("composer.refreshFromDispatch")}
            variant="secondary"
            onPress={onRefreshFromDispatch}
            loading={refreshingLink}
          />
        ) : null}
        {entry.entryType !== "letterhead_matter" ? (
          <PremiumActionButton
            label={t("common.shareText")}
            variant="glass"
            onPress={onShare}
          />
        ) : null}
        {entryHasPdfExport(entry.entryType) ? (
          <PremiumActionButton
            label={exporting ? t("pdf.entryExporting") : t("common.sharePdf")}
            variant="primary"
            onPress={onExportPdf}
            loading={exporting}
          />
        ) : null}
        <Button
          label={t("common.delete")}
          variant="danger"
          onPress={onDelete}
          loading={deleting}
        />
      </View>
    </Screen>
  );
}

