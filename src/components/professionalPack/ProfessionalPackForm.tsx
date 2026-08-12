import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { ReminderFields } from "@/components/composer/ReminderFields";
import { KeyboardAwareField } from "@/components/forms/KeyboardAwareField";
import { SmartSuggestionInput } from "@/components/forms/SmartSuggestionInput";
import { useValidationFocus } from "@/components/inputSafety";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { Button, TextField, LocaleUiText } from "@/components/ui";
import { masterKeyForProPackField } from "@/services/masterData/fieldKeys";
import type { MasterFieldKey } from "@/services/masterData";
import type { MatterTypeDef, ProfessionalCategory } from "@/domain/professionalPack";
import type { BusinessEntry } from "@/domain/businessEntry";
import { useT } from "@/i18n";
import { formDateRowStyle, formFieldLabelStyle } from "@/theme/formLayer";
import { luxuryCardBorder } from "@/theme/luxuryTokens";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { todayStartMs } from "@/utils/date";
import { buildPackFormSchema } from "@/utils/professionalPack/validation";
import { isDraftPayloadMeaningful } from "@/services/drafts";
import {
  clearPackDraft,
  loadPackDraft,
  savePackDraft,
} from "@/services/professionalPack/drafts";

interface ProfessionalPackFormProps {
  category: ProfessionalCategory;
  matterDef: MatterTypeDef;
  diaryEntries: BusinessEntry[];
  initialValues?: Record<string, unknown> | null;
  userId: string;
  saving: boolean;
  saveBlocked?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onValuesChange?: (values: Record<string, unknown>) => void;
}

export function ProfessionalPackForm({
  category,
  matterDef,
  diaryEntries,
  initialValues,
  userId,
  saving,
  saveBlocked = false,
  error,
  onSubmit,
  onValuesChange,
}: ProfessionalPackFormProps) {
  const t = useT();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const [validationBanner, setValidationBanner] = useState<string | null>(null);
  const [showMatterDate, setShowMatterDate] = useState(false);
  const [showDueDate, setShowDueDate] = useState(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      form: { gap: spacing.lg + 2 },
      hint: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      err: { ...typography.caption, color: c.danger },
      section: { ...formFieldLabelStyle(c), marginTop: spacing.sm, marginBottom: 0 },
      linkRow: {
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md + 2,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        marginBottom: spacing.xs,
      },
      linkRowOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      linkText: { ...typography.caption, color: c.text },
      dateRow: formDateRowStyle(isDark, c),
      dateVal: { ...typography.body, color: c.text },
      dateLink: { ...typography.captionStrong, color: c.primary },
    })
  );

  const schema = useMemo(() => buildPackFormSchema(matterDef), [matterDef]);

  const defaultValues = useMemo(() => {
    const base: Record<string, unknown> = {
      matterDate: todayStartMs(),
      dueDate: null,
      professionalName: "",
      professionalContact: "",
      notes: "",
      linkedEntryIds: [] as string[],
      title: "",
      reminder: null,
    };
    for (const f of matterDef.fields) {
      base[f.key] = f.kind === "amount" ? "" : "";
    }
    return { ...base, ...initialValues };
  }, [matterDef, initialValues]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues,
    resolver: zodResolver(schema) as never,
    mode: "onChange",
  });

  const linkedIds = watch("linkedEntryIds") as string[] | undefined;

  useEffect(() => {
    if (!onValuesChange) return;
    const sub = watch((values) => {
      onValuesChange(values as Record<string, unknown>);
    });
    return () => sub.unsubscribe();
  }, [watch, onValuesChange]);

  useEffect(() => {
    if (initialValues) return;
    void loadPackDraft(userId, category, matterDef.type).then((draft) => {
      if (!draft || !isDraftPayloadMeaningful(draft)) {
        void clearPackDraft(userId, category, matterDef.type);
        return;
      }
      for (const [k, v] of Object.entries(draft)) {
        setValue(k as never, v as never);
      }
    });
  }, [userId, category, matterDef.type, initialValues, setValue]);

  const persistDraft = useCallback(() => {
    const v = watch() as Record<string, unknown>;
    if (!isDraftPayloadMeaningful(v)) {
      void clearPackDraft(userId, category, matterDef.type);
      return;
    }
    void savePackDraft(userId, category, matterDef.type, v);
  }, [watch, userId, category, matterDef.type]);

  useEffect(() => {
    const sub = watch(() => persistDraft());
    return () => sub.unsubscribe();
  }, [watch, persistDraft]);

  const toggleLink = (id: string) => {
    const cur = linkedIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setValue("linkedEntryIds", next);
  };

  const validation = useValidationFocus();

  const fieldOrder = useMemo(
    () => [
      ...matterDef.fields.map((f) => f.key),
      "professionalName",
      "professionalContact",
      "notes",
    ],
    [matterDef.fields]
  );

  useFormFieldNavigation(fieldOrder);

  const field = (def: MatterTypeDef["fields"][number]) => {
    const masterKey: MasterFieldKey | null =
      def.kind === "multiline" || def.kind === "amount" || def.kind === "date"
        ? null
        : masterKeyForProPackField(def.key) ??
          (def.kind === "gstin" ? "gstin" : def.kind === "email" ? null : null);
    return (
    <View key={def.key}>
      <Controller
        control={control}
        name={def.key}
        render={({ field: { onChange, value } }) => (
          <KeyboardAwareField fieldId={def.key}>
            {masterKey && def.kind !== "multiline" ? (
              <SmartSuggestionInput
                navFieldKey={def.key}
                fieldKey={masterKey}
                label={t(`proPack.fields.${def.labelKey}`)}
                value={value == null ? "" : String(value)}
                onChangeText={onChange}
                keyboardType={def.kind === "amount" ? "numeric" : "default"}
                autoCapitalize={def.kind === "gstin" ? "characters" : "sentences"}
              />
            ) : (
              <TextField
                navFieldKey={def.key}
                label={t(`proPack.fields.${def.labelKey}`)}
                value={value == null ? "" : String(value)}
                onChangeText={onChange}
                multiline={def.kind === "multiline"}
                keyboardType={def.kind === "amount" ? "numeric" : "default"}
                autoCapitalize={def.kind === "gstin" ? "characters" : "sentences"}
              />
            )}
          </KeyboardAwareField>
        )}
      />
      {errors[def.key] ? (
        <Text style={styles.err}>{String(errors[def.key]?.message)}</Text>
      ) : null}
    </View>
    );
  };

  return (
    <View style={styles.form}>
      <LocaleUiText style={styles.hint}>{t("proPack.formDisclaimer")}</LocaleUiText>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {validationBanner ? <Text style={styles.err}>{validationBanner}</Text> : null}

      {matterDef.fields.map(field)}

      <LocaleUiText style={styles.section}>{t("proPack.matterDate")}</LocaleUiText>
      <Controller
        control={control}
        name="matterDate"
        render={({ field: { value, onChange } }) => (
          <>
            <Pressable style={styles.dateRow} onPress={() => setShowMatterDate(true)}>
              <Text style={styles.dateVal}>
                {new Date(value as number).toLocaleDateString()}
              </Text>
              <LocaleUiText style={styles.dateLink}>{t("diary.reminder.pickDate")}</LocaleUiText>
            </Pressable>
            {showMatterDate ? (
              <DateTimePicker
                mode="date"
                value={new Date(value as number)}
                onChange={(_, d) => {
                  setShowMatterDate(false);
                  if (d) onChange(d.getTime());
                }}
              />
            ) : null}
          </>
        )}
      />

      <LocaleUiText style={styles.section}>{t("proPack.dueDateOptional")}</LocaleUiText>
      <Controller
        control={control}
        name="dueDate"
        render={({ field: { value, onChange } }) => (
          <>
            <Pressable style={styles.dateRow} onPress={() => setShowDueDate(true)}>
              {value ? (
                <Text style={styles.dateVal}>
                  {new Date(value as number).toLocaleDateString()}
                </Text>
              ) : (
                <LocaleUiText style={styles.dateVal}>{t("proPack.notSet")}</LocaleUiText>
              )}
              <LocaleUiText style={styles.dateLink}>{t("diary.reminder.pickDate")}</LocaleUiText>
            </Pressable>
            {value ? (
              <Pressable onPress={() => onChange(null)}>
                <LocaleUiText style={styles.dateLink}>{t("common.remove")}</LocaleUiText>
              </Pressable>
            ) : null}
            {showDueDate ? (
              <DateTimePicker
                mode="date"
                value={value ? new Date(value as number) : new Date()}
                onChange={(_, d) => {
                  setShowDueDate(false);
                  if (d) onChange(d.getTime());
                }}
              />
            ) : null}
          </>
        )}
      />

      <ReminderFields control={control as never} errors={errors} />

      <KeyboardAwareField fieldId="professionalName">
        <SmartSuggestionInput
          navFieldKey="professionalName"
          fieldKey="personName"
          label={t("proPack.professionalName")}
          value={watch("professionalName") as string}
          onChangeText={(v: string) => setValue("professionalName", v)}
        />
      </KeyboardAwareField>
      <KeyboardAwareField fieldId="professionalContact">
        <SmartSuggestionInput
          navFieldKey="professionalContact"
          fieldKey="clarificationContactMobile"
          label={t("proPack.professionalContact")}
          value={watch("professionalContact") as string}
          onChangeText={(v: string) => setValue("professionalContact", v)}
          keyboardType="phone-pad"
        />
      </KeyboardAwareField>

      <LocaleUiText style={styles.section}>{t("proPack.linkEntries")}</LocaleUiText>
      {diaryEntries.slice(0, 40).map((e) => {
        const on = (linkedIds ?? []).includes(e.id);
        return (
          <Pressable
            key={e.id}
            style={[styles.linkRow, on && styles.linkRowOn]}
            onPress={() => toggleLink(e.id)}
          >
            <Text style={styles.linkText} numberOfLines={1}>
              {on ? "[x] " : "[ ] "}
              {e.title}
            </Text>
          </Pressable>
        );
      })}

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, value } }) => (
          <KeyboardAwareField fieldId="notes">
            <TextField
              navFieldKey="notes"
              label={t("proPack.notesOptional")}
              value={String(value ?? "")}
              onChangeText={onChange}
              multiline
            />
          </KeyboardAwareField>
        )}
      />

      <Button
        label={t("common.save")}
        loading={saving}
        loadingLabel="Saving…"
        disabled={saving || saveBlocked}
        onPress={handleSubmit(
          async (v) => {
            setValidationBanner(null);
            await clearPackDraft(userId, category, matterDef.type);
            await onSubmit(v as Record<string, unknown>);
          },
          (invalidErrors) => {
            setValidationBanner(t("composer.fixFields"));
            validation?.scrollToFirstInvalid(
              fieldOrder,
              (id) => Boolean(invalidErrors[id]),
              { focus: true }
            );
          }
        )}
      />
    </View>
  );
}
