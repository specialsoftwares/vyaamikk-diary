import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import {
  SettingsAccountAppPanel,
  SettingsInfoHero,
  SettingsNavCard,
  SettingsNavGroup,
} from "@/components/settings";
import { Screen, SkeletonLoadingPanel, SkeletonSettingsSection, LocaleUiText } from "@/components/ui";
import { getAuthEntryHref } from "@/config/authWrapper";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function SettingsTab() {
  const t = useT();
  const router = useRouter();
  const { user, session, signOut, status } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      sectionLabel: {
        ...typography.captionStrong,
        color: colors.textMuted,
        marginBottom: spacing.sm,
        marginTop: spacing.md,
        textTransform: "uppercase",
        letterSpacing: 0.6,
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
  const onLegalHub = useCallback(() => router.push("/(app)/settings/legal"), [router]);
  const onStatutory = useCallback(
    () => router.push({ pathname: "/statutory", params: { from: "settings" } }),
    [router]
  );
  const onAbout = useCallback(() => router.push("/(app)/settings/about"), [router]);
  const onDisclaimer = useCallback(
    () => router.push("/(app)/settings/disclaimer"),
    [router]
  );
  const onDelete = useCallback(() => router.push("/(app)/settings/delete"), [router]);
  const onPdfPrivacy = useCallback(() => router.push("/(app)/settings/pdf-privacy"), [router]);
  const onLocationAccess = useCallback(
    () => router.push("/(app)/settings/location-footprints"),
    [router]
  );
  const onBusinessInsights = useCallback(
    () => router.push("/(app)/settings/business-insights"),
    [router]
  );
  const onDevReset = useCallback(() => router.push("/(app)/settings/dev-reset"), [router]);

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

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionAccountApp")}</LocaleUiText>
      <SettingsAccountAppPanel
        user={user}
        sessionLastActive={session?.lastActiveAt}
        onLocationAccessPress={onLocationAccess}
      />
      <SettingsNavCard
        icon="account-remove-outline"
        title={t("settings.deleteAccountAndData")}
        subtitle={t("settings.deleteAccountSubtitle")}
        onPress={onDelete}
        accent="danger"
      />

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionInsights")}</LocaleUiText>
      <SettingsNavCard
        icon="chart-timeline-variant-shimmer"
        title={t("settings.businessInsightsItem")}
        subtitle={t("settings.businessInsightsSubtitle")}
        onPress={onBusinessInsights}
      />

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionStatutory")}</LocaleUiText>
      <SettingsNavCard
        icon="file-document-outline"
        title={t("settings.statutoryItem")}
        subtitle={t("settings.statutorySubtitle")}
        onPress={onStatutory}
        accent="statutory"
      />

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionPrivacy")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="shield-lock-outline"
          title={t("settings.pdfPrivacy")}
          onPress={onPdfPrivacy}
          embedded
        />
        <SettingsNavCard
          icon="file-document-outline"
          title={t("legal.linkDisclaimer")}
          onPress={onDisclaimer}
          embedded
        />
        <SettingsNavCard
          icon="shield-check-outline"
          title={t("settings.legalCombined")}
          subtitle={t("settings.legalCombinedSubtitle")}
          onPress={onLegalHub}
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
        </>
      ) : null}

      <LocaleUiText style={styles.sectionLabel}>{t("settings.sectionAbout")}</LocaleUiText>
      <SettingsNavGroup>
        <SettingsNavCard
          icon="information-outline"
          title={t("settings.about")}
          subtitle={t("settings.aboutSubtitle")}
          onPress={onAbout}
          embedded
        />
      </SettingsNavGroup>
      <LocaleUiText style={styles.aboutBlurb}>{t("settings.aboutFooterLine")}</LocaleUiText>

      <View style={styles.sectionGap} />
      <SettingsNavCard
        icon="logout"
        title={signingOut ? t("settings.signingOut") : t("settings.logout")}
        onPress={signingOut ? undefined : confirmSignOut}
        accent="danger"
      />

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
