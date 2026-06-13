import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ScrollView,
} from "react-native";
import { usePreventRemove } from "@react-navigation/core";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BusinessComposerForm } from "@/components/composer/BusinessComposerForm";
import { ComposerSaveSuccess } from "@/components/composer/ComposerSaveSuccess";
import { DraftSavedSuccess } from "@/components/drafts/DraftSavedSuccess";
import { DraftUnsavedSheet } from "@/components/drafts/DraftUnsavedSheet";
import { Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import { composerOptionForType, isComposerEntryType } from "@/domain/composerOptions";
import type { AttachmentRef, BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { CashPaidPhotoFieldState } from "@/components/composer/CashPaidPhotoField";
import {
  CASH_PAID_ATTACHMENT_ID,
  cashPaidPhotoAttachment,
  persistCashPaidPhoto,
  removeCashPaidPhotoFile,
} from "@/services/attachments/cashPaidPhotoService";
import {
  clearCashPaidPhotoStorageFields,
  uploadCashPaidPhotoToStorage,
} from "@/services/attachments/cashPaidPhotoStorage";
import { userFacingMessage } from "@/domain/errors";
import { useAppFeedback } from "@/feedback/AppFeedback";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import {
  formDraftsRepository,
  type FormDraftRecord,
} from "@/repositories/formDraftsRepository";
import { getDiaryRepository } from "@/services/diary";
import { updateEntryLocalFirst } from "@/services/diary/localFirst";
import { saveComposerEntry } from "@/services/diary/saveComposerEntry";
import { logSaveDiagnostic } from "@/services/records/saveDiagnostics";
import { lifecycleUiResetDiagnostics } from "@/services/records/saveLifecycleRunner";
import {
  buildDraftTitle,
  isDraftPayloadMeaningful,
} from "@/services/drafts";
import { ingestComposerForm } from "@/services/masterData";
import { resolveEntryLocationWithFootprint } from "@/services/location/locationFootprintCapture";
import { notifySearchIndexChanged } from "@/services/search";
import { freightDefaultsFromDispatch } from "@/utils/businessEntry/freightFromDispatch";
import { formValuesFromEntry } from "@/utils/businessEntry/formValuesFromEntry";
import {
  isOutwardMovementEntryType,
  resolveOutwardSaveEntryType,
} from "@/utils/businessEntry/outwardMovement";
import { formValuesToEntryParts } from "@/utils/businessEntry/payload";
import { autoEntryTitle } from "@/utils/businessEntry/display";
import { datePolicyOptionsFromEntry } from "@/utils/businessEntry/datePolicyFromEntry";
import { useSmartBack, requestComposerPickerReturn } from "@/navigation";
import { spacing, typography, useThemedStyles } from "@/theme";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";

export default function ComposerScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const feedback = useAppFeedback();
  const { user } = useAuth();
  const {
    type: typeParam,
    linkedDispatchId: linkedDispatchParam,
    entryId: entryIdParam,
    draftId: draftIdParam,
    pickerReturn: pickerReturnParam,
    from: fromParam,
  } = useLocalSearchParams<{
    type: string;
    linkedDispatchId?: string;
    entryId?: string;
    draftId?: string;
    pickerReturn?: string;
    from?: string;
  }>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [loading, setLoading] = useState(
    Boolean(entryIdParam || draftIdParam)
  );
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | undefined>();
  const [editMeta, setEditMeta] = useState<{
    recordCreatedAtMs: number;
    datePolicyOptions: ReturnType<typeof datePolicyOptionsFromEntry>;
  } | null>(null);
  const [saveResult, setSaveResult] = useState<{
    entry: BusinessEntry;
    pdfFailed: boolean;
    mode: "created" | "updated";
  } | null>(null);
  const [draftSaveResult, setDraftSaveResult] = useState<FormDraftRecord | null>(null);
  const [unsavedSheetVisible, setUnsavedSheetVisible] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(
    draftIdParam ? String(draftIdParam) : null
  );
  const dirtyRef = useRef(false);
  const editingAttachmentsRef = useRef<AttachmentRef[]>([]);
  const [cashPaidPhotoState, setCashPaidPhotoState] = useState<CashPaidPhotoFieldState>({
    picked: null,
    removeExisting: false,
  });
  const [existingCashPhotoUri, setExistingCashPhotoUri] = useState<string | null>(null);
  const saveLockRef = useRef(false);
  const clientRecordIdRef = useRef<string | null>(null);
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const draftSaveLockRef = useRef(false);
  /** JSON snapshot of formValues that counts as "saved" (draft save, entry load, or discard exit). */
  const [savedBaseline, setSavedBaseline] = useState("");
  const [suppressBackGuard, setSuppressBackGuard] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const scrollRef = useRef<ScrollView>(null);
  const editingId = entryIdParam ? String(entryIdParam) : null;

  const entryType = isComposerEntryType(typeParam ?? "")
    ? (typeParam as BusinessEntryType)
    : null;

  const linkedDispatchId = linkedDispatchParam ? String(linkedDispatchParam) : null;

  const draftSavable = useMemo(
    () => isDraftPayloadMeaningful(formValues),
    [formValues]
  );

  const hasUnsavedWork = useMemo(() => {
    if (!isDraftPayloadMeaningful(formValues)) return false;
    return JSON.stringify(formValues) !== savedBaseline;
  }, [formValues, savedBaseline]);

  const shouldBlockBack = useMemo(
    () =>
      !suppressBackGuard &&
      hasUnsavedWork &&
      !saveResult &&
      !draftSaveResult &&
      !loading,
    [suppressBackGuard, hasUnsavedWork, saveResult, draftSaveResult, loading]
  );

  useEffect(() => {
    dirtyRef.current = hasUnsavedWork;
    setFormDirty(hasUnsavedWork);
  }, [hasUnsavedWork]);

  const linkStyles = useThemedStyles((c) =>
    StyleSheet.create({
      saveDraft: { ...typography.captionStrong, color: c.primary },
      saveDraftHidden: { opacity: 0 },
    })
  );

  const { clearDraft: clearRecovery } = useFormAutosave({
    userId: user?.uid,
    draftKind: "composer",
    scopeKey: entryType ?? "",
    entryId: editingId,
    values: formValues,
    shouldPersist: isDraftPayloadMeaningful,
    enabled: Boolean(
      user && entryType && !saveResult && !draftSaveResult && !loading
    ),
    activeRoute: entryType
      ? {
          href: "/(app)/composer/[type]",
          params: {
            type: entryType,
            ...(editingId ? { entryId: editingId } : {}),
            ...(activeDraftId ? { draftId: activeDraftId } : {}),
            ...(linkedDispatchId ? { linkedDispatchId } : {}),
          },
        }
      : undefined,
  });

  const persistUserDraft = useCallback(async (): Promise<FormDraftRecord> => {
    if (!user || !entryType) throw new Error("Not signed in");
    if (!isDraftPayloadMeaningful(formValues)) {
      throw new Error(t("drafts.nothingToSave"));
    }
    const title = buildDraftTitle(
      {
        draftKind: "composer",
        scopeKey: entryType,
        payload: formValues,
        title: typeof formValues.title === "string" ? formValues.title : "",
      },
      t
    );
    const saved = await formDraftsRepository.saveUserDraft({
      userId: user.uid,
      draftKind: "composer",
      scopeKey: entryType,
      entryId: editingId,
      draftId: activeDraftId,
      title,
      payload: formValues,
    });
    await formDraftsRepository.clearRecovery({
      userId: user.uid,
      draftKind: "composer",
      scopeKey: entryType,
      entryId: editingId,
    });
    setActiveDraftId(saved.id);
    setSavedBaseline(JSON.stringify(formValues));
    dirtyRef.current = false;
    setFormDirty(false);
    notifySearchIndexChanged();
    await ingestComposerForm(
      { userId: user.uid, ueid: user.ueid },
      entryType,
      formValues
    );
    return saved;
  }, [user, entryType, formValues, editingId, activeDraftId, t]);

  const handleSaveDraft = useCallback(async () => {
    if (draftSaveLockRef.current) return;
    draftSaveLockRef.current = true;
    setDraftSaving(true);
    setError(null);
    try {
      const saved = await persistUserDraft();
      setUnsavedSheetVisible(false);
      setDraftSaveResult(saved);
      feedback.showSuccess(t("drafts.savedTitle"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : userFacingMessage(e);
      feedback.showError(msg);
      setError(msg);
    } finally {
      setDraftSaving(false);
      draftSaveLockRef.current = false;
    }
  }, [persistUserDraft, feedback, t]);

  const { performBack } = useSmartBack({
    from: fromParam ?? "you",
    dirty: false,
    handleHardwareBack: false,
  });

  const navigateBack = useCallback(() => {
    if (pickerReturnParam === "material_movement") {
      if (router.canGoBack()) {
        router.back();
      } else {
        performBack();
      }
      return;
    }
    const mode =
      pickerReturnParam === "work_team" || pickerReturnParam === "picker"
        ? pickerReturnParam
        : null;
    if (mode) {
      requestComposerPickerReturn(mode);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      performBack();
    }
  }, [pickerReturnParam, router, performBack]);

  const tryBack = useCallback(() => {
    if (saveResult || draftSaveResult) {
      navigateBack();
      return;
    }
    if (suppressBackGuard || !hasUnsavedWork) {
      navigateBack();
      return;
    }
    setUnsavedSheetVisible(true);
  }, [saveResult, draftSaveResult, suppressBackGuard, hasUnsavedWork, navigateBack]);

  usePreventRemove(shouldBlockBack, () => setUnsavedSheetVisible(true));

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      tryBack();
      return true;
    });
    return () => sub.remove();
  }, [tryBack]);

  const handleDiscard = useCallback(async () => {
    if (!user || !entryType) return;
    setSuppressBackGuard(true);
    setUnsavedSheetVisible(false);
    if (activeDraftId) {
      await formDraftsRepository.discardDraft(user.uid, activeDraftId);
      notifySearchIndexChanged();
      setActiveDraftId(null);
    }
    await formDraftsRepository.clearRecovery({
      userId: user.uid,
      draftKind: "composer",
      scopeKey: entryType,
      entryId: editingId,
    });
    setSavedBaseline(JSON.stringify(formValues));
    dirtyRef.current = false;
    setFormDirty(false);
    navigateBack();
  }, [user, entryType, editingId, activeDraftId, formValues, navigateBack]);

  useEffect(() => {
    if (!user || !entryType) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (draftIdParam) {
          const draft = await formDraftsRepository.getById(
            user.uid,
            String(draftIdParam)
          );
          if (!draft || draft.status !== "active" || draft.scopeKey !== entryType) {
            if (!cancelled) setError(t("errors.notFound"));
            return;
          }
          if (!cancelled) {
            setActiveDraftId(draft.id);
            setInitialValues(draft.payload);
            setSavedBaseline(JSON.stringify(draft.payload));
            if (draft.entryId) {
              const existing = await getDiaryRepository().getById(
                user.uid,
                draft.entryId
              );
              if (existing && existing.entryType === entryType) {
                setEditMeta({
                  recordCreatedAtMs: existing.createdAt,
                  datePolicyOptions: datePolicyOptionsFromEntry(existing),
                });
              }
            }
          }
          return;
        }

        if (editingId) {
          const existing = await getDiaryRepository().getById(user.uid, editingId);
          if (!existing || existing.entryType !== entryType) {
            if (!cancelled) setError(t("errors.notFound"));
            return;
          }
          const base = formValuesFromEntry(existing);
          editingAttachmentsRef.current = existing.attachments ?? [];
          const cashPhoto = cashPaidPhotoAttachment(existing.attachments);
          setExistingCashPhotoUri(cashPhoto?.uri ?? null);
          setCashPaidPhotoState({ picked: null, removeExisting: false });
          setEditMeta({
            recordCreatedAtMs: existing.createdAt,
            datePolicyOptions: datePolicyOptionsFromEntry(existing),
          });
          const recovery = await formDraftsRepository.loadRecovery({
            userId: user.uid,
            draftKind: "composer",
            scopeKey: entryType,
            entryId: editingId,
          });
          const merged = recovery?.payload ? { ...base, ...recovery.payload } : base;
          if (!cancelled) {
            setInitialValues(merged);
            setSavedBaseline(JSON.stringify(base));
          }
          return;
        }

        if (entryType === "outward_freight_details" && linkedDispatchId) {
          const dispatch = await getDiaryRepository().getById(
            user.uid,
            linkedDispatchId
          );
          if (dispatch?.entryType === "material_dispatched" && !cancelled) {
            const defaults = freightDefaultsFromDispatch(dispatch);
            setInitialValues(defaults);
            setSavedBaseline(JSON.stringify(defaults));
          }
          return;
        }

        const recovery = await formDraftsRepository.loadRecovery({
          userId: user.uid,
          draftKind: "composer",
          scopeKey: entryType,
          entryId: null,
        });
        if (recovery?.payload && !cancelled) {
          setInitialValues(recovery.payload);
          setSavedBaseline("");
        }
      } catch (e) {
        if (!cancelled) setError(userFacingMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, entryType, editingId, linkedDispatchId, draftIdParam, t]);

  useEffect(() => {
    if (!user || editingId) return;
    if (!clientRecordIdRef.current) {
      clientRecordIdRef.current = generateClientRecordId("entry");
    }
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "business_entry",
      clientRecordId: clientRecordIdRef.current,
      scopeKey: entryType ?? "composer",
    });
  }, [user, editingId, entryType]);

  const resolveCashPaidAttachments = useCallback(
    async (
      uid: string,
      entryId: string,
      baseAttachments: AttachmentRef[],
      photoState: CashPaidPhotoFieldState,
      basePayload: import("@/domain/businessEntry").BusinessCashGivenPayload
    ): Promise<{
      attachments: AttachmentRef[];
      payload: import("@/domain/businessEntry").BusinessCashGivenPayload;
      photoUploadFailed: boolean;
    }> => {
      if (!photoState.picked && !photoState.removeExisting) {
        return { attachments: baseAttachments, payload: basePayload, photoUploadFailed: false };
      }
      let attachments = [...baseAttachments];
      let payload = { ...basePayload };
      let photoUploadFailed = false;

      if (photoState.removeExisting) {
        await removeCashPaidPhotoFile(attachments);
        attachments = attachments.filter((a) => a.id !== CASH_PAID_ATTACHMENT_ID);
        payload = { ...payload, ...clearCashPaidPhotoStorageFields() };
      }

      if (photoState.picked) {
        await removeCashPaidPhotoFile(attachments);
        const localRef = await persistCashPaidPhoto(uid, entryId, photoState.picked);
        try {
          const uploaded = await uploadCashPaidPhotoToStorage({
            userId: uid,
            recordId: entryId,
            picked: photoState.picked,
            localAttachment: localRef,
          });
          attachments = [
            ...attachments.filter((a) => a.id !== CASH_PAID_ATTACHMENT_ID),
            uploaded.attachment,
          ];
          payload = { ...payload, ...uploaded.payloadPatch };
        } catch {
          attachments = [
            ...attachments.filter((a) => a.id !== CASH_PAID_ATTACHMENT_ID),
            localRef,
          ];
          photoUploadFailed = true;
        }
      }

      return { attachments, payload, photoUploadFailed };
    },
    []
  );

  const onSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!user || !entryType) return;
      if (saving || saveLockRef.current) return;
      saveLockRef.current = true;

      setSaving(true);
      setError(null);
      let succeeded = false;
      try {
        logSaveDiagnostic({
          phase: "start",
          recordKind: "business_entry",
          userId: user.uid,
          route: "/(app)/composer/[type]",
          clientRecordId: clientRecordIdRef.current ?? undefined,
          idempotencyKey: idempotencyRef.current?.idempotencyKey,
          message: `recordType:${entryType}`,
        });

        const saveEntryType =
          !editingId && entryType && isOutwardMovementEntryType(entryType)
            ? resolveOutwardSaveEntryType(values)
            : entryType;
        const parts = formValuesToEntryParts(saveEntryType, values, user.ueid);
        const { location, footprintFailed } = await resolveEntryLocationWithFootprint(
          user.uid,
          parts.location
        );
        const title =
          (typeof values.title === "string" && values.title.trim()) ||
          parts.title ||
          autoEntryTitle(saveEntryType, parts.entryDate, parts.payload, t);

        if (editingId) {
          let cashPayload = parts.payload as import("@/domain/businessEntry").BusinessCashGivenPayload;
          let attachments = editingAttachmentsRef.current;
          let photoUploadFailed = false;
          if (saveEntryType === "business_cash_given") {
            const resolved = await resolveCashPaidAttachments(
              user.uid,
              editingId,
              editingAttachmentsRef.current,
              cashPaidPhotoState,
              cashPayload
            );
            attachments = resolved.attachments;
            cashPayload = resolved.payload;
            photoUploadFailed = resolved.photoUploadFailed;
          }
          const updated = await updateEntryLocalFirst(user.uid, {
            id: editingId,
            title,
            entryDate: parts.entryDate,
            notes: parts.notes,
            reminder: parts.reminder,
            location,
            payload: saveEntryType === "business_cash_given" ? cashPayload : parts.payload,
            attachments,
          });
          editingAttachmentsRef.current = updated.attachments ?? [];
          if (photoUploadFailed) {
            feedback.showWarning(t("composer.cashPaidPhotoUploadFailed"));
          }
          if (activeDraftId) {
            await formDraftsRepository.markConverted(user.uid, activeDraftId);
          }
          await clearRecovery();
          notifySearchIndexChanged();
          dirtyRef.current = false;
          setFormDirty(false);
          setSaveResult({ entry: updated, pdfFailed: false, mode: "updated" });
          void ingestComposerForm(
            { userId: user.uid, ueid: user.ueid },
            entryType,
            values
          ).catch(() => undefined);
          if (footprintFailed) {
            feedback.showWarning(t("locationFootprints.saveAttachFailed"));
          }
          feedback.showSuccess(t("composer.saveSuccess.updatedTitle"));
          succeeded = true;
          return;
        }

        if (!clientRecordIdRef.current) {
          clientRecordIdRef.current = generateClientRecordId("entry");
        }
        let { entry, pdfFailed, failedSecondarySteps } = await saveComposerEntry(
          user.uid,
          {
            clientRecordId: clientRecordIdRef.current,
            ueid: user.ueid,
            entryType: saveEntryType,
            title,
            entryDate: parts.entryDate,
            notes: parts.notes,
            reminder: parts.reminder,
            location,
            payload: parts.payload,
            source: "composer",
          },
          {
            user,
            locale: "en-IN",
            uiLang: lang,
            t,
            labels: {
              pdfProfileTitle: t("pdf.userProfileTitle"),
              pdfUeid: t("pdf.entryUeid"),
              pdfUserName: t("pdf.entryUserName"),
              pdfBusiness: t("pdf.entryBusiness"),
              pdfEntryDate: t("pdf.entryEntryDate"),
              pdfNotes: t("pdf.entryNotesSection"),
              pdfReminder: t("pdf.entryReminderSection"),
              pdfDetailsSection: t("pdf.entryDetailsSection"),
              pdfHistorySectionTitle: t("pdf.documentHistoryTitle"),
              pdfHistoryFirstGenerated: t("pdf.historyFirstGenerated"),
              pdfHistoryLastEdited: t("pdf.historyLastEdited"),
              pdfHistoryVersion: t("pdf.historyVersion"),
              pdfHistoryChanges: t("pdf.historyChanges"),
              reminderNotificationTitle: t("diary.reminder.notificationTitle", {
                title: "{{title}}",
              }),
              fileNameHint: t("pdf.entryFileNameHint", { date: "{{date}}" }),
            },
            idempotency: idempotencyRef.current ?? undefined,
            route: "/(app)/composer/[type]",
          }
        );
        if (
          saveEntryType === "business_cash_given" &&
          (cashPaidPhotoState.picked || cashPaidPhotoState.removeExisting)
        ) {
          const cashPayload = entry.payload as import("@/domain/businessEntry").BusinessCashGivenPayload;
          const resolved = await resolveCashPaidAttachments(
            user.uid,
            entry.id,
            entry.attachments ?? [],
            cashPaidPhotoState,
            cashPayload
          );
          entry = await updateEntryLocalFirst(user.uid, {
            id: entry.id,
            attachments: resolved.attachments,
            payload: resolved.payload,
          });
          if (resolved.photoUploadFailed) {
            feedback.showWarning(t("composer.cashPaidPhotoUploadFailed"));
          }
        }
        if (activeDraftId) {
          await formDraftsRepository.markConverted(user.uid, activeDraftId);
        }
        await clearRecovery();
        notifySearchIndexChanged();
        dirtyRef.current = false;
        setFormDirty(false);
        setSaveResult({ entry, pdfFailed, mode: "created" });
        succeeded = true;
        void ingestComposerForm(
          { userId: user.uid, ueid: user.ueid },
          saveEntryType,
          values
        ).catch(() => undefined);
        if (footprintFailed) {
          feedback.showWarning(t("locationFootprints.saveAttachFailed"));
        }
        if (pdfFailed) {
          feedback.showWarning(t("pdf.entrySavedPdfFailed"), t("pdf.entrySavedTitle"));
        } else if (failedSecondarySteps && failedSecondarySteps.length > 0) {
          feedback.showWarning(
            t("composer.saveSuccess.secondaryPartial"),
            t("composer.saveSuccess.title")
          );
        } else {
          feedback.showSuccess(t("composer.saveSuccess.title"));
        }
        logSaveDiagnostic({
          phase: "complete",
          recordKind: "business_entry",
          userId: user.uid,
          remoteId: entry.id,
          message: "navigation_after_save",
        });
      } catch (e) {
        if (e instanceof SaveStillInProgressError) {
          setError(t("composer.saveInProgress"));
          feedback.showWarning(t("composer.saveInProgress"));
          return;
        }
        const msg = userFacingMessage(e);
        setError(msg);
        feedback.showError(msg);
      } finally {
        setSaving(false);
        saveLockRef.current = false;
        lifecycleUiResetDiagnostics("business_entry", user?.uid, undefined, succeeded);
      }
    },
    [
      user,
      entryType,
      saving,
      t,
      lang,
      editingId,
      feedback,
      clearRecovery,
      activeDraftId,
      cashPaidPhotoState,
      resolveCashPaidAttachments,
    ]
  );

  const formTitle = useMemo(() => {
    if (!entryType) return t("composer.invalid");
    const option = composerOptionForType(entryType);
    const base = option
      ? t(`composer.options.${option.labelKey}`)
      : t(`composer.types.${entryType}`);
    return editingId ? `${t("common.edit")} — ${base}` : base;
  }, [entryType, editingId, t]);

  const onAddAnother = useCallback(() => {
    setSaveResult(null);
    setDraftSaveResult(null);
    setError(null);
    setInitialValues(undefined);
    setEditMeta(null);
    setActiveDraftId(null);
    dirtyRef.current = false;
    setSuppressBackGuard(false);
    setSavedBaseline("");
    clientRecordIdRef.current = null;
    if (entryType) {
      router.replace({
        pathname: "/(app)/composer/[type]",
        params: {
          type: entryType,
          ...(linkedDispatchId ? { linkedDispatchId } : {}),
        },
      });
    }
  }, [entryType, linkedDispatchId, router]);

  const saveDraftHeader = draftSavable ? (
    <Pressable
      onPress={() => void handleSaveDraft()}
      disabled={draftSaving || saving}
      hitSlop={8}
      accessibilityRole="button"
    >
      <LocaleUiText style={linkStyles.saveDraft}>{t("composer.saveDraft")}</LocaleUiText>
    </Pressable>
  ) : (
    <View style={linkStyles.saveDraftHidden} accessibilityElementsHidden>
      <LocaleUiText style={linkStyles.saveDraft}>{t("composer.saveDraft")}</LocaleUiText>
    </View>
  );

  if (!entryType || entryType === "letterhead_matter") {
    return (
      <Screen>
        <Header title={t("composer.invalid")} showBack backFrom="you" onBackPress={navigateBack} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <Header
          variant="executive"
          title={formTitle}
          showBack
          backFrom="you"
          onBackPress={navigateBack}
        />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  if (draftSaveResult) {
    return (
      <Screen scroll padded>
        <Header title={formTitle} showBack backFrom="you" onBackPress={navigateBack} />
        <DraftSavedSuccess
          draft={draftSaveResult}
          onContinueEditing={() => {
            setDraftSaveResult(null);
            setInitialValues(draftSaveResult.payload);
            setSavedBaseline(JSON.stringify(draftSaveResult.payload));
          }}
          onAddAnother={onAddAnother}
        />
      </Screen>
    );
  }

  if (saveResult) {
    return (
      <Screen scroll padded>
        <Header title={formTitle} showBack backFrom="you" onBackPress={navigateBack} />
        <ComposerSaveSuccess
          entry={saveResult.entry}
          pdfFailed={saveResult.pdfFailed}
          onAddAnother={onAddAnother}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll form scrollRef={scrollRef}>
      <Header
        variant="executive"
        title={formTitle}
        subtitle={t("composer.formSubtitle")}
        showBack
        backFrom="you"
        onBackPress={tryBack}
        rightSlot={saveDraftHeader}
      />
      <BusinessComposerForm
        key={`${entryType}-${activeDraftId ?? "new"}-${editingId ?? ""}`}
        entryType={entryType}
        initialValues={initialValues}
        datePolicyOptions={editMeta?.datePolicyOptions}
        existingCashPaidDateMs={editMeta?.datePolicyOptions?.existingCashPaidDateMs}
        recordCreatedAtMs={editMeta?.recordCreatedAtMs}
        linkedDispatchId={linkedDispatchId}
        scrollRef={scrollRef}
        onValuesChange={setFormValues}
        onSubmit={onSubmit}
        saving={saving}
        error={error}
        cashPaidPhoto={
          entryType === "business_cash_given"
            ? {
                existingUri: existingCashPhotoUri,
                state: cashPaidPhotoState,
                onChange: setCashPaidPhotoState,
              }
            : undefined
        }
      />
      <DraftUnsavedSheet
        visible={unsavedSheetVisible}
        showSaveDraft={draftSavable}
        onSaveDraft={() => void handleSaveDraft()}
        onDiscard={() => void handleDiscard()}
        onContinueEditing={() => setUnsavedSheetVisible(false)}
        saving={draftSaving}
      />
    </Screen>
  );
}
