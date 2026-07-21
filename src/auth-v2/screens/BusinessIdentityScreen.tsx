import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { WizardProgress } from "@/auth-v2/components/WizardProgress";
import { useValidationFocus } from "@/components/inputSafety";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { BUSINESS_IDENTITY_NAV_FIELD_ORDER } from "@/utils/formFieldNavigation/fieldNavOrders";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { onboardingSalutationDefault } from "@/domain/profileSalutation";
import { isOnboardingIdentityLocked } from "@/domain/profileUpdatePolicy";
import { DesignationPicker } from "@/components/profile/DesignationPicker";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  markContinuingWizardStep,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import {
  clearOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import {
  clearOnboardingProfileDraft,
  loadOnboardingProfileDraft,
  saveOnboardingProfileDraft,
} from "@/auth/onboardingProfileDraft";
import {
  transformProfileDraftForAccountKind,
  type OnboardingAccountKind,
  type OnboardingProfileDraftFields,
} from "@/auth/onboardingWizard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";
import { maskMobile } from "@/utils/phone";
import { enrichProfilePatchWithPolicy } from "@/utils/profile/applyProfileUpdatePolicy";
import {
  onboardingProfileCoreSchema,
  type OnboardingProfileCoreFormValues,
} from "@/utils/validation";

const FIELD_ORDER: (keyof OnboardingProfileCoreFormValues)[] = [
  "displayName",
  "businessName",
  "workType",
  "designation",
];

export function BusinessIdentityScreen() {
  const t = useT();
  const router = useRouter();
  const { tokens } = useAuthV2Theme();
  const { user, updateProfile, signOut } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accountKind, setAccountKind] = useState<OnboardingAccountKind>("business");

  const readOnly = user ? isOnboardingIdentityLocked(user) : false;

  const {
    control,
    handleSubmit,
    setFocus,
    reset,
    getValues,
    setValue,
    formState: { errors, isValid },
  } = useForm<OnboardingProfileCoreFormValues>({
    resolver: zodResolver(onboardingProfileCoreSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      displayName: user?.displayName ?? "",
      businessName: user?.businessName ?? "",
      workType: user?.workType ?? "",
      designation: user?.designation ?? "",
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/");
        return;
      }
      const draft = await loadOnboardingProfileDraft(user.uid);
      if (cancelled) return;
      if (draft) {
        setAccountKind(draft.accountKind);
        reset({
          displayName: draft.displayName,
          businessName: draft.businessName,
          workType: draft.workType,
          designation: draft.designation,
        });
        return;
      }
      const kind: OnboardingAccountKind = user.businessName?.trim()
        ? "business"
        : "business";
      setAccountKind(kind);
      reset({
        displayName: user.displayName ?? "",
        businessName: user.businessName ?? "",
        workType: user.workType ?? "",
        designation: user.designation ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, reset, router, user]);

  useEffect(() => {
    if (!user || readOnly) return;
    const sub = setInterval(() => {
      const values = getValues();
      const draft: OnboardingProfileDraftFields = {
        accountKind,
        displayName: values.displayName ?? "",
        businessName: values.businessName ?? "",
        workType: values.workType ?? "",
        designation: values.designation ?? "",
      };
      void saveOnboardingProfileDraft(user.uid, draft);
    }, 800);
    return () => clearInterval(sub);
  }, [user, accountKind, getValues, readOnly]);

  if (!user) {
    return null;
  }

  const validation = useValidationFocus();
  useFormFieldNavigation(BUSINESS_IDENTITY_NAV_FIELD_ORDER);

  const scrollToField = (name: keyof OnboardingProfileCoreFormValues) => {
    if (readOnly) return;
    setFocus(name);
  };

  const onInvalid = () => {
    validation?.scrollToFirstInvalid(
      FIELD_ORDER,
      (k) => Boolean(errors[k as keyof typeof errors]?.message),
      { focus: true }
    );
    const first = FIELD_ORDER.find((k) => errors[k]?.message);
    if (first) scrollToField(first);
  };

  const persistDraftNow = async () => {
    const values = getValues();
    await saveOnboardingProfileDraft(user.uid, {
      accountKind,
      displayName: values.displayName ?? "",
      businessName: values.businessName ?? "",
      workType: values.workType ?? "",
      designation: values.designation ?? "",
    });
  };

  const switchAccountKind = (next: OnboardingAccountKind) => {
    if (next === accountKind || readOnly) return;
    const values = getValues();
    const current: OnboardingProfileDraftFields = {
      accountKind,
      displayName: values.displayName ?? "",
      businessName: values.businessName ?? "",
      workType: values.workType ?? "",
      designation: values.designation ?? "",
    };
    const { draft, clearedMeaningful } = transformProfileDraftForAccountKind(current, next);
    const apply = () => {
      setAccountKind(draft.accountKind);
      setValue("businessName", draft.businessName);
      setValue("workType", draft.workType);
      setValue("designation", draft.designation);
      void saveOnboardingProfileDraft(user.uid, draft);
    };
    if (clearedMeaningful) {
      Alert.alert(
        "Switch to Individual?",
        "Business name, field of work, and designation will be cleared from this draft.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Switch", style: "destructive", onPress: apply },
        ]
      );
      return;
    }
    apply();
  };

  const onSubmit = handleSubmit(
    async (values) => {
      setServerError(null);
      setSubmitting(true);
      try {
        const patch = enrichProfilePatchWithPolicy(
          user,
          {
            salutation: onboardingSalutationDefault(user.salutation),
            displayName: values.displayName.trim(),
            businessName:
              accountKind === "individual"
                ? null
                : values.businessName.trim() || null,
            workType:
              accountKind === "individual" ? null : values.workType.trim() || null,
            designation:
              accountKind === "individual"
                ? null
                : values.designation.trim() || null,
            profileCompletedAt: Date.now(),
          },
          "onboarding"
        );
        await updateProfile(patch);
        await clearOnboardingProfileDraft(user.uid);
        await markContinuingWizardStep("ueidRelease", user.uid, {
          phoneE164: user.phoneE164,
          verifiedEmail: user.normalizedEmail ?? user.businessEmail,
        });
        router.replace("/(auth)/ueid");
      } catch (e) {
        setServerError(userFacingMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    onInvalid
  );

  const goBack = () => {
    void (async () => {
      await persistDraftNow();
      await markReviewingWizardStep("emailEntry", user.uid, {
        phoneE164: user.phoneE164,
        verifiedEmail: hasAuthoritativeVerifiedEmail(user)
          ? user.normalizedEmail ?? user.businessEmail
          : null,
      });
      router.replace({
        pathname: "/(auth)/v2",
        params: { step: "email", intent: "review", from: "profile" },
      });
    })();
  };

  const goBackFromReadOnly = () => {
    void markContinuingWizardStep("ueidRelease", user.uid);
    router.replace("/(auth)/ueid");
  };

  const abandon = () => {
    Alert.alert(
      "Sign out and start again?",
      "This abandons the current incomplete registration on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await clearOnboardingNavigationState();
              await clearOnboardingProfileDraft(user.uid);
              await signOut();
              router.replace("/(auth)/v2");
            })();
          },
        },
      ]
    );
  };

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.buildIdentity")}
      title={t("onboarding.stages.buildIdentity")}
      subtitle={t("onboarding.profile.v2Body")}
      onBack={goBack}
      headerTop={
        <WizardProgress
          step="businessIdentity"
          tone="dark"
          verifiedMobile
          verifiedEmail={hasAuthoritativeVerifiedEmail(user)}
        />
      }
      footer={
        readOnly ? (
          <AuthV2PrimaryButton
            label={t("common.back")}
            onPress={goBackFromReadOnly}
            activeBg={tokens.ctaActiveBg}
            activeText={tokens.ctaActiveText}
            mutedBg={tokens.ctaMutedBg}
            mutedText={tokens.ctaMutedText}
          />
        ) : (
          <>
            {serverError ? <Banner tone="danger" message={serverError} /> : null}
            <AuthV2PrimaryButton
              label={t("onboarding.profile.continue")}
              loading={submitting}
              loadingLabel={t("authV2.email.saving")}
              disabled={!isValid || submitting}
              onPress={onSubmit}
              testID="complete-profile-continue"
              activeBg={tokens.ctaActiveBg}
              activeText={tokens.ctaActiveText}
              mutedBg={tokens.ctaMutedBg}
              mutedText={tokens.ctaMutedText}
            />
            <Text style={[styles.note, { color: tokens.muted }]}>
              {t("onboarding.profile.mobileNote", { phone: maskMobile(user.phoneE164) })}
            </Text>
            <Pressable onPress={abandon} accessibilityRole="button">
              <Text style={[styles.signOut, { color: tokens.muted }]}>
                Sign out and start again
              </Text>
            </Pressable>
          </>
        )
      }
    >
      {readOnly ? <Banner tone="info" message={t("onboarding.profile.lockedAfterUeid")} /> : null}
      {!readOnly ? (
        <View style={styles.kindRow}>
          {(["individual", "business"] as const).map((kind) => {
            const active = accountKind === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => switchAccountKind(kind)}
                style={[
                  styles.kindChip,
                  {
                    backgroundColor: active ? tokens.ctaActiveBg : tokens.cardBg,
                    borderColor: tokens.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={{
                    color: active ? tokens.ctaActiveText : tokens.body,
                    ...typography.captionStrong,
                  }}
                >
                  {kind === "individual" ? "Individual" : "Business"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={[styles.form, readOnly && styles.readOnly]} pointerEvents={readOnly ? "none" : "auto"}>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, value, onBlur } }) => (
            <OnboardingV2TextField
              navFieldKey="displayName"
              label={t("onboarding.profile.nameLabel")}
              required
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={t("onboarding.profile.namePlaceholder")}
              error={errors.displayName?.message ?? null}
              autoCapitalize="words"
              maxLength={80}
              editable={!readOnly}
            />
          )}
        />
        {accountKind === "business" ? (
          <>
            <Controller
              control={control}
              name="businessName"
              render={({ field: { onChange, value, onBlur } }) => (
                <OnboardingV2TextField
                  navFieldKey="businessName"
                  label={t("onboarding.profile.businessLabelOptional")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("onboarding.profile.businessPlaceholder")}
                  error={errors.businessName?.message ?? null}
                  autoCapitalize="words"
                  maxLength={120}
                  editable={!readOnly}
                />
              )}
            />
            <Controller
              control={control}
              name="workType"
              render={({ field: { onChange, value, onBlur } }) => (
                <OnboardingV2TextField
                  navFieldKey="workType"
                  label={t("onboarding.profile.fieldLabelOptional")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("onboarding.profile.fieldPlaceholder")}
                  error={errors.workType?.message ?? null}
                  autoCapitalize="words"
                  maxLength={120}
                  editable={!readOnly}
                />
              )}
            />
            <Controller
              control={control}
              name="designation"
              render={({ field: { onChange, value } }) => (
                <DesignationPicker
                  appearance="authV2"
                  value={value}
                  onChange={onChange}
                  disabled={readOnly}
                  error={errors.designation?.message ?? null}
                  onSubmitEditing={readOnly ? undefined : onSubmit}
                />
              )}
            />
          </>
        ) : null}
      </View>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, marginTop: spacing.sm },
  readOnly: { opacity: 0.72 },
  note: { ...typography.caption, textAlign: "center", lineHeight: 18 },
  signOut: {
    ...typography.caption,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: spacing.xs,
  },
  kindRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  kindChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
