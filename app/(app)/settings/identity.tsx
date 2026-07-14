import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useForm, useWatch, type Control, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { IdentityPreviewCard } from "@/components/profile/IdentityPreviewCard";
import { ProfileIdentityHeroCard } from "@/components/profile/ProfileIdentityHeroCard";
import { ProfilePolicyGuidanceCard } from "@/components/profile/ProfilePolicyGuidanceCard";
import { ProfileYourDetailsEditPanel } from "@/components/profile/ProfileYourDetailsEditPanel";
import { ProfileYourDetailsViewCard } from "@/components/profile/ProfileYourDetailsViewCard";
import { Banner,
  Header,
  Loader,
  PermissionRationaleModal,
  PremiumActionButton,
  Screen, LocaleUiText } from "@/components/ui";
import { PROFILE_SALUTATION_IDS } from "@/domain/profileSalutation";
import type { ProfileSalutationId } from "@/domain/profileSalutation";
import { userFacingMessage } from "@/domain/errors";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import {
  persistProfileLogoFromPicker,
  removeProfileLogoFile,
} from "@/services/profileLogo/storage";
import {
  buildIdentityProfilePatch,
  canRemoveLogo,
  hasLogoFieldChange,
  isBrandingDirty,
  isDetailsFormDirty,
  pendingLogoSave,
  previewLogoUri,
  snapshotIdentityBaseline,
  type LogoDraft,
} from "@/utils/profile/identityDraft";
import type { ProfilePatch } from "@/services/auth/types";
import {
  completeBusinessEmailBind,
  requiresServerEmailBinding,
  startBusinessEmailVerification,
} from "@/services/auth/bindBusinessEmail";
import { stripServerOwnedProfilePatchKeys } from "@/services/auth/clientProfilePatchPayload";
import {
  MAX_BUSINESS_NAME_CHANGES,
  MAX_EMAIL_CHANGES,
  assertCanEditProfileField,
  canEditProfileField,
} from "@/domain/profileUpdatePolicy";
import { enrichProfilePatchWithPolicy } from "@/utils/profile/applyProfileUpdatePolicy";
import { radius, spacing, typography, useThemedStyles } from "@/theme";

const identitySchema = z.object({
  salutation: z.enum(PROFILE_SALUTATION_IDS),
  displayName: z.string().trim().min(1),
  businessName: z.string().optional(),
  workType: z.string().optional(),
  businessEmail: z
    .string()
    .trim()
    .max(120)
    .refine((s) => s === "" || z.string().email().safeParse(s).success, {
      message: "Enter a valid email address.",
    }),
  designation: z.string().optional(),
});

type IdentityForm = z.infer<typeof identitySchema>;

const EMAIL_CODE_LENGTH = 6;

export default function BusinessIdentityScreen() {
  const t = useT();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { user, updateProfile, applyServerProfile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const displayNameRef = useRef<TextInput>(null);

  const [baseline, setBaseline] = useState<ReturnType<typeof snapshotIdentityBaseline> | null>(
    () => (user ? snapshotIdentityBaseline(user) : null)
  );

  useEffect(() => {
    if (user) setBaseline(snapshotIdentityBaseline(user));
  }, [user?.uid]);

  const [includeLogoOnPdf, setIncludeLogoOnPdf] = useState(
    user?.pdfBranding?.includeProfileLogo ?? true
  );
  const [logoDraft, setLogoDraft] = useState<LogoDraft>({ status: "unchanged" });
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermission, setShowPermission] = useState(false);
  const [showDisplayNameError, setShowDisplayNameError] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [emailVerifyPending, setEmailVerifyPending] = useState<{
    verificationId: string;
    email: string;
    policyPatch: ProfilePatch;
  } | null>(null);
  const [emailVerifyCode, setEmailVerifyCode] = useState("");
  const [emailVerifyBusy, setEmailVerifyBusy] = useState(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      sectionTitle: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginBottom: spacing.sm,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      },
      logoBlock: { marginBottom: spacing.lg, gap: spacing.sm },
      logoActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
      hint: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.md,
        gap: spacing.md,
      },
      toggleCopy: { flex: 1, gap: 4 },
      toggleTitle: { ...typography.bodyStrong, color: c.text },
      toggleSub: { ...typography.caption, color: c.textMuted },
      err: { ...typography.caption, color: c.danger, marginBottom: spacing.sm },
      emailVerifyBlock: {
        marginTop: spacing.lg,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        gap: spacing.sm,
      },
      emailVerifyTitle: { ...typography.bodyStrong, color: c.text },
      emailVerifyHint: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      emailCodeInput: {
        ...typography.mono,
        fontSize: 22,
        letterSpacing: 6,
        textAlign: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.divider,
        color: c.text,
        ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
      },
    })
  );

  const { control, handleSubmit, reset, formState: { errors } } = useForm<IdentityForm>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      salutation: (user?.salutation ?? "none") as ProfileSalutationId,
      displayName: user?.displayName ?? "",
      businessName: user?.businessName ?? "",
      workType: user?.workType ?? "",
      businessEmail: user?.businessEmail ?? "",
      designation: user?.designation ?? "",
    },
  });

  const watched = useWatch({ control });
  const formValues = useMemo(
    () => ({
      salutation: (watched.salutation ?? "none") as ProfileSalutationId,
      displayName: watched.displayName ?? "",
      businessName: watched.businessName ?? "",
      workType: watched.workType ?? "",
      businessEmail: watched.businessEmail ?? "",
      designation: watched.designation ?? "",
    }),
    [
      watched.salutation,
      watched.displayName,
      watched.businessName,
      watched.workType,
      watched.businessEmail,
      watched.designation,
    ]
  );

  const detailsDirty = useMemo(() => {
    if (!baseline) return false;
    return isDetailsFormDirty(baseline, formValues);
  }, [baseline, formValues]);

  const brandingDirty = useMemo(() => {
    if (!baseline) return false;
    return isBrandingDirty(baseline, includeLogoOnPdf, logoDraft);
  }, [baseline, includeLogoOnPdf, logoDraft]);

  const showSaveFooter = (detailsEditing && detailsDirty) || brandingDirty;

  const cancelDetailsEdit = useCallback(() => {
    if (!baseline) return;
    reset({
      salutation: baseline.salutation,
      displayName: baseline.displayName,
      businessName: baseline.businessName,
      workType: baseline.workType,
      businessEmail: baseline.businessEmail,
      designation: baseline.designation,
    });
    setShowDisplayNameError(false);
    setDetailsEditing(false);
  }, [baseline, reset]);

  const previewLogo = user ? previewLogoUri(user, logoDraft) : null;

  const backFrom = from === "you" ? "you" : "settings";

  const goToDashboard = useCallback(() => {
    router.replace("/(app)/(tabs)/you");
  }, [router]);

  const ensurePermission = async (): Promise<boolean> => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      setError(t("identity.permissionDenied"));
      return false;
    }
    setShowPermission(true);
    return false;
  };

  const pickLogo = async () => {
    if (!user) return;
    setError(null);
    const ok = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!ok.granted) {
      const allowed = await ensurePermission();
      if (!allowed) return;
    }
    setLogoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setLogoDraft({
        status: "picked",
        previewUri: asset.uri,
        asset: {
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        },
      });
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = () => {
    if (!user || !canRemoveLogo(user, logoDraft)) return;
    Alert.alert(t("identity.removeLogoTitle"), t("identity.removeLogoBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("identity.removeLogo"),
        style: "destructive",
        onPress: () => setLogoDraft({ status: "removed" }),
      },
    ]);
  };

  const showSaveSuccess = useCallback(() => {
    Alert.alert(t("identity.saveSuccessTitle"), t("identity.saveSuccessBody"), [
      { text: t("identity.stayHere"), style: "cancel" },
      { text: t("identity.goToDashboard"), onPress: goToDashboard },
    ]);
  }, [t, goToDashboard]);

  const onSave = useCallback(
    async (values: IdentityForm) => {
      if (!user || !baseline || saving) return;
      const trimmedName = values.displayName.trim();
      if (!trimmedName) {
        setShowDisplayNameError(true);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        displayNameRef.current?.focus();
        return;
      }
      setShowDisplayNameError(false);

      const formSnapshot = {
        salutation: values.salutation,
        displayName: trimmedName,
        businessName: values.businessName?.trim() ?? "",
        workType: values.workType?.trim() ?? "",
        businessEmail: values.businessEmail?.trim() ?? "",
        designation: values.designation?.trim() ?? "",
      };

      const hasDetailsChange = isDetailsFormDirty(baseline, formSnapshot);
      const hasBrandingChange = isBrandingDirty(baseline, includeLogoOnPdf, logoDraft);
      if (!hasDetailsChange && !hasBrandingChange) {
        return;
      }

      const newEmail = formSnapshot.businessEmail.trim().toLowerCase() || null;
      const baselineEmail = baseline.businessEmail.trim().toLowerCase() || null;
      const emailChanged = newEmail !== baselineEmail;
      const serverEmailBind = emailChanged && newEmail && requiresServerEmailBinding();

      if (serverEmailBind) {
        assertCanEditProfileField(user, "businessEmail");
      }

      setSaving(true);
      setError(null);
      try {
        const patch: ProfilePatch =
          buildIdentityProfilePatch(user, baseline, formSnapshot, includeLogoOnPdf, logoDraft) ??
          {};

        if (serverEmailBind) {
          delete patch.businessEmail;
        }

        const logoOp = pendingLogoSave(user, logoDraft);
        if (logoOp.kind === "persist") {
          const ref = await persistProfileLogoFromPicker(user.uid, logoOp.asset);
          if (user.profileLogo?.localUri && user.profileLogo.localUri !== ref.localUri) {
            await removeProfileLogoFile(user.profileLogo);
          }
          patch.profileLogo = ref;
        } else if (logoOp.kind === "delete") {
          await removeProfileLogoFile(logoOp.previous);
          patch.profileLogo = null;
        }

        if (
          Object.keys(patch).length === 0 &&
          !hasLogoFieldChange(logoDraft, baseline) &&
          !serverEmailBind
        ) {
          return;
        }

        let next = user;
        if (Object.keys(patch).length > 0 || hasLogoFieldChange(logoDraft, baseline)) {
          next = await updateProfile(
            enrichProfilePatchWithPolicy(user, patch, "settings")
          );
        }

        if (serverEmailBind) {
          const policyPatch = enrichProfilePatchWithPolicy(
            user,
            { businessEmail: newEmail },
            "settings"
          );
          const { verificationId } = await startBusinessEmailVerification(newEmail);
          setEmailVerifyPending({ verificationId, email: newEmail, policyPatch });
          setEmailVerifyCode("");
          setLogoDraft({ status: "unchanged" });
          setDetailsEditing(false);
          return;
        }

        setLogoDraft({ status: "unchanged" });
        const nextBaseline = snapshotIdentityBaseline(next);
        setBaseline(nextBaseline);
        setIncludeLogoOnPdf(nextBaseline.includeLogoOnPdf);
        reset({
          salutation: (next.salutation ?? "none") as ProfileSalutationId,
          displayName: next.displayName ?? "",
          businessName: next.businessName ?? "",
          workType: next.workType ?? "",
          businessEmail: next.businessEmail ?? "",
          designation: next.designation ?? "",
        });
        setDetailsEditing(false);
        if (hasDetailsChange) {
          showSaveSuccess();
        }
      } catch (e) {
        setError(userFacingMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [
      user,
      baseline,
      saving,
      includeLogoOnPdf,
      logoDraft,
      updateProfile,
      reset,
      showSaveSuccess,
    ]
  );

  const onVerifyEmailChange = useCallback(async () => {
    if (!user || !emailVerifyPending || emailVerifyCode.length !== EMAIL_CODE_LENGTH) return;
    setEmailVerifyBusy(true);
    setError(null);
    try {
      const serverProfile = await completeBusinessEmailBind(
        emailVerifyPending.verificationId,
        emailVerifyCode
      );
      let next = await applyServerProfile(serverProfile);
      const metadataPatch = stripServerOwnedProfilePatchKeys(
        emailVerifyPending.policyPatch,
        { production: true }
      );
      if (Object.keys(metadataPatch).length > 0) {
        next = await updateProfile(metadataPatch);
      }
      const nextBaseline = snapshotIdentityBaseline(next);
      setBaseline(nextBaseline);
      setIncludeLogoOnPdf(nextBaseline.includeLogoOnPdf);
      reset({
        salutation: (next.salutation ?? "none") as ProfileSalutationId,
        displayName: next.displayName ?? "",
        businessName: next.businessName ?? "",
        workType: next.workType ?? "",
        businessEmail: next.businessEmail ?? "",
        designation: next.designation ?? "",
      });
      setEmailVerifyPending(null);
      setEmailVerifyCode("");
      showSaveSuccess();
    } catch (e) {
      setError(userFacingMessage(e));
    } finally {
      setEmailVerifyBusy(false);
    }
  }, [
    user,
    emailVerifyPending,
    emailVerifyCode,
    applyServerProfile,
    updateProfile,
    reset,
    showSaveSuccess,
  ]);

  const onPrimaryPress = useCallback(() => {
    if (!showSaveFooter) return;
    void handleSubmit(onSave)();
  }, [showSaveFooter, handleSubmit, onSave]);

  if (!user) {
    return (
      <Screen>
        <Loader message={t("common.loading")} />
      </Screen>
    );
  }

  if (!baseline) {
    return (
      <Screen>
        <Header
          variant="executive"
          title={t("identity.title")}
          subtitle={t("identity.subtitle")}
          showBack
          backFrom={from === "you" ? "you" : "settings"}
          fallback="/(app)/(tabs)/you"
        />
        <Loader message={t("common.loading")} />
      </Screen>
    );
  }

  const memberSinceMs = user.createdAt ?? Date.now();

  const businessNameLocked = !canEditProfileField(user, "businessName").allowed;
  const emailLocked = !canEditProfileField(user, "businessEmail").allowed;
  const businessNameRemaining = Math.max(
    0,
    MAX_BUSINESS_NAME_CHANGES - (user.businessNameChangeCount ?? 0)
  );
  const emailRemaining = Math.max(0, MAX_EMAIL_CHANGES - (user.emailChangeCount ?? 0));

  const primaryLabel = saving ? t("common.loading") : t("identity.saveChanges");

  const displayNameError =
    showDisplayNameError || errors.displayName
      ? t("identity.displayNameRequired")
      : null;

  return (
    <Screen
      scroll
      form
      scrollRef={scrollRef}
      footer={
        showSaveFooter ? (
          <PremiumActionButton
            label={primaryLabel}
            onPress={onPrimaryPress}
            variant="primary"
            disabled={saving || logoBusy}
            loading={saving}
          />
        ) : null
      }
    >
      <Header
        variant="executive"
        title={t("identity.title")}
        subtitle={t("identity.subtitle")}
        showBack
        backFrom={backFrom}
        fallback="/(app)/(tabs)/you"
        dirty={showSaveFooter}
      />

      <ProfileIdentityHeroCard user={user} memberSinceMs={memberSinceMs} />

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {emailVerifyPending ? (
        <View style={styles.emailVerifyBlock}>
          <LocaleUiText style={styles.emailVerifyTitle}>
            {t("pendingDeletion.reactivateEmailTitle")}
          </LocaleUiText>
          <LocaleUiText style={styles.emailVerifyHint}>
            {t("pendingDeletion.reactivateEmailHint")}
          </LocaleUiText>
          <TextInput
            style={styles.emailCodeInput}
            value={emailVerifyCode}
            onChangeText={(text) =>
              setEmailVerifyCode(text.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH))
            }
            keyboardType="number-pad"
            maxLength={EMAIL_CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder={t("otp.codePlaceholder")}
            editable={!emailVerifyBusy}
          />
          <PremiumActionButton
            label={t("pendingDeletion.verifyAndReactivate")}
            onPress={() => void onVerifyEmailChange()}
            variant="primary"
            loading={emailVerifyBusy}
            disabled={emailVerifyCode.length !== EMAIL_CODE_LENGTH || emailVerifyBusy}
          />
          <PremiumActionButton
            label={t("common.cancel")}
            onPress={() => {
              setEmailVerifyPending(null);
              setEmailVerifyCode("");
            }}
            variant="ghost"
            disabled={emailVerifyBusy}
          />
        </View>
      ) : null}

      {detailsEditing ? (
        <ProfileYourDetailsEditPanel
          user={user}
          control={control as unknown as Control<FieldValues>}
          displayNameError={displayNameError}
          businessNameLocked={businessNameLocked}
          emailLocked={emailLocked}
          businessNameRemaining={businessNameRemaining}
          emailRemaining={emailRemaining}
          displayNameRef={displayNameRef}
          onDisplayNameChange={() => setShowDisplayNameError(false)}
          onCancel={cancelDetailsEdit}
        />
      ) : (
        <ProfileYourDetailsViewCard
          user={user}
          onRequestEdit={() => setDetailsEditing(true)}
        />
      )}

      <LocaleUiText style={styles.sectionTitle}>{t("identity.sectionBranding")}</LocaleUiText>

      <IdentityPreviewCard
        user={user}
        displayName={formValues.displayName}
        businessName={formValues.businessName}
        logoUri={previewLogo}
      />

      <LocaleUiText style={styles.sectionTitle}>{t("identity.logoSection")}</LocaleUiText>
      <View style={styles.logoBlock}>
        <View style={styles.logoActions}>
          <PremiumActionButton
            label={logoBusy ? t("common.loading") : t("identity.uploadLogo")}
            variant="secondary"
            size="md"
            onPress={() => void pickLogo()}
            disabled={logoBusy || saving}
          />
          {canRemoveLogo(user, logoDraft) ? (
            <PremiumActionButton
              label={t("identity.removeLogo")}
              variant="ghost"
              size="md"
              onPress={removeLogo}
              disabled={logoBusy || saving}
            />
          ) : null}
        </View>
        <LocaleUiText style={styles.hint}>{t("identity.logoHint")}</LocaleUiText>
      </View>

      <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <LocaleUiText style={styles.toggleTitle}>{t("identity.includeLogoOnPdf")}</LocaleUiText>
            <LocaleUiText style={styles.toggleSub}>{t("identity.includeLogoOnPdfSub")}</LocaleUiText>
          </View>
          <Switch
            value={includeLogoOnPdf}
            onValueChange={setIncludeLogoOnPdf}
            accessibilityLabel={t("identity.includeLogoOnPdf")}
          />
        </View>
        <Banner tone="info" message={t("identity.letterheadLogoNote")} />

      <ProfilePolicyGuidanceCard />

      <PermissionRationaleModal
        visible={showPermission}
        title={t("identity.permissionTitle")}
        body={t("identity.permissionBody")}
        allowLabel={t("common.allow")}
        onAllow={async () => {
          setShowPermission(false);
          const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (r.granted) void pickLogo();
          else setError(t("identity.permissionDenied"));
        }}
        notNowLabel={t("common.notNow")}
        onDismiss={() => setShowPermission(false)}
      />
    </Screen>
  );
}
