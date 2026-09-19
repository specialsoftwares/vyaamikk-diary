import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ProfessionalPackForm } from "@/components/professionalPack/ProfessionalPackForm";
import { Header, LocaleUiText, Screen } from "@/components/ui";
import type { ProfessionalCategory, ProfessionalMatterType } from "@/domain/professionalPack";
import { getMatterDef, isProfessionalCategory } from "@/domain/professionalPackMatters";
import { userFacingMessage } from "@/domain/errors";
import { useAuth } from "@/state/auth";
import { useI18n, useT } from "@/i18n";
import { getDiaryRepository } from "@/services/diary";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { saveProfessionalPackWithPdf } from "@/services/professionalPack/saveWithPdf";
import { notifyOrdinaryQuotaUpsell } from "@/billing/quotaUpsell";
import { captureAdmissionToken } from "@/sync/syncSessionOwnership";
import { autoPackTitle } from "@/utils/professionalPack/display";
import { validatePackForm } from "@/utils/professionalPack/validation";
import { useSmartBack, confirmUnsavedChanges, requestComposerPickerReturn } from "@/navigation";
import { ingestProfessionalPackForm } from "@/services/masterData";
import { clearPackDraft } from "@/services/professionalPack/drafts";
import { isDraftPayloadMeaningful } from "@/services/drafts";
import { SaveStillInProgressError } from "@/services/records/saveLockTypes";
import {
  createSaveIdempotencyContext,
  generateClientRecordId,
} from "@/services/records/saveIdempotency";

export default function ProfessionalPackFormScreen() {
  const t = useT();
  const { lang } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const {
    category: catParam,
    matter: matterParam,
    id: packIdParam,
    fromPicker,
  } = useLocalSearchParams<{
    category: string;
    matter: string;
    id?: string;
    fromPicker?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<import("@/domain/businessEntry").BusinessEntry[]>([]);
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | null>(
    packIdParam ? null : {}
  );
  const [editStatus, setEditStatus] = useState<
    import("@/domain/professionalPack").ProfessionalPackStatus | null
  >(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [savedBaseline, setSavedBaseline] = useState("");
  const [suppressBackGuard, setSuppressBackGuard] = useState(false);
  const saveLockRef = useRef(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const clientRecordIdRef = useRef(
    packIdParam ? String(packIdParam) : generateClientRecordId("psp")
  );
  const idempotencyRef = useRef<import("@/services/records/saveIdempotency").SaveIdempotencyContext | null>(
    null
  );

  const packDraftSavable = useMemo(
    () => isDraftPayloadMeaningful(formValues),
    [formValues]
  );

  const hasUnsavedWork = useMemo(() => {
    if (!isDraftPayloadMeaningful(formValues)) return false;
    return JSON.stringify(formValues) !== savedBaseline;
  }, [formValues, savedBaseline]);

  const shouldBlockBack = hasUnsavedWork && !saving && !suppressBackGuard;

  const { goBack, performBack } = useSmartBack({
    from: "you",
    dirty: shouldBlockBack,
    handleHardwareBack: false,
    onDiscard: () => {
      if (!packIdParam && user && category && matterDef) {
        void clearPackDraft(user.uid, category, matterDef.type);
      }
    },
  });

  const category = isProfessionalCategory(catParam ?? "")
    ? (catParam as ProfessionalCategory)
    : null;
  const matterDef =
    category && matterParam ? getMatterDef(category, matterParam) : null;

  useEffect(() => {
    if (!user || packIdParam) return;
    idempotencyRef.current = createSaveIdempotencyContext({
      userId: user.uid,
      recordKind: "professional_pack",
      clientRecordId: clientRecordIdRef.current,
      scopeKey: `${catParam ?? ""}:${matterParam ?? ""}`,
    });
  }, [user, packIdParam, catParam, matterParam]);

  React.useEffect(() => {
    if (!user) return;
    void getDiaryRepository()
      .list(user.uid, { limit: 80 })
      .then(setEntries);
  }, [user]);

  React.useEffect(() => {
    if (!user || !packIdParam) return;
    void getProfessionalPackRepository()
      .getById(user.uid, String(packIdParam))
      .then((pack) => {
        if (!pack) return;
        const vals: Record<string, unknown> = {
          matterDate: pack.matterDate,
          dueDate: pack.dueDate,
          professionalName: pack.professionalName ?? "",
          professionalContact: pack.professionalContact ?? "",
          notes: pack.notes ?? "",
          linkedEntryIds: pack.linkedEntryIds,
          title: pack.title,
          reminder: pack.reminder,
        };
        for (const [k, v] of Object.entries(pack.facts)) vals[k] = v;
        setInitialValues(vals);
        setSavedBaseline(JSON.stringify(vals));
        setEditStatus(pack.status);
      });
  }, [user, packIdParam]);

  useEffect(() => {
    if (!packIdParam && initialValues !== null && Object.keys(initialValues).length > 0) {
      setSavedBaseline(JSON.stringify(initialValues));
    }
  }, [packIdParam, initialValues]);

  const navigateBack = useCallback(() => {
    if (fromPicker === "1") {
      requestComposerPickerReturn("picker");
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      performBack();
    }
  }, [fromPicker, router, performBack]);

  const handleHeaderBack = useCallback(() => {
    if (!shouldBlockBack) {
      navigateBack();
      return;
    }
    if (!category || !matterDef || !user) {
      navigateBack();
      return;
    }
    confirmUnsavedChanges({
      t,
      draftAvailable: !packIdParam && packDraftSavable,
      onSaveDraft: () => {
        setSavedBaseline(JSON.stringify(formValues));
        navigateBack();
      },
      onDiscard: () => {
        if (!packIdParam) {
          void clearPackDraft(user.uid, category, matterDef.type);
        }
        navigateBack();
      },
    });
  }, [
    shouldBlockBack,
    navigateBack,
    t,
    category,
    matterDef,
    user,
    packIdParam,
    packDraftSavable,
    formValues,
  ]);

  const onSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!user || !category || !matterDef) return;
      if (saving || saveLockRef.current || saveBlocked) return;
      saveLockRef.current = true;

      const validated = validatePackForm(category, matterDef.type, values);
      if (!validated.ok) {
        setError(validated.message);
        saveLockRef.current = false;
        return;
      }

      const facts: Record<string, string | number | null> = {};
      for (const f of matterDef.fields) {
        const v = validated.data[f.key];
        facts[f.key] = v == null ? null : typeof v === "number" ? v : String(v);
      }

      const title =
        String(values.title ?? "").trim() ||
        autoPackTitle(
          {
            professionalCategory: category,
            matterType: matterDef.type as ProfessionalMatterType,
            facts,
            matterDate: Number(values.matterDate),
          },
          t
        );

      setSaving(true);
      setError(null);
      let succeeded = false;
      const saveSession = captureAdmissionToken();
      try {
        await saveProfessionalPackWithPdf(
          user.uid,
          {
            clientRecordId: packIdParam ? undefined : clientRecordIdRef.current,
            ueid: user.ueid,
            professionalCategory: category,
            matterType: matterDef.type as ProfessionalMatterType,
            title,
            facts,
            linkedEntryIds: (values.linkedEntryIds as string[]) ?? [],
            attachments: [],
            matterDate: Number(values.matterDate),
            dueDate: values.dueDate == null ? null : Number(values.dueDate),
            reminder: (values.reminder as import("@/domain/types").EntryReminder) ?? null,
            professionalName: String(values.professionalName ?? "") || null,
            professionalContact: String(values.professionalContact ?? "") || null,
            notes: String(values.notes ?? "") || null,
            status: editStatus ?? "active",
          },
          {
            user,
            locale: lang === "hi" ? "hi-IN" : "en-IN",
            uiLang: lang,
            t,
            isUpdate: Boolean(packIdParam),
            packId: packIdParam ? String(packIdParam) : undefined,
            idempotency: packIdParam ? undefined : idempotencyRef.current ?? undefined,
            route: "professional-pack/form",
          }
        );
        void ingestProfessionalPackForm(
          { userId: user.uid, ueid: user.ueid },
          matterDef,
          values
        ).catch(() => undefined);
        if (!packIdParam && category && matterDef) {
          await clearPackDraft(user.uid, category, matterDef.type);
        }
        succeeded = true;
        setSaveBlocked(true);
        setSuppressBackGuard(true);
        setSavedBaseline(JSON.stringify(values));
        router.replace(
          packIdParam
            ? {
                pathname: "/(app)/professional-pack/[id]",
                params: { id: String(packIdParam) },
              }
            : "/(app)/professional-pack/history"
        );
      } catch (e) {
        if (e instanceof SaveStillInProgressError) {
          setError(t("proPack.errSaveInProgress"));
          return;
        }
        setError(userFacingMessage(e));
        if (!packIdParam) {
          notifyOrdinaryQuotaUpsell({
            family: "professional_pack",
            origin: "user_save",
            clientRecordId: clientRecordIdRef.current,
            session: saveSession,
            error: e,
          });
        }
      } finally {
        setSaving(false);
        if (!succeeded) {
          saveLockRef.current = false;
        }
      }
    },
    [user, category, matterDef, saving, saveBlocked, t, lang, router, packIdParam, editStatus]
  );

  if (!category || !matterDef) {
    return (
      <Screen>
        <Header title={t("proPack.invalid")} showBack backFrom="you" onBackPress={goBack} />
      </Screen>
    );
  }

  return (
    <Screen scroll form>
      <Header
        variant="executive"
        title={t(`proPack.matters.${matterDef.labelKey}`)}
        subtitle={t("proPack.formSubtitle")}
        showBack
        backFrom="you"
        onBackPress={handleHeaderBack}
      />
      {user && initialValues !== null ? (
        <ProfessionalPackForm
          onValuesChange={setFormValues}
          category={category}
          matterDef={matterDef}
          diaryEntries={entries}
          userId={user.uid}
          initialValues={packIdParam ? initialValues : undefined}
          saving={saving}
          saveBlocked={saveBlocked}
          error={error}
          onSubmit={onSubmit}
        />
      ) : packIdParam ? (
        <LocaleUiText>{t("common.loading")}</LocaleUiText>
      ) : null}
    </Screen>
  );
}
