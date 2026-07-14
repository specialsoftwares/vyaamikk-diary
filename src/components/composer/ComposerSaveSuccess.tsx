import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";

import { PremiumActionButton } from "@/components/ui/PremiumActionButton";
import { useStuckBusyRecovery } from "@/hooks/useStuckBusyRecovery";
import { PremiumSuccessPrompt } from "@/components/ui/PremiumSuccessPrompt";
import type { BusinessEntry } from "@/domain/businessEntry";
import { userFacingMessage } from "@/domain/errors";
import { useAppFeedback } from "@/feedback/AppFeedback";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { pdfService } from "@/services/pdf/pdfService";
import { buildPdfFileName, buildPdfFileNameForBusinessEntry } from "@/services/pdf/pdfFileNames";
import { regenerateEntryPdf } from "@/services/diary/regenerateEntryPdf";
import { accentKeyForEntryType } from "@/theme/categoryAccentResolver";
import { shareBusinessEntryText } from "@/services/share/shareTextService";
import { isShareUserCancelled } from "@/utils/shareDismissed";

interface ComposerSaveSuccessProps {
  entry: BusinessEntry;
  pdfFailed: boolean;
  onAddAnother: () => void;
}

export function ComposerSaveSuccess({
  entry: entryProp,
  pdfFailed,
  onAddAnother,
}: ComposerSaveSuccessProps) {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const [entry, setEntry] = useState(entryProp);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(entryProp);
  }, [entryProp]);

  /** Share sheet / app switch can leave `exporting` stuck on iOS when the promise never settles. */
  const shareRecovery = useStuckBusyRecovery(
    useCallback(() => setExporting(false), [])
  );

  const locale = "en-IN" as const;

  const onViewRecord = () => {
    router.replace({
      pathname: "/(app)/diary/[id]",
      params: { id: entry.id, from: "you" },
    });
  };

  const onEdit = () => {
    router.push({
      pathname: "/(app)/composer/[type]",
      params: { type: entry.entryType, entryId: entry.id },
    });
  };

  const onDashboard = () => {
    router.replace("/(app)/(tabs)/you");
  };

  const freightLabels = useMemo(
    () => ({
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
    }),
    [t]
  );

  const onShare = useCallback(async () => {
    setActionError(null);
    try {
      await shareBusinessEntryText(entry, {
        locale: lang === "hi" ? "hi" : "en",
        t,
        freightLabels,
      });
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        const msg = userFacingMessage(e);
        setActionError(msg);
        feedback.showError(msg, t("composer.saveSuccess.shareFailedTitle"));
      }
    }
  }, [entry, lang, t, freightLabels, feedback]);

  const onPdf = useCallback(async () => {
    if (!user) return;
    setActionError(null);
    shareRecovery.markPending();
    setExporting(true);
    try {
      if (entry.pdfUri) {
        const fileName = buildPdfFileName(
          buildPdfFileNameForBusinessEntry(entry, { businessName: user.businessName })
        );
        await pdfService.share({ uri: entry.pdfUri, fileName });
        return;
      }
      const updated = await regenerateEntryPdf(user.uid, entry, {
        user,
        locale,
        uiLang: lang,
        t,
        fileNameHint: t("pdf.entryFileNameHint", { date: "{{date}}" }),
      });
      setEntry(updated);
      if (updated.pdfUri) {
        const fileName = buildPdfFileName(
          buildPdfFileNameForBusinessEntry(updated, { businessName: user.businessName })
        );
        await pdfService.share({ uri: updated.pdfUri, fileName });
      }
    } catch (e) {
      if (!isShareUserCancelled(e)) {
        const msg = userFacingMessage(e) || t("pdf.entryExportFailed");
        setActionError(msg);
        feedback.showError(msg, t("composer.saveSuccess.exportFailedTitle"));
      }
    } finally {
      shareRecovery.clearPending();
      setExporting(false);
    }
  }, [entry, user, locale, t, feedback, shareRecovery]);

  const pdfLabel = entry.pdfUri
    ? t("composer.saveSuccess.viewPdf")
    : t("composer.saveSuccess.generatePdf");

  return (
    <PremiumSuccessPrompt
      title={t("composer.saveSuccess.title")}
      subtitle={entry.title}
      warning={
        pdfFailed
          ? { title: t("pdf.entrySavedTitle"), message: t("pdf.entrySavedPdfFailed") }
          : null
      }
      accentKey={accentKeyForEntryType(entry.entryType)}
      trustMessages={[
        t("executive.trust.local_first"),
        t("executive.trust.user_record"),
        ...(entry.pdfUri ? [t("executive.trust.pdf_privacy")] : []),
      ]}
    >
      <PremiumActionButton
        label={t("composer.saveSuccess.viewRecord")}
        onPress={onViewRecord}
        variant="primary"
      />
      <PremiumActionButton
        label={pdfLabel}
        variant="primary"
        loading={exporting}
        disabled={exporting}
        onPress={() => void onPdf()}
      />
      <PremiumActionButton
        label={t("common.shareText")}
        variant="glass"
        onPress={() => void onShare()}
      />
      <PremiumActionButton
        label={t("composer.saveSuccess.addAnother")}
        variant="secondary"
        onPress={onAddAnother}
      />
      <PremiumActionButton
        label={t("composer.saveSuccess.edit")}
        variant="secondary"
        onPress={onEdit}
      />
      <PremiumActionButton
        label={t("composer.saveSuccess.dashboard")}
        variant="ghost"
        onPress={onDashboard}
      />
    </PremiumSuccessPrompt>
  );
}
