import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import {
  SettingsInfoHero,
  SettingsNavCard,
  SettingsNavGroup,
} from "@/components/settings";
import { CrashReportsPreferenceRow } from "@/components/settings/CrashReportsPreferenceRow";
import { Screen, SkeletonLoadingPanel, SkeletonSettingsSection, LocaleUiText } from "@/components/ui";
import { isBillingUxPreviewEnabled } from "@/components/billing/billingUxPreviewGate";
import { BUSINESS_INSIGHTS_HREF } from "@/content/insights/entry";
import { getAuthEntryHref } from "@/config/authWrapper";
import { openPublicLinkOrExplain } from "@/config/publicLinks";
import { useAuth } from "@/state/auth";
import { useIsOnline } from "@/state/network";
import { useT } from "@/i18n";
import { callLogoutAllDevices } from "@/services/auth/identityCallable";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import {
  classifyLogoutAllCallableFailure,
  LOGOUT_ALL_CONTROL_ENABLED,
  newLogoutOperationId,
  orchestrateConfirmedLogoutAll,
  type LogoutAllRemoteOutcome,
} from "@/services/auth/logoutAllDevices";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function SettingsTab() {
  const t = useT();
  const router = useRouter();
  const { signOut, status, user } = useAuth();
  const online = useIsOnline();
  const [signingOut, setSigningOut] = useState(false);
  const liveUid = useRef<string | null>(user?.uid ?? null);
  liveUid.current = user?.uid ?? null;
  const uiAttached = useRef(true);
  useEffect(() => {
    uiAttached.current = true;
    return () => {
      uiAttached.current = false;
    };
  }, []);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      sectionLabel: {
        ...typography.captionStrong,
        color: colors.textMuted,
        marginBottom: spacing.sm,
        marginTop: spacing.md,
        textTransform: "none",
        letterSpacing: 0.2,
      },
      sectionFirst: { marginTop: 0 },
      sectionGap: { height: spacing.sm },
      footer: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: spacing.xl,
        gap: 3,
        paddingBottom: spacing.lg,
      },
      footerText: {
        ...typography.bodyStrong,
        color: colors.text,
        textAlign: "center",
        letterSpacing: 0.3,
      },
      footerTagline: {
        ...typography.caption,
        color: colors.textMuted,
        textAlign: "center",
        marginBottom: 2,
      },
      footerSub: { ...typography.micro, color: colors.textSubtle, textAlign: "center" },
      aboutBlurb: {
        ...typography.caption,
        color: colors.textMuted,
        lineHeight: 18,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
      },
    })
  );

  const confirmSignOut = () => {
    Alert.alert(t("settings.signOutPrompt"), t("settings.signOutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logout"),
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
            router.replace(getAuthEntryHref());
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const logoutAllMessage = (remote: LogoutAllRemoteOutcome): string => {
    switch (remote) {
      case "complete":
        return t("settings.logoutAllComplete");
      case "pending":
        return t("settings.logoutAllPending");
      case "offline":
        return t("settings.logoutAllOffline");
      case "not_recent":
        return t("settings.logoutAllNotRecent");
      case "sign_in_invalid":
        return t("settings.logoutAllSignInInvalid");
      case "account_blocked":
        return t("settings.logoutAllAccountBlocked");
      case "superseded":
        return t("settings.logoutAllSuperseded");
      case "unavailable":
        return t("settings.logoutAllUnavailable");
    }
  };

  const confirmLogoutAll = () => {
    const identity = {
      uid: liveUid.current ?? "",
      generation: currentAuthMutationGeneration(),
    };
    if (!identity.uid) return;
    Alert.alert(t("settings.logoutAllPrompt"), t("settings.logoutAllBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logoutAllConfirm"),
        style: "destructive",
        onPress: () => {
          const confirmedIdentity = {
            uid: liveUid.current ?? "",
            generation: currentAuthMutationGeneration(),
          };
          if (!confirmedIdentity.uid) return;
          void orchestrateConfirmedLogoutAll({
            confirmed: true,
            online,
            operationId: newLogoutOperationId(),
            identity: confirmedIdentity,
            sessionStillCurrent: () =>
              liveUid.current === confirmedIdentity.uid &&
              currentAuthMutationGeneration() === confirmedIdentity.generation,
            uiAttached: () => uiAttached.current,
            call: async (operationId, bound) => {
              if (
                liveUid.current !== bound.uid ||
                currentAuthMutationGeneration() !== bound.generation
              ) {
                return { status: "unavailable" as const };
              }
              try {
                await callLogoutAllDevices(operationId);
                return { status: "complete" as const };
              } catch (error) {
                return { status: classifyLogoutAllCallableFailure(error) };
              }
            },
            signOutThisDevice: () => signOut(),
            navigateToSignedOut: () => router.replace(getAuthEntryHref()),
            presentOutcome: (remote) => {
              Alert.alert(t("settings.logoutAllPrompt"), logoutAllMessage(remote));
            },
            setBusy: setSigningOut,
          });
        },
      },
    ]);
  };

  const onProfileIdentity = useCallback(
    () => router.push("/(app)/settings/identity"),
    [router]
  );
  const onPrivacy = useCallback(() => {
    void openPublicLinkOrExplain("privacy");
  }, []);
  const onTerms = useCallback(() => {
    void openPublicLinkOrExplain("terms");
  }, []);
  const onAbout = useCallback(() => router.push("/(app)/settings/about"), [router]);
  const onSupport = useCallback(() => {
    void openPublicLinkOrExplain("support");
  }, []);
  const onDelete = useCallback(() => router.push("/(app)/settings/delete"), [router]);
  const onPdfPrivacy = useCallback(() => router.push("/(app)/settings/pdf-privacy"), [router]);
  const onBusinessInsights = useCallback(
    () => router.push(BUSINESS_INSIGHTS_HREF),
    [router]
  );
  const onDevReset = useCallback(() => router.push("/(app)/settings/dev-reset"), [router]);
  const onBillingPreview = useCallback(
    () => router.push("/(app)/settings/billing-ux-preview"),
    [router]
  );
  const onSubscription = useCallback(
    () => router.push("/(app)/settings/subscription"),
    [router]
  );

  if (status === "loading") {
    return (
      <Screen scroll tabBarInset>
        <SettingsInfoHero />
        <SkeletonLoadingPanel loading slowMessage={t("skeleton.stillLoading")}>
          <SkeletonSettingsSection />
        </SkeletonLoadingPanel>
      </Screen>
    );
  }

  return (
    <Screen scroll tabBarInset>
      <SettingsInfoHero />

      <LocaleUiText style={[styles.sectionLabel, styles.sectionFirst]}>{t("settings.profileSection")}</LocaleUiText>
      <SettingsNavCard
        icon="card-account-details-outline"
        title={t("settings.profileIdentityItem")}
        subtitle={t("settings.profileIdentitySubtitle")}
        onPress={onProfileIdentity}
      />

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionInsights")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="chart-timeline-variant-shimmer"
          title={t("settings.businessInsightsItem")}
          subtitle={t("settings.businessInsightsSubtitle")}
          onPress={onBusinessInsights}
          embedded
        />
        <SettingsNavCard
          icon="credit-card-outline"
          title={t("settings.subscriptionItem")}
          subtitle={t("settings.subscriptionSubtitle")}
          onPress={onSubscription}
          embedded
        />
      </SettingsNavGroup>

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionAccountApp")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="logout"
          title={signingOut ? t("settings.signingOut") : t("settings.logout")}
          subtitle={t("settings.signOutBody")}
          onPress={signingOut ? undefined : confirmSignOut}
          embedded
        />
        {LOGOUT_ALL_CONTROL_ENABLED ? (
          <SettingsNavCard
            icon="cellphone-off"
            title={signingOut ? t("settings.signingOut") : t("settings.logoutAll")}
            subtitle={t("settings.logoutAllBody")}
            onPress={signingOut ? undefined : confirmLogoutAll}
            accent="danger"
            embedded
          />
        ) : null}
        <SettingsNavCard
          icon="account-remove-outline"
          title={t("settings.deleteAccountAndData")}
          subtitle={t("settings.deleteAccountSubtitle")}
          onPress={onDelete}
          accent="danger"
          embedded
        />
      </SettingsNavGroup>

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionAbout")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="help-circle-outline"
          title={t("settings.supportItem")}
          subtitle={t("settings.supportSubtitle")}
          onPress={onSupport}
          embedded
        />
        <CrashReportsPreferenceRow />
        <SettingsNavCard
          icon="information-outline"
          title={t("settings.about")}
          subtitle={t("settings.aboutSubtitle")}
          onPress={onAbout}
          embedded
        />
      </SettingsNavGroup>

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionPrivacy")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="shield-check-outline"
          title={t("legal.linkPrivacy")}
          subtitle={t("settings.legalCombinedSubtitle")}
          onPress={onPrivacy}
          external
          embedded
        />
        <SettingsNavCard
          icon="file-document-outline"
          title={t("legal.linkTerms")}
          onPress={onTerms}
          external
          embedded
        />
        <SettingsNavCard
          icon="shield-lock-outline"
          title={t("settings.pdfPrivacy")}
          onPress={onPdfPrivacy}
          embedded
        />
      </SettingsNavGroup>

      {__DEV__ ? (
        <>
          <Text style={styles.sectionLabel}>Developer</Text>
          <SettingsNavCard
            icon="hammer-wrench"
            title="Reset dev data"
            subtitle="Clear test identities, records, drafts — dev builds only"
            onPress={onDevReset}
            accent="danger"
          />
          {isBillingUxPreviewEnabled() ? (
            <SettingsNavCard
              icon="credit-card-outline"
              title={t("billing.preview.title")}
              subtitle={t("billing.preview.subtitle")}
              onPress={onBillingPreview}
            />
          ) : null}
        </>
      ) : null}

      <LocaleUiText style={styles.aboutBlurb}>{t("settings.aboutFooterLine")}</LocaleUiText>

      <View style={styles.footer}>
        <LocaleUiText style={styles.footerText}>{t("app.name")}</LocaleUiText>
        <LocaleUiText style={styles.footerTagline}>{t("settings.footerTagline")}</LocaleUiText>
        <LocaleUiText style={styles.footerSub}>
          {t("settings.versionFooter", {
            version: Constants.expoConfig?.version ?? "1.0.0",
          })}
        </LocaleUiText>
        <LocaleUiText style={styles.footerSub}>{t("settings.footerDesignedBy")}</LocaleUiText>
      </View>
    </Screen>
  );
}
