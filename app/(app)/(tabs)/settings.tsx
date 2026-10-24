import React, { useCallback, useState } from "react";
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
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function SettingsTab() {
  const t = useT();
  const router = useRouter();
  const { signOut, status } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
          onPress={signingOut ? undefined : confirmSignOut}
          embedded
        />
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
