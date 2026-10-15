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
import { shouldDisplayRemoteSynced, type ComposerSaveStatus } from "@/services/diary/composerSaveStatus";
import { documentRevisionForCashEntry, documentRevisionKey } from "@/services/attachments/cashVoucherRevision";
import { ReceiptPhotoUnavailableError } from "@/services/attachments/cashVoucherPhotoPlan";
import {
  canShareDocumentRevision,
  isPdfRenderInFlight,
  pdfRevisionReadyKey,
} from "@/services/pdf/pdfRevisionGate";
import { accentKeyForEntryType } from "@/theme/categoryAccentResolver";
import { shareBusinessEntryText } from "@/services/share/shareTextService";
import { isShareUserCancelled } from "@/utils/shareDismissed";

interface ComposerSaveSuccessProps {
  entry: BusinessEntry;
  pdfFailed: boolean;
  onAddAnother: () => void;
  cloudAccepted?: boolean;
  syncFailureKind?: string;
  saveStatus?: ComposerSaveStatus;
  photoRecovery?: { reason: string; actions: Array<"retry" | "generate_without_photo"> } | null;
}

export function ComposerSaveSuccess({
  entry: entryProp,
  pdfFailed,
  onAddAnother,
  cloudAccepted = true,
  syncFailureKind,
  saveStatus,
  photoRecovery,
}: ComposerSaveSuccessProps) {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();
  const [entry, setEntry] = useState(entryProp);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offerWithoutPhoto, setOfferWithoutPhoto] = useState(Boolean(photoRecovery));

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

  const cashShareReady = useCallback(
    (candidate: BusinessEntry) => {
      if (candidate.entryType !== "business_cash_given") return Boolean(candidate.pdfUri);
      const expected = documentRevisionKey(documentRevisionForCashEntry(candidate));
      return canShareDocumentRevision({
        pdfUri: candidate.pdfUri,
        readyKey: pdfRevisionReadyKey(candidate.id),
        expectedKey: expected,
      });
    },
    []
  );

  const shareReadyPdf = useCallback(
    async (candidate: BusinessEntry) => {
      if (!user || !candidate.pdfUri) return;
      if (candidate.entryType === "business_cash_given" && !cashShareReady(candidate)) return;
      const fileName = buildPdfFileName(
        buildPdfFileNameForBusinessEntry(candidate, { businessName: user.businessName })
      );
      await pdfService.share({ uri: candidate.pdfUri, fileName });
    },
    [cashShareReady, user]
  );

  const onPdf = useCallback(async () => {
    if (!user) return;
    setActionError(null);
    shareRecovery.markPending();
    setExporting(true);
    try {
      if (entry.entryType === "business_cash_given") {
        if (isPdfRenderInFlight(entry.id) && !cashShareReady(entry)) {
          setActionError(t("composer.cashPaidPdfNotReady"));
          return;
        }
        if (cashShareReady(entry)) {
          await shareReadyPdf(entry);
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
        if (!cashShareReady(updated)) {
          setActionError(t("composer.cashPaidPdfNotReady"));
          return;
        }
        await shareReadyPdf(updated);
        return;
      }
      if (entry.pdfUri) {
        await shareReadyPdf(entry);
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
      if (updated.pdfUri) await shareReadyPdf(updated);
    } catch (e) {
      if (e instanceof ReceiptPhotoUnavailableError) {
        setOfferWithoutPhoto(true);
        setActionError(t("composer.cashPaidPdfPhotoUnavailable"));
        return;
      }
      if (!isShareUserCancelled(e)) {
        const msg = userFacingMessage(e) || t("pdf.entryExportFailed");
        setActionError(msg);
        feedback.showError(msg, t("composer.saveSuccess.exportFailedTitle"));
      }
    } finally {
      shareRecovery.clearPending();
      setExporting(false);
    }
  }, [entry, user, locale, t, feedback, shareRecovery, lang, cashShareReady, shareReadyPdf]);

  const onPdfWithoutPhoto = useCallback(async () => {
    if (!user || entry.entryType !== "business_cash_given") return;
    setActionError(null);
    shareRecovery.markPending();
    setExporting(true);
    try {
      const updated = await regenerateEntryPdf(user.uid, entry, {
        user,
        locale,
        uiLang: lang,
        t,
        fileNameHint: t("pdf.entryFileNameHint", { date: "{{date}}" }),
        allowWithoutPhoto: true,
      });
      setEntry(updated);
      if (!updated.pdfUri) {
        setActionError(t("composer.cashPaidPdfNotReady"));
        return;
      }
      const fileName = buildPdfFileName(
        buildPdfFileNameForBusinessEntry(updated, { businessName: user.businessName })
      );
      await pdfService.share({ uri: updated.pdfUri, fileName });
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
  }, [entry, user, locale, lang, t, feedback, shareRecovery]);

  const synced = shouldDisplayRemoteSynced(cloudAccepted);
  const statusLabel = saveStatus ? t(`composer.saveStatus.${saveStatus}`) : null;
  const pdfLabel =
    entry.entryType === "business_cash_given" && !cashShareReady(entry)
      ? t("composer.saveSuccess.generatePdf")
      : entry.pdfUri
        ? t("composer.saveSuccess.viewPdf")
        : t("composer.saveSuccess.generatePdf");

  const localWarning =
    !cloudAccepted
      ? {
          title: t("sync.savedLocallyTitle"),
          message:
            syncFailureKind === "quota_exhausted"
              ? t("sync.savedLocallyQuota")
              : syncFailureKind === "permission_denied" || syncFailureKind === "quota_state_invalid"
                ? t("sync.savedLocallyPermission")
                : t("sync.savedLocallyPending"),
        }
      : pdfFailed
        ? { title: t("pdf.entrySavedTitle"), message: t("pdf.entrySavedPdfFailed") }
        : null;

  return (
    <PremiumSuccessPrompt
      title={synced ? t("composer.saveSuccess.title") : t("sync.savedLocallyTitle")}
      subtitle={statusLabel ? `${statusLabel} — ${entry.title}` : entry.title}
      warning={localWarning}
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
      {offerWithoutPhoto ? (
        <PremiumActionButton
          label={t("composer.cashPaidPdfWithoutPhoto")}
          variant="secondary"
          loading={exporting}
          disabled={exporting}
          onPress={() => void onPdfWithoutPhoto()}
        />
      ) : null}
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
