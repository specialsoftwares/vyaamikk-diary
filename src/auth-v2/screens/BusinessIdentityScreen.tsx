import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AuthV2PrimaryButton } from "@/auth-v2/components/AuthV2PrimaryButton";
import { OnboardingV2Shell } from "@/auth-v2/components/OnboardingV2Shell";
import { OnboardingV2TextField } from "@/auth-v2/components/OnboardingV2TextField";
import { useValidationFocus } from "@/components/inputSafety";
import { useFormFieldNavigation } from "@/components/inputSafety/FormFocusManager";
import { BUSINESS_IDENTITY_NAV_FIELD_ORDER } from "@/utils/formFieldNavigation/fieldNavOrders";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { onboardingSalutationDefault } from "@/domain/profileSalutation";
import { isOnboardingIdentityLocked } from "@/domain/profileUpdatePolicy";
import { DesignationPicker } from "@/components/profile/DesignationPicker";
import { Banner } from "@/components/ui";
import { userFacingMessage } from "@/domain/errors";
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
  const { user, updateProfile } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const readOnly = user ? isOnboardingIdentityLocked(user) : false;

  const {
    control,
    handleSubmit,
    setFocus,
    reset,
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
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.profileCompletedAt && !user.ueidReleasedAt) {
      router.replace("/");
      return;
    }
    reset({
      displayName: user.displayName ?? "",
      businessName: user.businessName ?? "",
      workType: user.workType ?? "",
      designation: user.designation ?? "",
    });
  }, [user, reset, router]);

  if (!user) {
    return null;
  }
  if (user.profileCompletedAt && !user.ueidReleasedAt) {
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
            businessName: values.businessName.trim() || null,
            workType: values.workType.trim() || null,
            designation: values.designation.trim() || null,
            profileCompletedAt: Date.now(),
          },
          "onboarding"
        );
        await updateProfile(patch);
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
    if (readOnly) {
      router.replace("/(auth)/ueid");
      return;
    }
    if (user.businessEmail?.trim()) {
      router.replace({
        pathname: "/(auth)/v2",
        params: { step: "email", from: "profile" },
      });
      return;
    }
    router.replace("/(auth)/v2");
  };

  const goBackFromReadOnly = () => {
    router.replace("/(auth)/ueid");
  };

  return (
    <OnboardingV2Shell
      stageLabel={t("onboarding.stages.buildIdentity")}
      title={t("onboarding.stages.buildIdentity")}
      subtitle={t("onboarding.profile.v2Body")}
      onBack={goBack}
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
          </>
        )
      }
    >
      {readOnly ? <Banner tone="info" message={t("onboarding.profile.lockedAfterUeid")} /> : null}
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
      </View>
    </OnboardingV2Shell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, marginTop: spacing.sm },
  readOnly: { opacity: 0.72 },
  note: { ...typography.caption, textAlign: "center", lineHeight: 18 },
});
