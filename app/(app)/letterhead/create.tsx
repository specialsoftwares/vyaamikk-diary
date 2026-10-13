/**
 * Letterhead create flow.
 *
 * Loads the saved letterhead config. If none exists, sends the user back to
 * the gate (which routes them to setup). Supports resuming a saved draft via
 * the `draftId` route param.
 *
 * Sections: template status, letter details, recipient, subject & matter,
 * closing & signature, then preview / generate. Pressing Generate composes
 * the HTML via `buildLetterheadHtml` and hands it to `pdfService` — the screen
 * never touches the file system or expo-print directly.
 *
 * The exported PDF carries no Vyaamikk branding/footer — only the user's
 * uploaded letterhead plus their matter.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Controller, useForm } from "react-hook-form";

import { KeyboardAwareField } from "@/components/forms/KeyboardAwareField";
import { SmartSuggestionInput } from "@/components/forms/SmartSuggestionInput";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { Banner,
  Button,
  FormSection,
  Header,
  IndigoChoiceChip,
  IndigoChoiceChipRow,
  Loader,
  Screen,
  TextField, LocaleUiText } from "@/components/ui";
import { LetterheadPreview } from "@/components/letterhead/LetterheadPreview";
import { ingestLetterheadForm } from "@/services/masterData";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { formDateRowStyle, formFieldLabelStyle } from "@/theme/formLayer";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { userFacingMessage } from "@/domain/errors";
import { LETTERHEAD_NAV_FIELD_ORDER } from "@/utils/formFieldNavigation/fieldNavOrders";
import {
  getLetterheadDocumentRepository,
  getLetterheadRepository,
  isLetterheadDraftMeaningful,
  LETTERHEAD_DRAFT_KIND,
  LETTERHEAD_DRAFT_SCOPE,
  letterheadInputToDraftPayload,
  resolveDraftLetterhead,
  type LetterheadConfig,
  type LetterheadDocument,
  type LetterheadDocumentInput,
  type LetterheadEditHistoryEntry,
} from "@/services/letterhead";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { pdfService } from "@/services/pdf/pdfService";
import { englishPdfT } from "@/i18n/englishPdfT";
import { buildLetterheadHtml } from "@/services/pdf/letterheadPdfService";
import { saveLetterheadCreateWithPdf } from "@/services/letterhead/saveWithPdf";
import {
  freezeLetterheadTemplateSnapshot,
  letterheadReadyToRender,
  resolveHistoricalLetterhead,
} from "@/services/letterhead/letterheadTemplateSnapshot";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";
import { dayKey, formatShortDate, todayStartMs } from "@/utils/date";
import { useSmartBack } from "@/navigation";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
  type SaveIdempotencyContext,
} from "@/services/records/saveIdempotency";

export default function LetterheadCreateScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { draftId: draftIdParam, editDocId: editDocIdParam } = useLocalSearchParams<{
    draftId?: string;
    editDocId?: string;
  }>();
  const isEditing = Boolean(editDocIdParam);

  const [config, setConfig] = useState<LetterheadConfig | null>(null);
  const [previewConfig, setPreviewConfig] = useState<LetterheadConfig | null>(null);
  const [templateGap, setTemplateGap] = useState<null | "document" | "draft">(null);
  const [showLetterOptions, setShowLetterOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const activeDraftIdRef = useRef<string | null>(
    draftIdParam ? String(draftIdParam) : null
  );
  const editDocRef = useRef<LetterheadDocument | null>(null);
  const finishedRef = useRef(false);
  const saveLockRef = useRef(false);
  const draftFlightRef = useRef(false);
  const draftTemplateRef = useRef<LetterheadConfig | null>(null);
  const clientRecordIdRef = useRef(
    editDocIdParam ? String(editDocIdParam) : generateClientRecordId("lhd")
  );
  const idempotencyRef = useRef<SaveIdempotencyContext | null>(null);
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
      helper: {
        ...typography.caption,
        color: colors.textSubtle,
        marginBottom: spacing.lg,
        lineHeight: 18,
      },
      banner: { marginBottom: spacing.md },
      sectionGap: { marginBottom: spacing.lg },
      fieldLabel: formFieldLabelStyle(colors),
      chipLabel: {
        ...formFieldLabelStyle(colors),
        marginBottom: spacing.xs,
      },
      dateRow: formDateRowStyle(isDark, colors),
      dateValue: { ...typography.body, color: colors.text },
      dateChange: { ...typography.captionStrong, color: colors.primary },
      assetHint: {
        ...typography.caption,
        color: colors.textSubtle,
        marginTop: spacing.xs,
      },
      actions: { gap: spacing.sm, marginTop: spacing.md },
    })
  );

  const salutationOptions = [
    t("letterhead.salutationDefault"),
    "Dear Sir,",
    "Dear Madam,",
  ];
  const closingOptions = [t("letterhead.closingDefault"), "Sincerely,", "Yours faithfully,"];

  const { control, handleSubmit, watch, setValue, reset, getValues } =
    useForm<LetterheadDocumentInput>({
      mode: "onChange",
      defaultValues: {
        title: "",
        date: todayStartMs(),
        reference: "",
        recipientName: "",
        recipientDesignation: "",
        recipientCompany: "",
        recipientAddress: "",
        subject: "",
        salutation: t("letterhead.salutationDefault"),
        body: "",
        closing: t("letterhead.closingDefault"),
        name: user?.displayName ?? "",
        designation: "",
        place: "",
        useSignature: false,
        useStamp: false,
      },
    });

  useFormFieldNavigation(LETTERHEAD_NAV_FIELD_ORDER);

  const date = watch("date");
  const senderNameWatch = watch("name");
  const senderTitleWatch = watch("designation");
  const body = watch("body");
  const salutation = watch("salutation");
  const closing = watch("closing");
  const useSignature = watch("useSignature");
  const useStamp = watch("useStamp");

  const { goBack } = useSmartBack({
    from: "letterhead",
    dirty: false,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const c = await getLetterheadRepository().get(user.uid);
      if (!c) {
        router.replace("/(app)/letterhead");
        return;
      }
      setConfig(c);
      if (!editDocIdParam) {
        setTemplateGap(null);
        setPreviewConfig(c);
        draftTemplateRef.current = c;
      }

      // Edit an existing saved document — load its frozen input verbatim.
      if (editDocIdParam) {
        const existing = await getLetterheadDocumentRepository().get(
          user.uid,
          String(editDocIdParam)
        );
        if (existing) {
          editDocRef.current = existing;
          const resolved = resolveHistoricalLetterhead(existing, c);
          if (resolved.kind === "unavailable") {
            setTemplateGap("document");
            setPreviewConfig(null);
            draftTemplateRef.current = null;
          } else {
            setTemplateGap(null);
            setPreviewConfig(resolved.config);
            draftTemplateRef.current = resolved.config;
          }
          reset(applyDefaults({ ...existing.input }, resolved.kind === "unavailable" ? c : resolved.config, user));
          return;
        }
        // Doc vanished — fall through to a fresh form.
      }

      // Resume an explicitly saved draft, else any recovery snapshot.
      let restored = false;
      if (draftIdParam) {
        const draft = await formDraftsRepository.getById(user.uid, String(draftIdParam));
        if (draft && draft.status === "active") {
          const resumed = resolveDraftLetterhead(draft.payload, c);
          draftTemplateRef.current = resumed.preview;
          setPreviewConfig(resumed.preview);
          setTemplateGap(resumed.gap);
          reset(applyDefaults(resumed.input, resumed.preview ?? c, user));
          activeDraftIdRef.current = draft.id;
          restored = true;
          setNotice(
            resumed.gap
              ? t("letterhead.draftTemplateUnavailable")
              : t("letterhead.draftResumed")
          );
        }
      }
      if (!restored) {
        const recovery = await formDraftsRepository.loadRecovery({
          userId: user.uid,
          draftKind: LETTERHEAD_DRAFT_KIND,
          scopeKey: LETTERHEAD_DRAFT_SCOPE,
        });
        if (recovery?.payload) {
          const resumed = resolveDraftLetterhead(recovery.payload, c);
          draftTemplateRef.current = resumed.preview;
          setPreviewConfig(resumed.preview);
          setTemplateGap(resumed.gap);
          reset(applyDefaults(resumed.input, resumed.preview ?? c, user));
          if (resumed.gap) setNotice(t("letterhead.draftTemplateUnavailable"));
        } else {
          // Apply config-derived defaults to the empty form.
          reset(
            applyDefaults(
              {
                ...getValues(),
                name: getValues("name") || c.defaultSenderName || user.displayName || "",
              },
              c,
              user
            )
          );
        }
      }
    } catch (e) {
      setLoadError(userFacingMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, router, draftIdParam, editDocIdParam, reset, getValues, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user || isEditing) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "letterhead_doc",
      clientRecordId: clientRecordIdRef.current,
      sourceDraftId: activeDraftIdRef.current,
    });
  }, [user, isEditing]);

  // Best-effort recovery autosave so an app restart / accidental exit doesn't
  // lose in-progress matter. Debounced (≈800ms) so typing never thrashes
  // SQLite; never runs after a successful submit.
  useEffect(() => {
    // Editing a saved document is not a draft flow — skip recovery autosave.
    if (!user || loading || isEditing) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = watch((value) => {
      if (finishedRef.current) return;
      const input = value as LetterheadDocumentInput;
      if (!isLetterheadDraftMeaningful(input)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void formDraftsRepository
          .saveRecovery({
            userId: user.uid,
            draftKind: LETTERHEAD_DRAFT_KIND,
            scopeKey: LETTERHEAD_DRAFT_SCOPE,
            payload: letterheadInputToDraftPayload(input, draftTemplateRef.current),
          })
          .catch(() => {});
      }, 800);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [user, loading, isEditing, watch]);

  const revealStatus = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const onSaveDraft = useCallback(async () => {
    if (!user || draftFlightRef.current) return;
    const values = getValues();
    if (!isLetterheadDraftMeaningful(values)) {
      setSubmitError(t("letterhead.subjectRequired"));
      revealStatus();
      return;
    }
    draftFlightRef.current = true;
    setSavingDraft(true);
    setSubmitError(null);
    try {
      const title =
        values.title?.trim() ||
        values.subject?.trim() ||
        t("letterhead.createTitle");
      const saved = await formDraftsRepository.saveUserDraft({
        userId: user.uid,
        draftKind: LETTERHEAD_DRAFT_KIND,
        scopeKey: LETTERHEAD_DRAFT_SCOPE,
        draftId: activeDraftIdRef.current,
        title,
        payload: letterheadInputToDraftPayload(values, draftTemplateRef.current),
      });
      activeDraftIdRef.current = saved.id;
      await formDraftsRepository.clearRecovery({
        userId: user.uid,
        draftKind: LETTERHEAD_DRAFT_KIND,
        scopeKey: LETTERHEAD_DRAFT_SCOPE,
      });
      setNotice(t("letterhead.draftSaved"));
      revealStatus();
    } catch (e) {
      setSubmitError(userFacingMessage(e));
      revealStatus();
    } finally {
      draftFlightRef.current = false;
      setSavingDraft(false);
    }
  }, [user, getValues, t, revealStatus]);

  const onSubmit = handleSubmit(async (values) => {
    if (templateGap) {
      setSubmitError(
        t(
          templateGap === "draft"
            ? "letterhead.draftTemplateUnavailable"
            : "letterhead.historicalTemplateUnavailable"
        )
      );
      revealStatus();
      return;
    }
    const renderConfig = previewConfig ?? config;
    if (!renderConfig || !user) {
      setSubmitError(t("letterhead.setupLoadFailed"));
      revealStatus();
      return;
    }
    if (finishedRef.current || saveLockRef.current) return;
    if (!letterheadReadyToRender(renderConfig)) {
      setSubmitError(t("letterhead.setupNeedImage"));
      revealStatus();
      return;
    }
    if (!values.subject?.trim()) {
      setSubmitError(t("letterhead.subjectRequired"));
      revealStatus();
      return;
    }
    if (!values.body?.trim()) {
      setSubmitError(t("letterhead.bodyRequired"));
      revealStatus();
      return;
    }
    const senderName = values.name?.trim() || renderConfig.defaultSenderName?.trim() || "";
    if (!senderName) {
      setShowLetterOptions(true);
      setSubmitError(t("letterhead.senderMissing"));
      revealStatus();
      return;
    }
    setSubmitError(null);
    setNotice(null);
    saveLockRef.current = true;
    setSubmitting(true);
    try {
      const docInput: LetterheadDocumentInput = { ...values, name: senderName };
      const title = docInput.title || docInput.subject || t("letterhead.createTitle");

      if (!isEditing && idempotencyRef.current) {
        const { html, warnings } = await buildLetterheadHtml({
          config: renderConfig,
          doc: docInput,
          locale: lang === "hi" ? "hi-IN" : "en-IN",
          labels: {
            subject: englishPdfT()("letterhead.labels.subject"),
            date: englishPdfT()("letterhead.labels.date"),
            reference: englishPdfT()("letterhead.labels.reference"),
            to: englishPdfT()("letterhead.labels.to"),
          },
        });
        if (warnings.length) {
          setNotice(warnings.map((w) => t(w)).join("\n"));
        }
        const { pdfUri } = await saveLetterheadCreateWithPdf(user.uid, {
          user,
          config: renderConfig,
          docInput,
          title,
          createPayload: {
            ueid: user.ueid,
            templateRefUpdatedAt: renderConfig.updatedAt,
            templateSnapshot: freezeLetterheadTemplateSnapshot(renderConfig),
            pdfUri: null,
            saved: true,
          },
          idempotency: idempotencyRef.current,
          locale: lang === "hi" ? "hi-IN" : "en-IN",
          t,
          diaryClientId: `${clientRecordIdRef.current}_matter`,
          route: "/(app)/letterhead/create",
        });
        await ingestLetterheadForm(
          { userId: user.uid, ueid: user.ueid },
          docInput as unknown as Record<string, unknown>
        );
        try {
          await formDraftsRepository.clearRecovery({
            userId: user.uid,
            draftKind: LETTERHEAD_DRAFT_KIND,
            scopeKey: LETTERHEAD_DRAFT_SCOPE,
          });
          if (activeDraftIdRef.current) {
            await formDraftsRepository.markConverted(user.uid, activeDraftIdRef.current);
          }
        } catch {
          // non-fatal
        }
        if (pdfUri) {
          try {
            await pdfService.share({ uri: pdfUri, fileName: title });
          } catch (shareError) {
            if (isShareSheetCancellation(shareError)) {
              setNotice(t("letterhead.shareCancelledSaved"));
              revealStatus();
              return;
            }
            setSubmitError(
              userFacingMessage(shareError) || t("letterhead.createGenerateFailed")
            );
            revealStatus();
            return;
          }
        }
        finishedRef.current = true;
        router.replace("/(app)/letterhead/history");
        return;
      }

      const { html, warnings } = await buildLetterheadHtml({
        config: renderConfig,
        doc: docInput,
        locale: lang === "hi" ? "hi-IN" : "en-IN",
        labels: {
          subject: englishPdfT()("letterhead.labels.subject"),
          date: englishPdfT()("letterhead.labels.date"),
          reference: englishPdfT()("letterhead.labels.reference"),
          to: englishPdfT()("letterhead.labels.to"),
        },
      });
      if (warnings.length) {
        setNotice(warnings.map((w) => t(w)).join("\n"));
      }
      const fileNameHint = t("letterhead.fileNameHint", { date: dayKey(docInput.date) });
      const pdf = await pdfService.generate({ html, fileNameHint });

      // --- EDIT existing document: PO-style metadata preserved, version bumped.
      if (isEditing && editDocRef.current) {
        const existing = editDocRef.current;
        const now = Date.now();
        const nextVersion = (existing.version ?? 1) + 1;
        const history: LetterheadEditHistoryEntry[] = [
          ...(existing.editHistory ?? []),
          { version: nextVersion, at: now, action: "edited" },
        ];
        try {
          await getLetterheadDocumentRepository().update(user.uid, existing.id, {
            title,
            input: docInput,
            pdfUri: pdf.uri,
            version: nextVersion,
            lastEditedAt: now,
            editHistory: history,
          });
          await ingestLetterheadForm(
            { userId: user.uid, ueid: user.ueid },
            docInput as unknown as Record<string, unknown>
          );
        } catch (updateError) {
          setSubmitError(userFacingMessage(updateError) || t("letterhead.createGenerateFailed"));
          revealStatus();
          return;
        }
        try {
          await pdfService.share(pdf);
        } catch (shareError) {
          if (isShareSheetCancellation(shareError)) {
            setNotice(t("letterhead.shareCancelledSaved"));
            revealStatus();
            return;
          }
          setSubmitError(userFacingMessage(shareError) || t("letterhead.createGenerateFailed"));
          revealStatus();
          return;
        }
        finishedRef.current = true;
        router.replace("/(app)/letterhead/history");
        return;
      }
    } catch (e) {
      if (e instanceof SaveStillInProgressError) {
        setSubmitError(t("letterhead.errSaveInProgress"));
        revealStatus();
        return;
      }
      setSubmitError(userFacingMessage(e) || t("letterhead.createGenerateFailed"));
      revealStatus();
    } finally {
      setSubmitting(false);
      if (!finishedRef.current) {
        saveLockRef.current = false;
      }
    }
  });

  if (loading) {
    return (
      <Screen>
        <Header
          title={t("letterhead.createTitle")}
          showBack
          backFrom="letterhead"
          onBackPress={goBack}
        />
        <Loader fullscreen message={t("common.loading")} />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <Header
          title={t("letterhead.createTitle")}
          showBack
          backFrom="letterhead"
          onBackPress={goBack}
        />
        <Banner tone="danger" message={loadError} />
      </Screen>
    );
  }

  const isLongBody = body.length > 1800;
  const hasSignatureAsset = Boolean(config?.signatureDataUri?.trim());
  const hasStampAsset = Boolean(config?.stampDataUri?.trim());

  return (
    <Screen scroll form scrollRef={scrollRef}>
      <Header
        variant="executive"
        title={isEditing ? t("letterhead.editTitle") : t("letterhead.createTitle")}
        showBack
        backFrom="letterhead"
        onBackPress={goBack}
      />
      <LocaleUiText style={styles.lead}>{t("letterhead.createIntro")}</LocaleUiText>
      <LocaleUiText style={styles.helper}>{t("letterhead.helperBase")}</LocaleUiText>
      <LocaleUiText style={styles.helper}>
        {senderNameWatch?.trim()
          ? t("letterhead.senderLine", {
              name: [senderNameWatch.trim(), senderTitleWatch?.trim()].filter(Boolean).join(", "),
            })
          : t("letterhead.senderMissing")}
      </LocaleUiText>
      {templateGap ? (
        <View style={styles.banner}>
          <Banner
            tone="warning"
            message={t(
              templateGap === "draft"
                ? "letterhead.draftTemplateUnavailable"
                : "letterhead.historicalTemplateUnavailable"
            )}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t("letterhead.changeLetterhead")}
          variant="ghost"
          onPress={() => router.push("/(app)/letterhead")}
        />
        <Button
          label={t("letterhead.letterOptions")}
          variant="secondary"
          onPress={() => setShowLetterOptions((open) => !open)}
        />
      </View>

      {isEditing && editDocRef.current ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            message={t("letterhead.editMetaBanner", {
              version: (editDocRef.current.version ?? 1) + 1,
              created: formatShortDate(
                editDocRef.current.firstGeneratedAt ?? editDocRef.current.createdAt
              ),
            })}
          />
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={submitError} />
        </View>
      ) : null}
      {notice ? (
        <View style={styles.banner}>
          <Banner tone="info" message={notice} />
        </View>
      ) : null}
      {isLongBody ? (
        <View style={styles.banner}>
          <Banner tone="warning" message={t("letterhead.createOverflowWarning")} />
        </View>
      ) : null}

      {/* --- Optional letter details --- */}
      {showLetterOptions ? (
      <FormSection title={t("letterhead.sectionLetter")} style={styles.sectionGap}>
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="title">
              <TextField
                navFieldKey="title"
                label={t("letterhead.fieldTitle")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldTitlePlaceholder")}
                maxLength={120}
              />
            </KeyboardAwareField>
          )}
        />

        <View>
          <LocaleUiText style={styles.fieldLabel}>{t("letterhead.fieldDate")}</LocaleUiText>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateRow}>
            <Text style={styles.dateValue}>{formatShortDate(date)}</Text>
            <LocaleUiText style={styles.dateChange}>{t("diary.reminder.pickDate")}</LocaleUiText>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              mode="date"
              value={new Date(date)}
              onChange={(event, selected) => {
                setShowDatePicker(false);
                if (event.type === "dismissed" || !selected) return;
                setValue("date", selected.getTime(), { shouldValidate: true });
              }}
            />
          ) : null}
        </View>

        <Controller
          control={control}
          name="reference"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="reference">
              <TextField
                navFieldKey="reference"
                label={t("letterhead.fieldReference")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldReferencePlaceholder")}
                maxLength={60}
              />
            </KeyboardAwareField>
          )}
        />
      </FormSection>
      ) : null}

      {/* --- Recipient details (all optional) --- */}
      <FormSection title={t("letterhead.sectionRecipient")} style={styles.sectionGap}>
        <Controller
          control={control}
          name="recipientName"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="recipientName">
              <SmartSuggestionInput
                navFieldKey="recipientName"
                fieldKey="personName"
                label={t("letterhead.fieldRecipientName")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldRecipientNamePlaceholder")}
                maxLength={80}
              />
            </KeyboardAwareField>
          )}
        />
        {showLetterOptions ? (
        <>
        <Controller
          control={control}
          name="recipientDesignation"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="recipientDesignation">
              <TextField
                navFieldKey="recipientDesignation"
                label={t("letterhead.fieldRecipientDesignation")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldRecipientDesignationPlaceholder")}
                maxLength={80}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="recipientCompany"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="recipientCompany">
              <SmartSuggestionInput
                navFieldKey="recipientCompany"
                fieldKey="partyName"
                label={t("letterhead.fieldRecipientCompany")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldRecipientCompanyPlaceholder")}
                maxLength={120}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="recipientAddress"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="recipientAddress">
              <TextField
                navFieldKey="recipientAddress"
                label={t("letterhead.fieldRecipientAddress")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldRecipientAddressPlaceholder")}
                multiline
                maxLength={300}
              />
            </KeyboardAwareField>
          )}
        />
        </>
        ) : null}
      </FormSection>

      {/* --- Subject & matter --- */}
      <FormSection title={t("letterhead.sectionMatter")} style={styles.sectionGap}>
        <Controller
          control={control}
          name="subject"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="subject">
              <SmartSuggestionInput
                navFieldKey="subject"
                fieldKey="partyName"
                label={t("letterhead.fieldSubject")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldSubjectPlaceholder")}
                maxLength={160}
              />
            </KeyboardAwareField>
          )}
        />

        {showLetterOptions ? (
        <View>
          <LocaleUiText style={styles.chipLabel}>{t("letterhead.fieldSalutation")}</LocaleUiText>
          <IndigoChoiceChipRow style={{ marginBottom: spacing.sm }}>
            {salutationOptions.map((opt) => (
              <IndigoChoiceChip
                key={opt}
                label={opt}
                selected={salutation === opt}
                onPress={() => setValue("salutation", opt, { shouldDirty: true })}
              />
            ))}
          </IndigoChoiceChipRow>
          <Controller
            control={control}
            name="salutation"
            render={({ field: { onChange, value } }) => (
              <KeyboardAwareField fieldId="salutation">
                <TextField
                  navFieldKey="salutation"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder={t("letterhead.fieldSalutationPlaceholder")}
                  maxLength={60}
                />
              </KeyboardAwareField>
            )}
          />
        </View>
        ) : null}

        <Controller
          control={control}
          name="body"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="body">
              <TextField
                navFieldKey="body"
                label={t("letterhead.fieldBody")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldBodyPlaceholder")}
                multiline
                maxLength={5000}
              />
            </KeyboardAwareField>
          )}
        />
      </FormSection>

      {/* --- Closing & signature --- */}
      {showLetterOptions ? (
      <FormSection title={t("letterhead.sectionClosing")} style={styles.sectionGap}>
        <View>
          <LocaleUiText style={styles.chipLabel}>{t("letterhead.fieldClosing")}</LocaleUiText>
          <IndigoChoiceChipRow style={{ marginBottom: spacing.sm }}>
            {closingOptions.map((opt) => (
              <IndigoChoiceChip
                key={opt}
                label={opt}
                selected={closing === opt}
                onPress={() => setValue("closing", opt, { shouldDirty: true })}
              />
            ))}
          </IndigoChoiceChipRow>
          <Controller
            control={control}
            name="closing"
            render={({ field: { onChange, value } }) => (
              <KeyboardAwareField fieldId="closing">
                <TextField
                  navFieldKey="closing"
                  value={value ?? ""}
                  onChangeText={onChange}
                  placeholder={t("letterhead.fieldClosingPlaceholder")}
                  maxLength={80}
                />
              </KeyboardAwareField>
            )}
          />
        </View>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="name">
              <SmartSuggestionInput
                navFieldKey="name"
                fieldKey="personName"
                label={t("letterhead.fieldName")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldNamePlaceholder")}
                maxLength={80}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="designation"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="designation">
              <SmartSuggestionInput
                navFieldKey="designation"
                fieldKey="personName"
                label={t("letterhead.fieldDesignation")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldDesignationPlaceholder")}
                maxLength={80}
              />
            </KeyboardAwareField>
          )}
        />
        <Controller
          control={control}
          name="place"
          render={({ field: { onChange, value } }) => (
            <KeyboardAwareField fieldId="place">
              <SmartSuggestionInput
                navFieldKey="place"
                fieldKey="deliveryLocation"
                label={t("letterhead.fieldPlace")}
                value={value ?? ""}
                onChangeText={onChange}
                placeholder={t("letterhead.fieldPlacePlaceholder")}
                maxLength={80}
              />
            </KeyboardAwareField>
          )}
        />

        <View>
          <IndigoChoiceChipRow>
            <IndigoChoiceChip
              label={t("letterhead.useSignature")}
              selected={Boolean(useSignature) && hasSignatureAsset}
              onPress={() => {
                if (!hasSignatureAsset) return;
                setValue("useSignature", !useSignature, { shouldDirty: true });
              }}
            />
            <IndigoChoiceChip
              label={t("letterhead.useStamp")}
              selected={Boolean(useStamp) && hasStampAsset}
              onPress={() => {
                if (!hasStampAsset) return;
                setValue("useStamp", !useStamp, { shouldDirty: true });
              }}
            />
          </IndigoChoiceChipRow>
          {!hasSignatureAsset ? (
            <LocaleUiText style={styles.assetHint}>{t("letterhead.useSignatureNoAsset")}</LocaleUiText>
          ) : null}
          {!hasStampAsset ? (
            <LocaleUiText style={styles.assetHint}>{t("letterhead.useStampNoAsset")}</LocaleUiText>
          ) : null}
        </View>
      </FormSection>
      ) : null}

      {/* --- Preview / generate --- */}
      {showPreview && !templateGap && (previewConfig ?? config) ? (
        <View style={styles.sectionGap}>
          <FormSection title={t("letterhead.previewTitle")}>
            <LetterheadPreview config={(previewConfig ?? config)!} input={getValues()} />
          </FormSection>
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={submitError} />
        </View>
      ) : null}
      {notice ? (
        <View style={styles.banner}>
          <Banner tone="info" message={notice} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={showPreview ? t("letterhead.previewClose") : t("letterhead.previewOpen")}
          variant="secondary"
          onPress={() => setShowPreview((s) => !s)}
        />
        {!isEditing ? (
          <Button
            label={t("letterhead.draftSave")}
            variant="secondary"
            loading={savingDraft}
            loadingLabel={t("letterhead.draftSaving")}
            onPress={() => void onSaveDraft()}
          />
        ) : null}
        <Button
          label={isEditing ? t("letterhead.editShare") : t("letterhead.createShare")}
          loading={submitting}
          loadingLabel={t("letterhead.createGenerating")}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}

/**
 * Fill blank sender/salutation/closing fields from the config defaults and
 * profile so the form is never short on the minimal required data.
 */
function applyDefaults(
  input: LetterheadDocumentInput,
  config: LetterheadConfig,
  user: { displayName?: string | null } | null
): LetterheadDocumentInput {
  return {
    ...input,
    name: input.name?.trim()
      ? input.name
      : config.defaultSenderName?.trim() || user?.displayName || "",
    designation: input.designation?.trim()
      ? input.designation
      : config.defaultSenderTitle?.trim() || "",
    closing: input.closing?.trim()
      ? input.closing
      : config.defaultComplimentaryClose?.trim() || input.closing || "",
  };
}
